import os
import psycopg2
import argparse
from datetime import timezone
from psycopg2.extras import DictCursor
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime

# 從專案根目錄的 .env 檔案載入環境變數
dotenv_path = os.path.join(os.path.dirname(__file__), '../../../.env')
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv('DATABASE_URL')

MERGE_FIELDS = [
    'atmovies_id', 'tmdb_id', 'full_title', 'chinese_title', 
    'english_title', 'release_date', 'runtime', 'poster_url', 'last_tmdb_check_at'
]

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def select_master_and_slaves(movie_group):
    if not movie_group:
        return None, []

    # Sort by priority: tmdb_id, atmovies_id, completeness (poster, runtime), then oldest (smallest id)
    def sort_key(movie):
        has_tmdb_id = 1 if movie.get('tmdb_id') else 0
        has_atmovies_id = 1 if movie.get('atmovies_id') else 0
        has_poster = 1 if movie.get('poster_url') else 0
        has_runtime = 1 if movie.get('runtime') and movie.get('runtime') > 0 else 0
        # Negative ID for descending sort (smaller ID is older, preferred)
        return (has_tmdb_id, has_atmovies_id, has_poster, has_runtime, -movie['id'])

    sorted_group = sorted(movie_group, key=sort_key, reverse=True)
    master = sorted_group[0]
    slaves = sorted_group[1:]
    return master, slaves

def merge_movie_data(master, slave, cursor):
    updates = {}
    # atmovies_id: if master lacks and slave has
    if not master.get('atmovies_id') and slave.get('atmovies_id'):
        # Check if this atmovies_id is used by any other movie (not master, not current slave)
        cursor.execute("SELECT id FROM movies WHERE atmovies_id = %s AND id NOT IN (%s, %s)", 
                       (slave['atmovies_id'], master['id'], slave['id']))
        if cursor.fetchone():
            print(f"      警告: 從屬電影 {slave['id']} 的 atmovies_id '{slave['atmovies_id']}' 已被其他電影使用，不會合併到主電影 {master['id']}.")
        else:
            updates['atmovies_id'] = slave['atmovies_id']

    # tmdb_id: if master lacks and slave has
    if not master.get('tmdb_id') and slave.get('tmdb_id'):
        # Check if this tmdb_id is used by any other movie (not master, not current slave)
        cursor.execute("SELECT id FROM movies WHERE tmdb_id = %s AND id NOT IN (%s, %s)", 
                       (slave['tmdb_id'], master['id'], slave['id']))
        if cursor.fetchone():
            print(f"      警告: 從屬電影 {slave['id']} 的 tmdb_id '{slave['tmdb_id']}' 已被其他電影使用，不會合併到主電影 {master['id']}.")
        else:
            updates['tmdb_id'] = slave['tmdb_id']

    # Titles: if master lacks and slave has
    for title_field in ['full_title', 'chinese_title', 'english_title']:
        if not master.get(title_field) and slave.get(title_field):
            updates[title_field] = slave[title_field]

    # release_date: if master lacks and slave has (less common for this to be missing on master)
    if not master.get('release_date') and slave.get('release_date'):
        updates['release_date'] = slave['release_date']

    # runtime: if master lacks (or is 0) and slave has valid, use slave's. Otherwise, keep master's.
    if (not master.get('runtime') or master.get('runtime') == 0) and \
       (slave.get('runtime') and isinstance(slave.get('runtime'), int) and slave.get('runtime') > 0):
        updates['runtime'] = slave['runtime']
    
    # poster_url: if master lacks and slave has
    if not master.get('poster_url') and slave.get('poster_url'):
        updates['poster_url'] = slave['poster_url']

    # last_tmdb_check_at: use the more recent one, or slave's if master lacks
    master_check_at = master.get('last_tmdb_check_at')
    slave_check_at = slave.get('last_tmdb_check_at')
    if slave_check_at:
        if not master_check_at or slave_check_at > master_check_at:
            updates['last_tmdb_check_at'] = slave_check_at
    
    # Ensure updated_at is always set
    if updates: # Only add updated_at if there are other changes
        updates['updated_at'] = datetime.now()
        
    return updates

def process_duplicates(conn, execute_mode=False):
    dry_run = not execute_mode
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    print("查詢所有電影以進行重複檢查...")
    cursor.execute(
        "SELECT id, chinese_title, english_title, release_date, tmdb_id, atmovies_id, "
        "poster_url, runtime, created_at, updated_at, full_title, last_tmdb_check_at "
        "FROM movies ORDER BY id"
    )
    movies = cursor.fetchall()
    print(f"共找到 {len(movies)} 部電影記錄。")

    potential_duplicate_groups = []
    # Group by Chinese title + year
    grouped_by_chinese_title_year = defaultdict(list)
    for movie in movies:
        if movie['chinese_title'] and movie['release_date']:
            year = movie['release_date'].year
            key = (movie['chinese_title'].strip().lower(), year)
            grouped_by_chinese_title_year[key].append(movie)
    
    for key, group in grouped_by_chinese_title_year.items():
        if len(group) > 1:
            potential_duplicate_groups.append(group)
            print(f"\n潛在重複群組 (中文標題 '{key[0]}', 年份 {key[1]}): {[m['id'] for m in group]}")

    # Group by English title + year (and avoid adding groups already found)
    existing_group_ids = set()
    for group in potential_duplicate_groups:
        for movie_in_group in group:
            existing_group_ids.add(movie_in_group['id'])
            
    grouped_by_english_title_year = defaultdict(list)
    for movie in movies:
        # Only consider movies not already in a Chinese title group to avoid processing twice
        if movie['id'] not in existing_group_ids and movie['english_title'] and movie['release_date']:
            year = movie['release_date'].year
            key = (movie['english_title'].strip().lower(), year)
            grouped_by_english_title_year[key].append(movie)
            
    for key, group in grouped_by_english_title_year.items():
        if len(group) > 1:
            # Check if this group is substantially different from already added groups
            # This simple check avoids adding the exact same set of IDs if already captured by Chinese title
            current_group_ids = {m['id'] for m in group}
            is_new_group = True
            for existing_group in potential_duplicate_groups:
                if {m['id'] for m in existing_group} == current_group_ids:
                    is_new_group = False
                    break
            if is_new_group:
                potential_duplicate_groups.append(group)
                print(f"\n潛在重複群組 (英文標題 '{key[0]}', 年份 {key[1]}): {[m['id'] for m in group]}")

    if not potential_duplicate_groups:
        print("未找到任何潛在的重複電影群組。")
        cursor.close()
        return

    print(f"\n共識別出 {len(potential_duplicate_groups)} 個潛在重複群組進行處理。")

    for i, group in enumerate(potential_duplicate_groups):
        master, slaves = select_master_and_slaves(group)
        if not master or not slaves:
            print(f"群組 {i+1} 無法選出 master/slaves，跳過。群組: {[m['id'] for m in group]}")
            continue

        print(f"\n--- 處理群組 {i+1}/{len(potential_duplicate_groups)} ---")
        print(f"  主電影 ID: {master['id']} (中文標題: '{master.get('chinese_title', 'N/A')}')")
        print(f"  從電影 ID(s):")
        for s_idx, s_movie in enumerate(slaves):
            print(f"    - {s_movie['id']} (中文標題: '{s_movie.get('chinese_title', 'N/A')}')")
        print("  ---")
        
        sql_commands = []

        for s_movie in slaves:
            # 1. Merge data from slave to master
            updates_to_master = merge_movie_data(master, s_movie, cursor)

            # Pre-emptively NULLify unique keys on slave if master is about to take them
            fields_to_nullify_on_slave_first = []
            if updates_to_master.get('atmovies_id') and s_movie.get('atmovies_id') == updates_to_master['atmovies_id']:
                fields_to_nullify_on_slave_first.append('atmovies_id')
            
            if updates_to_master.get('tmdb_id') and s_movie.get('tmdb_id') == updates_to_master['tmdb_id']:
                fields_to_nullify_on_slave_first.append('tmdb_id')

            if fields_to_nullify_on_slave_first:
                nullify_clauses = [f"{field} = NULL" for field in fields_to_nullify_on_slave_first]
                nullify_clauses.append(f"updated_at = %s") # Also update updated_at for the slave
                sql_nullify_slave_fields = f"UPDATE movies SET {', '.join(nullify_clauses)} WHERE id = %s;"
                params_nullify_slave = [datetime.now(timezone.utc), s_movie['id']]

                if dry_run:
                    print(f"  DRY RUN: Would nullify fields {fields_to_nullify_on_slave_first} on slave {s_movie['id']} before master update.")
                    print(f"     SQL: {sql_nullify_slave_fields} PARAMS: {params_nullify_slave}")
                else:
                    print(f"  -- Nullifying fields {fields_to_nullify_on_slave_first} on slave {s_movie['id']} before master update.")
                    cursor.execute(sql_nullify_slave_fields, params_nullify_slave)

            if updates_to_master:
                set_clauses = []
                params = []
                for col, val in updates_to_master.items():
                    set_clauses.append(f"{col} = %s")
                    params.append(val)
                params.append(master['id'])
                sql = f"UPDATE movies SET {', '.join(set_clauses)} WHERE id = %s;"
                sql_commands.append({'sql': sql, 'params': tuple(params), 'desc': f"合併資訊從 {s_movie['id']} 到 {master['id']}"})
                # Update master in memory for subsequent slaves in the same group
                for col, val in updates_to_master.items():
                    master[col] = val 

            # 2. Update showtimes foreign keys
            sql_update_showtimes = "UPDATE showtimes SET movie_id = %s WHERE movie_id = %s;"
            params_update_showtimes = (master['id'], s_movie['id'])
            sql_commands.append({'sql': sql_update_showtimes, 'params': params_update_showtimes, 'desc': f"更新 showtimes 中 movie_id 從 {s_movie['id']} 到 {master['id']}"})

            # 3. Delete slave movie
            sql_delete_slave = "DELETE FROM movies WHERE id = %s;"
            params_delete_slave = (s_movie['id'],)
            sql_commands.append({'sql': sql_delete_slave, 'params': params_delete_slave, 'desc': f"刪除從電影 ID: {s_movie['id']}"})

        if not sql_commands:
            print("此群組無需任何操作。")
            continue

        if not execute_mode:
            print("DRY RUN: 以下 SQL 命令將被執行:")
            for cmd_info in sql_commands:
                # Format params for display, handling strings and None
                display_params = []
                for p in cmd_info['params']:
                    if isinstance(p, str):
                        display_params.append(f"'{p}'")
                    elif p is None:
                        display_params.append("NULL")
                    else:
                        display_params.append(str(p))
                formatted_sql = cmd_info['sql'].replace('%s', '{}').format(*display_params) # Basic formatting for display
                # More robust display would require knowing param types or using cursor.mogrify if possible without execution
                print(f"  -- {cmd_info['desc']}")
                print(f"     {cmd_info['sql']} -- 參數: {cmd_info['params']}") # Show raw SQL and params
        else:
            print("EXECUTE MODE: 執行 SQL 命令...")
            try:
                cursor.execute("BEGIN;")
                print("  BEGIN TRANSACTION;")
                for cmd_info in sql_commands:
                    print(f"    -- {cmd_info['desc']}")
                    print(f"       Executing: {cmd_info['sql']} with params {cmd_info['params']}")
                    cursor.execute(cmd_info['sql'], cmd_info['params'])
                conn.commit()
                print("  COMMIT;")
                print(f"群組 {i+1} 處理成功！")
            except Exception as e:
                conn.rollback()
                print("  ROLLBACK;")
                print(f"處理群組 {i+1} 時發生錯誤: {e}")
                print("  所有變更已回滾。")
    
    cursor.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='合併資料庫中的重複電影記錄。')
    parser.add_argument('--execute', action='store_true', help='實際執行資料庫修改操作。預設為 dry run 模式。')
    args = parser.parse_args()

    if not DATABASE_URL:
        print("錯誤：DATABASE_URL 環境變數未設定。請檢查 .env 檔案。")
    else:
        conn = None
        try:
            conn = get_db_connection()
            print("成功連接到資料庫！")
            if args.execute:
                print("\n***警告：您正處於 EXECUTE 模式。將會實際修改資料庫！***")
                confirm = input("請輸入 'yes' 以繼續執行，或按 Enter 取消: ")
                if confirm.lower() == 'yes':
                    process_duplicates(conn, execute_mode=True)
                else:
                    print("執行已取消。")
            else:
                print("\n--- DRY RUN 模式 --- (不會修改資料庫)")
                process_duplicates(conn, execute_mode=False)
        
        except psycopg2.Error as e:
            print(f"資料庫連接或查詢錯誤: {e}")
        except Exception as e:
            print(f"發生未預期錯誤: {e}")
        finally:
            if conn:
                conn.close()
                print("\n資料庫連接已關閉。")

import os
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv

# Load environment variables from .env file
# Assuming the .env file is in the project root, two levels up from backend/scripts/utils/
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print(f"Attempting to load .env file from: {dotenv_path}")
else:
    print(f".env file not found at {dotenv_path}. Attempting to load from default location or environment.")
    load_dotenv() # Load from default location or environment if specific path not found

DATABASE_URL = os.getenv('DATABASE_URL')

def find_duplicate_cinema_names():
    """Finds and lists duplicate cinema names and their IDs."""
    if not DATABASE_URL:
        print("錯誤：DATABASE_URL 環境變數未設定。")
        return

    conn = None
    try:
        print(f"Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=DictCursor) as cur:
            query = """
                SELECT name, ARRAY_AGG(id ORDER BY id ASC) as ids, COUNT(*) as count
                FROM cinemas
                GROUP BY name
                HAVING COUNT(*) > 1
                ORDER BY name;
            """
            cur.execute(query)
            duplicates = cur.fetchall()

            if not duplicates:
                print("資料庫中未找到重複的電影院名稱。")
                return

            print(f"\n發現 {len(duplicates)} 個重複的電影院名稱：")
            for duplicate in duplicates:
                name = duplicate['name']
                ids = duplicate['ids']
                master_id = ids[0] # Smallest ID is the master
                duplicate_ids_to_merge = ids[1:]
                print(f"  - 名稱: '{name}'")
                print(f"    所有 ID: {ids}")
                print(f"    將保留的 Master ID: {master_id}")
                if duplicate_ids_to_merge:
                    print(f"    將被合併/刪除的 ID: {duplicate_ids_to_merge}")
                else:
                    # This case should not happen due to HAVING COUNT(*) > 1, but good to be safe
                    print("    沒有需要合併/刪除的 ID (資料可能存在異常)") 

    except psycopg2.Error as e:
        print(f"資料庫錯誤: {e}")
    except Exception as e:
        print(f"發生未預期錯誤: {e}")
    finally:
        if conn:
            conn.close()
            print("資料庫連接已關閉。")

def merge_duplicate_cinemas_action(dry_run=True):
    """Merges duplicate cinema records based on predefined logic."""
    if not DATABASE_URL:
        print("錯誤：DATABASE_URL 環境變數未設定。")
        return

    conn = None
    try:
        print(f"\n{'DRY RUN' if dry_run else 'EXECUTION RUN'}: Connecting to database for merging operations...")
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False # Start transaction

        with conn.cursor(cursor_factory=DictCursor) as cur:
            # Step 1: Find duplicates (same logic as find_duplicate_cinema_names)
            query_duplicates = """
                SELECT name, ARRAY_AGG(id ORDER BY id ASC) as ids
                FROM cinemas
                GROUP BY name
                HAVING COUNT(*) > 1
                ORDER BY name;
            """
            cur.execute(query_duplicates)
            duplicate_groups = cur.fetchall()

            if not duplicate_groups:
                print("資料庫中未找到重複的電影院名稱可供合併。")
                if not dry_run: conn.commit() # Commit even if nothing to do, to end transaction properly
                return

            print(f"\n準備開始合併 {len(duplicate_groups)} 組重複的電影院名稱...")
            total_merged_count = 0
            total_showtimes_updated = 0

            for group in duplicate_groups:
                name = group['name']
                ids = sorted(group['ids'])
                master_id = ids[0]
                duplicate_ids_to_process = ids[1:]

                print(f"\n處理名稱: '{name}'")
                print(f"  Master ID: {master_id}")
                print(f"  Duplicate IDs: {duplicate_ids_to_process}")

                # Fetch master record details
                cur.execute("SELECT * FROM cinemas WHERE id = %s", (master_id,))
                master_record = cur.fetchone()
                if not master_record:
                    print(f"  錯誤: 找不到 Master ID {master_id} 的記錄，跳過此群組。")
                    continue
                
                master_updates = {}

                for dup_id in duplicate_ids_to_process:
                    print(f"    處理重複 ID: {dup_id}")
                    cur.execute("SELECT * FROM cinemas WHERE id = %s", (dup_id,))
                    dup_record = cur.fetchone()
                    if not dup_record:
                        print(f"      錯誤: 找不到重複 ID {dup_id} 的記錄，跳過此 ID。")
                        continue

                    # Consolidate data into master_record if master's field is empty/NULL
                    fields_to_check = ['address', 'lat', 'lng', 'external_id', 'source']
                    current_master_values_for_update = {f: master_record[f] for f in fields_to_check}
                    
                    # Apply previous updates to current_master_values_for_update if any
                    for field_key, field_val in master_updates.items():
                        if field_key in current_master_values_for_update:
                            current_master_values_for_update[field_key] = field_val

                    for field in fields_to_check:
                        master_val = current_master_values_for_update.get(field)
                        dup_val = dup_record.get(field)
                        
                        # Check for None or empty string for text fields, None for numeric (lat/lng)
                        is_master_empty = master_val is None
                        if isinstance(master_val, str) and not master_val.strip():
                            is_master_empty = True
                        
                        is_dup_not_empty = dup_val is not None
                        if isinstance(dup_val, str) and not dup_val.strip():
                            is_dup_not_empty = False
                        
                        if is_master_empty and is_dup_not_empty:
                            master_updates[field] = dup_val
                            print(f"      合併欄位 '{field}': 從 ID {dup_id} ('{dup_val}') 到 Master ID {master_id}")

                    # Update showtimes table
                    update_showtimes_sql = "UPDATE showtimes SET cinema_id = %s WHERE cinema_id = %s;"
                    print(f"      SQL (Showtimes Update): UPDATE showtimes SET cinema_id = {master_id} WHERE cinema_id = {dup_id};")
                    if not dry_run:
                        cur.execute(update_showtimes_sql, (master_id, dup_id))
                        total_showtimes_updated += cur.rowcount
                        print(f"        {cur.rowcount} 個 showtime 記錄已更新指向 Master ID {master_id}")
                    else:
                        print("        DRY RUN: 未執行 showtimes 更新。")

                    # Delete duplicate cinema record
                    delete_cinema_sql = "DELETE FROM cinemas WHERE id = %s;"
                    print(f"      SQL (Cinema Delete): DELETE FROM cinemas WHERE id = {dup_id};")
                    if not dry_run:
                        cur.execute(delete_cinema_sql, (dup_id,))
                        total_merged_count += 1
                        print(f"        重複的電影院 ID {dup_id} 已刪除。")
                    else:
                        print("        DRY RUN: 未執行電影院刪除。")
                
                # Apply consolidated updates to master record if any
                if master_updates:
                    set_clauses = []
                    update_values = []
                    for field, value in master_updates.items():
                        set_clauses.append(f"{field} = %s")
                        update_values.append(value)
                    
                    if set_clauses: # Ensure there's something to update
                        update_master_sql = f"UPDATE cinemas SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s;"
                        update_values.append(master_id)
                        print(f"    SQL (Master Record Update for ID {master_id}): {update_master_sql} VALUES: {tuple(update_values)}")
                        if not dry_run:
                            cur.execute(update_master_sql, tuple(update_values))
                            print(f"      Master ID {master_id} 的欄位已更新。")
                        else:
                            print("      DRY RUN: 未執行 Master Record 更新。")
            
            if not dry_run:
                conn.commit()
                print("\n所有合併操作已成功提交到資料庫。")
                print(f"總共刪除 (合併) 了 {total_merged_count} 個重複的電影院記錄。")
                print(f"總共更新了 {total_showtimes_updated} 個 showtime 記錄的 cinema_id。")
            else:
                conn.rollback() # Rollback dry run changes (though none were made)
                print("\nDRY RUN 完成。未對資料庫進行任何實際變更。")

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"資料庫錯誤: {e}")
        print("操作已回滾。")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"合併過程中發生未預期錯誤: {e}")
        print("操作已回滾。")
    finally:
        if conn:
            conn.autocommit = True # Reset autocommit
            conn.close()
            print("資料庫連接已關閉。")

if __name__ == "__main__":
    print("步驟 1: 查找重複的電影院名稱...")
    find_duplicate_cinema_names() # This function already prints details
    
    # Check if duplicates exist by running a quick count query again
    # This is a bit redundant but ensures we don't ask to proceed if find_duplicate_cinema_names found nothing.
    conn_check = None
    duplicates_exist = False
    try:
        if DATABASE_URL:
            conn_check = psycopg2.connect(DATABASE_URL)
            with conn_check.cursor() as cur_check:
                cur_check.execute("SELECT 1 FROM cinemas GROUP BY name HAVING COUNT(*) > 1 LIMIT 1;")
                if cur_check.fetchone():
                    duplicates_exist = True
            conn_check.close()
    except Exception:
        pass # Ignore errors here, main functions will handle them

    if duplicates_exist:
        proceed_dry_run = input("\n是否要預覽將執行的合併操作 (SQL指令將被印出但不會執行)？ (yes/no): ").strip().lower()
        if proceed_dry_run == 'yes':
            merge_duplicate_cinemas_action(dry_run=True)
            
            proceed_execute = input("\n是否要實際執行上述合併操作？警告：這將修改您的資料庫！ (yes/no): ").strip().lower()
            if proceed_execute == 'yes':
                merge_duplicate_cinemas_action(dry_run=False)
            else:
                print("未執行實際合併操作。")
        else:
            print("未進行預覽或合併操作。")
    else:
        print("\n根據初步檢查，似乎沒有重複的電影院名稱需要合併，或者 find_duplicate_cinema_names 未能列出它們。")


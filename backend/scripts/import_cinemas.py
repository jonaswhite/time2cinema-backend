import os
import csv
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 資料庫連接設定
DB_CONFIG = {
    'local': {
        'dbname': 'jonaswhite',
        'user': 'postgres',
        'password': 'postgres',
        'host': 'localhost',
        'port': '5432'
    },
    'remote': {
        'dbname': 'time2cinema_db',
        'user': 'time2cinema_db_user',
        'password': 'wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX',
        'host': 'dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com',
        'port': '5432'
    }
}

def connect_db(db_type='local'):
    """建立資料庫連接"""
    try:
        conn = psycopg2.connect(**DB_CONFIG[db_type])
        return conn
    except Exception as e:
        print(f"無法連接到{db_type}資料庫: {e}")
        return None

def ensure_external_id_constraint(conn):
    """確保 cinemas 表有 external_id 的唯一約束"""
    with conn.cursor() as cur:
        try:
            # 檢查是否已存在 unique 約束
            cur.execute("""
                SELECT conname 
                FROM pg_constraint 
                WHERE conname = 'cinemas_external_id_key' 
                AND conrelid = 'public.cinemas'::regclass;
            """)
            
            if not cur.fetchone():
                # 添加 unique 約束
                cur.execute("""
                    ALTER TABLE cinemas 
                    ADD CONSTRAINT cinemas_external_id_key 
                    UNIQUE (external_id);
                """)
                conn.commit()
                print("已添加 external_id 的唯一約束")
            else:
                print("external_id 的唯一約束已存在")
                
        except Exception as e:
            conn.rollback()
            print(f"檢查/添加約束時發生錯誤: {e}")
            raise

def clear_cinemas_table(conn):
    """清空 cinemas 表格"""
    with conn.cursor() as cur:
        try:
            cur.execute("TRUNCATE TABLE cinemas RESTART IDENTITY CASCADE;")
            conn.commit()
            print("已清空 cinemas 表格")
        except Exception as e:
            conn.rollback()
            print(f"清空表格時發生錯誤: {e}")
            raise

def import_cinemas_from_csv(conn, csv_file):
    """從 CSV 檔案匯入電影院資料"""
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        cinemas = list(reader)
    
    with conn.cursor() as cur:
        try:
            for cinema in cinemas:
                # 檢查是否已存在相同 external_id 的電影院
                cur.execute(
                    """
                    INSERT INTO cinemas (name, address, city, district, external_id, source, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (external_id) DO UPDATE
                    SET name = EXCLUDED.name,
                        address = EXCLUDED.address,
                        city = EXCLUDED.city,
                        district = EXCLUDED.district,
                        source = EXCLUDED.source,
                        updated_at = EXCLUDED.updated_at
                    RETURNING id;
                    """,
                    (
                        cinema['name'],
                        cinema['address'],
                        cinema['city'],
                        cinema['district'],
                        cinema['external_id'],
                        'atmovies',  # 預設來源
                        datetime.now(),
                        datetime.now()
                    )
                )
            conn.commit()
            print(f"成功匯入 {len(cinemas)} 筆電影院資料")
        except Exception as e:
            conn.rollback()
            print(f"匯入資料時發生錯誤: {e}")
            raise

def main():
    # CSV 檔案路徑
    csv_file = '/Users/jonaswhite/Downloads/cinmeas_table.csv'
    
    # 檢查檔案是否存在
    if not os.path.exists(csv_file):
        print(f"錯誤: 找不到檔案 {csv_file}")
        return
    
    # 連接到本機資料庫並匯入
    print("=== 開始匯入到本機資料庫 ===")
    local_conn = connect_db('local')
    if local_conn:
        try:
            clear_cinemas_table(local_conn)
            ensure_external_id_constraint(local_conn)
            import_cinemas_from_csv(local_conn, csv_file)
        finally:
            local_conn.close()
    
    # 連接到遠端資料庫並匯入
    print("\n=== 開始匯入到遠端資料庫 ===")
    remote_conn = connect_db('remote')
    if remote_conn:
        try:
            clear_cinemas_table(remote_conn)
            ensure_external_id_constraint(remote_conn)
            import_cinemas_from_csv(remote_conn, csv_file)
        finally:
            remote_conn.close()

if __name__ == "__main__":
    main()

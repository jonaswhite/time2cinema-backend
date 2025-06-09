import os
import csv
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print(f"Attempting to load .env file from: {dotenv_path}")
else:
    print(f".env file not found at {dotenv_path}. Attempting to load from default location or environment.")
    load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
CSV_FILE_PATH = '/Users/jonaswhite/Downloads/atmovies_cinemas_20250518_175234 - atmovies_cinemas_20250518_175234.csv'

def import_data_from_csv():
    if not DATABASE_URL:
        print("錯誤：DATABASE_URL 環境變數未設定。")
        return
    if not os.path.exists(CSV_FILE_PATH):
        print(f"錯誤：CSV 檔案未找到於 {CSV_FILE_PATH}")
        return

    conn = None
    updated_count = 0
    processed_rows = 0
    skipped_rows_no_external_id = 0
    skipped_rows_not_found_in_db = 0

    try:
        print("正在連接到資料庫...")
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False # Use transaction

        with conn.cursor(cursor_factory=DictCursor) as cur:
            with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                print(f"從 CSV 檔案讀取的欄位名稱: {reader.fieldnames}")

                if 'external_id' not in reader.fieldnames or 'city' not in reader.fieldnames or 'district' not in reader.fieldnames:
                    print("錯誤：CSV 檔案中缺少必要的欄位 (external_id, city, district)。")
                    if conn: conn.rollback()
                    return

                for row in reader:
                    processed_rows += 1
                    external_id = row.get('external_id', '').strip()
                    city = row.get('city', '').strip()
                    district = row.get('district', '').strip()

                    if not external_id:
                        print(f"警告：CSV 第 {processed_rows} 行缺少 external_id，跳過此行。資料: {row}")
                        skipped_rows_no_external_id +=1
                        continue
                    
                    # Prepare for potential NULL values if city/district are empty in CSV
                    city_to_update = city if city else None
                    district_to_update = district if district else None

                    # Check if cinema with this external_id exists
                    cur.execute("SELECT id FROM cinemas WHERE external_id = %s", (external_id,))
                    cinema_record = cur.fetchone()

                    if cinema_record:
                        cinema_db_id = cinema_record['id']
                        print(f"找到電影院 external_id: {external_id} (DB ID: {cinema_db_id})。準備更新 city='{city_to_update}', district='{district_to_update}'...")
                        
                        update_sql = """
                            UPDATE cinemas
                            SET city = %s, district = %s, updated_at = CURRENT_TIMESTAMP
                            WHERE external_id = %s;
                        """
                        cur.execute(update_sql, (city_to_update, district_to_update, external_id))
                        if cur.rowcount > 0:
                            updated_count += 1
                            print(f"  成功更新 external_id: {external_id}")
                        else:
                            # This case should ideally not happen if the select found the record,
                            # but could if another process modified it, or if update conditions changed.
                            print(f"  警告：更新 external_id: {external_id} 時影響了 0 行。")
                    else:
                        print(f"警告：在資料庫中找不到 external_id 為 '{external_id}' 的電影院，跳過此 CSV 行。")
                        skipped_rows_not_found_in_db += 1
            
            conn.commit()
            print("\n資料匯入操作完成並已提交。")

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"資料庫錯誤: {e}")
        print("操作已回滾。")
    except FileNotFoundError:
        print(f"錯誤：CSV 檔案未找到於 {CSV_FILE_PATH}")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"發生未預期錯誤: {e}")
        print("操作已回滾。")
    finally:
        if conn:
            conn.autocommit = True # Reset autocommit
            conn.close()
            print("資料庫連接已關閉。")
        
        print(f"\n匯入總結:")
        print(f"  總共處理 CSV 行數: {processed_rows}")
        print(f"  成功更新資料庫記錄數: {updated_count}")
        print(f"  因缺少 external_id 而跳過的 CSV 行數: {skipped_rows_no_external_id}")
        print(f"  因在資料庫中找不到 external_id 而跳過的 CSV 行數: {skipped_rows_not_found_in_db}")


if __name__ == "__main__":
    import_data_from_csv()

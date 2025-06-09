import os
import psycopg2
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

def add_columns_to_cinemas():
    if not DATABASE_URL:
        print("錯誤：DATABASE_URL 環境變數未設定。")
        return

    conn = None
    try:
        print("正在連接到資料庫...")
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False # Use transaction
        with conn.cursor() as cur:
            # Add city column if it doesn't exist
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' -- or your specific schema
                        AND table_name = 'cinemas'
                        AND column_name = 'city'
                    ) THEN
                        ALTER TABLE cinemas ADD COLUMN city VARCHAR(255);
                        RAISE NOTICE '欄位 "city" 已成功新增到 cinemas 表格。';
                    ELSE
                        RAISE NOTICE '欄位 "city" 已存在於 cinemas 表格。';
                    END IF;
                END $$;
            """)

            # Add district column if it doesn't exist
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' -- or your specific schema
                        AND table_name = 'cinemas'
                        AND column_name = 'district'
                    ) THEN
                        ALTER TABLE cinemas ADD COLUMN district VARCHAR(255);
                        RAISE NOTICE '欄位 "district" 已成功新增到 cinemas 表格。';
                    ELSE
                        RAISE NOTICE '欄位 "district" 已存在於 cinemas 表格。';
                    END IF;
                END $$;
            """)
            conn.commit()
            print("資料庫欄位檢查/新增操作完成並已提交。")

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"資料庫錯誤: {e}")
        print("操作已回滾。")
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

if __name__ == "__main__":
    add_columns_to_cinemas()

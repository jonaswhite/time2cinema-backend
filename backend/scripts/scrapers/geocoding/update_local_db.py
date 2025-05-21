import csv
import psycopg2
from psycopg2 import sql

def update_local_database(csv_file):
    """更新本地資料庫中的經緯度資訊"""
    try:
        # 連接到本地資料庫
        conn = psycopg2.connect(
            host="localhost",
            database="jonaswhite",
            user="jonaswhite",
            password=""  # 如果沒有密碼，請留空
        )
        
        with conn.cursor() as cur:
            # 讀取 CSV 文件
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if not row.get('lng') or not row.get('lat'):
                        print(f"跳過電影院 {row['name']}，缺少經緯度資料")
                        continue
                    
                    # 更新資料庫
                    # 更新資料庫中的經緯度
                    try:
                        cur.execute(
                            """
                            UPDATE cinemas 
                            SET longitude = %s, latitude = %s 
                            WHERE id = %s
                            """,
                            (float(row['lng']), float(row['lat']), int(row['id']))
                        )
                        print(f"已更新電影院 {row['name']} 的經緯度: {row['lng']}, {row['lat']}")
                    except Exception as e:
                        print(f"更新電影院 {row['name']} 時出錯: {e}")
            
            # 提交事務
            conn.commit()
            print("本地資料庫更新完成")
            
    except Exception as e:
        print(f"更新本地資料庫時出錯: {e}")
        if 'conn' in locals():
            conn.rollback()
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    update_local_database("/tmp/local_cinemas_with_geocode.csv")

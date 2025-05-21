import csv
import json
import re
import time
import os
import requests
from typing import Dict, List, Any, Optional

# Google Maps API 金鑰
GOOGLE_MAPS_API_KEY = "AIzaSyAxrpnM-Lch6zzr-CSku6ga069KOKn2CvM"

def clean_address(address: str) -> str:
    """
    清理地址，確保以「幾號」結尾
    
    例如：
    "信義區松壽路16、18號" -> "信義區松壽路16、18號"
    "中正區信一路177號（華冠大樓）7至10樓" -> "中正區信一路177號"
    """
    # 使用正則表達式找到「幾號」的部分
    match = re.search(r'(.*?\d+[巷弄號])', address)
    if match:
        return match.group(1)
    
    # 如果沒有找到「幾號」的模式，則保留原始地址
    return address

def get_geocode(address: str, city: str) -> Optional[Dict[str, float]]:
    """
    使用 Google Maps API 獲取地址的經緯度
    
    Args:
        address: 地址
        city: 城市名稱
    
    Returns:
        包含經緯度的字典，如果查詢失敗則返回 None
    """
    # 將地址格式化為「台灣、城市、地址」的形式
    formatted_address = f"台灣,{city},{address}"
    
    # 使用 Google Maps Geocoding API
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": formatted_address,
        "key": GOOGLE_MAPS_API_KEY,
        "language": "zh-TW",
        "region": "tw"
    }
    
    try:
        response = requests.get(url, params=params)
        data = response.json()
        
        if data['status'] == 'OK':
            location = data['results'][0]['geometry']['location']
            return {
                'lat': location['lat'],
                'lng': location['lng']
            }
        else:
            print(f"無法獲取經緯度: {data['status']} - {formatted_address}")
            return None
    except Exception as e:
        print(f"獲取經緯度時出錯: {e} - {formatted_address}")
        return None

def process_cinemas(input_csv: str, output_csv: str):
    """
    處理電影院資料，添加經緯度並保存到新的 CSV 文件
    
    Args:
        input_csv: 輸入的 CSV 文件路徑
        output_csv: 輸出的 CSV 文件路徑
    """
    cinemas = []
    
    # 讀取 CSV 文件
    with open(input_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cinemas.append(row)
    
    # 處理每個電影院的地址
    for cinema in cinemas:
        # 清理地址
        original_address = cinema.get('address', '')
        cleaned_address = clean_address(original_address)
        
        # 獲取城市
        city = cinema.get('city', '')
        
        print(f"處理電影院: {cinema['name']} - {city}{cleaned_address}")
        
        # 獲取經緯度
        geocode = get_geocode(cleaned_address, city)
        if geocode:
            cinema['lng'] = geocode['lng']
            cinema['lat'] = geocode['lat']
        else:
            cinema['lng'] = ""
            cinema['lat'] = ""
        
        # 避免 API 請求過於頻繁
        time.sleep(0.5)
    
    # 寫入新的 CSV 文件
    with open(output_csv, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['id', 'name', 'address', 'city', 'lng', 'lat']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for cinema in cinemas:
            writer.writerow({
                'id': cinema['id'],
                'name': cinema['name'],
                'address': cinema['address'],
                'city': cinema['city'],
                'lng': cinema.get('lng', ''),
                'lat': cinema.get('lat', '')
            })
    
    print(f"已將處理後的資料保存至 {output_csv}")
    return cinemas

def update_database(csv_file: str):
    """
    更新資料庫中的電影院經緯度
    
    Args:
        csv_file: 包含經緯度的 CSV 文件路徑
    """
    import psycopg2
    from urllib.parse import urlparse
    
    # 從環境變數獲取資料庫連接字串
    database_url = os.getenv('DATABASE_URL', 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db')
    
    # 解析連接字串
    result = urlparse(database_url)
    username = result.username
    password = result.password
    database = result.path[1:]  # 移除開頭的 '/'
    hostname = result.hostname
    port = result.port or 5432
    
    # 連接到資料庫
    conn = psycopg2.connect(
        dbname=database,
        user=username,
        password=password,
        host=hostname,
        port=port,
        sslmode='require'
    )
    
    try:
        with conn.cursor() as cur:
            # 讀取 CSV 文件
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if not row.get('lng') or not row.get('lat'):
                        print(f"跳過電影院 {row['name']}，缺少經緯度資料")
                        continue
                    
                    # 更新資料庫
                    cur.execute(
                        """
                        UPDATE cinemas 
                        SET longitude = %s, latitude = %s 
                        WHERE id = %s
                        """,
                        (float(row['lng']), float(row['lat']), int(row['id']))
                    )
                    print(f"已更新電影院 {row['name']} 的經緯度: {row['lng']}, {row['lat']}")
            
            # 提交事務
            conn.commit()
            print("資料庫更新完成")
            
    except Exception as e:
        print(f"更新資料庫時出錯: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='處理電影院地址並更新經緯度')
    parser.add_argument('--input', type=str, default='/tmp/cinemas_export.csv', help='輸入的 CSV 文件路徑')
    parser.add_argument('--output', type=str, default='/tmp/cinemas_with_geocode.csv', help='輸出的 CSV 文件路徑')
    parser.add_argument('--update-db', action='store_true', help='是否更新資料庫')
    
    args = parser.parse_args()
    
    print("開始處理電影院資料...")
    process_cinemas(args.input, args.output)
    
    if args.update_db:
        print("\n開始更新資料庫...")
        update_database(args.output)

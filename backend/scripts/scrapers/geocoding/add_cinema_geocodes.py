import re
import time
import os
import faulthandler
faulthandler.enable()
import requests
import psycopg2
from psycopg2.extras import DictCursor
from typing import Dict, Optional
from dotenv import load_dotenv

# Construct the path to the .env file, which is four levels up from the script's directory
# __file__ is the path to the current script
# os.path.dirname(__file__) is the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, '..', '..', '..', '..'))
dotenv_path = os.path.join(project_root, '.env')

print(f"Attempting to load .env file from: {dotenv_path}") # Debug print
load_dotenv(dotenv_path=dotenv_path) # Loads variables from the specified .env file into environment

# Get API keys and database URL from environment variables loaded by load_dotenv()
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")

# Validate that the environment variables are set
if not GOOGLE_MAPS_API_KEY:
    print("錯誤：GOOGLE_MAPS_API_KEY 環境變數未在 .env 檔案中設定或為空。請檢查 .env 檔案。")
    exit(1)
if not DATABASE_URL:
    print("錯誤：DATABASE_URL 環境變數未在 .env 檔案中設定或為空。請檢查 .env 檔案。")
    exit(1)

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

def get_geocode(address: str, city: Optional[str] = None) -> Optional[Dict[str, float]]:
    """
    使用 Google Maps API 獲取地址的經緯度
    
    Args:
        address: 地址
        city: 城市名稱
    
    Returns:
        包含經緯度的字典，如果查詢失敗則返回 None
    """
    # 將地址格式化
    if city:
        formatted_address = f"台灣,{city},{address}"
    else:
        # 如果沒有提供城市，Google API 通常也能處理，但可能需要更完整的地址
        formatted_address = f"台灣,{address}"
    
    # 使用 Google Maps Geocoding API
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": formatted_address,
        "key": GOOGLE_MAPS_API_KEY,
        "region": "tw",
        "language": "zh-TW"
    }
    
    print(f"  [get_geocode] Attempting to fetch URL: {url} with params: {params}")
    try:
        response = requests.get(url, params=params, timeout=15)  # Added timeout=15 seconds
        print(f"  [get_geocode] requests.get call completed. Status code: {response.status_code}")
        
        # It's good practice to check response.ok or response.status_code before .json()
        if not response.ok:
            print(f"  [get_geocode] API request failed with status code {response.status_code}. Response text: {response.text[:200]}...")
            return None
            
        data = response.json()
        
        if data.get('status') == 'OK' and data.get('results'):
            location = data['results'][0]['geometry']['location']
            print(f"  [get_geocode] Successfully geocoded: {formatted_address} -> lat:{location['lat']}, lng:{location['lng']}")
            return {
                "lng": location['lng'],
                "lat": location['lat']
            }
        else:
            status = data.get('status', 'N/A')
            error_message = data.get('error_message', 'No error message provided.')
            # For ZERO_RESULTS, error_message might not be present, so rely on status.
            print(f"  [get_geocode] API query for '{formatted_address}' returned status '{status}'. Error: '{error_message}'")
            return None
            
    except requests.exceptions.Timeout:
        print(f"  [get_geocode] Timeout (15s) while fetching geocode for: {formatted_address}")
        return None
    except requests.exceptions.RequestException as req_e:
        print(f"  [get_geocode] RequestException for {formatted_address}: {req_e}")
        return None
    except ValueError as json_err: # Handles json.JSONDecodeError which is a subclass of ValueError
        print(f"  [get_geocode] JSONDecodeError for {formatted_address}: {json_err}. Response text: {response.text[:200]}...")
        return None
    except Exception as e:
        print(f"  [get_geocode] Unexpected error in get_geocode for {formatted_address}: {type(e).__name__} - {e}")
        return None

def main():
    """主函數，從資料庫讀取電影院資料，獲取經緯度並更新回資料庫"""
    conn = None
    updated_count = 0
    failed_count = 0
    processed_count = 0
    
    print("開始處理電影院地理編碼...")

    try:
        print(f"Attempting to connect directly using DATABASE_URL: {DATABASE_URL}")
        conn = psycopg2.connect(DATABASE_URL)
        # 使用 DictCursor 可以讓我們像操作字典一樣操作查詢結果
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 選擇 id, name, address，條件是 lat 或 lng 為 NULL，且 source 為 'atmovies'
            cur.execute("SELECT id, name, address FROM cinemas WHERE (lat IS NULL OR lng IS NULL) AND source = 'atmovies'")
            cinemas_to_geocode = cur.fetchall()
            
            total_cinemas = len(cinemas_to_geocode)
            print(f"找到 {total_cinemas} 家電影院需要地理編碼。")

            for cinema in cinemas_to_geocode:
                processed_count += 1
                print(f"\n處理中 ({processed_count}/{total_cinemas}): ID={cinema['id']}, 名稱='{cinema['name']}'")
                if not cinema['address']:
                    print(f"  跳過 ID={cinema['id']}, 名稱='{cinema['name']}'，因為地址為空。")
                    failed_count +=1
                    continue

                cleaned_address = clean_address(cinema['address'])
                print(f"  原始地址: '{cinema['address']}' -> 清理後地址: '{cleaned_address}'")
                
                # 嘗試從地址前三個字提取城市，如果失敗或不合理，則不傳遞 city 參數
                # 台灣地址通常是 縣/市 + 區/鄉/鎮/市 + 路/街
                # 例如 台北市信義區... -> 台北市
                #      新北市板橋區... -> 新北市
                potential_city = None
                if len(cleaned_address) >= 3:
                    # 檢查是否以「縣」或「市」結尾的標準台灣縣市名稱
                    if cleaned_address[2] == '市' or cleaned_address[2] == '縣':
                        potential_city = cleaned_address[:3]
                        print(f"  推斷城市: {potential_city}")

                geocode_result = get_geocode(cleaned_address, city=potential_city)
                
                if geocode_result and 'lat' in geocode_result and 'lng' in geocode_result:
                    # 更新資料庫
                    with conn.cursor() as update_cur: # Use a new cursor for update
                        update_cur.execute(
                            "UPDATE cinemas SET lat = %s, lng = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                            (geocode_result['lat'], geocode_result['lng'], cinema['id'])
                        )
                    conn.commit() # 提交事務
                    updated_count += 1
                    print(f"  成功更新 ID={cinema['id']}: lat={geocode_result['lat']}, lng={geocode_result['lng']}")
                else:
                    failed_count += 1
                    print(f"  無法獲取 ID={cinema['id']} 的地理編碼。")
                
                # 避免 API 請求過於頻繁
                time.sleep(0.6) # 稍微增加延遲以符合 Google API 使用條款 (每秒請求上限)

    except psycopg2.Error as e:
        print(f"資料庫錯誤: {e}")
        if conn:
            conn.rollback() # 如果出錯則回滾
    except Exception as e:
        print(f"處理過程中發生未預期錯誤: {e}")
    finally:
        if conn:
            conn.close()
            print("資料庫連接已關閉。")
            
    print(f"\n地理編碼處理完成。")
    print(f"總共處理: {processed_count} 家電影院")
    print(f"成功更新: {updated_count} 家電影院")
    print(f"失敗處理: {failed_count} 家電影院")

if __name__ == "__main__":
    # 確保 API 金鑰和資料庫 URL 已設定
    if not GOOGLE_MAPS_API_KEY or not DATABASE_URL:
        print("請先在 .env 檔案中設定 GOOGLE_MAPS_API_KEY 和 DATABASE_URL 環境變數。")
    else:
        main()

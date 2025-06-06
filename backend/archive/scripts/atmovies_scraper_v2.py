import requests
from bs4 import BeautifulSoup
import json
import csv
import time
import datetime
import logging
import os
import re
from typing import Dict, List, Any, Optional

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("atmovies_scraper_v2.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 常數設定
BASE_URL = "https://www.atmovies.com.tw/showtime/"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
}
REQUEST_DELAY = 1.0  # 請求間隔秒數
MAX_RETRIES = 2  # 最大重試次數
TIMEOUT = 10  # 請求超時時間
OUTPUT_DIR = "output"  # 輸出目錄

# 確保輸出目錄存在
os.makedirs(OUTPUT_DIR, exist_ok=True)

class ATMoviesScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.data = []
    
    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        while retries <= MAX_RETRIES:
            try:
                logger.info(f"正在抓取: {url}")
                response = self.session.get(url, timeout=TIMEOUT)
                if response.status_code == 200:
                    return BeautifulSoup(response.text, 'html.parser')
                else:
                    logger.warning(f"HTTP錯誤: {response.status_code} - {url}")
            except Exception as e:
                logger.error(f"請求錯誤: {e} - {url}")
            
            retries += 1
            if retries <= MAX_RETRIES:
                wait_time = retries * 3  # 指數退避
                logger.info(f"等待 {wait_time} 秒後重試...")
                time.sleep(wait_time)
            else:
                logger.error(f"已達最大重試次數，跳過 URL: {url}")
        
        return None
    
    def get_region_list(self) -> List[Dict[str, str]]:
        """獲取所有區域列表，但只返回台北區域"""
        regions = []
        soup = self.fetch_page(BASE_URL)
        if not soup:
            logger.error("無法獲取區域列表")
            return regions
        
        try:
            # 只抽取台北區域
            region_data = [
                {'code': 'a02', 'name': '台北'},
            ]
            
            # 為台北區域構建URL和資訊
            for region in region_data:
                region_url = f"{BASE_URL}{region['code']}/"
                regions.append({
                    'region_code': region['code'],
                    'region_name': region['name'],
                    'url': region_url
                })
                
            logger.info(f"成功載入 {len(regions)} 個區域（只抽取台北區域）")
            
        except Exception as e:
            logger.error(f"載入區域列表時出錯: {e}")
        
        return regions
    
    def get_theaters_in_region(self, region: Dict[str, str]) -> List[Dict[str, str]]:
        """獲取指定區域內的所有電影院"""
        theaters = []
        soup = self.fetch_page(region['url'])
        if not soup:
            logger.error(f"無法獲取區域 {region['region_name']} 的電影院列表")
            return theaters
        
        try:
            # 尋找所有電影院連結
            for a in soup.find_all('a'):
                href = a.get('href', '')
                # 電影院連結格式為: /showtime/t{atmovies_theater_id}/{region_code}/
                if '/showtime/t' in href and region['region_code'] in href:
                    # 從 URL 解析出 atmovies_theater_id
                    url_parts = href.strip('/').split('/')
                    atmovies_theater_id = ''
                    for part in url_parts:
                        if part.startswith('t'):
                            atmovies_theater_id = part
                            break
                    
                    if atmovies_theater_id and atmovies_theater_id.startswith('t'):
                        atmovies_theater_name = a.text.strip()
                        if atmovies_theater_name:  # 確保名稱不是空字串
                            theaters.append({
                                'atmovies_theater_id': atmovies_theater_id,
                                'atmovies_theater_name': atmovies_theater_name,
                                'region_code': region['region_code'],
                                'url': urljoin(BASE_URL, href) if 'urljoin' in globals() else f"{BASE_URL}{atmovies_theater_id}/{region['region_code']}/"
                            })
            
            # 移除重複項
            unique_theaters = []
            seen_ids = set()
            for theater in theaters:
                if theater['atmovies_theater_id'] not in seen_ids:
                    seen_ids.add(theater['atmovies_theater_id'])
                    unique_theaters.append(theater)
            
            theaters = unique_theaters
            logger.info(f"在區域 {region['region_name']} 找到 {len(theaters)} 家電影院")
        except Exception as e:
            logger.error(f"解析電影院列表時出錯: {e} - 區域: {region['region_name']}")
            import traceback
            logger.error(traceback.format_exc())
        
        return theaters
    
    def get_dates(self) -> List[Dict[str, str]]:
        """獲取今天、明天和後天的日期資料"""
        dates = []
        today = datetime.datetime.now()
        
        # 抽取今天、明天和後天的資料
        for i in range(3):
            date = today + datetime.timedelta(days=i)
            date_str = date.strftime("%Y%m%d")
            
            if i == 0:
                label = "今天"
            elif i == 1:
                label = "明天"
            else:
                label = "後天"
            
            dates.append({
                'date': date_str,
                'label': label
            })
        
        logger.info(f"抽取今天、明天和後天共 {len(dates)} 天的場次資訊")
        return dates
    
    def get_showtimes(self, theater: Dict[str, str], date: Dict[str, str]) -> List[Dict[str, str]]:
        """獲取特定電影院在特定日期的所有場次"""
        showtimes = []
        
        # 構建URL
        url = f"{BASE_URL}{theater['atmovies_theater_id']}/{theater['region_code']}/"
        if date['label'] != "今天":  # 如果不是今天，加上日期參數
            url += f"{date['date']}/"
        
        soup = self.fetch_page(url)
        if not soup:
            logger.error(f"無法獲取場次資訊: {theater['atmovies_theater_name']} - {date['label']}")
            return showtimes
        
        try:
            # 1. 從 h2 標籤獲取電影院名稱（確認用）
            atmovies_theater_name_tag = soup.find('h2')
            if atmovies_theater_name_tag:
                atmovies_theater_name = atmovies_theater_name_tag.text.strip()
                logger.info(f"確認電影院名稱: {atmovies_theater_name}")
            
            # 2. 尋找所有電影場次表
            movie_tables = soup.find_all('ul', id='theaterShowtimeTable')
            
            for table in movie_tables:
                # 3. 從每個表格中獲取電影名稱
                film_title = table.find('li', class_='filmTitle')
                if not film_title:
                    continue
                
                film_link = film_title.find('a')
                if not film_link:
                    continue
                
                movie_name = film_link.text.strip()
                # 移除可能的星號標記
                movie_name = re.sub(r'\*+$', '', movie_name)
                
                # 4. 獲取場次時間
                # 場次時間通常在第二個 ul 中的 li 元素中
                time_list = table.find_all('ul')
                if len(time_list) >= 2:
                    time_items = time_list[1].find_all('li')
                    for time_item in time_items:
                        time_text = time_item.text.strip()
                        # 排除"其他戲院"的連結
                        if "其他戲院" in time_text:
                            continue
                        
                        # 處理時間格式（將全形冒號轉換為半形）
                        time_text = time_text.replace('：', ':')
                        
                        # 確保時間格式正確
                        if re.match(r'\d{1,2}:\d{2}', time_text):
                            showtimes.append({
                                'time': time_text,
                                'movie_name': movie_name
                            })
            
            logger.info(f"在 {theater['atmovies_theater_name']} - {date['label']} 找到 {len(showtimes)} 個場次")
        except Exception as e:
            logger.error(f"解析場次資訊時出錯: {e} - {theater['atmovies_theater_name']} - {date['label']}")
            import traceback
            logger.error(traceback.format_exc())
        
        return showtimes
    
    def scrape_all(self):
        """主要爬蟲流程，抓取所有資料"""
        # 1. 獲取所有區域
        regions = self.get_region_list()
        
        # 2. 獲取日期列表
        dates = self.get_dates()
        
        # 3. 對每個區域，獲取所有電影院
        for region in regions:
            theaters = self.get_theaters_in_region(region)
            time.sleep(REQUEST_DELAY)  # 請求間隔
            
            # 4. 對每個電影院，獲取三天的場次資訊
            for theater in theaters:
                theater_data = {
                    'atmovies_theater_id': theater['atmovies_theater_id'],
                    'atmovies_theater_name': theater['atmovies_theater_name'],
                    'atmovies_showtimes_by_date': []
                }
                
                # 依序獲取今天、明天、後天的場次，如果前一天沒有資料，就不找下一天
                for i, date in enumerate(dates):
                    # 檢查是否需要跳過這一天
                    if i > 0:  # 如果不是今天
                        # 檢查前一天是否有資料
                        prev_date_data = theater_data['atmovies_showtimes_by_date'][i-1]
                        if len(prev_date_data['showtimes']) == 0:
                            # 前一天沒有資料，跳過這一天
                            logger.info(f"由於 {theater['atmovies_theater_name']} 在 {dates[i-1]['label']} 沒有場次資料，跳過 {date['label']} 的資料收集")
                            theater_data['atmovies_showtimes_by_date'].append({
                                'date': date['date'],
                                'label': date['label'],
                                'showtimes': []
                            })
                            continue
                    
                    # 獲取當天場次
                    showtimes = self.get_showtimes(theater, date)
                    time.sleep(REQUEST_DELAY)  # 請求間隔
                    
                    # 添加到結果中
                    theater_data['atmovies_showtimes_by_date'].append({
                        'date': date['date'],
                        'label': date['label'],
                        'showtimes': showtimes
                    })
                
                self.data.append(theater_data)
                logger.info(f"完成電影院 {theater['atmovies_theater_name']} 的資料收集")
        
        return self.data
    
    def save_to_json(self, filename="atmovies_showtimes.json"):
        """將結果保存為JSON格式"""
        filepath = os.path.join(OUTPUT_DIR, filename)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            logger.info(f"已將資料保存至 {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"保存JSON時出錯: {e}")
            return None
    
    def save_to_csv(self, filename="atmovies_showtimes.csv"):
        """將結果保存為CSV格式"""
        filepath = os.path.join(OUTPUT_DIR, filename)
        try:
            with open(filepath, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                # 寫入標題行
                writer.writerow(['atmovies_theater_id', 'atmovies_theater_name', 'date', 'date_label', 'time', 'movie_name'])
                
                # 寫入資料行
                for theater in self.data:
                    for date_data in theater['atmovies_showtimes_by_date']:
                        for showtime in date_data['showtimes']:
                            writer.writerow([
                                theater['atmovies_theater_id'],
                                theater['atmovies_theater_name'],
                                date_data['date'],
                                date_data['label'],
                                showtime['time'],
                                showtime['movie_name']
                            ])
                
            logger.info(f"已將資料保存至 {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"保存CSV時出錯: {e}")
            return None

def main():
    scraper = ATMoviesScraper()
    
    logger.info("開始執行爬蟲...")
    start_time = time.time()
    
    # 執行爬蟲
    scraper.scrape_all()
    
    # 保存結果
    json_path = scraper.save_to_json()
    csv_path = scraper.save_to_csv()
    
    end_time = time.time()
    duration = end_time - start_time
    
    logger.info(f"爬蟲完成! 總耗時: {duration:.2f} 秒")
    logger.info(f"結果已保存至: {json_path}, {csv_path}")

if __name__ == "__main__":
    from urllib.parse import urljoin
    main()

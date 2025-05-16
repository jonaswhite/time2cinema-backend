import requests
from bs4 import BeautifulSoup
import json
import csv
import time
import datetime
import logging
import os
import re
import asyncio
import aiohttp
import random
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("atmovies_scraper_v3.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 常數設定
BASE_URL = "https://www.atmovies.com.tw/showtime/"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.atmovies.com.tw/',
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
}
MAX_RETRIES = 2  # 最大重試次數
TIMEOUT = 10  # 請求超時時間
# 統一輸出目錄到 backend/output/scrapers
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')
MAX_CONCURRENT_REQUESTS = 5  # 最大並發請求數

# 確保輸出目錄存在
os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"輸出目錄設置為: {OUTPUT_DIR}")

class ATMoviesScraper:
    def __init__(self):
        self.data = []
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    def fetch_page_sync(self, url: str) -> Optional[BeautifulSoup]:
        """同步獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        while retries <= MAX_RETRIES:
            try:
                logger.info(f"正在抓取: {url}")
                # 使用隨機延遲避免被封
                time.sleep(1 + random.random() * 2)
                response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
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
        
    async def fetch_page(self, url: str, session: aiohttp.ClientSession) -> Optional[BeautifulSoup]:
        """非同步獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        async with self.semaphore:  # 限制並發請求數
            while retries <= MAX_RETRIES:
                try:
                    logger.info(f"正在抓取: {url}")
                    # 減少隨機延遲，加速爬蟲
                    await asyncio.sleep(0.2 * random.random())
                    async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as response:
                        if response.status == 200:
                            html = await response.text()
                            return BeautifulSoup(html, 'html.parser')
                        else:
                            logger.warning(f"HTTP錯誤: {response.status} - {url}")
                except Exception as e:
                    logger.error(f"請求錯誤: {e} - {url}")
                
                retries += 1
                if retries <= MAX_RETRIES:
                    wait_time = retries  # 減少等待時間，加速重試
                    logger.info(f"等待 {wait_time} 秒後重試...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"已達最大重試次數，跳過 URL: {url}")
            
            return None
    
    def get_region_list(self) -> List[Dict[str, str]]:
        """獲取所有區域列表，但只返回台北區域"""
        # 只抽取台北區域
        region_data = [
            {'code': 'a02', 'name': '台北'},
        ]
        
        # 為台北區域構建URL和資訊
        regions = []
        for region in region_data:
            region_url = f"{BASE_URL}{region['code']}/"
            regions.append({
                'region_code': region['code'],
                'region_name': region['name'],
                'url': region_url
            })
            
        logger.info(f"成功載入 {len(regions)} 個區域（只抽取台北區域）")
        return regions
    
    async def get_theaters_in_region(self, region: Dict[str, str], session: aiohttp.ClientSession) -> List[Dict[str, str]]:
        """非同步獲取指定區域內的所有電影院"""
        theaters = []
        soup = await self.fetch_page(region['url'], session)
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
                                'url': urljoin(BASE_URL, href)
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
    
    async def get_showtimes(self, theater: Dict[str, str], date: Dict[str, str], session: aiohttp.ClientSession) -> List[Dict[str, str]]:
        """非同步獲取特定電影院在特定日期的所有場次"""
        showtimes = []
        
        # 構建URL
        url = f"{BASE_URL}{theater['atmovies_theater_id']}/{theater['region_code']}/"
        if date['label'] != "今天":  # 如果不是今天，加上日期參數
            url += f"{date['date']}/"
        
        soup = await self.fetch_page(url, session)
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
    
    async def process_theater(self, theater: Dict[str, str], dates: List[Dict[str, str]], session: aiohttp.ClientSession) -> Dict[str, Any]:
        """非同步處理單個電影院的所有日期場次，使用並行處理加速"""
        logger.info(f"開始處理電影院: {theater['atmovies_theater_name']}")
        
        theater_data = {
            'atmovies_theater_id': theater['atmovies_theater_id'],
            'atmovies_theater_name': theater['atmovies_theater_name'],
            'atmovies_showtimes_by_date': []
        }
        
        # 並行獲取所有日期的場次資料
        date_tasks = []
        for date in dates:
            task = asyncio.create_task(self.get_showtimes(theater, date, session))
            date_tasks.append((date, task))
        
        # 等待所有日期的場次資料獲取完成
        for date, task in date_tasks:
            try:
                showtimes = await task
                theater_data['atmovies_showtimes_by_date'].append({
                    'date': date['date'],
                    'label': date['label'],
                    'showtimes': showtimes
                })
                logger.info(f"已獲取 {theater['atmovies_theater_name']} 在 {date['label']} 的場次資料，共 {len(showtimes)} 筆")
            except Exception as e:
                logger.error(f"獲取 {theater['atmovies_theater_name']} 在 {date['label']} 的場次資料時出錯: {e}")
                theater_data['atmovies_showtimes_by_date'].append({
                    'date': date['date'],
                    'label': date['label'],
                    'showtimes': []
                })
        
        # 按日期排序
        theater_data['atmovies_showtimes_by_date'].sort(key=lambda x: x['date'])
        
        logger.info(f"完成電影院 {theater['atmovies_theater_name']} 的資料收集")
        return theater_data
    
    async def scrape_all(self):
        """主要非同步爬蟲流程，抓取所有資料"""
        # 1. 獲取所有區域
        regions = self.get_region_list()
        
        # 2. 獲取日期列表
        dates = self.get_dates()
        
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            # 3. 並行獲取所有區域的電影院
            region_tasks = []
            for region in regions:
                task = asyncio.create_task(self.get_theaters_in_region(region, session))
                region_tasks.append(task)
            
            # 等待所有區域的電影院資料獲取完成
            theaters_results = await asyncio.gather(*region_tasks)
            
            # 將所有電影院合併到一個列表
            all_theaters = []
            for theaters in theaters_results:
                all_theaters.extend(theaters)
            
            logger.info(f"共找到 {len(all_theaters)} 家電影院需要處理")
            
            # 4. 並行處理所有電影院，使用更大的並發數
            # 分批處理以避免同時開啟太多任務
            batch_size = 10  # 每批處理的電影院數量
            all_results = []
            
            for i in range(0, len(all_theaters), batch_size):
                batch = all_theaters[i:i+batch_size]
                logger.info(f"處理電影院批次 {i//batch_size + 1}/{(len(all_theaters)-1)//batch_size + 1} (共 {len(batch)} 家電影院)")
                
                tasks = []
                for theater in batch:
                    task = asyncio.create_task(self.process_theater(theater, dates, session))
                    tasks.append(task)
                
                # 等待當前批次完成
                batch_results = await asyncio.gather(*tasks)
                all_results.extend(batch_results)
            
            self.data = all_results
        
        return self.data
    
    def save_to_json(self, filename="atmovies_showtimes.json"):
        """將結果保存為JSON格式"""
        filepath = os.path.join(OUTPUT_DIR, filename)
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            
            # 計算總場次數
            total_showtimes = 0
            for theater in self.data:
                for date_data in theater['atmovies_showtimes_by_date']:
                    total_showtimes += len(date_data['showtimes'])
            
            logger.info(f"已將資料保存至 {filepath}")
            logger.info(f"總場次數: {total_showtimes}")
            logger.info(f"總電影院數: {len(self.data)}")
            
            # 顯示日期範圍
            dates = set()
            for theater in self.data:
                for date_data in theater['atmovies_showtimes_by_date']:
                    dates.add(date_data['date'])
            
            logger.info(f"日期範圍: {', '.join(sorted(list(dates)))}")
            
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
                writer.writerow(['電影院ID', '電影院名稱', '日期', '場次時間', '電影名稱'])
                
                for theater in self.data:
                    for date_data in theater['atmovies_showtimes_by_date']:
                        for showtime in date_data['showtimes']:
                            writer.writerow([
                                theater['atmovies_theater_id'],
                                theater['atmovies_theater_name'],
                                date_data['date'],
                                showtime['time'],
                                showtime['movie_name']
                            ])
                
            logger.info(f"已將資料保存至 {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"保存CSV時出錯: {e}")
            return None

async def main():
    start_time = time.time()
    logger.info(f"開始執行爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"設置為抓取 3 天的場次資料，最大並發請求數: {MAX_CONCURRENT_REQUESTS}")
    
    scraper = ATMoviesScraper()
    await scraper.scrape_all()
    
    # 保存結果
    json_path = scraper.save_to_json()
    csv_path = scraper.save_to_csv()
    
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"爬蟲總耗時: {duration:.2f} 秒 ({duration/60:.2f} 分鐘)")
    logger.info(f"JSON 輸出: {json_path}")
    logger.info(f"CSV 輸出: {csv_path}")
    logger.info(f"完成執行爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    asyncio.run(main())

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
        logging.FileHandler("atmovies_data_update_checker.log"), # Changed log file name
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
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')
MAX_CONCURRENT_REQUESTS = 5  # 最大並發請求數 (可根據需要調整)
MAX_THEATERS_TO_CHECK_DEFAULT = 10 # Default number of theaters to check

# 確保輸出目錄存在 (雖然此腳本不直接輸出文件，但保留以防萬一或繼承自原腳本的邏輯)
os.makedirs(OUTPUT_DIR, exist_ok=True)
# print(f"輸出目錄設置為: {OUTPUT_DIR}") # Not critical for this script

class ATMoviesScraper:
    def __init__(self):
        self.data = [] # Still collect data, but won't be saved to file by default
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    def fetch_page_sync(self, url: str) -> Optional[BeautifulSoup]:
        """同步獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        while retries <= MAX_RETRIES:
            try:
                logger.info(f"正在抓取 (sync): {url}")
                time.sleep(1 + random.random() * 2)
                response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
                if response.status_code == 200:
                    return BeautifulSoup(response.text, 'html.parser')
                else:
                    logger.warning(f"HTTP錯誤: {response.status_code} - {url}")
            except Exception as e:
                logger.error(f"請求錯誤 (sync): {e} - {url}")
            
            retries += 1
            if retries <= MAX_RETRIES:
                wait_time = retries * 3
                logger.info(f"等待 {wait_time} 秒後重試 (sync)... {url}")
                time.sleep(wait_time)
            else:
                logger.error(f"已達最大重試次數，跳過 URL (sync): {url}")
        return None
        
    async def fetch_page(self, url: str, session: aiohttp.ClientSession) -> Optional[BeautifulSoup]:
        """非同步獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        async with self.semaphore:
            while retries <= MAX_RETRIES:
                try:
                    logger.info(f"正在抓取 (async): {url}")
                    await asyncio.sleep(0.2 * random.random())
                    async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as response:
                        if response.status == 200:
                            html = await response.text()
                            return BeautifulSoup(html, 'html.parser')
                        else:
                            logger.warning(f"HTTP錯誤: {response.status} - {url}")
                except aiohttp.ClientError as e:
                    error_type = type(e).__name__
                    error_args = e.args if hasattr(e, 'args') else 'N/A'
                    os_error_msg = str(e.os_error) if hasattr(e, 'os_error') and e.os_error is not None else 'N/A'
                    status_msg = str(e.status) if hasattr(e, 'status') and e.status is not None else 'N/A'
                    logger.error(f"請求錯誤 (async): Type: {error_type}, Args: {error_args}, OS Error: {os_error_msg}, Status: {status_msg} - {url}")
                except asyncio.TimeoutError:
                    logger.error(f"請求超時 (async): {url}")
                
                retries += 1
                if retries <= MAX_RETRIES:
                    wait_time = retries * 2 
                    logger.info(f"等待 {wait_time} 秒後重試 (async)... {url}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"已達最大重試次數，跳過 URL (async): {url}")
            return None

    def get_region_list(self) -> List[Dict[str, str]]:
        """獲取所有區域列表，但只返回台北區域"""
        # Based on user feedback, Taipei region code is 'a02'
        # URL format: https://www.atmovies.com.tw/showtime/a02/
        region_info_list = [{'code': 'a02', 'name': '台北市'}] 
        
        processed_regions = []
        for r_info in region_info_list:
            # BASE_URL is "https://www.atmovies.com.tw/showtime/"
            full_region_url = f"{BASE_URL}{r_info['code']}/"

            processed_regions.append({
                'region_code': r_info['code'],
                'region_name': r_info['name'],
                'url': full_region_url 
            })
            
        if processed_regions:
            logger.info(f"目標區域設定為: {processed_regions[0]['region_name']} (Code: {processed_regions[0]['region_code']}, URL: {processed_regions[0]['url']})")
        else:
            logger.warning("未能設定目標區域。")
        return processed_regions

    async def get_theaters_in_region(self, region: Dict[str, str], session: aiohttp.ClientSession) -> List[Dict[str, str]]:
        """非同步獲取指定區域內的所有電影院"""
        theaters = []
        url = region['url']
        region_name_to_log = region.get('region_name', '未知區域')
        
        logger.info(f"正在獲取 {region_name_to_log} 的電影院列表從: {url}")
        
        soup = await self.fetch_page(url, session)
        if not soup:
            logger.error(f"無法獲取區域 {region_name_to_log} 的電影院列表頁面: {url}")
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
                                'id': atmovies_theater_id,  # 保持與原代碼兼容
                                'name': atmovies_theater_name,  # 保持與原代碼兼容
                                'url': urljoin(BASE_URL, href)
                            })
            
            # 移除重複項
            unique_theaters = []
            seen_ids = set()
            for theater in theaters:
                if theater['id'] not in seen_ids:
                    seen_ids.add(theater['id'])
                    unique_theaters.append(theater)
            
            theaters = unique_theaters
            logger.info(f"在 {region_name_to_log} 找到 {len(theaters)} 家電影院")
        except Exception as e:
            logger.error(f"解析電影院列表時出錯: {e} - 區域: {region_name_to_log}")
            import traceback
            logger.error(traceback.format_exc())
        
        return theaters

    def get_dates(self) -> List[Dict[str, str]]:
        """獲取今天、明天和後天的日期資料"""
        # 此處邏輯與原腳本相同
        dates_to_check = []
        today = datetime.date.today()
        for i in range(3): # 今天, 明天, 後天
            current_date = today + datetime.timedelta(days=i)
            dates_to_check.append({
                'raw': current_date,
                'formatted': current_date.strftime('%Y/%m/%d'),
                'url_param': current_date.strftime('%Y%m%d')
            })
        return dates_to_check

    async def get_showtimes(self, theater: Dict[str, str], date: Dict[str, str], session: aiohttp.ClientSession) -> Optional[Dict[str, Any]]:
        """非同步獲取特定電影院在特定日期的所有場次"""
        # 使用與 atmovies_scraper_v3.py 相同的 URL 格式
        # 注意：theater['id'] 已經包含了 't' 前綴，例如 't02a06'
        # 構建 URL 格式: {BASE_URL}{theater_id}/{region_code}/[date/]
        
        # 從 get_region_list 獲取的 region 中提取 region_code
        region_code = theater.get('region_code', 'a02')  # 默認使用 'a02' 作為台北市的區域代碼
        
        # 構建基本 URL
        showtimes_url = f"{BASE_URL}{theater['id']}/{region_code}/"
        
        # 如果不是今天，加上日期參數
        # 在我們的 get_dates 方法中，沒有 'label' 鍵，所以我們使用日期來判斷
        # 獲取今天的日期格式化字符串
        today_formatted = datetime.date.today().strftime('%Y/%m/%d')
        
        # 如果不是今天，加上日期參數
        if date['formatted'] != today_formatted:
            showtimes_url += f"{date['url_param']}/"
        
        logger.info(f"獲取場次資料 URL: {showtimes_url}")
        
        page_content = await self.fetch_page(showtimes_url, session)
        if not page_content:
            logger.warning(f"無法獲取場次資料: {theater['name']} - {date['formatted']} 從 {showtimes_url}")
            return None

        movies_on_date = []
        # 簡化場次解析，我們主要關心是否有資料及日期
        # 原腳本的詳細解析邏輯可以保留，但此處僅為示例
        
        # 嘗試多種可能的選擇器來找到電影列表
        movie_elements = []
        selectors_to_try = [
            'ul#theaterShowtimeTable',  # 與 atmovies_scraper_v3.py 一致
            'ul.movieList > li',       # 舊的選擇器
            '#theaterShowtimeTable',    # 另一種可能的結構
        ]
        
        for selector in selectors_to_try:
            elements = page_content.select(selector)
            if elements:
                movie_elements = elements
                logger.info(f"使用選擇器 '{selector}' 找到 {len(elements)} 個元素")
                break
        
        # 解析電影名稱
        for movie_el in movie_elements:
            # 嘗試找到電影名稱
            film_title = movie_el.find('li', class_='filmTitle')
            if film_title:
                film_link = film_title.find('a')
                if film_link:
                    movie_name = film_link.text.strip()
                    # 移除可能的星號標記
                    movie_name = re.sub(r'\*+$', '', movie_name)
                    movies_on_date.append({"movie_name": movie_name, "time": "N/A"})
            
            # 如果上面的方法找不到，嘗試其他可能的結構
            if not film_title:
                # 嘗試找 h3 > a 或其他可能的結構
                movie_name_tag = movie_el.find('h3')
                if movie_name_tag and movie_name_tag.find('a'):
                    movie_name = movie_name_tag.find('a').text.strip()
                    movies_on_date.append({"movie_name": movie_name, "time": "N/A"})
        
        logger.info(f"在 {theater['name']} 於 {date['formatted']} 找到 {len(movies_on_date)} 部電影的場次資訊")
        return {
            'date': date['formatted'],
            'showtimes': movies_on_date # 簡化, 只存電影列表
        }

    async def process_theater(self, theater: Dict[str, str], dates: List[Dict[str, str]], session: aiohttp.ClientSession) -> Dict[str, Any]:
        """非同步處理單個電影院的所有日期場次，使用並行處理加速"""
        theater_id = theater['id']
        theater_name = theater['name']
        logger.info(f"開始處理電影院: {theater_name} (ID: {theater_id}) 的資料更新檢查")
        
        showtimes_by_date = []
        date_tasks = [asyncio.create_task(self.get_showtimes(theater, date_obj, session)) for date_obj in dates]
        date_results = await asyncio.gather(*date_tasks)
        
        for date_data in date_results:
            if date_data and date_data['showtimes']: # 確保有場次資料
                showtimes_by_date.append(date_data)

        # --- New printing block for checker script ---
        current_time_utc = datetime.datetime.utcnow()
        current_time_taipei = current_time_utc + datetime.timedelta(hours=8)
        
        print(f"\n=== ATMOVIES DATA UPDATE CHECK ===")
        print(f"Timestamp (Taipei Time): {current_time_taipei.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Theater Scraped: {theater_name} (ID: {theater_id})")
        
        processed_dates = [d['date'] for d in showtimes_by_date if d and d.get('showtimes')]
        if processed_dates:
            # 只打印有場次的日期，並確保唯一性
            unique_dates = sorted(list(set(processed_dates)))
            print(f"Showtime Dates Found: {', '.join(unique_dates)}")
        else:
            print(f"Showtime Dates Found: None for this theater on queried dates ({[d['formatted'] for d in dates]}).")
        print(f"==============================\n")
        # --- End of new printing block ---

        return {
            "atmovies_theater_id": theater_id,
            "atmovies_theater_name": theater_name,
            "atmovies_showtimes_by_date": showtimes_by_date
        }

    async def scrape_all(self, max_theaters_to_scrape: Optional[int] = None):
        """主要非同步爬蟲流程，抓取指定數量電影院的資料"""
        async with aiohttp.ClientSession() as session:
            regions = self.get_region_list()
            if not regions:
                logger.error("無法獲取區域列表，爬蟲中止。")
                return
            
            target_region = regions[0] 
            # Use 'region_name' as defined in get_region_list's return structure
            logger.info(f"目標區域: {target_region['region_name']}")

            all_theaters_full_list = await self.get_theaters_in_region(target_region, session)
            if not all_theaters_full_list:
                # Use 'region_name' as defined in get_region_list's return structure
                logger.error(f"在區域 {target_region['region_name']} 中找不到任何電影院，爬蟲中止。")
                return
            
            logger.info(f"在 {target_region['region_name']} 區域共找到 {len(all_theaters_full_list)} 家電影院 (完整列表)." )

            theaters_to_process = all_theaters_full_list
            if max_theaters_to_scrape is not None and len(all_theaters_full_list) > max_theaters_to_scrape:
                logger.info(f"限制為檢查前 {max_theaters_to_scrape} 家電影院。")
                theaters_to_process = all_theaters_full_list[:max_theaters_to_scrape]
            
            logger.info(f"將為本次檢查處理 {len(theaters_to_process)} 家電影院。")

            dates = self.get_dates()
            logger.info(f"將抓取以下日期的場次: {[d['formatted'] for d in dates]}")
            
            logger.info(f"使用非同步方法，最大並發請求數: {MAX_CONCURRENT_REQUESTS}")

            tasks = []
            for theater in theaters_to_process:
                task = asyncio.create_task(self.process_theater(theater, dates, session))
                tasks.append(task)
            
            # 等待所有選定電影院的處理完成
            collected_results = await asyncio.gather(*tasks)
            self.data = [res for res in collected_results if res] # Store results, though not saving to file
        
        # 列印每個電影院的收集結果及詳細統計信息
        all_theaters_stats = []
        total_movies_count = 0
        total_dates_with_data = 0
        dates_to_check = [d['formatted'] for d in dates]
        
        for theater_data in self.data:
            theater_name = theater_data.get('atmovies_theater_name', '未知電影院')
            theater_id = theater_data.get('atmovies_theater_id', '未知ID')
            showtimes_dates = []
            theater_stats = {
                'theater_name': theater_name,
                'theater_id': theater_id,
                'dates': []
            }
            
            for date_data in theater_data.get('atmovies_showtimes_by_date', []):
                date_formatted = date_data.get('date', '未知日期')
                showtimes = date_data.get('showtimes', [])
                movie_count = len(showtimes)
                
                if movie_count > 0:
                    showtimes_dates.append(date_formatted)
                    total_movies_count += movie_count
                    total_dates_with_data += 1
                
                theater_stats['dates'].append({
                    'date': date_formatted,
                    'movie_count': movie_count,
                    'movies': [movie.get('movie_name', '未知電影') for movie in showtimes]
                })
            
            all_theaters_stats.append(theater_stats)
            
            print("\n=== ATMOVIES DATA UPDATE CHECK ===")
            print(f"Timestamp (Taipei Time): {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"Theater Scraped: {theater_name} (ID: {theater_id})")
            if showtimes_dates:
                print(f"Showtime Dates Found: {', '.join(showtimes_dates)}")
            else:
                print(f"Showtime Dates Found: None for this theater on queried dates ({dates_to_check}).")
            print("==============================\n")
        
        # 在所有電影院處理完成後輸出統計信息
        print("\n=== ATMOVIES DATA UPDATE STATISTICS ===")
        print(f"Timestamp (Taipei Time): {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Total Theaters Scraped: {len(self.data)}")
        print(f"Total Dates with Data: {total_dates_with_data}")
        print(f"Total Movies Found: {total_movies_count}")
        print("\nDetailed Statistics by Theater and Date:")
        
        for theater in all_theaters_stats:
            print(f"\n{theater['theater_name']} (ID: {theater['theater_id']})")
            for date_info in theater['dates']:
                print(f"  {date_info['date']}: {date_info['movie_count']} movies")
                if date_info['movie_count'] > 0:
                    for i, movie in enumerate(date_info['movies'], 1):
                        print(f"    {i}. {movie}")
        
        print("\n==============================")
        
        # 返回統計信息供其他函數使用
        return {
            'total_theaters': len(self.data),
            'total_dates_with_data': total_dates_with_data,
            'total_movies': total_movies_count,
            'theater_stats': all_theaters_stats
        }
    
    # self.data is populated but not explicitly saved in this script's main flow

async def main():
    start_time = time.time()
    logger.info(f"開始執行 ATMovies 資料更新檢查爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    max_theaters = int(os.environ.get("MAX_THEATERS_TO_CHECK", MAX_THEATERS_TO_CHECK_DEFAULT))
    logger.info(f"將檢查最多 {max_theaters} 家電影院的資料。")
    logger.info(f"設置為抓取 3 天的場次資料 (今天、明天、後天)，最大並發請求數: {MAX_CONCURRENT_REQUESTS}")
    
    scraper = ATMoviesScraper()
    await scraper.scrape_all(max_theaters_to_scrape=max_theaters)
    
    end_time = time.time()
    duration = end_time - start_time
    logger.info(f"資料更新檢查爬蟲總耗時: {duration:.2f} 秒 ({duration/60:.2f} 分鐘)")
    logger.info(f"完成執行資料更新檢查爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    # 主要輸出將來自 process_theater 中的 print 語句

if __name__ == "__main__":
    # In Python 3.7+ asyncio.run is preferred
    # For older versions, you might use loop = asyncio.get_event_loop(); loop.run_until_complete(main())
    asyncio.run(main())


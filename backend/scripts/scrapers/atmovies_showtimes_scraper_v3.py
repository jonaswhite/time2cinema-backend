import requests
from bs4 import BeautifulSoup
import json
import csv
import time
import random
import re
import logging
import asyncio
import aiohttp
import ssl
import os
import sys
import datetime
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urljoin, urlparse, unquote, parse_qsl, urlencode

# 導入 User-Agent 列表
from user_agents import USER_AGENTS

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
MAX_RETRIES = 3  # 增加重試次數，提高成功率
TIMEOUT = 15   # 增加超時時間，避免因網路減速導致的失敗
DAYS_TO_SCRAPE = 3  # 要爬取的天數
MAX_CONCURRENT_REQUESTS = 8  # 增加並發請求數，提高效率
CONNECTION_LIMIT = 20  # 增加連接池大小，提高並發能力
REQUEST_DELAY = (0.8, 2.0)  # 稍微增加延遲時間，降低網站負擔
# 每個電影院之間的延遲時間
THEATER_DELAY = (1.0, 3.0)  # 電影院之間的延遲時間，降低網站負擔
# 統一輸出目錄到 backend/output/scrapers
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')

# 確保輸出目錄存在
os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"輸出目錄設置為: {OUTPUT_DIR}")

def get_random_headers() -> Dict[str, str]:
    """生成隨機請求頭"""
    user_agent = random.choice(USER_AGENTS)
    
    # 根據 User-Agent 設置相應的 sec-ch-ua 和 platform
    if 'Chrome' in user_agent:
        chrome_version = re.search(r'Chrome/(\d+)', user_agent)
        chrome_version = chrome_version.group(1) if chrome_version else '123'
        sec_ch_ua = f'"Google Chrome";v="{chrome_version}", "Not:A-Brand";v="8", "Chromium";v="{chrome_version}"'
        platform = 'Windows' if 'Windows' in user_agent else 'macOS'
    elif 'Firefox' in user_agent:
        firefox_version = re.search(r'Firefox/(\d+)', user_agent)
        firefox_version = firefox_version.group(1) if firefox_version else '123'
        sec_ch_ua = f'"Firefox";v="{firefox_version}"'
        platform = 'Windows' if 'Windows' in user_agent else 'macOS'
    elif 'Safari' in user_agent and 'Chrome' not in user_agent:
        safari_version = re.search(r'Version/(\d+)', user_agent)
        safari_version = safari_version.group(1) if safari_version else '17'
        sec_ch_ua = f'"Safari";v="{safari_version}"'
        platform = 'macOS'
    else:
        sec_ch_ua = '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"'
        platform = 'Windows'
    
    headers = {
        'User-Agent': user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'sec-ch-ua': sec_ch_ua,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': f'"{platform}"',
        'Referer': 'https://www.atmovies.com.tw/'
    }
    
    return headers

# 創建自定義 SSL 上下文
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE  # 跳過證書驗證
# 設置更寬鬆的 SSL 選項
ssl_context.options |= ssl.OP_NO_SSLv2
ssl_context.options |= ssl.OP_NO_SSLv3
ssl_context.options |= ssl.OP_NO_TLSv1
ssl_context.options |= ssl.OP_NO_TLSv1_1
# 設置協議版本
ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
ssl_context.maximum_version = ssl.TLSVersion.TLSv1_3

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
        self.session = None  # 用於保持會話

    async def fetch_page_sync(self, url: str) -> Optional[BeautifulSoup]:
        """同步獲取並解析網頁內容，處理重試邏輯"""
        retries = 0
        last_error = None
        
        while retries <= MAX_RETRIES:
            try:
                # 使用隨機的 User-Agent 和請求頭
                headers = get_random_headers()
                
                # 隨機延遲，避免請求過於頻繁
                time.sleep(1 + random.random() * 3)  # 1-4秒隨機延遲
                
                logger.info(f"正在同步抓取: {url} (嘗試 {retries + 1}/{MAX_RETRIES + 1})")
                
                # 使用 requests.Session 保持會話
                if not hasattr(self, 'session') or self.session is None:
                    self.session = requests.Session()
                    self.session.verify = False  # 跳過 SSL 驗證
                    self.session.headers.update(headers)
                
                # 添加隨機的查詢參數以避免緩存
                parsed_url = urlparse(url)
                query = dict(parse_qsl(parsed_url.query))
                query['_'] = str(int(time.time() * 1000))
                if random.random() > 0.7:
                    query['__cf_chl_rt_tk'] = ''.join(random.choices('abcdef0123456789', k=32))
                
                url_with_params = url
                if query:
                    url_with_params = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}?{urlencode(query)}&{parsed_url.query}" if parsed_url.query else f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}?{urlencode(query)}"
                
                logger.debug(f"同步請求 URL: {url_with_params}")
                
                # 發送請求
                response = self.session.get(
                    url_with_params,
                    timeout=TIMEOUT,
                    headers=headers,
                    allow_redirects=True
                )
                
                if response.status_code == 200:
                    # 檢查是否被重定向到驗證頁面
                    if '請輸入驗證碼' in response.text or 'Access Denied' in response.text or 'Cloudflare' in response.text:
                        logger.warning(f"觸發了防爬蟲驗證: {url}")
                        raise Exception("觸發了防爬蟲驗證")
                    return BeautifulSoup(response.text, 'html.parser')
                else:
                    logger.warning(f"HTTP錯誤: {response.status_code} - {url}")
                    last_error = f"HTTP {response.status_code}"
            except requests.exceptions.Timeout:
                last_error = "請求超時"
                logger.warning(f"請求超時: {url}")
            except requests.exceptions.RequestException as e:
                last_error = str(e)
                logger.error(f"請求錯誤: {e} - {url}")
            except Exception as e:
                last_error = str(e)
                logger.error(f"發生異常: {e} - {url}")
            
            retries += 1
            if retries <= MAX_RETRIES:
                wait_time = retries * 2 + random.random() * 3  # 指數退避 + 隨機延遲
                logger.info(f"等待 {wait_time:.1f} 秒後重試... (原因: {last_error})")
                time.sleep(wait_time)
                
                # 隨機切換 User-Agent
                if random.random() > 0.7:
                    self.session = None
            else:
                logger.error(f"已達最大重試次數，跳過 URL: {url}")
        
        return None

    async def fetch_page(self, url: str, session: aiohttp.ClientSession) -> Optional[BeautifulSoup]:
        """非同步獲取並解析網頁內容，使用指數退避策略進行重試"""
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # 隨機延遲，避免請求過於頻繁
                delay = random.uniform(*REQUEST_DELAY)
                if attempt > 1:
                    # 使用指數退避策略，每次重試增加等待時間
                    delay = delay + (2 ** (attempt - 1))
                
                logger.info(f"正在抓取: {url} (嘗試 {attempt}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
                
                # 每次請求使用新的隨機 headers
                custom_headers = get_random_headers()
                
                # 發送請求
                async with session.get(url, headers=custom_headers, ssl=ssl_context, timeout=TIMEOUT) as response:
                    if response.status != 200:
                        logger.error(f"請求失敗: {url}, 狀態碼: {response.status}")
                        
                        # 如果是 429 Too Many Requests，等待更長時間
                        if response.status == 429:
                            wait_time = 5 * attempt
                            logger.warning(f"請求過多，等待 {wait_time} 秒後重試")
                            await asyncio.sleep(wait_time)
                        continue
                    
                    html = await response.text()
                    
                    # 檢查頁面是否有效
                    if len(html) < 1000 or "404 Not Found" in html or "無法連線到伺服器" in html:
                        logger.error(f"無效的頁面內容: {url}, 長度: {len(html)}")
                        continue
                    
                    # 檢查是否被重定向到驗證頁面
                    if '請輸入驗證碼' in html or 'Access Denied' in html or 'Cloudflare' in html:
                        logger.warning(f"觸發了防爬蟲驗證: {url}")
                        continue
                    
                    # 解析 HTML
                    soup = BeautifulSoup(html, 'html.parser')
                    return soup
                    
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                logger.error(f"請求出錯: {url}, 錯誤: {e}, 嘗試: {attempt}/{MAX_RETRIES}")
                # 指數退避等待
                wait_time = 2 ** attempt + random.uniform(0, 1)
                logger.info(f"等待 {wait_time:.2f} 秒後重試")
                await asyncio.sleep(wait_time)
            except Exception as e:
                logger.error(f"未知錯誤: {url}, 錯誤: {e}, 嘗試: {attempt}/{MAX_RETRIES}")
                wait_time = 2 ** attempt + random.uniform(0, 1)
                await asyncio.sleep(wait_time)
        
        logger.error(f"已達最大重試次數，跳過 URL: {url}")
        return None
    
    def get_region_list(self) -> List[Dict[str, str]]:
        """獲取區域列表 - 全台灣地區"""
        regions = [
            {'region_code': 'a01', 'region_name': '基隆', 'url': f"{BASE_URL}a01/"},
            {'region_code': 'a02', 'region_name': '台北', 'url': f"{BASE_URL}a02/"},
            {'region_code': 'a03', 'region_name': '桃園', 'url': f"{BASE_URL}a03/"},
            {'region_code': 'a35', 'region_name': '新竹', 'url': f"{BASE_URL}a35/"},
            {'region_code': 'a37', 'region_name': '苗栗', 'url': f"{BASE_URL}a37/"},
            {'region_code': 'a04', 'region_name': '台中', 'url': f"{BASE_URL}a04/"},
            {'region_code': 'a47', 'region_name': '彰化', 'url': f"{BASE_URL}a47/"},
            {'region_code': 'a45', 'region_name': '雲林', 'url': f"{BASE_URL}a45/"},
            {'region_code': 'a49', 'region_name': '南投', 'url': f"{BASE_URL}a49/"},
            {'region_code': 'a05', 'region_name': '嘉義', 'url': f"{BASE_URL}a05/"},
            {'region_code': 'a06', 'region_name': '台南', 'url': f"{BASE_URL}a06/"},
            {'region_code': 'a07', 'region_name': '高雄', 'url': f"{BASE_URL}a07/"},
            {'region_code': 'a39', 'region_name': '宜蘭', 'url': f"{BASE_URL}a39/"},
            {'region_code': 'a38', 'region_name': '花蓮', 'url': f"{BASE_URL}a38/"},
            {'region_code': 'a89', 'region_name': '台中', 'url': f"{BASE_URL}a89/"},
            {'region_code': 'a87', 'region_name': '屏東', 'url': f"{BASE_URL}a87/"},
            {'region_code': 'a69', 'region_name': '澎湖', 'url': f"{BASE_URL}a69/"},
            {'region_code': 'a68', 'region_name': '金門', 'url': f"{BASE_URL}a68/"}
        ]
        logger.info(f"成功載入 {len(regions)} 個區域（全台灣地區）")
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
                
                # 從電影連結中提取 atmovies_id
                atmovies_id = None
                film_href = film_link.get('href', '')
                # 從 /movie/ 後面的部分提取 ID
                match = re.search(r'/movie/([^/]+)', film_href)
                if match:
                    atmovies_id = match.group(1)
                    logger.debug(f"找到電影 ID: {movie_name} -> {atmovies_id}")
                
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
                            if atmovies_id: # Only add showtime if we have an atmovies_id
                                showtime_data = {
                                    'time': time_text,
                                    'atmovies_id': atmovies_id
                                }
                                showtimes.append(showtime_data)
                            else:
                                logger.warning(f"電影 {movie_name} 缺少 atmovies_id，將跳過此場次")
            
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
        start_time = time.time()
        logger.info(f"開始執行爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"設置為抓取 {DAYS_TO_SCRAPE} 天的場次資料，最大並發請求數: {MAX_CONCURRENT_REQUESTS}")
        
        # 初始化數據存儲
        self.data = []
        
        # 獲取所有區域
        all_regions = self.get_region_list()
        regions = all_regions
        logger.info(f"成功載入 {len(regions)} 個區域")
        logger.info(f"處理的區域: {[r['region_name'] for r in regions]}")
        
        # 獲取日期列表
        dates = self.get_dates()
        logger.info(f"抽取 {len(dates)} 天的場次資訊")
        
        # 使用優化的 aiohttp 客戶端配置
        headers = get_random_headers()
        connector = aiohttp.TCPConnector(
            limit=CONNECTION_LIMIT,
            ssl=ssl_context,
            force_close=True,  # 強制關閉連接以避免連接洩漏
            enable_cleanup_closed=True  # 清理已關閉的連接
        )
        timeout = aiohttp.ClientTimeout(total=TIMEOUT, connect=TIMEOUT/2)
        
        async with aiohttp.ClientSession(
            headers=headers,
            connector=connector,
            timeout=timeout,
            trust_env=True
        ) as session:
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
            batch_size = 15  # 增加每批處理的電影院數量
            all_results = []
            
            # 將電影院按地區分組，每個地區的電影院放在一起處理
            theaters_by_region = {}
            for theater in all_theaters:
                region_code = theater['region_code']
                if region_code not in theaters_by_region:
                    theaters_by_region[region_code] = []
                theaters_by_region[region_code].append(theater)
            
            # 先處理電影院數量較少的地區
            sorted_regions = sorted(theaters_by_region.items(), key=lambda x: len(x[1]))
            
            for region_code, region_theaters in sorted_regions:
                logger.info(f"開始處理地區 {region_code} 的 {len(region_theaters)} 家電影院")
                
                for i in range(0, len(region_theaters), batch_size):
                    batch = region_theaters[i:i+batch_size]
                    logger.info(f"處理地區 {region_code} 電影院批次 {i//batch_size + 1}/{(len(region_theaters)-1)//batch_size + 1} (共 {len(batch)} 家電影院)")
                    
                    tasks = []
                    for theater in batch:
                        # 每個電影院之間添加隨機延遲，降低網站負擔
                        await asyncio.sleep(random.uniform(*THEATER_DELAY))
                        task = asyncio.create_task(self.process_theater(theater, dates, session))
                        tasks.append(task)
                    
                    # 等待當前批次完成
                    batch_results = await asyncio.gather(*tasks)
                    all_results.extend(batch_results)
                    
                    # 批次之間的延遲，給網站一些「喘息」的時間
                    await asyncio.sleep(random.uniform(2.0, 4.0))
            
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
                writer.writerow(['電影院ID', '電影院名稱', '日期', '場次時間', 'atmovies_id'])
                
                for theater in self.data:
                    for date_data in theater['atmovies_showtimes_by_date']:
                        for showtime in date_data['showtimes']:
                            writer.writerow([
                                theater['atmovies_theater_id'],
                                theater['atmovies_theater_name'],
                                date_data['date'],
                                showtime['time'],
                                showtime['atmovies_id']
                            ])
                
            logger.info(f"已將資料保存至 {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"保存CSV時出錯: {e}")
            return None

async def main():
    start_time = time.time()
    logger.info(f"開始執行爬蟲，時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"設置為抓取 {DAYS_TO_SCRAPE} 天的場次資料，最大並發請求數: {MAX_CONCURRENT_REQUESTS}")
    
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

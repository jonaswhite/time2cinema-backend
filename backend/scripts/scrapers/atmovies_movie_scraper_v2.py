#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import aiohttp
import asyncio
import json
import logging
import os
import re
import sys
import time
import datetime
import random
import csv
from bs4 import BeautifulSoup
from typing import Dict, List, Any, Optional, Set, Tuple
from urllib.parse import urljoin
from title_utils import split_chinese_english
from dotenv import load_dotenv

# Load environment variables
# Correct path from backend/scripts/scrapers/ to the root .env file
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print(f"INFO: Attempting to load .env file from: {dotenv_path}")
else:
    print(f"INFO: .env file not found at {dotenv_path}. Attempting to load from default location or environment.")
    load_dotenv() # Fallback

DATABASE_URL = os.getenv('DATABASE_URL')
TMDB_API_KEY = os.getenv('TMDB_API_KEY')


# 設定專案根目錄與輸出目錄
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output', 'scrapers')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 設定日誌格式和級別
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(OUTPUT_DIR, 'atmovies_movie_scraper.log'))
    ]
)
logger = logging.getLogger(__name__)

# 導入自定義的 User-Agent 列表
from user_agents import USER_AGENTS

# 設置默認編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 確保日誌目錄存在
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 設置日誌
logger = logging.getLogger('atmovies_movie_scraper')
logger.setLevel(logging.DEBUG)

# 創建文件處理器
log_file = os.path.join(OUTPUT_DIR, 'atmovies_movie_scraper_v2.log')
file_handler = logging.FileHandler(log_file, mode='w')
file_handler.setLevel(logging.DEBUG)

# 創建控制台處理器
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)

# 創建日誌格式
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

# 添加處理器到日誌記錄器
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# 設置其他模組的日誌級別
logging.getLogger('aiohttp').setLevel(logging.WARNING)
logging.getLogger('asyncio').setLevel(logging.WARNING)

# 設置根日誌記錄器
root_logger = logging.getLogger()
root_logger.setLevel(logging.WARNING)
root_logger.addHandler(file_handler)
root_logger.addHandler(console_handler)

# 設置爬蟲日誌記錄器
logger = logging.getLogger('atmovies_movie_scraper')

# 常數設定
BASE_URL = "https://www.atmovies.com.tw/"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.atmovies.com.tw/',
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
}
TIMEOUT = 30  # 增加請求超時時間至 30 秒
MAX_CONCURRENT_REQUESTS = 5  # 降低並發請求數至 5
MAX_RETRIES = 3  # 最大重試次數
RETRY_DELAY = 3  # 重試間隔時間(秒)

# 資料庫連接資訊
DATABASE_URL_ENV = os.environ.get('DATABASE_URL')
if not DATABASE_URL_ENV:
    logger.error("錯誤：DATABASE_URL 環境變數未設定。請設定該環境變數再執行腳本。")
    sys.exit(1)
DB_URL = DATABASE_URL_ENV

# 電影清單頁面
FIRST_RUN_URL = "https://www.atmovies.com.tw/movie/now/1/"
SECOND_RUN_URL = "https://www.atmovies.com.tw/movie/now2/1/"

class ATMoviesMovieScraper:
    """ATMovies 電影爬蟲"""
    def __init__(self):
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)  # 限制並發請求數
        self.session = None  # 用於非同步HTTP請求的session
        self.movie_details_cache = {}  # 快取已爬取的電影詳情
        self.movies = []  # 儲存爬取的電影資料
        self.processed_movies = set()  # 用於追蹤已處理的電影ID，避免重複處理
        self.conn = None  # 資料庫連接
        self.cursor = None  # 資料庫游標
        
    async def __aenter__(self):
        """非同步上下文管理器進入點，用於初始化資源"""
        import psycopg2
        from psycopg2.extras import DictCursor
        
        try:
            # 使用 Supabase 連接字串（從 .env 檔案中獲取）
            supabase_url = 'postgresql://postgres.bnfplxbaqnmwpjvjwqzx:Thisisjonas2021%40@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require'
            
            # 建立資料庫連接
            logger.info("正在連接到 Supabase 資料庫")
            
            # 建立連接
            self.conn = psycopg2.connect(
                supabase_url,
                cursor_factory=DictCursor
            )
            self.cursor = self.conn.cursor()
            
            # 測試連線
            self.cursor.execute("SELECT 1")
            logger.info("資料庫連線測試成功")
            
            # 設定搜尋路徑
            self.cursor.execute("SET search_path TO public")
            self.conn.commit()
            return self
            
        except Exception as e:
            logger.error(f"資料庫連線失敗: {e}")
            if hasattr(self, 'conn') and self.conn:
                self.conn.close()
            raise
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """非同步上下文管理器退出點，用於清理資源"""
        logger.info("開始執行 __aexit__ 清理資源...")
        
        # 處理資料庫事務
        if self.conn:
            try:
                if exc_type is not None:
                    logger.info("偵測到異常，嘗試回滾資料庫事務...")
                    self.conn.rollback()
                    logger.info("資料庫事務已回滾")
                else:
                    logger.info("嘗試提交資料庫事務...")
                    self.conn.commit()
                    logger.info("資料庫事務已提交")
            except Exception as e:
                logger.error(f"處理資料庫事務時出錯 (commit/rollback): {e}", exc_info=True)

        # 關閉資料庫游標
        if self.cursor:
            try:
                logger.info("嘗試關閉資料庫游標...")
                self.cursor.close()
                logger.info("資料庫游標已成功關閉")
            except Exception as e:
                logger.error(f"關閉資料庫游標時出錯: {e}", exc_info=True)
            finally:
                self.cursor = None # Set to None after attempting to close
        else:
            logger.info("資料庫游標不存在或已為 None")
        
        # 關閉資料庫連接
        if self.conn:
            try:
                logger.info("嘗試關閉資料庫連接...")
                self.conn.close()
                logger.info("資料庫連接已成功關閉")
            except Exception as e:
                logger.error(f"關閉資料庫連接時出錯: {e}", exc_info=True)
            finally:
                self.conn = None # Set to None after attempting to close
        else:
            logger.info("資料庫連接不存在或已為 None")

        # 關閉 aiohttp session
        if hasattr(self, 'session') and self.session:
            if not self.session.closed:
                try:
                    logger.info("嘗試關閉 aiohttp.ClientSession...")
                    await self.session.close()
                    logger.info("aiohttp.ClientSession 已成功關閉")
                except Exception as e:
                    logger.error(f"關閉 aiohttp.ClientSession 時出錯: {e}", exc_info=True)
            else:
                logger.info("aiohttp.ClientSession 已經關閉")
            self.session = None 
        else:
            logger.info("aiohttp.ClientSession 不存在、已為 None 或未初始化")
        
        logger.info("__aexit__ 清理資源完成")
        
    async def save_to_file(self, format_type: str = 'json') -> str:
        """
        將爬取的電影資料保存到檔案
        
        Args:
            format_type: 輸出格式，可選 'json' 或 'csv'
            
        Returns:
            str: 保存的檔案路徑
        """
        if not self.movies:
            logger.warning("沒有電影資料可以保存")
            return ""
            
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if format_type.lower() == 'json':
            filename = os.path.join(OUTPUT_DIR, f'atmovies_movies_{timestamp}.json')
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(self.movies, f, ensure_ascii=False, indent=2)
        elif format_type.lower() == 'csv':
            filename = os.path.join(OUTPUT_DIR, f'atmovies_movies_{timestamp}.csv')
            # 確保所有字典都有相同的鍵
            all_keys = set()
            for movie in self.movies:
                all_keys.update(movie.keys())
            fieldnames = sorted(all_keys)
            
            with open(filename, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
        else:
            logger.error(f"不支援的格式: {format_type}")
            return ""
            
        logger.info(f"已將 {len(self.movies)} 部電影資料保存到 {filename}")
        return filename
            
    async def create_session(self):
        """創建HTTP會話"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers=HEADERS)
        return self.session
    
    async def close_session(self):
        """關閉HTTP會話"""
        if self.session and not self.session.closed:
            await self.session.close()
            logger.info("非同步HTTP session已關閉")
            
    async def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """獲取並解析頁面內容，帶重試機制和隨機 User-Agent"""
        if not self.session:
            await self.create_session()
        
        retries = 0
        while retries < MAX_RETRIES:
            try:
                # 使用隨機 User-Agent
                headers = HEADERS.copy()
                headers['User-Agent'] = self._get_random_user_agent()
                
                # 添加隨機參數以避免緩存
                params = {
                    "_": int(time.time() * 1000),
                    "rand": random.randint(1000, 9999)
                }
                
                # 添加更多隨機請求頭
                headers['Accept-Encoding'] = random.choice(['gzip, deflate', 'br, gzip, deflate', 'gzip, deflate, br'])
                headers['Accept-Language'] = random.choice(['zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7', 'zh-TW,zh;q=0.8,en;q=0.6', 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7'])
                
                async with self.semaphore:
                    # 增加隨機延遲，模擬真實用戶行為
                    await asyncio.sleep(1 + random.random() * 2)
                    
                    async with self.session.get(url, headers=headers, params=params, timeout=TIMEOUT) as response:
                        if response.status == 200:
                            html = await response.text()
                            soup = BeautifulSoup(html, 'html.parser')
                            
                            # 檢查頁面是否有效
                            if self._is_valid_page(soup, url):
                                return soup
                            else:
                                logger.warning(f"無效的頁面內容: {url}")
                                retries += 1
                        else:
                            logger.warning(f"請求失敗: {url}, 狀態碼: {response.status}")
                            retries += 1
            except asyncio.TimeoutError:
                logger.warning(f"請求超時: {url}, 重試 {retries+1}/{MAX_RETRIES}")
                retries += 1
                # 超時後增加等待時間
                await asyncio.sleep(RETRY_DELAY * (retries + 1))
            except Exception as e:
                logger.error(f"請求出錯: {url}, 錯誤: {e}, 重試 {retries+1}/{MAX_RETRIES}")
                retries += 1
                await asyncio.sleep(RETRY_DELAY)
        
        logger.error(f"已達到最大重試次數，無法獲取頁面: {url}")
        return None
        

        
    def _get_random_user_agent(self) -> str:
        """獲取隨機 User-Agent"""
        # 使用導入的擴展 User-Agent 列表
        return random.choice(USER_AGENTS)
    
    def _is_valid_page(self, soup: BeautifulSoup, url: str) -> bool:
        """檢查頁面是否有效"""
        # 如果是電影詳情頁面，檢查是否有電影標題
        if '/movie/' in url and not '/now' in url:
            return soup.select_one('.filmTitle') is not None
        # 如果是電影列表頁面，檢查是否有電影連結
        elif '/now/' in url or '/now2/' in url:
            return len(soup.find_all('a', href=re.compile(r'/movie/[a-zA-Z0-9]+/'))) > 0
        return True  # 其他頁面預設為有效
                
    async def get_movie_list(self, page_url: str) -> List[Dict[str, Any]]:
        """獲取電影列表"""
        if "first-run" in page_url:
            return await self._get_first_run_movies(page_url)
        else:
            return await self._get_movies_from_page(page_url)
    
    async def _get_first_run_movies(self, page_url: str) -> List[Dict[str, Any]]:
        """獲取首輪電影列表，包含處理「更多影片」按鈕"""
        # 先獲取第一頁的電影
        movies = await self._get_movies_from_page(page_url)
        logger.info(f"第一頁找到 {len(movies)} 部電影")
        
        # 處理「更多影片」按鈕，獲取後續頁面
        soup = await self.fetch_page(page_url)
        if not soup:
            logger.error(f"無法解析頁面: {page_url}")
            return movies
        
        # 尋找「更多影片」按鈕
        more_button = soup.select_one(".listTab a[onclick*='grabFile']")
        if more_button:
            # 從onclick屬性中提取URL
            onclick = more_button.get('onclick', '')
            url_match = re.search(r"grabFile\('([^']+)',[^)]+\)", onclick)
            if url_match:
                more_url = url_match.group(1)
                if not more_url.startswith('http'):
                    more_url = urljoin(BASE_URL, more_url)
                
                logger.info(f"找到更多影片按鈕，URL: {more_url}")
                more_movies = await self._get_movies_from_page(more_url)
                logger.info(f"更多影片頁面找到 {len(more_movies)} 部電影")
                
                # 合併電影列表
                movies.extend(more_movies)
        
        logger.info(f"首輪電影共找到 {len(movies)} 部電影")
        return movies
    
    async def _get_movies_from_page(self, page_url: str) -> List[Dict[str, Any]]:
        """從指定頁面獲取電影列表
        
        Args:
            page_url: 要爬取的頁面URL
            
        Returns:
            List[Dict[str, Any]]: 包含電影資訊的字典列表
        """
        soup = await self.fetch_page(page_url)
        if not soup:
            logger.error(f"無法解析頁面: {page_url}")
            return []
        
        # 對網頁內容進行除錯調試
        logger.debug(f"頁面標題: {soup.title.text if soup.title else 'No title'}")
        
        # 嘗試不同的選擇器來找到電影項目
        selectors = [
            "article.filmList",  # 根據分析結果的主要選擇器
            ".filmList",  # 備用選擇器
            ".filmList li",  # 原始選擇器
            ".filmListPA li",  # 原始備用選擇器
            "li.filmList",  # 可能的變化
            "div.filmList",  # 可能的變化
            "ul.filmList li"  # 可能的變化
        ]
        
        movie_items = []
        for selector in selectors:
            items = soup.select(selector)
            if items:
                logger.info(f"使用選擇器 '{selector}' 找到 {len(items)} 個項目")
                movie_items = items
                break
        
        if not movie_items:
            # 如果使用選擇器找不到，嘗試直接尋找所有包含電影連結的元素
            movie_links = soup.find_all('a', href=re.compile(r'/movie/[a-zA-Z0-9]+/'))
            if movie_links:
                logger.info(f"直接找到 {len(movie_links)} 個電影連結")
                await self._process_movie_links(movie_links, page_url)
                return self.movies[-len(movie_links):]  # 返回新增的電影
            else:
                logger.warning(f"在頁面 {page_url} 中找不到電影項目")
                return []
        
        logger.info(f"在頁面 {page_url} 中處理 {len(movie_items)} 個電影項目")
        
        for item in movie_items:
            try:
                # 尋找電影連結，可能在項目內或就是項目本身
                title_element = None
                if item.name == 'a' and '/movie/' in item.get('href', ''):
                    title_element = item
                else:
                    title_element = item.select_one("a[href*='/movie/']")
                
                if not title_element:
                    continue
                
                href = title_element.get("href", "")
                if not href or '/movie/' not in href:
                    continue
                    
                # 提取並標準化電影ID
                atmovies_id = href.split('/')[-2] if href.endswith('/') else href.split('/')[-1]
                atmovies_id = self._normalize_movie_id(atmovies_id)
                
                # 檢查是否為有效的電影ID（過濾非電影資料）
                if not self._is_valid_movie_id(atmovies_id):
                    logger.debug(f"跳過無效的電影ID: {atmovies_id}")
                    continue
                
                # 避免重複處理同一部電影
                if atmovies_id in self.processed_movies:
                    logger.debug(f"電影已處理，跳過: {atmovies_id}")
                    continue
                    
                # 標記為已處理
                self.processed_movies.add(atmovies_id)
                
                # 獲取電影標題
                title = title_element.text.strip()
                if not title:  # 如果沒有標題，跳過
                    logger.debug(f"跳過無標題的電影: {atmovies_id}")
                    continue
                    
                # 使用 split_chinese_english 函數來分割中英文標題
                chinese_title, english_title = split_chinese_english(title)
                
                # 如果 split_chinese_english 無法正確分割，則使用簡單的邏輯作為備用
                if not chinese_title and not english_title:
                    logger.debug("split_chinese_english 返回空結果，使用備用邏輯")
                    title_parts = title.split(" ", 1)
                    if len(title_parts) > 1 and re.search(r'[A-Za-z]', title_parts[1]):
                        chinese_title = title_parts[0].strip()
                        english_title = title_parts[1].strip()
                    else:
                        chinese_title = title
                        english_title = ""
                
                logger.debug(f"解析標題: {title}")
                logger.debug(f"解析結果 - 中文: '{chinese_title}', 英文: '{english_title}'")
                
                # 初始化電影資料
                movie_data = {
                    'atmovies_id': atmovies_id,
                    'full_title': title,
                    'chinese_title': chinese_title,
                    'english_title': english_title,
                    'detail_url': f"https://www.atmovies.com.tw/movie/{atmovies_id}/",
                    'source_url': page_url,
                    'crawled_at': datetime.datetime.now().isoformat(),
                    'runtime': None,
                    'release_date': None,
                    'poster_url': None
                }
                
                # 尋找片長和上映日期資訊
                runtime = None
                release_date = None
                detail_url = f"https://www.atmovies.com.tw/movie/{atmovies_id}/"
                
                # 根據我們的分析，片長和上映日期資訊在 div.runtime 元素中
                # 如果 item 本身是 article.filmList，直接在其中尋找
                if item.name == 'article' and 'filmList' in item.get('class', []):
                    runtime_elem = item.select_one("div.runtime")
                    
                    # 嘗試獲取海報圖片URL
                    poster_elem = item.select_one("img.filmListPoster")
                    if poster_elem and 'src' in poster_elem.attrs:
                        movie_data['poster_url'] = poster_elem['src']
                        logger.debug(f"找到海報圖片: {movie_data['poster_url']}")
                else:
                    # 嘗試找到包含此電影的 article.filmList
                    parent_article = item.find_parent("article", class_="filmList")
                    if parent_article:
                        runtime_elem = parent_article.select_one("div.runtime")
                        
                        # 嘗試從父元素獲取海報圖片URL
                        poster_elem = parent_article.select_one("img.filmListPoster")
                        if poster_elem and 'src' in poster_elem.attrs:
                            movie_data['poster_url'] = poster_elem['src']
                            logger.debug(f"找到海報圖片: {movie_data['poster_url']}")
                    else:
                        # 如果找不到特定結構，嘗試更寬泛的選擇器
                        runtime_elem = item.select_one("div.runtime")
                
                if runtime_elem and runtime_elem.text.strip():
                    runtime_date_text = runtime_elem.text.strip()
                    logger.info(f"找到片長和上映日期資訊: {runtime_date_text}")
                    
                    # 提取片長
                    runtime_match = re.search(r"片長[\s\xa0]*[\:|：]?[\s\xa0]*(\d+)[\s\xa0]*分", runtime_date_text)
                    if runtime_match:
                        movie_data['runtime'] = int(runtime_match.group(1))
                        logger.info(f"提取到片長: {movie_data['runtime']} 分鐘")
                    
                    # 提取上映日期 - 先嘗試 MM/DD/YYYY 格式
                    date_match = re.search(r"上映日期[\s\xa0]*[\:|：]?[\s\xa0]*([\d/]+)", runtime_date_text)
                    if date_match:
                        date_str = date_match.group(1)
                        logger.info(f"提取到上映日期字串: {date_str}")
                        try:
                            # 處理日期格式 (例如: 5/14/2025 或 2025/05/14)
                            if '/' in date_str:
                                parts = date_str.split('/')
                                if len(parts) == 3:  # 可能是 MM/DD/YYYY 或 YYYY/MM/DD
                                    if len(parts[0]) == 4:  # YYYY/MM/DD
                                        year = parts[0]
                                        month = parts[1].zfill(2)
                                        day = parts[2].zfill(2)
                                    else:  # MM/DD/YYYY
                                        month = parts[0].zfill(2)
                                        day = parts[1].zfill(2)
                                        year = parts[2] if len(parts[2]) == 4 else "2025"
                                elif len(parts) == 2:  # MM/DD (年份假設為當前年份)
                                    month = parts[0].zfill(2)
                                    day = parts[1].zfill(2)
                                    year = "2025"  # 假設為2025年
                                movie_data['release_date'] = f"{year}-{month}-{day}"
                                logger.info(f"格式化上映日期: {movie_data['release_date']}")
                        except Exception as e:
                            logger.error(f"解析日期出錯: {date_str}, 錯誤: {e}")
                
                # 將電影資料加入列表
                # 嘗試從項目的其他部分尋找資訊
                item_text = item.text.strip()
                
                # 嘗試從整個項目文本中提取片長
                if not movie_data['runtime']:
                    runtime_match = re.search(r"片長[\s\xa0]*[\:|：]?[\s\xa0]*(\d+)[\s\xa0]*分", item_text)
                    if runtime_match:
                        movie_data['runtime'] = int(runtime_match.group(1))
                        logger.info(f"從項目文本提取到片長: {movie_data['runtime']} 分鐘")
                
                # 嘗試從整個項目文本中提取上映日期
                if not movie_data['release_date']:
                    date_match = re.search(r"上映日期[\s\xa0]*[\:|：]?[\s\xa0]*([\d/]+)", item_text)
                    if date_match:
                        date_str = date_match.group(1)
                        try:
                            # 處理日期格式
                            if '/' in date_str:
                                parts = date_str.split('/')
                                if len(parts) == 3:  # 可能是 MM/DD/YYYY 或 YYYY/MM/DD
                                    if len(parts[0]) == 4:  # YYYY/MM/DD
                                        year = parts[0]
                                        month = parts[1].zfill(2)
                                        day = parts[2].zfill(2)
                                    else:  # MM/DD/YYYY
                                        month = parts[0].zfill(2)
                                        day = parts[1].zfill(2)
                                        year = parts[2] if len(parts[2]) == 4 else "2025"
                                    movie_data['release_date'] = f"{year}-{month}-{day}"
                                    logger.info(f"從項目文本提取到上映日期: {movie_data['release_date']}")
                                elif len(parts) == 2:  # MM/DD
                                    month = parts[0].zfill(2)
                                    day = parts[1].zfill(2)
                                    year = "2025"  # 假設為今年
                                    movie_data['release_date'] = f"{year}-{month}-{day}"
                                    logger.info(f"從項目文本提取到上映日期(無年份): {movie_data['release_date']}")
                        except Exception as e:
                            logger.error(f"解析日期出錯: {date_str}, 錯誤: {e}")
                
                self.movies.append(movie_data)
                logger.info(f"已處理電影: {title} (ID: {atmovies_id})")
                
            except Exception as e:
                logger.error(f"處理電影項目時發生錯誤: {e}", exc_info=True)
                continue
                
        return self.movies[-len(movie_items):]  # 返回新增的電影
    
    def _normalize_movie_id(self, movie_id: str) -> str:
        """標準化電影ID，移除常見的社交媒體前綴"""
        # 移除常見的社交媒體前綴
        prefixes = ['fb', 'tw', 'ig', 'yt']
        for prefix in prefixes:
            if movie_id.startswith(prefix) and len(movie_id) > len(prefix):
                # 檢查前綴後面的部分是否為有效的電影ID格式
                remaining = movie_id[len(prefix):]
                if self._is_valid_movie_id(remaining):
                    return remaining
        return movie_id

    def _is_valid_movie_id(self, atmovies_id: str) -> bool:
        """檢查是否為有效的電影ID"""
        # 已知的非電影ID列表
        invalid_ids = [
            'newmovie', 'list', 'listall', 'parasite', 'now2', 'new'
        ]
        
        # 如果在已知的非電影ID列表中，返回 False
        if atmovies_id in invalid_ids:
            return False
            
        # 有效的電影ID通常是由字母開頭加上數字組成
        # 例如：fmen33092501，fako92197800
        valid_pattern = re.compile(r'^f[a-z]{2,3}\d{8}$')
        return bool(valid_pattern.match(atmovies_id))
    
    async def save_movie_to_db(self, movie_data: Dict[str, Any]) -> bool:
        """
        將電影資訊存入資料庫
        
        Args:
            movie_data: 包含電影資訊的字典，應包含以下欄位：
                - atmovies_id (str): ATMovies 電影ID
                - full_title (str): 完整標題
                - chinese_title (str): 中文標題
                - english_title (str): 英文標題
                - runtime (int): 片長（分鐘）
                - release_date (str): 上映日期（YYYY-MM-DD）
                - poster_url (str, optional): 海報URL
                
        Returns:
            bool: 操作是否成功
        """
        try:
            if not hasattr(self, 'conn') or self.conn.closed:
                logger.error("資料庫連接未建立或已關閉")
                return False
            
            # 確保必要欄位存在
            required_fields = ['atmovies_id', 'full_title']
            for field in required_fields:
                if field not in movie_data:
                    logger.error(f"缺少必要欄位: {field}")
                    return False
            
            # 記錄要保存的電影資料（使用 get 方法避免 KeyError）
            atmovies_id = movie_data['atmovies_id']
            full_title = movie_data.get('full_title', '未知電影')
            
            logger.info(f"準備保存電影到資料庫: {full_title} (ID: {atmovies_id})")
            logger.debug(f"  完整標題: {full_title}")
            logger.debug(f"  中文標題: {movie_data.get('chinese_title', '無')}")
            logger.debug(f"  英文標題: {movie_data.get('english_title', '無')}")
            logger.debug(f"  片長: {movie_data.get('runtime', '無')} 分鐘")
            logger.debug(f"  上映日期: {movie_data.get('release_date', '無')}")
            logger.debug(f"  海報URL: {movie_data.get('poster_url', '無')}")
            
            # 檢查電影是否已存在
            self.cursor.execute(
                """
                SELECT id, full_title, chinese_title, english_title, 
                       runtime, release_date, poster_url 
                FROM movies 
                WHERE atmovies_id = %s
                """,
                (atmovies_id,)
            )
            existing_movie = self.cursor.fetchone()
            
            if existing_movie:
                # 記錄現有電影的資料
                logger.info(f"找到現有電影 (資料庫ID: {existing_movie[0]})")
                logger.info(f"  現有完整標題: {existing_movie[1]}")
                logger.info(f"  現有中文標題: {existing_movie[2]}")
                logger.info(f"  現有英文標題: {existing_movie[3]}")
                
                # 構建更新語句，強制更新所有欄位，包括 None 值
                update_fields = [
                    'full_title = %s',
                    'chinese_title = %s',
                    'english_title = %s',
                    'runtime = %s',
                    'release_date = %s',
                    'poster_url = %s',
                    'updated_at = NOW()'
                ]
                
                # 準備更新值，使用 get() 方法獲取值，如果不存在則為 None
                update_values = [
                    movie_data.get('full_title'),
                    movie_data.get('chinese_title'),
                    movie_data.get('english_title'),
                    movie_data.get('runtime'),
                    movie_data.get('release_date'),
                    movie_data.get('poster_url')
                ]
                
                if not update_fields:
                    logger.info("沒有需要更新的欄位")
                    return True
                
                # 添加 WHERE 條件
                update_values.append(atmovies_id)
                
                # 構建並執行更新查詢
                update_query = f"""
                    UPDATE movies 
                    SET {', '.join(update_fields)}
                    WHERE atmovies_id = %s
                    RETURNING id
                """
                
                logger.info(f"執行更新查詢: {update_query}")
                logger.info(f"更新參數: {update_values}")
                
                try:
                    # 執行更新
                    self.cursor.execute(update_query, update_values)
                    
                    # 檢查更新是否成功
                    if self.cursor.rowcount > 0:
                        updated_id = self.cursor.fetchone()[0]
                        logger.info(f"成功更新電影資料 (資料庫ID: {updated_id})")
                        # 提交事務
                        self.conn.commit()
                        return True
                    else:
                        logger.warning(f"更新電影時沒有影響任何記錄: {full_title} (ID: {atmovies_id})")
                        return False
                        
                except Exception as e:
                    logger.error(f"更新電影資料時發生錯誤: {e}", exc_info=True)
                    # 發生錯誤時回滾事務
                    self.conn.rollback()
                    return False
            else:
                # 新增電影
                insert_query = """
                    INSERT INTO movies (
                        atmovies_id, full_title, chinese_title, english_title, 
                        runtime, release_date, poster_url, created_at, updated_at, source
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), 'atmovies')
                    RETURNING id
                """
                
                insert_values = (
                    atmovies_id,
                    full_title,
                    movie_data.get('chinese_title'),
                    movie_data.get('english_title'),
                    movie_data.get('runtime'),
                    movie_data.get('release_date'),
                    movie_data.get('poster_url')
                )
                
                logger.debug(f"執行新增語句: {insert_query}")
                logger.debug(f"新增值: {insert_values}")
                
                self.cursor.execute(insert_query, insert_values)
                new_id = self.cursor.fetchone()[0]
                self.conn.commit()
                
                logger.info(f"成功新增電影: {full_title} (資料庫ID: {new_id}, ATMovies ID: {atmovies_id})")
                return True
                
        except Exception as e:
            self.conn.rollback()
            logger.error(f"存入電影資訊時出錯: {str(e)}", exc_info=True)
            return False
    
    async def process_movie_list(self, page_url: str) -> int:
        """處理電影列表頁面"""
        # 獲取電影列表
        movies = await self.get_movie_list(page_url)
        processed_count = 0
        failed_count = 0
        
        if not movies:
            logger.warning(f"無法從頁面獲取電影列表: {page_url}")
            return processed_count
            
        logger.info(f"共找到 {len(movies)} 部電影，開始處理...")
        
        # 處理每部電影
        for index, movie in enumerate(movies):
            try:
                logger.info(f"[進度 {index+1}/{len(movies)}] 處理電影: {movie.get('full_title', '未知電影')} ({movie.get('atmovies_id', 'N/A')})")
                
                # 檢查資料完整性
                if not self._validate_movie_data(movie):
                    logger.warning(f"電影資料不完整，已跳過: {movie.get('full_title', '未知電影')}")
                    failed_count += 1
                    continue
                
                # 存入資料庫
                if await self.save_movie_to_db(movie):
                    processed_count += 1
                    logger.info(f"成功處理電影: {movie.get('full_title', '未知電影')} ({movie.get('atmovies_id', 'N/A')})")
                    
                    # 打印詳細資訊供檢查
                    logger.info(f"  完整標題: {movie.get('full_title', 'N/A')}")
                    logger.info(f"  中文標題: {movie.get('chinese_title', 'N/A')}")
                    logger.info(f"  英文標題: {movie.get('english_title', 'N/A')}")
                    logger.info(f"  上映日期: {movie.get('release_date', 'N/A')}")
                    logger.info(f"  片長: {movie.get('runtime', 'N/A')} 分鐘")
                else:
                    failed_count += 1
                
                # 由於不需要訪問詳情頁面，可以減少延遲
                await asyncio.sleep(0.2 + random.random() * 0.3)
            except Exception as e:
                logger.error(f"處理電影時出錯: {e}", exc_info=True)
                failed_count += 1
        
        logger.info(f"頁面 {page_url} 處理完成: 成功 {processed_count} 部，失敗 {failed_count} 部")
        return processed_count
        
    def _validate_movie_data(self, movie_data: Dict[str, Any]) -> bool:
        """驗證電影資料是否完整"""
        # 檢查必要欄位
        required_fields = ['atmovies_id', 'full_title']
        for field in required_fields:
            if not movie_data.get(field):
                logger.warning(f"缺少必要欄位: {field}")
                return False
        
        # 檢查是否有至少一個附加資訊（上映日期或片長）
        if not movie_data.get('release_date') and not movie_data.get('runtime'):
            logger.warning(f"缺少上映日期和片長資訊: {movie_data.get('full_title', '未知電影')}")
            # 不返回 False，因為這些不是必要的
        
        return True
    
    async def export_to_csv(self, movies: List[Dict[str, Any]]) -> str:
        """將電影資料匯出為CSV檔案"""
        try:
            # 確保 output 目錄存在
            output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
            os.makedirs(output_dir, exist_ok=True)
            
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(output_dir, f"atmovies_movies_{timestamp}.csv")
            
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                fieldnames = ['atmovies_id', 'full_title', 'chinese_title', 'english_title', 'runtime', 'release_date', 'detail_url']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for movie in movies:
                    # 確保所有需要的鍵都存在
                    row = {
                        'atmovies_id': movie.get('atmovies_id', ''), 
                        'full_title': movie.get('full_title', ''),
                        'chinese_title': movie.get('chinese_title', ''),
                        'english_title': movie.get('english_title', ''),
                        'runtime': movie.get('runtime', ''),
                        'release_date': movie.get('release_date', ''),
                        'detail_url': movie.get('detail_url', '')
                    }
                    writer.writerow(row)
                    
            logger.info(f"已將 {len(movies)} 部電影資料匯出至 {filename}")
            return filename
        except Exception as e:
            logger.error(f"匯出CSV檔案時出錯: {e}")
            return ""
    
    async def run(self, output_format: str = 'json') -> bool:
        """執行電影爬蟲
        
        Args:
            output_format: 輸出格式，可選 'json' 或 'csv'
            
        Returns:
            bool: 爬蟲執行是否成功
        """
        try:
            # 初始化電影列表
            self.movies = []
            
            # 設置日誌層級為 INFO，以查看詳細資訊
            logger.setLevel(logging.INFO)
            
            # 處理首輪電影
            logger.info("開始爬取首輪電影清單...")
            first_run_movies = await self._get_first_run_movies(FIRST_RUN_URL)
            first_run_count = len(first_run_movies) if first_run_movies else 0
            logger.info(f"成功爬取 {first_run_count} 部首輪電影")
            
            # 處理二輪電影
            logger.info("開始爬取二輪電影清單...")
            second_run_movies = await self._get_first_run_movies(SECOND_RUN_URL)
            second_run_count = len(second_run_movies) if second_run_movies else 0
            logger.info(f"成功爬取 {second_run_count} 部二輪電影")
            
            # 合併電影列表
            all_movies = self.movies
            total_movies = len(all_movies)
            
            if total_movies == 0:
                logger.warning("沒有找到任何電影資料")
                return False
                
            logger.info(f"總共找到 {total_movies} 部電影")
            
            # 保存到資料庫
            if hasattr(self, 'conn') and not self.conn.closed:
                saved_count = 0
                for movie in all_movies:
                    try:
                        success = await self.save_movie_to_db(movie)
                        if success:
                            saved_count += 1
                    except Exception as e:
                        logger.error(f"保存電影到資料庫時出錯: {e}", exc_info=True)
                
                logger.info(f"成功保存 {saved_count}/{total_movies} 部電影到資料庫")
            else:
                logger.warning("資料庫連接不可用，跳過保存到資料庫")
            
            # 保存到文件
            if output_format.lower() == 'csv':
                output_file = self.export_to_csv(all_movies)
            else:
                output_file = await self.save_to_file('json')
                
            if output_file:
                logger.info(f"電影資料已成功保存到: {output_file}")
                return True
            
            logger.error("保存電影資料到文件時出錯")
            return False
                
        except Exception as e:
            logger.error(f"執行爬蟲時發生錯誤: {e}", exc_info=True)
            return False
        finally:
            # 確保關閉所有資源
            if hasattr(self, 'session') and self.session and not self.session.closed:
                await self.session.close()
            # 不需要顯式調用 close_db_connection，因為 __aexit__ 會處理

async def main(output_format: str = 'json', skip_db: bool = False) -> bool:
    """主函數
    
    Args:
        output_format: 輸出格式，可選 'json' 或 'csv'
        skip_db: 是否跳過資料庫操作，僅用於測試
        
    Returns:
        bool: 爬蟲執行是否成功
    """
    try:
        async with ATMoviesMovieScraper() as scraper:
            if skip_db:
                logger.info("跳過資料庫操作，僅爬取資料並輸出到文件")
                # 執行爬蟲但不連接資料庫
                success = await scraper.run(output_format, skip_db=True)
            else:
                # 執行爬蟲並更新資料庫
                success = await scraper.run(output_format)
            return success
    except Exception as e:
        logger.error(f"執行爬蟲時發生錯誤: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    import argparse
    
    # 解析命令行參數
    parser = argparse.ArgumentParser(description='ATMovies 電影資訊爬蟲')
    parser.add_argument('--format', type=str, default='json',
                        choices=['json', 'csv'],
                        help='輸出格式 (json 或 csv)')
    parser.add_argument('--skip-db', action='store_true',
                        help='跳過資料庫操作，僅爬取資料並輸出到文件')
    args = parser.parse_args()
    
    # 在 Windows 上需要使用事件循環策略
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # 執行主函數
    success = asyncio.run(main(args.format, args.skip_db))
    
    # 根據執行結果返回適當的退出碼
    sys.exit(0 if success else 1)

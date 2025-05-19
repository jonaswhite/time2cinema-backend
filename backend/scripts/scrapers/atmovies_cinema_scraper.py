#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import aiohttp
import asyncio
import logging
import re
import sys
import csv
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# 設置默認編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("atmovies_cinema_scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 常數設定
BASE_URL = "https://www.atmovies.com.tw/"
CINEMA_BASE_URL = "https://www.atmovies.com.tw/showtime/"

# 台灣各地區代碼 (a01-a19, 跳過不存在的代碼)
REGION_CODES = [
    'a01',  # 基隆
    'a02',  # 台北
    'a03',  # 桃園
    'a35',  # 新竹
    'a37',  # 苗栗
    'a04',  # 台中
    'a47',  # 彰化
    'a45',  # 雲林
    'a49',  # 南投
    'a05',  # 嘉義
    'a06',  # 台南
    'a07',  # 高雄
    'a39',  # 宜蘭
    'a38',  # 花蓮
    'a89',  # 台東
    'a87',  # 屏東
    'a69',  # 澎湖
    'a68',  # 金門
]

# 請求頭
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.atmovies.com.tw/'
}

# 最大重試次數
MAX_RETRIES = 3
# 請求間隔 (秒)
REQUEST_DELAY = 1
# 輸出目錄
OUTPUT_DIR = "cinema_data"

class ATMoviesCinemaScraper:
    """ATMovies 電影院爬蟲"""
    
    def __init__(self):
        """初始化爬蟲"""
        self.session = None
        self.all_cinemas = []
    
    async def init(self):
        """初始化爬蟲，創建 HTTP 會話"""
        self.session = aiohttp.ClientSession(headers=HEADERS)
        # 確保輸出目錄存在
        os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    async def close(self):
        """關閉爬蟲，釋放資源"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    def save_to_csv(self):
        """將爬取的電影院資料保存為 CSV 檔案"""
        if not self.all_cinemas:
            logger.warning("沒有可保存的電影院資料")
            return
        
        # 生成輸出檔案名稱，包含當前日期
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(OUTPUT_DIR, f"atmovies_cinemas_{timestamp}.csv")
        
        try:
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['cinema_id', 'name', 'address', 'url', 'region_code']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(self.all_cinemas)
            
            logger.info(f"成功保存 {len(self.all_cinemas)} 間電影院資料到 {output_file}")
            return output_file
        except Exception as e:
            logger.error(f"保存 CSV 檔案時發生錯誤: {e}")
            return None
    
    async def fetch_page(self, url: str, retry: int = 0) -> Optional[str]:
        """獲取網頁內容，帶重試機制
        
        Args:
            url (str): 要獲取的網址
            retry (int): 當前重試次數
            
        Returns:
            str: 網頁內容
        """
        if retry >= MAX_RETRIES:
            logger.error(f"達到最大重試次數: {url}")
            return None
            
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    content = await response.text()
                    return content
                else:
                    logger.warning(f"請求失敗，狀態碼: {response.status}, URL: {url}")
                    await asyncio.sleep(REQUEST_DELAY * (retry + 1))  # 指數退避
                    return await self.fetch_page(url, retry + 1)
        except Exception as e:
            logger.error(f"請求發生錯誤: {e}, URL: {url}")
            await asyncio.sleep(REQUEST_DELAY * (retry + 1))  # 指數退避
            return await self.fetch_page(url, retry + 1)
    
    def parse_cinema_list(self, html: str, region_code: str) -> List[Dict[str, str]]:
        """解析電影院列表頁面
        
        Args:
            html (str): 網頁HTML內容
            region_code (str): 地區代碼
            
        Returns:
            List[Dict[str, str]]: 電影院基本資訊列表，包含 id, name, address, url, region_code
        """
        cinemas = []
        soup = BeautifulSoup(html, 'html5lib')
        
        # 找到所有的電影院項目 - 根據實際HTML結構調整選擇器
        cinema_items = soup.select('#theaterList > li')
        
        for item in cinema_items:
            try:
                # 提取電影院名稱和詳細頁面鏈接
                name_elem = item.select_one('a')
                if not name_elem or not name_elem.get('href'):
                    continue
                
                # 從 URL 中提取電影院 ID
                href = name_elem['href']
                cinema_id = href.split('/')[-2] if href.endswith('/') else href.split('/')[-1]
                
                name = name_elem.get_text(strip=True)
                detail_url = urljoin(BASE_URL, href)
                # 從詳細頁面URL中提取電影院ID (例如: /showtime/t03902/a39/ 中的 t03902)
                external_id = ''
                if detail_url:
                    parts = [p for p in detail_url.split('/') if p]
                    for part in parts:
                        if part.startswith('t') and part[1:].isdigit():
                            external_id = part
                            break
                
                # 提取地址
                address = ''
                # 嘗試從 ul > li 中獲取地址
                address_li = item.select_one('ul > li')
                if address_li:
                    address = address_li.get_text(strip=True)
                    # 清理地址字串，移除多餘的空格和特殊字符
                    address = ' '.join(address.split())  # 合併多個空格為一個
                    # 移除可能的電話號碼和地圖文字
                    address = re.sub(r'電話[:：]?\s*\d{2,}[-\s]?\d{3,}[-\s]?\d{3,}', '', address)
                    address = re.sub(r'地圖.*$', '', address).strip()
                
                # 如果沒有找到地址，記錄警告
                if not address:
                    logger.warning(f"無法找到電影院 {name} 的地址")
                
                # 添加到電影院列表
                cinemas.append({
                    'cinema_id': cinema_id,
                    'name': name,
                    'address': address,
                    'url': detail_url,
                    'region_code': region_code
                })
                
            except Exception as e:
                logger.error(f"解析電影院資訊時發生錯誤: {e}", exc_info=True)
                continue
                
        return cinemas
    
    async def scrape_region(self, region_code: str) -> List[Dict]:
        """爬取指定地區的所有電影院
        
        Args:
            region_code (str): 地區代碼，如 'a01'
            
        Returns:
            List[Dict]: 該地區的電影院列表
        """
        url = f"{CINEMA_BASE_URL}{region_code}/"
        logger.info(f"開始爬取地區: {region_code}, URL: {url}")
        
        html = await self.fetch_page(url)
        if not html:
            logger.error(f"無法獲取地區 {region_code} 的電影院列表")
            return []
            
        cinemas = self.parse_cinema_list(html, region_code)
        logger.info(f"地區 {region_code} 共找到 {len(cinemas)} 間電影院")
        
        # 將爬取到的電影院添加到總列表中
        self.all_cinemas.extend(cinemas)
        
        return cinemas
    
    async def scrape_all_regions(self) -> List[Dict]:
        """爬取所有地區的電影院
        
        Returns:
            List[Dict]: 所有電影院列表
        """
        self.all_cinemas = []  # 清空之前的結果
        
        for region_code in REGION_CODES:
            try:
                await self.scrape_region(region_code)
                # 避免請求過於頻繁
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"爬取地區 {region_code} 時發生錯誤: {e}", exc_info=True)
                continue
                
        return self.all_cinemas
    
    async def run(self):
        """執行爬蟲主邏輯"""
        logger.info("開始執行 ATMovies 電影院爬蟲")
        
        # 清空現有資料
        logger.info("開始清空現有電影院資料...")
        
        # 爬取所有電影院
        all_cinemas = await self.scrape_all_regions()
        
        # 保存到 CSV 檔案
        output_file = self.save_to_csv()
        
        if output_file:
            print(f"\n電影院資料爬取完成，共爬取 {len(all_cinemas)} 間電影院")
            print(f"資料已保存至: {os.path.abspath(output_file)}")
        else:
            print("\n爬取完成，但保存檔案時發生錯誤")
        
        logger.info(f"電影院爬取完成，共處理 {len(all_cinemas)} 家電影院")
        
        # 確保資源被正確釋放
        await self.close()


async def main():
    """主函數"""
    # 創建爬蟲實例
    scraper = ATMoviesCinemaScraper()
    
    try:
        # 初始化爬蟲
        await scraper.init()
        
        # 執行爬蟲
        await scraper.run()
        
    except Exception as e:
        logger.error(f"程式執行時發生錯誤: {e}")
    finally:
        # 確保資源被正確釋放
        await scraper.close()


if __name__ == "__main__":
    import platform
    
    # 在 Windows 上需要使用事件循環策略
    if platform.system() == 'Windows':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # 執行主函數
    asyncio.run(main())

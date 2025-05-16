#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import aiohttp
import logging
import os
import sys
import json
import time
import datetime
import csv
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, List, Any, Optional, Tuple, NamedTuple

# 設置默認編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("tmdb_poster_fetcher.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 常數設定
TMDB_API_KEY = "d4c9092656c3aa3cfa5761fbf093f7d0"
TMDB_API_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original"

# 資料庫連接資訊
DB_URL = "postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db"

class FetchResult(NamedTuple):
    """海報獲取結果"""
    movie_id: int
    display_title: str
    original_title: Optional[str]
    release_date: Optional[str]
    runtime: Optional[int]
    poster_url: Optional[str]
    tmdb_id: Optional[int]
    success: bool
    failure_reason: Optional[str]

class TMDBPosterFetcher:
    """TMDB 海報獲取器"""
    
    def __init__(self):
        self.conn = None
        self.cursor = None
        self.session = None
        self.headers = {
            'Authorization': f'Bearer {TMDB_API_KEY}',
            'Content-Type': 'application/json;charset=utf-8'
        }
        self.results = []  # 存儲所有獲取結果
        
    async def connect_to_db(self) -> bool:
        """連接到資料庫"""
        try:
            # 建立資料庫連接，並設定編碼為 UTF-8
            self.conn = psycopg2.connect(
                DB_URL,
                sslmode='require',
                client_encoding='UTF8'
            )
            self.conn.autocommit = False
            self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            
            # 確保資料庫連接的編碼為 UTF-8
            self.cursor.execute("SET client_encoding TO 'UTF8'")
            self.conn.commit()
            
            logger.info("成功連接到資料庫")
            return True
        except Exception as e:
            logger.error(f"連接資料庫時出錯: {e}")
            return False
    
    def close_db_connection(self):
        """關閉資料庫連接"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("資料庫連接已關閉")
            
    async def create_session(self):
        """創建HTTP會話"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers=self.headers)
        return self.session
    
    async def close_session(self):
        """關閉HTTP會話"""
        if self.session and not self.session.closed:
            await self.session.close()
            logger.info("非同步HTTP session已關閉")
    
    async def get_movies_without_poster(self) -> List[Dict[str, Any]]:
        """獲取沒有海報的電影列表"""
        try:
            self.cursor.execute("""
                SELECT id, atmovies_id, display_title, original_title, release_date, runtime 
                FROM movies 
                WHERE source = 'atmovies' 
                AND display_title IS NOT NULL
            """)
            movies = self.cursor.fetchall()
            logger.info(f"找到 {len(movies)} 部電影")
            return movies
        except Exception as e:
            logger.error(f"獲取電影列表時出錯: {e}")
            return []
    
    async def search_movie_on_tmdb(self, title: str, language: str = 'zh-TW') -> Optional[Dict[str, Any]]:
        """在TMDB上搜索電影"""
        try:
            url = f"{TMDB_API_BASE_URL}/search/movie"
            params = {
                'api_key': TMDB_API_KEY,
                'query': title,
                'language': language,
                'include_adult': 'false'
            }
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    results = data.get('results', [])
                    
                    if results:
                        # 嘗試找到最匹配的結果
                        # 首先檢查是否有完全匹配的標題
                        for result in results:
                            if result.get('title', '').lower() == title.lower() or result.get('original_title', '').lower() == title.lower():
                                logger.info(f"找到完全匹配的電影: {result.get('title')} (ID: {result.get('id')})")
                                return result
                        
                        # 如果沒有完全匹配，但只有一個結果，則使用該結果
                        if len(results) == 1:
                            logger.info(f"找到唯一的搜尋結果: {results[0].get('title')} (ID: {results[0].get('id')})")
                            return results[0]
                        
                        # 如果有多個結果，則使用第一個
                        logger.info(f"找到多個搜尋結果，使用第一個: {results[0].get('title')} (ID: {results[0].get('id')})")
                        return results[0]
                    else:
                        logger.warning(f"在TMDB上找不到電影: {title}")
                        return None
                else:
                    logger.error(f"TMDB API請求失敗，狀態碼: {response.status}")
                    return None
        except Exception as e:
            logger.error(f"搜索TMDB時出錯: {e}")
            return None
    
    async def update_movie_with_poster(self, movie_id: int, tmdb_id: int, poster_path: str) -> bool:
        """更新電影的海報資訊"""
        try:
            poster_url = f"{TMDB_IMAGE_BASE_URL}{poster_path}" if poster_path else None
            
            if not poster_url:
                logger.warning(f"電影 ID {movie_id} 沒有海報路徑")
                return False
            
            self.cursor.execute("""
                UPDATE movies 
                SET tmdb_id = %s, poster_url = %s, updated_at = NOW() 
                WHERE id = %s
            """, (tmdb_id, poster_url, movie_id))
            self.conn.commit()
            
            logger.info(f"已更新電影 ID {movie_id} 的海報資訊: TMDB ID {tmdb_id}, 海報 URL {poster_url}")
            return True
        except Exception as e:
            self.conn.rollback()
            logger.error(f"更新電影海報資訊時出錯: {e}")
            return False
    
    async def process_movie(self, movie: Dict[str, Any]) -> FetchResult:
        """處理單部電影的海報獲取"""
        movie_id = movie['id']
        title = movie['display_title']
        original_title = movie.get('original_title')
        release_date = movie.get('release_date')
        runtime = movie.get('runtime')
        
        logger.info(f"處理電影: {title} (ID: {movie_id})")
        
        # 初始化結果
        result = FetchResult(
            movie_id=movie_id,
            display_title=title,
            original_title=original_title,
            release_date=release_date,
            runtime=runtime,
            poster_url=None,
            tmdb_id=None,
            success=False,
            failure_reason=None
        )
        
        # 嘗試使用中文標題搜索
        tmdb_movie = await self.search_movie_on_tmdb(title)
        
        # 如果找不到，嘗試使用原始標題（通常是英文）
        if not tmdb_movie and original_title:
            logger.info(f"使用原始標題 {original_title} 重新搜索")
            tmdb_movie = await self.search_movie_on_tmdb(original_title, language='en-US')
        
        if tmdb_movie:
            tmdb_id = tmdb_movie.get('id')
            poster_path = tmdb_movie.get('poster_path')
            
            if tmdb_id and poster_path:
                poster_url = f"{TMDB_IMAGE_BASE_URL}{poster_path}"
                success = await self.update_movie_with_poster(movie_id, tmdb_id, poster_path)
                
                if success:
                    # 更新結果
                    result = result._replace(
                        poster_url=poster_url,
                        tmdb_id=tmdb_id,
                        success=True
                    )
                else:
                    result = result._replace(
                        failure_reason="更新數據庫失敗"
                    )
            else:
                failure_reason = f"TMDB電影 {tmdb_movie.get('title')} 沒有ID或海報路徑"
                logger.warning(failure_reason)
                result = result._replace(failure_reason=failure_reason)
        else:
            failure_reason = f"在TMDB上找不到電影: {title}"
            logger.warning(failure_reason)
            result = result._replace(failure_reason=failure_reason)
        
        return result
    
    async def export_to_csv(self, results: List[FetchResult]) -> str:
        """將結果導出為 CSV 檔案"""
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"tmdb_posters_{timestamp}.csv"
            
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                fieldnames = ['display_title', 'original_title', 'release_date', 'runtime', 'poster_url', 'tmdb_id', 'success', 'failure_reason']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for result in results:
                    writer.writerow({
                        'display_title': result.display_title,
                        'original_title': result.original_title or '',
                        'release_date': result.release_date or '',
                        'runtime': result.runtime or '',
                        'poster_url': result.poster_url or '',
                        'tmdb_id': result.tmdb_id or '',
                        'success': 'Yes' if result.success else 'No',
                        'failure_reason': result.failure_reason or ''
                    })
                    
            logger.info(f"已將 {len(results)} 筆結果導出至 {filename}")
            return filename
        except Exception as e:
            logger.error(f"導出 CSV 檔案時出錯: {e}")
            return ""
    
    async def run(self):
        """執行海報獲取程序"""
        try:
            # 連接資料庫
            if not await self.connect_to_db():
                return
            
            # 創建 HTTP 會話
            await self.create_session()
            
            # 獲取電影列表
            movies = await self.get_movies_without_poster()
            
            if not movies:
                logger.info("沒有需要處理的電影")
                return
            
            # 處理每部電影
            self.results = []
            for movie in movies:
                result = await self.process_movie(movie)
                self.results.append(result)
                
                # 避免請求過於頻繁
                await asyncio.sleep(0.5)
            
            # 統計結果
            success_count = sum(1 for r in self.results if r.success)
            failure_count = len(self.results) - success_count
            
            # 分析失敗原因
            failure_reasons = {}
            for result in self.results:
                if not result.success and result.failure_reason:
                    reason = result.failure_reason
                    failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
            
            # 記錄統計資訊
            logger.info(f"處理完成，成功獲取 {success_count}/{len(movies)} 部電影的海報")
            logger.info(f"失敗數量: {failure_count} 部")
            
            if failure_reasons:
                logger.info("失敗原因統計:")
                for reason, count in failure_reasons.items():
                    logger.info(f"  - {reason}: {count} 部")
            
            # 導出失敗的電影清單
            if failure_count > 0:
                logger.info("失敗的電影列表:")
                for result in self.results:
                    if not result.success:
                        logger.info(f"  - {result.display_title} (原因: {result.failure_reason or '未知'})")
            
            # 導出結果為 CSV
            await self.export_to_csv(self.results)
            
        except Exception as e:
            logger.error(f"運行時出錯: {e}")
            import traceback
            logger.error(traceback.format_exc())
        finally:
            # 關閉資源
            await self.close_session()
            self.close_db_connection()

async def main():
    """主函數"""
    fetcher = TMDBPosterFetcher()
    await fetcher.run()

if __name__ == "__main__":
    # 在 Windows 上需要使用事件循環策略
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # 執行主函數
    asyncio.run(main())

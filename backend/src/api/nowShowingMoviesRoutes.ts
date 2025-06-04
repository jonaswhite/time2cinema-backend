import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import pool from '../db';

// 快取目錄設定
const CACHE_DIR = process.env.NODE_ENV === 'production' 
  ? '/tmp/time2cinema-cache'  // 使用專屬目錄避免權限問題
  : path.join(__dirname, '../../cache');

// 快取檔案路徑
const CACHE_FILE = path.join(CACHE_DIR, 'now-showing-movies.json');
const CACHE_DURATION = 1000 * 60 * 30; // 30 分鐘快取

// 確保快取目錄存在
const ensureCacheDir = () => {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { 
        recursive: true, 
        mode: 0o755 // 明確設定權限
      });
      console.log(`已建立快取目錄: ${CACHE_DIR}`);
    }
    return true;
  } catch (error) {
    console.error('無法創建快取目錄:', error);
    return false;
  }
};

// 初始化快取目錄
ensureCacheDir();

// 檢查快取是否有效
const isCacheValid = async (): Promise<boolean> => {
  try {
    const exists = await fs.pathExists(CACHE_FILE);
    if (!exists) return false;
    
    const stats = await fs.stat(CACHE_FILE);
    const cacheAge = Date.now() - stats.mtimeMs;
    return cacheAge < CACHE_DURATION;
  } catch (error) {
    console.error('檢查快取時出錯:', error);
    return false;
  }
};

// 獲取所有正在上映的電影（有場次的電影）
export const getNowShowingMovies = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  const forceRefresh = req.query.forceRefresh === 'true';
  
  try {
    console.log('開始獲取上映中資料，forceRefresh:', forceRefresh);
    
    // 檢查快取是否存在且未過期
    if (!forceRefresh && await isCacheValid()) {
      try {
        const cache = await fs.readJSON(CACHE_FILE);
        console.log('使用快取資料');
        res.json(cache);
        return;
      } catch (error) {
        console.error('讀取快取檔案時出錯:', error);
        // 繼續執行資料庫查詢
      }
    }
    
    console.log('重新生成上映中資料');
    
    // 獲取當前日期（台灣時間）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 將日期調整為台灣時區 (+8)
    const taiwanOffset = 8 * 60 * 60 * 1000; // 8 小時的毫秒數
    const nowInTaiwan = new Date(Date.now() + taiwanOffset);
    const todayInTaiwan = new Date(nowInTaiwan.getFullYear(), nowInTaiwan.getMonth(), nowInTaiwan.getDate());
    
    console.log('台灣時間現在是:', nowInTaiwan.toISOString());
    console.log('台灣時間今天:', todayInTaiwan.toISOString());
    
    let result;
    const client = await pool.connect();
    
    try {
      // 主查詢：獲取所有有場次的電影
      // 修改查詢條件，包含今天和昨天的場次，以確保不會因為時區問題而遺漏
      const yesterday = new Date(todayInTaiwan);
      yesterday.setDate(yesterday.getDate() - 1);
      
      console.log('查詢場次日期範圍:', yesterday.toISOString(), '到未來');
      
      result = await client.query(
        `SELECT DISTINCT 
          m.id,
          COALESCE(m.chinese_title, m.english_title, '未知電影') as title,
          m.english_title,
          m.release_date,
          m.runtime,
          m.tmdb_id,
          m.chinese_title,
          m.english_title,
          CASE 
            WHEN m.poster_url IS NULL OR m.poster_url = '' 
            THEN 'https://via.placeholder.com/500x750?text=No+Poster+Available'
            WHEN m.poster_url LIKE 'http%' 
            THEN m.poster_url
            ELSE CONCAT('https://image.tmdb.org/t/p/w500', m.poster_url)
          END as poster_url
        FROM movies m
        WHERE EXISTS (
          SELECT 1 
          FROM showtimes s 
          WHERE s.movie_id = m.id 
          AND s.date >= $1
        )`,
        [yesterday]  // 使用昨天作為查詢起點，確保不會因為時區問題而遺漏場次
      );
      
      console.log(`成功查詢到 ${result.rows.length} 部電影`);
      
      // 記錄前幾部電影的標題用於調試
      if (result.rows.length > 0) {
        console.log('電影範例:', result.rows.slice(0, 3).map(m => ({
          id: m.id,
          title: m.title,
          release_date: m.release_date,
          poster_url: m.poster_url ? `${m.poster_url.substring(0, 50)}...` : '無海報'
        })));
      }
      
      // 定義電影介面
      interface Movie {
        id: number;
        title: string;
        english_title: string | null;
        release_date: string | null;
        poster_url: string;
        runtime: number | null;
        tmdb_id: number | null;
        full_title: string;
        chinese_title: string;
      }
      
      // 處理查詢結果
      const movies: Movie[] = result.rows.map((row: any) => {
        // 如果沒有海報 URL，使用預設圖片
        let posterUrl = row.poster_url;
        if (!posterUrl || posterUrl === '') {
          posterUrl = 'https://via.placeholder.com/500x750?text=No+Poster+Available';
        } else if (!posterUrl.startsWith('http')) {
          // 如果是相對路徑，添加基礎 URL
          posterUrl = `https://image.tmdb.org/t/p/w500${posterUrl}`;
        }
        
        return {
          id: row.id,
          title: row.title || '未知電影',
          release_date: row.release_date,
          poster_url: posterUrl,
          runtime: row.runtime,
          tmdb_id: row.tmdb_id,
          full_title: row.full_title,
          chinese_title: row.chinese_title || '',
          english_title: row.english_title
        };
      });
      console.log(`成功查詢到 ${result.rows.length} 部電影`);
    } catch (dbError) {
      console.error('資料庫查詢錯誤:', dbError);
      throw new Error('查詢電影資料時發生錯誤');
    } finally {
      client.release();
    }
    
    // 處理電影資料
    const movies = result.rows.map(movie => {
      // 確保有有效的海報 URL
      let posterUrl = movie.poster_url;
      if (!posterUrl || posterUrl === '') {
        // 如果沒有海報，使用預設圖片，並在 URL 中包含電影名稱作為提示
        const movieName = encodeURIComponent(movie.chinese_title || movie.english_title || 'No+Poster');
        posterUrl = `https://via.placeholder.com/500x750?text=${movieName}`;
        
        // 記錄缺少海報的電影（僅在開發環境）
        if (process.env.NODE_ENV !== 'production') {
          console.log(`電影 ${movie.chinese_title || movie.english_title} 缺少海報，使用預設圖片`);
        }
      } else if (posterUrl.startsWith('/')) {
        // 如果是相對路徑，添加 atmovies 基礎 URL
        posterUrl = `https://www.atmovies.com.tw${posterUrl}`;
      }
      // 如果 poster_url 已經是完整 URL 或 atmovies 的 URL，則保持不變

      return {
        ...movie,
        // 確保所有必要的欄位都有預設值
        title: movie.chinese_title || movie.english_title || '未知電影',
        poster_url: posterUrl,
        // 確保陣列類型的欄位至少是空陣列
        genres: movie.genres || [],
        production_companies: movie.production_companies || [],
        production_countries: movie.production_countries || [],
        spoken_languages: movie.spoken_languages || []
      };
    });

    // 根據 release_date 排序：距離今天越近越前面，null/無效日期在最後
    const todayForSorting = new Date(todayInTaiwan); // 使用已計算的 todayInTaiwan

    movies.sort((a, b) => {
      const dateA = a.release_date ? new Date(a.release_date) : null;
      const dateB = b.release_date ? new Date(b.release_date) : null;

      const isValidDate = (d: Date | null): d is Date => d instanceof Date && !isNaN(d.getTime());

      const aIsValid = isValidDate(dateA);
      const bIsValid = isValidDate(dateB);

      if (aIsValid && bIsValid) {
        // 兩個日期都有效，比較它們與今天的絕對差值
        const diffA = Math.abs(todayForSorting.getTime() - dateA.getTime());
        const diffB = Math.abs(todayForSorting.getTime() - dateB.getTime());
        return diffA - diffB; // 按最小差值排序
      } else if (aIsValid) {
        return -1; // a 有效，b 無效；a 在前
      } else if (bIsValid) {
        return 1;  // b 有效，a 無效；b 在前 (a 在後)
      } else {
        return 0;  // 兩者都無效，保持原始相對順序
      }
    });

    console.log('電影已根據 release_date 排序');
    // 調試：記錄排序後的前幾部電影
    if (movies.length > 0) {
      console.log('排序後電影範例:', movies.slice(0, 3).map(m => ({
        title: m.title,
        release_date: m.release_date,
      })));
    }
    
    // 將結果寫入快取
    try {
      await fs.writeJSON(CACHE_FILE, movies);
      console.log('已更新上映中快取');
    } catch (error) {
      console.error('寫入快取檔案時出錯:', error);
    }
    
    res.json(movies);
  } catch (error) {
    console.error('獲取上映中時出錯:', error);
    next(error);
  }
};

import express from 'express';
const router = express.Router();

router.get('/', getNowShowingMovies);

export { router as nowShowingMoviesRouter };

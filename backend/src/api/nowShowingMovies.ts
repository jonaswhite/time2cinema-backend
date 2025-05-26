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
    console.log('開始獲取上映中電影資料，forceRefresh:', forceRefresh);
    
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
    
    console.log('重新生成上映中電影資料');
    
    // 獲取當前日期（台灣時間）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('準備查詢資料庫...');
    
    let result;
    const client = await pool.connect();
    
    try {
      result = await client.query(
        `SELECT DISTINCT 
          m.id,
          COALESCE(m.chinese_title, m.original_title, '未知電影') as title,
          m.original_title,
          m.release_date,
          m.runtime,
          m.overview,
          m.poster_url,
          m.backdrop_url,
          m.vote_average,
          m.vote_count,
          m.popularity,
          m.original_language,
          m.genres,
          m.production_companies,
          m.production_countries,
          m.spoken_languages,
          m.budget,
          m.revenue,
          m.status,
          m.tagline,
          m.imdb_id,
          m.tmdb_id,
          m.homepage,
          m.adult,
          m.video,
          m.created_at,
          m.updated_at,
          CASE 
            WHEN m.poster_url IS NULL OR m.poster_url = '' 
            THEN 'https://via.placeholder.com/500x750?text=No+Poster+Available'
            WHEN m.poster_url LIKE 'http%' 
            THEN m.poster_url
            ELSE CONCAT('https://image.tmdb.org/t/p/w500', m.poster_url)
          END as poster_url
        FROM movies m
        JOIN showtimes s ON m.id = s.movie_id
        WHERE s.showtime >= $1
        GROUP BY m.id
        ORDER BY MAX(s.showtime) DESC, m.chinese_title`,
        [today]
      );
      
      console.log(`成功查詢到 ${result.rowCount} 部電影`);
    } catch (dbError) {
      console.error('資料庫查詢錯誤:', dbError);
      throw new Error('查詢電影資料時發生錯誤');
    } finally {
      client.release();
    }
    
    // 處理電影資料
    const movies = result.rows.map(movie => ({
      ...movie,
      // 確保所有必要的欄位都有預設值
      title: movie.title || '未知電影',
      original_title: movie.original_title || movie.title || '未知電影',
      poster_url: movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster+Available',
      // 確保陣列類型的欄位至少是空陣列
      genres: movie.genres || [],
      production_companies: movie.production_companies || [],
      production_countries: movie.production_countries || [],
      spoken_languages: movie.spoken_languages || []
    }));
    
    // 將結果寫入快取
    try {
      await fs.writeJSON(CACHE_FILE, movies);
      console.log('已更新上映中電影快取');
    } catch (error) {
      console.error('寫入快取檔案時出錯:', error);
    }
    
    res.json(movies);
  } catch (error) {
    console.error('獲取上映中電影時出錯:', error);
    next(error);
  }
};

export default getNowShowingMovies;

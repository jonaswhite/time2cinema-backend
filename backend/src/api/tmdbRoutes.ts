import express, { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import dayjs from 'dayjs';
import pool from '../db';
import { 
  enrichMoviesWithTMDBData, 
  getMoviesNotFoundOnTMDB,
  cleanupNotFoundMovies,
  BoxOfficeMovieWithTMDB,
  BoxOfficeMovie,
  searchMovieFromTMDB
} from './tmdb';

// TMDB API 配置
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const router = express.Router();
const CACHE_DIR = path.resolve(__dirname, '../../cache');
fs.ensureDirSync(CACHE_DIR);

// 取得帶有 TMDB 資訊的票房排行榜
router.get('/boxoffice-with-posters', async (req: Request, res: Response) => {
  try {
    const queryDate = req.query.date as string | undefined;
    const forceRefresh = req.query.refresh === 'true';
    
    // 取得週一日期（與票房 API 保持一致）
    const monday = (() => {
      const date = queryDate ? dayjs(queryDate) : dayjs();
      const day = date.day();
      return date.subtract((day === 0 ? 7 : day) - 1, 'day');
    })();
    
    const dateStr = monday.format('YYYY-MM-DD');
    const cacheFile = path.join(CACHE_DIR, `boxoffice-with-posters-${dateStr}.json`);
    
    // 檢查快取是否存在且是當天的
    const shouldUseCache = async () => {
      if (forceRefresh) return false;
      
      if (!await fs.pathExists(cacheFile)) return false;
      
      try {
        const stats = await fs.stat(cacheFile);
        const fileDate = dayjs(stats.mtime);
        const today = dayjs();
        
        if (fileDate.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')) {
          const cache = await fs.readJSON(cacheFile);
          if (cache && Array.isArray(cache) && cache.length > 0) {
            return true;
          }
        }
        
        return false;
      } catch (error) {
        console.error('檢查快取檔案時出錯:', error);
        return false;
      }
    };
    
    // 檢查是否應該使用快取
    if (await shouldUseCache()) {
      const cache = await fs.readJSON(cacheFile);
      console.log(`從今日快取返回 ${cache.length} 筆帶有海報的票房資料`);
      res.json(cache);
      return;
    }
    
    console.log(forceRefresh ? '強制重新爬取票房資料及海報' : '快取過期或無效，開始爬取今日票房資料及海報');
    
    // 先取得基本票房資料
    let boxOfficeData: BoxOfficeMovie[] = [];
    const basicCacheFile = path.join(CACHE_DIR, `boxoffice-${dateStr}.json`);
    
    // 如果已有基本票房資料快取，則使用它
    if (await fs.pathExists(basicCacheFile)) {
      boxOfficeData = await fs.readJSON(basicCacheFile);
      console.log(`從快取讀取 ${boxOfficeData.length} 筆基本票房資料`);
    } else {
      // 如果沒有基本票房資料，則直接從資料庫查詢
      try {
        // 直接從資料庫查詢票房資料，避免使用 fetch 調用其他 API
        const result = await pool.query(
          'SELECT * FROM boxoffice WHERE date(week_start_date) = $1 ORDER BY rank',
          [dateStr]
        );
        
        boxOfficeData = result.rows.map(row => ({
          title: row.movie_id, // 使用 movie_id 作為電影標題，因為這是實際存儲電影名稱的欄位
          releaseDate: row.release_date,
          totalGross: row.total_gross,
          totalSales: row.total_sales,
          rank: row.rank
        }));
        
        console.log(`從資料庫查詢到 ${boxOfficeData.length} 筆基本票房資料`);
      } catch (error) {
        console.error('從資料庫查詢票房資料失敗:', error);
        throw new Error('無法獲取基本票房資料');
      }
    }
    
    if (boxOfficeData.length === 0) {
      throw new Error('沒有票房資料可用');
    }
    
    // 為電影加入 TMDB 資訊
    console.log(`開始為 ${boxOfficeData.length} 筆電影加入 TMDB 資訊...`);
    const enrichedMovies = await enrichMoviesWithTMDBData(boxOfficeData);
    // 只保留精簡欄位
    const simpleMovies = enrichedMovies.map(movie => ({
      title: movie.title,
      releaseDate: movie.releaseDate,
      totalGross: movie.totalGross,
      totalSales: movie.totalSales,
      posterUrl: movie.posterUrl
    }));
    // 寫入帶有海報的快取（精簡版）
    await fs.writeJSON(cacheFile, simpleMovies, { spaces: 2 });
    console.log(`已將 ${simpleMovies.length} 筆帶有海報的票房資料（精簡版）寫入快取`);
    res.json(simpleMovies);

  } catch (err) {
    console.error('獲取帶有海報的票房資料失敗:', err);
    console.error('錯誤詳情:', err instanceof Error ? err.stack : String(err));
    
    // 檢查是否為資料庫連接問題
    if (err instanceof Error && err.message.includes('database')) {
      console.error('可能是資料庫連接問題');
    }
    
    // 檢查是否為 TMDB API 問題
    if (err instanceof Error && err.message.includes('TMDB')) {
      console.error('可能是 TMDB API 問題');
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch box office data with posters', 
      detail: err instanceof Error ? err.message : String(err) 
    });
  }
});

// 獲取 TMDB 上找不到的電影列表
router.get('/not-found-movies', async (req: Request, res: Response) => {
  try {
    // 清理超過 7 天的未找到記錄
    await cleanupNotFoundMovies(7);
    
    // 獲取未找到的電影列表
    const notFoundMovies = await getMoviesNotFoundOnTMDB();
    
    // 返回結果
    res.json({
      count: notFoundMovies.length,
      movies: notFoundMovies
    });
  } catch (err) {
    console.error('獲取未找到電影列表失敗:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ 
      error: 'Failed to get not found movies', 
      detail: err instanceof Error ? err.message : String(err) 
    });
  }
});

// 新增端點：批量獲取電影海報資訊
// @ts-ignore - 繁過 TypeScript 的類型檢查，因為 Express 的類型定義問題
router.post('/posters', async (req: Request, res: Response) => {
  try {
    const { movieTitles } = req.body;
    
    if (!movieTitles || !Array.isArray(movieTitles) || movieTitles.length === 0) {
      return res.status(400).json({ error: 'Invalid request. Please provide an array of movie titles.' });
    }
    
    console.log(`收到海報請求，共 ${movieTitles.length} 部電影`);
    
    // 將所有電影標題轉換為 Promise
    const promises = movieTitles.map(async (title: string) => {
      try {
        const tmdbData = await searchMovieFromTMDB(title);
        return {
          movieTitle: title,
          posterUrl: tmdbData && tmdbData.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${tmdbData.poster_path}`
            : null
        };
      } catch (error) {
        console.error(`為電影 ${title} 獲取海報時發生錯誤:`, error);
        return {
          movieTitle: title,
          posterUrl: null
        };
      }
    });
    
    // 使用 Promise.allSettled 並行處理所有電影的海報請求
    const results = await Promise.allSettled(promises);

    // 處理結果
    const posterData = results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // 如果失敗，返回空海報
        return { 
          movieTitle: 'unknown',
          posterUrl: null 
        };
      }
    }).filter(item => item.movieTitle !== 'unknown'); // 過濾掉未知電影
    
    console.log(`成功處理 ${posterData.length} 部電影的海報資訊`);
    res.json(posterData);
    
  } catch (err) {
    console.error('處理海報請求時發生錯誤:', err);
    res.status(500).json({ 
      error: 'Failed to process poster requests', 
      detail: err instanceof Error ? err.message : String(err) 
    });
  }
});

export const tmdbRouter = router;

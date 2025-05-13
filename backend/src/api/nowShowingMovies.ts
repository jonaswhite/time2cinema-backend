import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import pool from '../db';
import { searchMovieFromTMDB } from './tmdb';
import { getMovieFromCache, ensureTMDBCacheTable, migrateCacheToDatabase } from '../db/tmdbCache';

// 確保 TMDB 快取表存在並進行遷移
ensureTMDBCacheTable().then(() => {
  migrateCacheToDatabase().catch(err => {
    console.error('TMDB 快取遷移失敗:', err);
  });
});

// 快取目錄
const CACHE_DIR = path.resolve(__dirname, '../../cache');
fs.ensureDirSync(CACHE_DIR);

// 獲取所有正在上映的電影（有場次的電影）
export const getNowShowingMovies = async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const cacheFile = path.join(CACHE_DIR, 'now-showing-movies.json');
    
    // 檢查快取是否存在且未過期（12小時內）
    const shouldUseCache = async (): Promise<boolean> => {
      if (forceRefresh) return false;
      if (!await fs.pathExists(cacheFile)) return false;
      
      try {
        const stats = await fs.stat(cacheFile);
        const fileDate = new Date(stats.mtime);
        const now = new Date();
        // 如果快取文件在12小時內創建，則使用快取
        if ((now.getTime() - fileDate.getTime()) < 12 * 60 * 60 * 1000) {
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
    
    // 如果可以使用快取，直接返回快取資料
    if (await shouldUseCache()) {
      console.log('從快取返回上映中電影資料');
      const cache = await fs.readJSON(cacheFile);
      return res.json(cache);
    }
    
    console.log('重新生成上映中電影資料');
    
    // 獲取當前日期（台灣時間）
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 格式化日期為 YYYY-MM-DD
    const formatDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const formattedDate = formatDate(today);
    console.log(`查詢今天及以後的場次，今天日期: ${formattedDate}`);
    
    // 優化查詢：一次性獲取電影和上映日期，減少資料庫查詢次數
    const query = `
      SELECT 
        s.movie_name, 
        MIN(b.release_date) as release_date,
        CASE WHEN MIN(b.release_date) IS NULL THEN 2 ELSE 1 END as has_release_date
      FROM showtimes s
      LEFT JOIN boxoffice b ON s.movie_name = b.movie_id
      WHERE DATE(s.date) >= DATE($1)
      GROUP BY s.movie_name
      ORDER BY 
        has_release_date,  -- 有上映日期的排前面
        release_date DESC  -- 按上映日期降序排列（新上映的在前）
    `;
    
    const result = await pool.query(query, [formattedDate]);
    console.log(`找到 ${result.rowCount} 部正在上映的電影`);
    
    // 並行處理所有電影的海報查詢，提高效率
    const moviesWithPosters = await Promise.all(
      result.rows.map(async (movie) => {
        try {
          // 從新的資料庫快取中獲取電影資訊
          let tmdbMovie = await getMovieFromCache(movie.movie_name);
          let posterUrl = null;
          let runtime = null;
          
          if (tmdbMovie) {
            // 從快取獲取成功
            posterUrl = tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null;
            runtime = tmdbMovie.runtime || null;
          } else {
            // 如果資料庫中沒有，嘗試直接從 TMDB API 獲取
            try {
              tmdbMovie = await searchMovieFromTMDB(movie.movie_name, movie.release_date ? movie.release_date.toISOString().split('T')[0] : undefined);
              if (tmdbMovie) {
                posterUrl = tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null;
                runtime = tmdbMovie.runtime || null;
              }
            } catch (tmdbError) {
              console.error(`從 TMDB 獲取 ${movie.movie_name} 的資訊失敗:`, tmdbError);
            }
          }
          
          return {
            title: movie.movie_name,
            releaseDate: movie.release_date ? movie.release_date.toISOString().split('T')[0] : null,
            posterUrl: posterUrl,
            runtime: runtime
          };
        } catch (error) {
          console.error(`獲取電影 ${movie.movie_name} 的海報失敗:`, error);
          return {
            title: movie.movie_name,
            releaseDate: movie.release_date ? movie.release_date.toISOString().split('T')[0] : null,
            posterUrl: null,
            runtime: null
          };
        }
      })
    );
    
    // 寫入快取
    await fs.writeJSON(cacheFile, moviesWithPosters, { spaces: 2 });
    console.log(`已將 ${moviesWithPosters.length} 筆上映中電影資料寫入快取`);
    
    res.json(moviesWithPosters);
  } catch (error) {
    console.error('獲取上映中電影失敗:', error);
    res.status(500).json({ error: '獲取上映中電影失敗' });
  }
};

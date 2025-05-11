import { Request, Response } from 'express';
import pool from '../db';
import { searchMovieFromTMDB } from './tmdb';
import { getMovieFromCache, ensureTMDBCacheTable, migrateCacheToDatabase } from '../db/tmdbCache';

// 確保 TMDB 快取表存在並進行遷移
ensureTMDBCacheTable().then(() => {
  migrateCacheToDatabase().catch(err => {
    console.error('TMDB 快取遷移失敗:', err);
  });
});

// 獲取所有正在上映的電影（有場次的電影）
export const getNowShowingMovies = async (req: Request, res: Response) => {
  try {
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
    
    // 查詢所有有場次的電影
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
    
    // 查詢電影海報
    const moviesWithPosters = await Promise.all(
      result.rows.map(async (movie) => {
        try {
          // 從新的資料庫快取中獲取電影資訊
          let tmdbMovie = await getMovieFromCache(movie.movie_name);
          let posterUrl = null;
          let runtime = null;
          
          if (tmdbMovie) {
            console.log(`從資料庫快取獲取 ${movie.movie_name} 的資訊`);
            posterUrl = tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null;
            runtime = tmdbMovie.runtime || null;
          } else {
            // 如果資料庫中沒有，嘗試直接從 TMDB API 獲取
            try {
              console.log(`從 TMDB API 獲取 ${movie.movie_name} 的資訊`);
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
    
    res.json(moviesWithPosters);
  } catch (error) {
    console.error('獲取上映中電影失敗:', error);
    res.status(500).json({ error: '獲取上映中電影失敗' });
  }
};

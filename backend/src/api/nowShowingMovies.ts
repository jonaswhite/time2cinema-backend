import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import pool from '../db';

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
    
    // 使用新的資料庫結構，從 showtimes 表查詢上映中的電影，但從 movies 表獲取電影詳細資訊
    const query = `
      SELECT DISTINCT 
        m.id,
        m.title,
        m.original_title,
        m.poster_url,
        m.backdrop_url,
        m.release_date,
        m.runtime,
        m.tmdb_id
      FROM showtimes s
      JOIN movies m ON s.movie_id = m.id
      WHERE DATE(s.date) >= DATE($1)
      ORDER BY 
        m.release_date DESC NULLS LAST  -- 按上映日期降序排列（新上映的在前）
    `;
    
    const result = await pool.query(query, [formattedDate]);
    console.log(`找到 ${result.rowCount} 部正在上映的電影`);
    
    // 格式化電影資料以符合前端需求
    const moviesData = result.rows.map(movie => ({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      release_date: movie.release_date ? movie.release_date.toISOString().split('T')[0] : null,
      posterUrl: movie.poster_url,
      runtime: movie.runtime,
      tmdb_id: movie.tmdb_id
    }));
    
    // 寫入快取
    await fs.writeJSON(cacheFile, moviesData, { spaces: 2 });
    console.log(`已將 ${moviesData.length} 筆上映中電影資料寫入快取`);
    
    res.json(moviesData);
  } catch (error) {
    console.error('獲取上映中電影失敗:', error);
    res.status(500).json({ error: '獲取上映中電影失敗' });
  }
};

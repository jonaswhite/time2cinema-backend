import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import pool from '../db';

// 快取目錄
const CACHE_DIR = process.env.NODE_ENV === 'production' 
  ? '/tmp/cache' 
  : path.resolve(__dirname, '../../cache');

// 確保快取目錄存在
try {
  fs.ensureDirSync(CACHE_DIR);
  console.log(`快取目錄設置為: ${CACHE_DIR}`);
} catch (error) {
  console.error(`無法創建快取目錄 ${CACHE_DIR}:`, error);
}

// 獲取所有正在上映的電影（有場次的電影）
export const getNowShowingMovies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      res.json(cache);
      return;
    }
    
    console.log('重新生成上映中電影資料');
    
    // 獲取當前日期（台灣時間）
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 查詢有場次的電影
    const result = await pool.query(`
      SELECT DISTINCT m.*
      FROM movies m
      JOIN showtimes s ON m.id = s.movie_id
      WHERE s.showtime >= $1
      ORDER BY m.release_date DESC, m.chinese_title
    `, [today]);
    
    const movies = result.rows;
    
    // 將結果寫入快取
    try {
      await fs.writeJSON(cacheFile, movies);
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

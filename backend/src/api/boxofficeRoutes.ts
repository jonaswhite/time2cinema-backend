import express, { Request, Response } from 'express';
import pool from '../db';
import { getMovieFromCache } from '../db/tmdbCache';

const router = express.Router();

// 獲取所有票房資料（統一回傳格式）
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // 檢查是否需要強制更新
    const forceRefresh = req.query.refresh === 'true';
    
    const result = await pool.query('SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice WHERE week_start_date = (SELECT MAX(week_start_date) FROM boxoffice) ORDER BY rank');
    
    // 獲取每部電影的 TMDB 資訊（包含片長和海報）
    const moviesWithDetails = await Promise.all(result.rows.map(async (row) => {
      // 從 TMDB 快取中獲取電影資訊
      const tmdbMovie = await getMovieFromCache(row.movie_id);
      
      return {
        movie_id: row.movie_id,
        rank: row.rank,
        tickets: row.tickets,
        totalsales: row.totalsales,
        release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
        week_start_date: row.week_start_date.toISOString().split('T')[0],
        // 添加 TMDB 資訊
        poster_path: tmdbMovie?.poster_path || null,
        runtime: tmdbMovie?.runtime || null
      };
    }));
    
    res.json(moviesWithDetails);
  } catch (error) {
    console.error('獲取票房資料失敗:', error);
    res.status(500).json({ error: '獲取票房資料失敗' });
  }
});

// 獲取特定日期的票房資料
router.get('/date/:date', (req: Request, res: Response): void => {
  const { date } = req.params;
  
  if (!date) {
    res.status(400).json({ error: '請提供日期' });
    return;
  }
  
  pool.query(
    'SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice WHERE week_start_date = $1 ORDER BY rank',
    [date]
  )
    .then(result => {
      const formatted = result.rows.map(row => ({
        movie_id: row.movie_id,
        rank: row.rank,
        tickets: row.tickets,
        totalsales: row.totalsales,
        release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
        week_start_date: row.week_start_date.toISOString().split('T')[0]
      }));
      res.json(formatted);
    })
    .catch(error => {
      console.error('獲取票房資料失敗:', error);
      res.status(500).json({ error: '獲取票房資料失敗' });
    });
});

// 獲取特定電影的票房資料
router.get('/movie/:movieName', (req: Request, res: Response): void => {
  const { movieName } = req.params;
  
  if (!movieName) {
    res.status(400).json({ error: '請提供電影名稱' });
    return;
  }
  
  const decodedMovieName = decodeURIComponent(movieName);
  
  pool.query(
    'SELECT movie_id, rank, tickets FROM boxoffice WHERE movie_id = $1 ORDER BY week_start_date DESC',
    [decodedMovieName]
  )
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: '找不到指定電影的票房資料' });
        return;
      }
      const formatted = result.rows.map(row => ({
        movie_id: row.movie_id,
        rank: row.rank,
        tickets: row.tickets,
        totalsales: null
      }));
      res.json(formatted);
    })
    .catch(error => {
      console.error('獲取票房資料失敗:', error);
      res.status(500).json({ error: '獲取票房資料失敗' });
    });
});

// 獲取最新一週的票房排行榜
router.get('/latest', (req: Request, res: Response): void => {
  // 獲取最新的票房日期
  pool.query('SELECT week_start_date FROM boxoffice ORDER BY week_start_date DESC LIMIT 1')
    .then(dateResult => {
      if (dateResult.rows.length === 0) {
        res.status(404).json({ error: '找不到票房資料' });
        return null; // 返回 null 以中斷連鎖
      }
      
      const latestDate = dateResult.rows[0].week_start_date;
      
      // 獲取該日期的票房排行榜
      return pool.query(
        'SELECT movie_id, rank, tickets FROM boxoffice WHERE week_start_date = $1 ORDER BY rank',
        [latestDate]
      );
    })
    .then(result => {
      if (result) {
        const formatted = result.rows.map(row => ({
          movie_id: row.movie_id,
          rank: row.rank,
          tickets: row.tickets,
          totalsales: null
        }));
        res.json(formatted);
      }
    })
    .catch(error => {
      console.error('獲取票房資料失敗:', error);
      res.status(500).json({ error: '獲取票房資料失敗' });
    });
});

export const boxofficeRouter = router;

import express, { Request, Response, NextFunction, Router } from 'express';
import pool from '../db';

const router: Router = express.Router();

// 定義自定義錯誤處理中間件
const handleError = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error('發生錯誤:', err);
  res.status(500).json({ 
    error: '伺服器內部錯誤',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// 獲取所有票房資料（統一回傳格式）
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('開始查詢票房資料...');
    
    // 測試資料庫連接
    try {
      const timeResult = await pool.query('SELECT NOW() as current_time');
      console.log('資料庫連接正常，當前時間:', timeResult.rows[0].current_time);
    } catch (dbError) {
      console.error('資料庫連接錯誤:', dbError);
      res.status(500).json({ error: '無法連接到資料庫' });
      return;
    }
    
    // 獲取最新的週開始日期
    const dateResult = await pool.query(`
      SELECT MAX(week_start_date) as latest_week 
      FROM boxoffice
    `);
    const latestWeek = dateResult.rows[0]?.latest_week;
    
    if (!latestWeek) {
      console.log('沒有找到任何票房資料');
      res.json([]);
      return;
    }
    
    console.log(`查詢最新一週 (${latestWeek}) 的票房資料`);
    
    // 查詢最新票房資料，並按照 rank 欄位排序
    try {
      const result = await pool.query(`
        SELECT 
          b.movie_id as id,       -- Movie's unique ID for the frontend
          b.rank, 
          b.tickets, 
          b.totalsales, 
          m.release_date,         -- Use release_date from movies table
          b.week_start_date,
          b.movie_alias,
          m.full_title,           -- Correct field name
          m.chinese_title,        -- Correct field name
          m.english_title,        -- Correct field name
          CASE 
            WHEN m.poster_url IS NULL OR m.poster_url = '' 
            THEN NULL
            WHEN m.poster_url LIKE 'http%' 
            THEN m.poster_url
            ELSE CONCAT('https://image.tmdb.org/t/p/w500', m.poster_url)
          END as poster_url,
          m.runtime, 
          m.tmdb_id,
          b.id as boxoffice_db_id -- ID of the boxoffice entry itself
        FROM 
          boxoffice b
        LEFT JOIN 
          movies m ON b.movie_id = m.id
        WHERE 
          b.week_start_date = $1
        ORDER BY 
          CASE WHEN b.rank = 0 THEN 9999 ELSE b.rank END ASC
      `, [latestWeek]);
      
      console.log(`成功獲取 ${result.rows.length} 筆票房資料`);
      
      // 輸出前 5 筆資料的 rank, tickets, totalsales 欄位，用於調試
      const preview = result.rows.slice(0, 5).map(row => ({
        id: row.id, // Expected movie ID
        full_title: row.full_title,
        chinese_title: row.chinese_title,
        english_title: row.english_title,
        poster_url: row.poster_url,
        rank: row.rank,
        tickets: row.tickets,
        totalsales: row.totalsales,
        week_start_date: row.week_start_date
      }));
      console.log('票房資料預覽:', JSON.stringify(preview, null, 2));
      
      res.json(result.rows);
    } catch (error) {
      console.error('查詢票房資料時出錯:', error);
      res.status(500).json({ error: '獲取票房資料失敗' });
    }
  } catch (error) {
    console.error('獲取票房資料時出錯:', error);
    next(error);
  }
});

// 使用錯誤處理中間件
router.use(handleError);

export { router as boxofficeRouter };

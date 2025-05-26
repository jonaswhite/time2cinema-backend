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
    // 檢查是否需要強制更新
    const forceRefresh = req.query.refresh === 'true';
    
    console.log('開始查詢票房資料...');
    
    // 測試資料庫連接
    try {
      await pool.query('SELECT NOW()');
      console.log('資料庫連接正常');
    } catch (dbError) {
      console.error('資料庫連接錯誤:', dbError);
      res.status(500).json({ error: '無法連接到資料庫' });
      return;
    }
    
    // 先獲取最新的週開始日期
    let dateResult;
    try {
      dateResult = await pool.query(`
        SELECT MAX(week_start_date) as latest_week 
        FROM boxoffice
      `);
      console.log('查詢最新週數成功');
    } catch (error) {
      console.error('查詢最新週數時出錯:', error);
      res.status(500).json({ error: '查詢最新週數時出錯' });
      return;
    }
    
    const latestWeek = dateResult.rows[0]?.latest_week;
    
    if (!latestWeek) {
      console.log('沒有找到任何票房資料');
      res.json([]);
      return;
    }
    
    console.log(`查詢最新一週 (${latestWeek}) 的票房資料`);
    
    // 使用 LEFT JOIN 查詢來獲取電影詳細資訊
    const result = await pool.query(`
      SELECT 
        b.id as boxoffice_id,
        b.movie_id, 
        b.rank, 
        b.tickets, 
        b.totalsales, 
        b.release_date, 
        b.week_start_date,
        b.movie_alias,
        m.chinese_title as title, 
        m.english_title as original_title, 
        m.poster_url, 
        m.runtime, 
        m.tmdb_id
      FROM 
        boxoffice b
      LEFT JOIN 
        movies m ON b.movie_id = m.id
      WHERE 
        b.week_start_date = $1
      ORDER BY 
        b.rank ASC
    `, [latestWeek]);
    
    console.log(`成功獲取 ${result.rows.length} 筆票房資料`);
    res.json(result.rows);
  } catch (error) {
    console.error('獲取票房資料時出錯:', error);
    next(error);
  }
});

// 使用錯誤處理中間件
router.use(handleError);

export { router as boxofficeRouter };

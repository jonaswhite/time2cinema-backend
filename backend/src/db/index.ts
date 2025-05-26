import { Pool } from 'pg';

// 建立資料庫連接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 僅在生產環境啟用 SSL
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false // 忽略自簽名憑證警告
  } : false
});

// 測試資料庫連線
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('資料庫連線失敗:', err);
  } else {
    console.log('成功連接到資料庫');
  }
});

export default pool;

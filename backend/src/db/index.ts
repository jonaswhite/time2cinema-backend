import { Pool, PoolConfig } from 'pg';

// 建立資料庫連接池配置
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// 在生產環境中強制使用 SSL
if (process.env.NODE_ENV === 'production') {
  // 確保資料庫 URL 包含 sslmode=require
  if (poolConfig.connectionString && !poolConfig.connectionString.includes('sslmode=require')) {
    poolConfig.connectionString += poolConfig.connectionString.includes('?') 
      ? '&sslmode=require' 
      : '?sslmode=require';
  }
  
  // 設定 SSL 選項
  poolConfig.ssl = {
    rejectUnauthorized: false // 忽略自簽名憑證警告
  };
}

const pool = new Pool(poolConfig);

// 測試資料庫連線
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('資料庫連線失敗:', err);
  } else {
    console.log('成功連接到資料庫');
    console.log('當前資料庫時間:', res.rows[0].now);
  }
});

export default pool;

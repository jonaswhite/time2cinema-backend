import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// 建立資料庫連接池配置
const connectionString = process.env.DATABASE_URL || 
  'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db';

// 確保連接字串包含 sslmode=require
const dbUrl = new URL(connectionString);
if (!dbUrl.searchParams.has('sslmode')) {
  dbUrl.searchParams.set('sslmode', 'require');
}

// Log the final connection string before creating the pool
console.log('Final connection string for pg.Pool:', dbUrl.toString());

// 建立連接池
const pool = new Pool({
  connectionString: dbUrl.toString(),
  ssl: {
    rejectUnauthorized: true // Standard SSL for publicly trusted CAs like Supabase
  },
  // 增加連線超時設定
  connectionTimeoutMillis: 10000, // 10 秒
  idleTimeoutMillis: 30000, // 30 秒
  max: 20 // 最大連線數
});

// 測試資料庫連線
const testConnection = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW()');
    console.log('成功連接到資料庫');
    console.log('當前資料庫時間:', res.rows[0].now);
  } catch (err) {
    console.error('資料庫連線錯誤:', err);
  } finally {
    client.release();
  }
};

// 執行連線測試
testConnection().catch(err => {
  console.error('連線測試失敗:', err);
});

export default pool;

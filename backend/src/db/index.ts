import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// 建立資料庫連接池配置
const connectionString = process.env.DATABASE_URL || 
  'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db';

// The path is relative from the compiled file in dist/db/index.js
const caCertPath = path.join(__dirname, '..', '..', 'src', 'certs', 'AmazonRootCA1.pem');
const dbUrl = new URL(connectionString);

if (fs.existsSync(caCertPath)) {
  console.log('CA certificate found. Configuring sslmode=verify-full with sslrootcert.');
  // Use the stricter verify-full mode and provide the root cert path
  dbUrl.searchParams.set('sslmode', 'verify-full');
  dbUrl.searchParams.set('sslrootcert', caCertPath);
} else {
  console.warn('CA certificate not found at:', caCertPath);
  console.warn('Falling back to sslmode=require. This may fail.');
  // Ensure sslmode=require is set if the cert is not found
  if (!dbUrl.searchParams.has('sslmode')) {
    dbUrl.searchParams.set('sslmode', 'require');
  }
}

const finalConnectionString = dbUrl.toString();
console.log('Final connection string for pg.Pool:', finalConnectionString);

// 建立連接池
const pool = new Pool({
  connectionString: finalConnectionString,
  // SSL config is now entirely within the connection string.
  // 增加連線超時設定
  connectionTimeoutMillis: 10000, // 10 秒
  idleTimeoutMillis: 30000, // 30 秒
  max: 20, // 最大連線數
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

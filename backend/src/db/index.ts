import { Pool } from 'pg';

// 建立資料庫連接池
const pool = new Pool({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432,
});

// 設定時區
pool.query('SET timezone = "Asia/Taipei"');

export default pool;

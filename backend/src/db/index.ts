import { Pool } from 'pg';

// 建立資料庫連接池配置
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'FATAL ERROR: DATABASE_URL environment variable is not set. ' +
    'Please provide the Supabase connection string in the environment variables.'
  );
  process.exit(1); // Exit if DATABASE_URL is not provided
}

// Supabase connection strings (DATABASE_URL) usually include necessary SSL parameters
// (e.g., sslmode=require). The custom CA certificate logic previously used for
// Render's PostgreSQL (AmazonRootCA1.pem and sslmode=verify-full) is likely
// not needed for Supabase and has been removed for simplification.
// If your Supabase setup requires a specific CA certificate, this section might
// need to be revisited, but standard Supabase connections typically don't.

console.log('Attempting to connect to database using DATABASE_URL.');
// For debugging, you might want to log the connectionString, but be careful in production
// console.log('Using connection string for pg.Pool:', connectionString);

// 建立連接池
// The connectionString from Supabase should handle SSL configuration.
// If you encounter SSL issues (e.g., self-signed certificate errors with some proxy setups),
// you might need to add an ssl object, for example:
// const pool = new Pool({
//   connectionString: connectionString,
//   ssl: {
//     rejectUnauthorized: false, // Use with caution, typically for development or specific trusted environments
//   },
// });
// However, for Supabase, this is often not required. Start with the direct connection string.
const pool = new Pool({
  connectionString: connectionString,
  connectionTimeoutMillis: 10000, // 10 秒
  idleTimeoutMillis: 30000, // 30 秒
  max: 20, // 最大連線數
});

pool.on('connect', () => {
  console.log('Successfully connected to the PostgreSQL database via pg.Pool.');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client in pg.Pool', err);
  // process.exit(-1); // Consider if errors should be fatal
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

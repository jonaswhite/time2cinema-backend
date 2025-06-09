/**
 * 檢查資料表結構
 */
const { Pool } = require('pg');

// 資料庫連線設定
const pool = new Pool({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'time2cinema',
  password: '',
  port: 5432,
});

async function checkTableSchema() {
  try {
    console.log('檢查資料表結構...');
    
    // 檢查 cinemas 表格的結構
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cinemas'
      ORDER BY ordinal_position
    `);
    
    console.log('cinemas 表格的欄位結構：');
    console.table(result.rows);
    
  } catch (error) {
    console.error('檢查資料表結構失敗:', error);
  } finally {
    // 關閉資料庫連線
    pool.end();
  }
}

// 執行檢查
checkTableSchema();

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 資料庫連線設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/time2cinema',
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

async function createBoxofficeTable() {
  const client = await pool.connect();
  try {
    console.log('🚀 開始創建 boxoffice 資料表...');
    
    // 讀取 SQL 文件
    const sqlPath = path.join(__dirname, 'sql/create_boxoffice_table.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    // 執行 SQL
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ boxoffice 資料表創建成功！');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 創建資料表時發生錯誤:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// 執行
createBoxofficeTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 執行過程中發生未預期的錯誤:', error);
    process.exit(1);
  });

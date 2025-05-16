// 檢查資料庫結構的腳本
const { Client } = require('pg');

// 本地資料庫連接資訊
const dbConfig = {
  host: 'localhost',
  database: 'time2cinema_db_local',
  port: 5432
};

async function checkDatabaseStructure() {
  const client = new Client(dbConfig);
  
  try {
    console.log('連接到本地資料庫...');
    await client.connect();
    console.log('成功連接到本地資料庫');
    
    // 獲取所有表格
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log(`\n資料庫中的表格: ${tables.join(', ')}`);
    
    // 檢查每個表格的結構和數據
    for (const table of tables) {
      console.log(`\n=== 表格: ${table} ===`);
      
      // 獲取表結構
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      
      console.log('欄位結構:');
      columnsResult.rows.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type})`);
      });
      
      // 獲取記錄數量
      const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`記錄數量: ${countResult.rows[0].count}`);
      
      // 獲取樣本數據
      const sampleResult = await client.query(`SELECT * FROM ${table} LIMIT 3`);
      console.log('數據樣本:');
      sampleResult.rows.forEach((row, index) => {
        console.log(`[${index + 1}] ${JSON.stringify(row)}`);
      });
    }
    
  } catch (error) {
    console.error('檢查資料庫結構時出錯:', error);
  } finally {
    await client.end();
  }
}

// 執行主函數
checkDatabaseStructure();

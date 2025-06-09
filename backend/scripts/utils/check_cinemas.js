/**
 * 檢查電影院資料中的經緯度值
 */
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// 資料庫連線設定
const pool = new Pool({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'time2cinema',
  password: '',
  port: 5432,
});

async function checkCinemas() {
  try {
    console.log('檢查電影院資料中的經緯度值...');
    
    // 查詢經緯度為 null 或 0 的電影院
    const result = await pool.query(`
      SELECT id, name, city, district, lat, lng 
      FROM cinemas 
      WHERE lat IS NULL OR lng IS NULL OR lat = 0 OR lng = 0
      ORDER BY id
    `);
    
    if (result.rows.length === 0) {
      console.log('所有電影院都有有效的經緯度值');
    } else {
      console.log(`發現 ${result.rows.length} 筆電影院資料的經緯度值無效：`);
      console.table(result.rows);
    }
    
    // 檢查經緯度值的範圍（台灣的經緯度範圍約為：經度 119-122，緯度 21-26）
    const outOfRangeResult = await pool.query(`
      SELECT id, name, city, district, lat, lng 
      FROM cinemas 
      WHERE lat IS NOT NULL AND lng IS NOT NULL 
        AND (lat < 21 OR lat > 26 OR lng < 119 OR lng > 122)
      ORDER BY id
    `);
    
    if (outOfRangeResult.rows.length === 0) {
      console.log('所有電影院的經緯度值都在合理範圍內');
    } else {
      console.log(`發現 ${outOfRangeResult.rows.length} 筆電影院資料的經緯度值超出合理範圍：`);
      console.table(outOfRangeResult.rows);
    }
    
  } catch (error) {
    console.error('檢查電影院資料失敗:', error);
  } finally {
    // 關閉資料庫連線
    pool.end();
  }
}

// 執行檢查
checkCinemas();

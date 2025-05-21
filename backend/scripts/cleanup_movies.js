const { Pool } = require('pg');
const fs = require('fs').promises;

async function initDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  return pool;
}

async function cleanupMovies() {
  const client = await initDb();
  
  try {
    // 1. 開始事務
    await client.query('BEGIN');
    
    // 2. 刪除重複的電影記錄，只保留 id 最小的那一筆
    console.log('刪除重複的電影記錄...');
    await client.query(`
      DELETE FROM movies
      WHERE id IN (
        SELECT id
        FROM movies
        WHERE chinese_title IN (
          SELECT chinese_title
          FROM movies
          WHERE chinese_title IS NOT NULL
          GROUP BY chinese_title
          HAVING COUNT(*) > 1
        )
        AND id NOT IN (
          SELECT MIN(id)
          FROM movies
          WHERE chinese_title IS NOT NULL
          GROUP BY chinese_title
          HAVING COUNT(*) > 1
        )
      )
    `);
    
    // 3. 刪除缺少完整資料的電影記錄
    console.log('刪除缺少完整資料的電影記錄...');
    await client.query(`
      DELETE FROM movies
      WHERE (
        chinese_title IS NOT NULL AND (
          english_title IS NULL OR 
          english_title = '' OR
          full_title IS NULL OR
          full_title = ''
        )
      ) OR (
        chinese_title IS NULL AND (
          english_title IS NULL OR 
          english_title = '' OR
          full_title IS NULL OR
          full_title = ''
        )
      )
    `);

    // 4. 標準化電影名稱格式
    console.log('標準化電影名稱格式...');
    await client.query(`
      UPDATE movies
      SET 
        chinese_title = TRIM(chinese_title),
        english_title = TRIM(LOWER(english_title)),
        full_title = TRIM(full_title)
      WHERE chinese_title IS NOT NULL AND english_title IS NOT NULL AND full_title IS NOT NULL
    `);

    // 5. 處理只有英文標題的電影
    console.log('處理只有英文標題的電影...');
    await client.query(`
      UPDATE movies
      SET 
        chinese_title = english_title,
        full_title = english_title
      WHERE chinese_title IS NULL AND english_title IS NOT NULL AND full_title IS NULL
    `);
    
    // 4. 提交事務
    await client.query('COMMIT');
    
    console.log('清理完成！');
    
  } catch (error) {
    console.error('清理過程中發生錯誤:', error);
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

// 執行清理
cleanupMovies().catch(error => {
  console.error('❌ 執行清理程序時發生錯誤:', error);
  process.exit(1);
});

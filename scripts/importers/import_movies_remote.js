const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');

// 連接到線上資料庫
if (!process.env.DATABASE_URL) {
  console.error('錯誤：未設置 DATABASE_URL 環境變數');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 在生產環境中應該使用正確的SSL證書
  }
});

async function importMovies(csvFilePath) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 清空現有資料
    await client.query('TRUNCATE TABLE movies RESTART IDENTITY CASCADE');
    
    const movies = [];
    
    // 讀取CSV檔案，使用 csv-parser 來解析
    await new Promise((resolve, reject) => {
      const rows = [];
      
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => {
          // 處理 BOM 問題
          const headers = Object.keys(rows[0] || {});
          
          // 檢查並修正 BOM 問題
          if (headers.length > 0 && headers[0].startsWith('\ufeff')) {
            const fixedHeaders = headers.map(header => 
              header.startsWith('\ufeff') ? header.substring(1) : header
            );
            
            // 重新映射數據
            movies.push(...rows.map(row => {
              const newRow = {};
              headers.forEach((header, index) => {
                const cleanHeader = fixedHeaders[index];
                newRow[cleanHeader] = row[header];
              });
              return newRow;
            }));
          } else {
            movies.push(...rows);
          }
          
          resolve();
        })
        .on('error', (error) => {
          console.error('讀取CSV檔案時出錯:', error);
          reject(error);
        });
    });
    
    console.log(`找到 ${movies.length} 部電影`);
    
    // 插入資料
    for (const movie of movies) {
      try {
        console.log('正在處理電影:', movie.full_title || movie.chinese_title || movie.english_title);
        
        await client.query(
          `INSERT INTO movies (
            atmovies_id, release_date, source, runtime, 
            full_title, chinese_title, english_title, poster_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [
            movie.atmovies_id || null,
            movie.release_date || null,
            'atmovies',
            movie.runtime ? parseInt(movie.runtime) : null,
            movie.full_title || '',
            movie.chinese_title || '',
            movie.english_title || '',
            '' // poster_url is empty for now
          ]
        );
        console.log('已成功匯入:', movie.full_title || movie.chinese_title || movie.english_title);
      } catch (error) {
        console.error('處理電影時出錯:', error);
        throw error;
      }
    }
    
    await client.query('COMMIT');
    console.log('電影資料匯入成功');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('匯入電影資料時出錯:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const csvFilePath = process.argv[2];
    if (!csvFilePath) {
      throw new Error('請提供 CSV 文件路徑');
    }
    await importMovies(csvFilePath);
  } catch (error) {
    console.error('執行出錯:', error);
    process.exit(1);
  }
}

main();

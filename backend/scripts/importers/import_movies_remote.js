const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const { program } = require('commander');
require('dotenv').config();

// 設置命令行參數
program
  .requiredOption('-f, --file <file>', 'CSV file to import')
  .option('--debug', 'Enable debug logging', false);

program.parse(process.argv);
const options = program.opts();

// 日誌函數
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// 從環境變數獲取數據庫連接信息
const DATABASE_URL = process.env.DATABASE_URL || '';

// 驗證數據庫連接信息
if (!DATABASE_URL) {
  log('錯誤：未設置 DATABASE_URL 環境變數');
  process.exit(1);
}

// 創建數據庫連接池
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 對於 Render 的 PostgreSQL 數據庫是必需的
  }
});

// 主函數
async function importMovies() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    log('開始導入電影數據...');
    
    // 讀取並解析 CSV 文件
    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(options.file)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });
    
    log(`從 ${options.file} 讀取到 ${results.length} 條電影記錄`);
    
    // 準備 SQL 語句
    const insertMovie = `
      INSERT INTO movies (
        title, original_title, release_date, duration, 
        imdb_rating, imdb_votes, imdb_id, poster_url, 
        description, genres, director, actors, 
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
      )
      ON CONFLICT (imdb_id) 
      DO UPDATE SET
        title = EXCLUDED.title,
        original_title = EXCLUDED.original_title,
        release_date = EXCLUDED.release_date,
        duration = EXCLUDED.duration,
        imdb_rating = EXCLUDED.imdb_rating,
        imdb_votes = EXCLUDED.imdb_votes,
        poster_url = EXCLUDED.poster_url,
        description = EXCLUDED.description,
        genres = EXCLUDED.genres,
        director = EXCLUDED.director,
        actors = EXCLUDED.actors,
        updated_at = NOW()
      RETURNING id, title, imdb_id`;
    
    // 處理每條電影記錄
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const row of results) {
      try {
        // 準備電影數據
        const movieData = {
          title: row.chinese_title || row.english_title || '',
          original_title: row.original_title || row.english_title || '',
          release_date: row.release_date || null,
          duration: row.duration ? parseInt(row.duration) : null,
          imdb_rating: row.imdb_rating ? parseFloat(row.imdb_rating) : null,
          imdb_votes: row.imdb_votes ? parseInt(row.imdb_votes.replace(/,/g, '')) : null,
          imdb_id: row.imdb_id || null,
          poster_url: row.poster_url || null,
          description: row.description || null,
          genres: row.genres ? row.genres.split(',').map(g => g.trim()) : [],
          director: row.director || null,
          actors: row.actors ? row.actors.split(',').map(a => a.trim()) : []
        };
        
        // 檢查必要字段
        if (!movieData.title || !movieData.imdb_id) {
          log(`跳過無效記錄 - 標題: ${movieData.title}, IMDB ID: ${movieData.imdb_id}`);
          skippedCount++;
          continue;
        }
        
        // 執行插入或更新
        const result = await client.query(insertMovie, [
          movieData.title,
          movieData.original_title,
          movieData.release_date,
          movieData.duration,
          movieData.imdb_rating,
          movieData.imdb_votes,
          movieData.imdb_id,
          movieData.poster_url,
          movieData.description,
          JSON.stringify(movieData.genres),
          movieData.director,
          JSON.stringify(movieData.actors)
        ]);
        
        if (result.rowCount > 0) {
          const action = result.rows[0].id ? '更新' : '新增';
          log(`${action}電影: ${movieData.title} (IMDB: ${movieData.imdb_id})`);
          
          if (action === '更新') {
            updatedCount++;
          } else {
            importedCount++;
          }
        }
      } catch (error) {
        log(`處理電影記錄時出錯: ${error.message}`, row);
        // 繼續處理下一條記錄
      }
    }
    
    await client.query('COMMIT');
    log(`\n導入完成！`);
    log(`新增: ${importedCount}, 更新: ${updatedCount}, 跳過: ${skippedCount}, 總計: ${results.length}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    log('導入過程中出錯:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// 執行導入
importMovies().catch(error => {
  log('發生未捕獲的錯誤:', error);
  process.exit(1);
});

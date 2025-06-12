const { pool } = require('../../dist/db');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

// Load environment variables from .env file
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '..', '..', '..', '.env'); // Adjust path to root .env
const envConfig = dotenv.config({ path: envPath });

if (envConfig.error) {
  console.warn(`Warning: Could not load .env file from ${envPath}. Relying on system environment variables. Error: ${envConfig.error.message}`);
} else {
  console.log(`INFO: Successfully loaded .env file from ${envPath}`);
}

// 設置命令行參數
const program = new Command();
program
  .requiredOption('-f, --file <file>', 'JSON file to import')
  .option('--debug', 'enable debug logging', false);

// 解析命令行參數
const options = program.parse(process.argv).opts();

// 日誌函數
function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
}



// 主函數
async function importMovies() {
  // 從連接池獲取客戶端
  log('從連接池獲取數據庫連接...');
  const client = await pool.connect();
  
  try {
    // 檢查並創建唯一約束
    log('檢查唯一約束...');
    
    // Transactions will be handled per-insert or implicitly by individual statements.
    
    try {
      // 讀取 JSON 文件
      log(`讀取 JSON 文件: ${options.file}`);
      const jsonData = JSON.parse(fs.readFileSync(options.file, 'utf8'));
      
      if (!Array.isArray(jsonData)) {
        throw new Error('JSON 文件格式不正確，預期是一個數組');
      }
      
      log(`找到 ${jsonData.length} 筆電影資料`);
      
      // 準備 SQL 語句
      const insertQuery = `
        INSERT INTO movies (
          atmovies_id, full_title, chinese_title, 
          english_title, release_date, runtime, 
          poster_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (atmovies_id) DO UPDATE SET
          full_title = EXCLUDED.full_title,
          chinese_title = EXCLUDED.chinese_title,
          english_title = EXCLUDED.english_title,
          release_date = EXCLUDED.release_date,
          runtime = EXCLUDED.runtime,
          poster_url = EXCLUDED.poster_url,
          updated_at = NOW()
        RETURNING id;
      `;
      
      // 批量處理電影數據
      let successCount = 0;
      let errorCount = 0;
      
      for (const movie of jsonData) {
        try {
          // 使用 JSON 中的欄位名稱
          const values = [
            movie.atmovies_id,
            movie.full_title || '',
            movie.chinese_title || '',
            movie.english_title || null,
            movie.release_date || null,
            movie.runtime ? parseInt(movie.runtime) : null,
            movie.poster_url || null
          ];
          
          await client.query(insertQuery, values);
          successCount++;
          
          if (options.debug) {
            log(`成功處理: ${movie.display_title} (${movie.atmovies_id})`);
          } else if (successCount % 10 === 0) {
            process.stdout.write('.');
          }
        } catch (error) {
          errorCount++;
          log(`處理電影 ${movie.atmovies_id} 時出錯:`, error.message);
          if (options.debug) {
            console.error(error);
          }
        }
      }
      
      // Commit is not needed here as transactions are not managed globally for the batch.
      
      log(`\n匯入完成！成功: ${successCount}, 失敗: ${errorCount}`);
      
    } catch (error) {
      // Rollback is not needed here as transactions are not managed globally for the batch.
      throw error;
    }
    
  } catch (error) {
    log('發生錯誤:', error);
    process.exit(1);
    
  } finally {
    // 釋放客戶端回連接池
    if (client) {
      client.release();
    }
    // 不再關閉共享連接池
    // await pool.end();
  }
}

// 執行導入
importMovies().catch(error => {
  log('發生未捕獲的錯誤:', error);
  process.exit(1);
});

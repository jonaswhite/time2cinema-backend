const { Pool, Client } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
const { Command } = require('commander');

// 設置命令行參數
const program = new Command();
program
  .requiredOption('-f, --file <file>', 'CSV file to import')
  .option('--debug', 'enable debug logging', false);

// 解析命令行參數
const options = program.parse(process.argv).opts();

// 日誌函數
function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
}

// 從環境變數獲取數據庫連接信息
const DATABASE_URL = process.env.DATABASE_URL || '';

// 驗證數據庫連接信息
if (!DATABASE_URL) {
  log('錯誤：未設置 DATABASE_URL 環境變數');
  process.exit(1);
}

// 創建連接池
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 對於 Render 的 PostgreSQL 需要這個選項
  }
});

// 主函數
async function importMovies() {
  // 從連接池獲取客戶端
  log('從連接池獲取數據庫連接...');
  const client = await pool.connect();
  
  try {
    // 檢查並創建唯一約束
    log('檢查唯一約束...');
    
    // 首先檢查並刪除現有的部分唯一索引
    const checkPartialIndexQuery = `
      SELECT 1
      FROM pg_indexes
      WHERE tablename = 'movies' 
      AND indexname = 'movies_atmovies_id_key'
      AND indexdef LIKE '%WHERE (atmovies_id IS NOT NULL)%';
    `;
    const hasPartialIndex = (await client.query(checkPartialIndexQuery)).rowCount > 0;
    
    if (hasPartialIndex) {
      log('刪除現有的部分唯一索引...');
      await client.query(`
        DROP INDEX IF EXISTS movies_atmovies_id_key;
      `);
      log('部分唯一索引已刪除');
    }
    
    // 檢查是否已存在唯一約束
    const checkConstraintQuery = `
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'movies_atmovies_id_key';
    `;
    const constraintExists = (await client.query(checkConstraintQuery)).rowCount > 0;
    
    if (!constraintExists) {
      log('創建唯一約束...');
      // 創建唯一約束（這會自動創建一個唯一索引）
      await client.query(`
        ALTER TABLE movies 
        ADD CONSTRAINT movies_atmovies_id_key 
        UNIQUE (atmovies_id);
      `);
      log('唯一約束創建成功');
    } else {
      log('唯一約束已存在');
    }
    
    await client.query('BEGIN');
    
    log('開始導入電影數據...');
    
    // 讀取並解析 CSV 文件
    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(options.file, { encoding: 'utf8' })
        .pipe(csv({
          mapHeaders: ({ header }) => header.replace(/^\ufeff/, '') // 移除 BOM 字符
        }))
        .on('data', (data) => {
          // 確保 atmovies_id 是字符串且不為空
          if (data.atmovies_id) {
            results.push(data);
          } else {
            log(`跳過無效記錄 - 缺少 atmovies_id: ${JSON.stringify(data)}`);
          }
        })
        .on('end', () => {
          log(`成功解析 ${results.length} 條有效記錄`);
          resolve();
        })
        .on('error', (error) => {
          log('解析 CSV 文件時出錯:', error);
          reject(error);
        });
    });
    
    log(`從 ${options.file} 讀取到 ${results.length} 條電影記錄`);
    
    // 準備 SQL 語句
    const insertMovie = `
      INSERT INTO movies (
        full_title, chinese_title, english_title, release_date, 
        runtime, atmovies_id, poster_url, source,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4::date, $5, $6, $7, 'atmovies',
        NOW(), NOW()
      )
      ON CONFLICT (atmovies_id) 
      DO UPDATE SET
        full_title = EXCLUDED.full_title,
        chinese_title = EXCLUDED.chinese_title,
        english_title = EXCLUDED.english_title,
        release_date = EXCLUDED.release_date,
        runtime = EXCLUDED.runtime,
        poster_url = EXCLUDED.poster_url,
        updated_at = NOW()
      RETURNING id, full_title, atmovies_id`;
      
    // 啟用詳細錯誤日誌
    await client.query('SET client_min_messages TO NOTICE');
    
    // 處理每條電影記錄
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNumber = i + 2; // +2 因為 CSV 第一行是標題，且陣列從 0 開始
      
      try {
        log(`\n處理第 ${rowNumber} 條記錄...`);
        
        // 準備電影數據
        const movieData = {
          full_title: (row.full_title || '').trim(),
          chinese_title: (row.chinese_title || row.full_title || '').trim(),
          english_title: (row.english_title || '').trim(),
          release_date: row.release_date ? row.release_date.trim() : null,
          runtime: row.runtime ? parseInt(row.runtime) : null,
          atmovies_id: row.atmovies_id ? row.atmovies_id.trim().replace(/^f/, '') : null,
          poster_url: null,
          detail_url: row.detail_url ? row.detail_url.trim() : null
        };
        
        log('處理電影數據:', movieData);
        
        // 檢查必要字段
        if (!movieData.full_title || !movieData.atmovies_id) {
          log(`❌ 跳過無效記錄 - 缺少標題或 atmovies_id`);
          skippedCount++;
          continue;
        }
        
        // 檢查日期格式
        if (movieData.release_date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(movieData.release_date)) {
            log(`❌ 無效的日期格式: ${movieData.release_date}`);
            throw new Error(`無效的日期格式: ${movieData.release_date}`);
          }
        }
        
        // 開始新的事務
        await client.query('BEGIN');
        
        try {
          log(`執行 SQL 插入/更新...`);
          const result = await client.query(insertMovie, [
            movieData.full_title,
            movieData.chinese_title,
            movieData.english_title,
            movieData.release_date,
            movieData.runtime,
            movieData.atmovies_id,
            movieData.poster_url
          ]);
          
          await client.query('COMMIT');
          
          if (result.rows.length > 0) {
            if (result.rows[0].id) {
              importedCount++;
              log(`✅ 已新增/更新電影: ${result.rows[0].full_title} (ID: ${result.rows[0].id})`);
            } else {
              updatedCount++;
              log(`🔄 已更新電影: ${movieData.full_title}`);
            }
          } else {
            log(`⏭️  跳過重複記錄: ${movieData.full_title}`);
            skippedCount++;
          }
        } catch (dbError) {
          await client.query('ROLLBACK');
          throw dbError; // 重新拋出錯誤以捕獲並記錄
        }
      } catch (error) {
        log(`❌ 處理第 ${rowNumber} 條記錄時出錯: ${error.message}`);
        log('問題記錄:', JSON.stringify(row, null, 2));
        skippedCount++;
        
        // 如果錯誤與資料庫連接有關，可能需要重新連接
        if (error.code === '57P01' || error.message.includes('terminating connection')) {
          log('資料庫連接中斷，嘗試重新連接...');
          try {
            await client.end();
            client = await pool.connect();
            log('成功重新連接到資料庫');
          } catch (reconnectError) {
            log('重新連接資料庫失敗:', reconnectError);
            throw reconnectError;
          }
        }
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

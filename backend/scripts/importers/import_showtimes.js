// WARNING: This bypasses TLS certificate verification. Only for local development/debugging.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// 直接使用環境變數中的 DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
const fs = require('fs').promises;
const { Command } = require('commander');
const format = require('pg-format');
const { start } = require('repl');

// 設定專案根目錄與輸出目錄
// 使用絕對路徑確保檔案位置正確
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'scrapers');
const SHOWTIMES_FILE = path.join(OUTPUT_DIR, 'atmovies_showtimes.json');

// 輸出檔案路徑用於除錯
console.log('使用場次檔案路徑:', SHOWTIMES_FILE);

// 命令行參數解析
const program = new Command();
program
  .option('--file <path>', '指定場次資料檔案路徑', SHOWTIMES_FILE)
  .parse(process.argv);

const options = program.opts();

// In-memory caches

const TABLE_CREATION_QUERY = `
  CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    tmdb_id INTEGER UNIQUE,
    imdb_id VARCHAR(255) UNIQUE,
    full_title VARCHAR(255),
    chinese_title VARCHAR(255),
    english_title VARCHAR(255),
    original_title VARCHAR(255),
    poster_url TEXT,
    backdrop_url TEXT,
    overview TEXT,
    release_date DATE,
    runtime INTEGER,
    vote_average NUMERIC(3,1),
    genres TEXT[],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cinemas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    phone VARCHAR(50),
    region VARCHAR(50),
    district VARCHAR(50),
    source VARCHAR(50), -- e.g., 'atmovies', 'ezding'
    external_id VARCHAR(255), -- ID from the source
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, external_id)
  );

  CREATE TABLE IF NOT EXISTS showtimes (
    id SERIAL PRIMARY KEY,
    cinema_id INTEGER REFERENCES cinemas(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    -- The unique constraint (cinema_id, movie_id, date, time) will be added by the script later
  );
`;

const movieCache = new Map();
const cinemaCache = new Map();

// 初始化資料庫連接
async function initDb() {
  const client = await pool.connect();
  try {
    // 步驟 1: 測試連接並開始事務（如果需要，但這裡主要用於確保連接）
    await client.query('SELECT 1'); // Simple query to ensure connection is live
    console.log('✅ 成功連接到資料庫');

    // 步驟 2: 創建資料表 (如果不存在)
    await client.query(TABLE_CREATION_QUERY);
    console.log('✅ 資料表已創建或已存在');

    // 步驟 2.1: 檢查並添加 cinemas.external_id 欄位 (如果不存在)
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cinemas' AND column_name = 'external_id';
    `;
    const colResult = await client.query(checkColumnQuery);
    if (colResult.rows.length === 0) {
      console.log('🔧 cinemas.external_id 欄位不存在，正在添加...');
      await client.query('ALTER TABLE cinemas ADD COLUMN external_id VARCHAR(255);');
      console.log('✅ cinemas.external_id 欄位已添加');
    } else {
      console.log('ℹ️ cinemas.external_id 欄位已存在');
    }

    // 步驟 2.1b: 檢查並添加 cinemas.source 欄位 (如果不存在)
    const checkSourceColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cinemas' AND column_name = 'source';
    `;
    const sourceColResult = await client.query(checkSourceColumnQuery);
    if (sourceColResult.rows.length === 0) {
      console.log('🔧 cinemas.source 欄位不存在，正在添加...');
      await client.query('ALTER TABLE cinemas ADD COLUMN source VARCHAR(50);');
      console.log('✅ cinemas.source 欄位已添加');
    } else {
      console.log('ℹ️ cinemas.source 欄位已存在');
    }

    // 步驟 2.2: 檢查並添加 cinemas_source_external_id_key 唯一約束 (如果不存在)
    const checkConstraintQuery = `
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'cinemas' AND constraint_name = 'cinemas_source_external_id_key';
    `;
    const constraintResult = await client.query(checkConstraintQuery);
    if (constraintResult.rows.length === 0) {
      console.log('🔧 cinemas_source_external_id_key 約束不存在，正在添加...');
      // 首先確保 source 和 external_id 欄位存在且允許 NULL (如果它們可能尚未有值)
      // 然後再添加約束。如果欄位中已有重複的 NULL 值，直接添加 UNIQUE 約束會失敗。
      // 這裡假設 external_id 剛被添加，所以是空的，或者已有資料但需要清理。
      // 為了簡化，我們先嘗試直接添加，如果失敗，可能需要更複雜的資料清理邏輯。
      try {
        await client.query('ALTER TABLE cinemas ADD CONSTRAINT cinemas_source_external_id_key UNIQUE (source, external_id);');
        console.log('✅ cinemas_source_external_id_key 約束已添加');
      } catch (constraintError) {
        console.error('❌ 添加 cinemas_source_external_id_key 約束失敗:', constraintError.message);
        console.warn('⚠️ 請檢查 cinemas 資料表中 (source, external_id) 是否存在重複值或 NULL 值問題。');
      }
    } else {
      console.log('ℹ️ cinemas_source_external_id_key 約束已存在');
    }

    // 步驟 3: 確保 showtimes 表的唯一約束存在
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM pg_constraint 
          WHERE conname = 'showtimes_cinema_movie_date_time_key' 
          AND conrelid = 'showtimes'::regclass
        ) THEN
          ALTER TABLE showtimes ADD CONSTRAINT showtimes_cinema_movie_date_time_key UNIQUE (cinema_id, movie_id, date, "time");
          RAISE NOTICE 'Constraint showtimes_cinema_movie_date_time_key created on showtimes table.';
        ELSE
          RAISE NOTICE 'Constraint showtimes_cinema_movie_date_time_key already exists on showtimes table.';
        END IF;
      END;
      $$;
    `);
    // console.log('Ensured showtimes_cinema_movie_date_time_key unique constraint exists on showtimes table.'); // Log is now part of the DO block

    return client;
  } catch (error) {
    console.error('❌ 資料庫初始化失敗:', error);
    // 如果 client 已經連接，則釋放它
    if (client) {
      try {
        await client.release();
      } catch (releaseError) {
        console.error('Error releasing client after initialization failure:', releaseError);
      }
    }
    throw error; // 重新拋出錯誤，讓主程序知道初始化失敗
  }
  // 注意：client 的釋放現在應該由 main 函數中的 finally 區塊處理，
  // 或者如果 initDb 本身要管理 client 的生命週期直到返回前，則錯誤處理中需要釋放。
  // 目前的設計是 initDb 返回 client，所以 main 函數負責釋放。
}

// 將 YYYYMMDD 格式轉換為 YYYY-MM-DD
function formatDate(dateStr) {
  if (!dateStr) return null;
  
  // 如果已經是 YYYY-MM-DD 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // 處理 YYYYMMDD 格式
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  return null;
}

// 根據電影名稱獲取或創建電影 ID
async function getOrCreateMovieId(client, atmoviesId, movieName) { // movieName is now optional, for fallback
  if (!atmoviesId) {
    console.warn('⚠️ 缺少 atmoviesId，無法處理電影');
    return null;
  }
  if (movieCache.has(atmoviesId)) {
    return movieCache.get(atmoviesId);
  }

  try {
    // Removed showYear logic as it depended on showDateString which is no longer a parameter.
    // Matching is now primarily by atmovies_id.

    // 嘗試使用 atmovies_id 查找電影
    const res = await client.query(
      'SELECT id FROM movies WHERE atmovies_id = $1 LIMIT 1',
      [atmoviesId]
    );

    if (res.rows.length > 0) {
      movieCache.set(atmoviesId, res.rows[0].id);
      return res.rows[0].id;
    }

    // 如果找不到，創建新電影
    // 使用 movieName 作為 chinese_title 和 full_title 的 fallback
    const titleToUse = movieName || `未知電影 (${atmoviesId})`;
    try {
      const insertRes = await client.query(
        `INSERT INTO movies (atmovies_id, chinese_title, full_title, created_at, updated_at, source)
         VALUES ($1, $2, $3, NOW(), NOW(), 'atmovies_showtimes_import')
         RETURNING id`,
        [atmoviesId, titleToUse, titleToUse]
      );
      
      const newMovieId = insertRes.rows[0].id;
      console.log(`✅ 創建新電影: ${titleToUse} (atmovies_id: ${atmoviesId}, DB ID: ${newMovieId})`);
      movieCache.set(atmoviesId, newMovieId);
      return newMovieId;
    } catch (insertError) {
      // 處理並發創建導致的唯一約束衝突
      if (insertError.code === '23505') { // unique_violation for atmovies_id
        console.warn(`🔄 插入電影 ${atmoviesId} 時發生唯一約束衝突，嘗試重新查詢...`);
        const retryRes = await client.query(
          'SELECT id FROM movies WHERE atmovies_id = $1 LIMIT 1',
          [atmoviesId]
        );
        if (retryRes.rows.length > 0) {
          movieCache.set(atmoviesId, retryRes.rows[0].id);
          return retryRes.rows[0].id;
        }
      }
      console.error(`❌ 創建電影 ${atmoviesId} (${titleToUse}) 時出錯:`, insertError.message);
      throw insertError; // 重新拋出錯誤，讓上層處理
    }
  } catch (error) {
    console.error(`❌ 處理電影 atmovies_id: ${atmoviesId} / name: ${movieName} 時出錯:`, error.message);
    return null;
  }
}

// 根據電影院 ID 獲取或創建電影院記錄
async function getOrCreateTheaterId(client, atmoviesTheaterId, theaterName) {
  if (cinemaCache.has(atmoviesTheaterId)) {
    return cinemaCache.get(atmoviesTheaterId);
  }
  if (!atmoviesTheaterId) return null;
  
  try {
    // 先嘗試查找
    const res = await client.query(
      `SELECT id FROM cinemas WHERE external_id = $1 AND source = 'atmovies' LIMIT 1`,
      [atmoviesTheaterId]
    );
    
    if (res.rows.length > 0) {
      cinemaCache.set(atmoviesTheaterId, res.rows[0].id);
      return res.rows[0].id;
    }
    
    // 如果找不到，創建新記錄
    const insertRes = await client.query(
      `INSERT INTO cinemas (name, external_id, source, created_at, updated_at)
       VALUES ($1, $2, 'atmovies', NOW(), NOW())
       RETURNING id`,
      [theaterName || `未知電影院-${atmoviesTheaterId}`, atmoviesTheaterId]
    );
    
    console.log(`✅ 創建新電影院: ${theaterName} (ID: ${insertRes.rows[0].id})`);
    cinemaCache.set(atmoviesTheaterId, insertRes.rows[0].id);
    return insertRes.rows[0].id;
  } catch (error) {
    console.error(`❌ 處理電影院 ${theaterName} (${atmoviesTheaterId}) 時出錯:`, error);
    return null;
  }
}

// 清理昨天的場次資料
async function cleanupOldShowtimes(client) {
  try {
    // 獲取今天的日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 格式化為 YYYY-MM-DD
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`🧹 開始清理 ${todayStr} 之前的場次資料...`);
    
    // 刪除昨天的場次資料
    const result = await client.query(
      `DELETE FROM showtimes 
       WHERE date < $1 
       RETURNING id`,
      [todayStr]
    );
    
    console.log(`✅ 已清理 ${result.rowCount} 筆舊場次資料`);
    return result.rowCount;
  } catch (error) {
    console.error('❌ 清理舊場次資料時出錯:', error);
    throw error;
  }
}

// 主函數
async function main() {
  console.log('🚀 開始匯入場次資料...');
  let client;
  
  try {
    // 讀取場次資料
    const data = await fs.readFile(options.file || SHOWTIMES_FILE, 'utf8');
    const showtimesData = JSON.parse(data);
    
    // 初始化資料庫連接
    client = await initDb();
    
    // 在匯入新資料前清理舊場次
    await client.query('BEGIN');
    try {
      await cleanupOldShowtimes(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
    console.log(`📂 讀取場次資料：${options.file || SHOWTIMES_FILE}`);
    console.log(`📅 場次資料日期：${showtimesData[0]?.atmovies_showtimes_by_date[0]?.date || '未知'}`);
    
    // 處理每個電影院的場次資料
    let totalShowtimes = 0;
    let successfulTheaters = 0;
    const processedMovies = new Set();
    let showtimesToInsertBatch = [];
    const BATCH_SIZE = 500; // Configurable batch size

    for (const theater of showtimesData) {
      const atmoviesTheaterId = theater.atmovies_theater_id;
      const theaterName = theater.atmovies_theater_name;
      
      if (!atmoviesTheaterId) {
        console.error('❌ 缺少電影院 ID');
        continue;
      }
      
      console.log(`\n🎬 處理電影院: ${theaterName} (${atmoviesTheaterId})`);
      
      // 開始新事務
      await client.query('BEGIN');
      let theaterShowtimes = 0;
      
      try {
        // 獲取或創建電影院 ID
        const theaterId = await getOrCreateTheaterId(client, atmoviesTheaterId, theaterName);
        if (!theaterId) {
          throw new Error(`無法獲取或創建電影院: ${theaterName}`);
        }
        
        // 處理每個日期的場次
        for (const dateGroup of theater.atmovies_showtimes_by_date || []) {
          const showDate = dateGroup.date; // 格式: YYYYMMDD
          
          if (!dateGroup.showtimes || !Array.isArray(dateGroup.showtimes)) {
            console.log(`ℹ️  ${showDate} 沒有場次`);
            continue;
          }
          
          console.log(`📅 處理日期: ${showDate} (${dateGroup.label || '無標籤'}) - 共 ${dateGroup.showtimes.length} 個場次`);
          
          // 處理每個場次
          for (const showtime of dateGroup.showtimes) {
            const movieName = showtime.movie_name;
            const timeStr = showtime.time; // 格式: HH:MM
            // Removed check for movieName as we now rely on atmovies_id
            
            if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
              console.error(`❌ 無效的場次時間格式: ${timeStr}`);
              continue;
            }
            
            // Validate atmovies_id before processing
            const atmoviesIdPattern = /^[a-z]{4}\d{8}$/;
            if (!showtime.atmovies_id || !atmoviesIdPattern.test(showtime.atmovies_id)) {
              console.warn(`🚫 檢測到無效或空的 atmovies_id: '${showtime.atmovies_id}' (時間: ${timeStr})，跳過此場次。可能為休館或其他特殊情況。`);
              continue;
            }
            
            try {
              // 獲取或創建電影 ID
              const showDateForMovie = showDate; // YYYYMMDD, from dateGroup.date
              const movieId = await getOrCreateMovieId(client, showtime.atmovies_id, showtime.movie_name); // Pass atmovies_id and movie_name as fallback
              if (!movieId) {
                console.warn(`⚠️ 無法獲取或創建電影 ID for atmovies_id: ${showtime.atmovies_id}. 跳過此場次.`);
                continue; // Skip this showtime if movie ID can't be resolved
              }
              
              // 記錄已處理的電影
              if (!processedMovies.has(movieId)) {
                processedMovies.add(movieId);
              }
              
              // 解析日期
              const year = showDate.substring(0, 4);
              const month = showDate.substring(4, 6);
              const day = showDate.substring(6, 8);
              const dateStr = `${year}-${month}-${day}`;
              const timeWithSeconds = timeStr + ':00'; // 轉換為 HH:MM:SS
              
              console.log(`🕒 處理場次: ${dateStr} ${timeWithSeconds} - atmovies_id: ${showtime.atmovies_id}`);
              
              showtimesToInsertBatch.push([theaterId, movieId, dateStr, timeWithSeconds, new Date(), new Date()]);
              totalShowtimes++;
              theaterShowtimes++;

              if (showtimesToInsertBatch.length >= BATCH_SIZE) {
                try {
                  const insertQuery = format(
                    'INSERT INTO showtimes (cinema_id, movie_id, date, time, created_at, updated_at) VALUES %L ON CONFLICT (cinema_id, movie_id, date, time) DO NOTHING',
                    showtimesToInsertBatch
                  );
                  await client.query(insertQuery);
                  console.log(`✅ 批量插入 ${showtimesToInsertBatch.length} 筆場次`);
                  showtimesToInsertBatch = []; // Reset batch
                } catch (batchInsertError) {
                  console.error('❌ 批量插入場次失敗:', batchInsertError.message);
                  // Optionally, handle individual inserts as fallback or log problematic batch
                  // For now, we'll just log and continue, some showtimes in this batch might be lost
                }
              }
              
            } catch (error) {
              console.error(`❌ 處理場次失敗 (${movieName} - ${timeStr}):`, error.message);
              // 繼續處理下一個場次
            }
          }
        }
        
        // Insert any remaining showtimes in the batch
        if (showtimesToInsertBatch.length > 0) {
          try {
            const insertQuery = format(
              'INSERT INTO showtimes (cinema_id, movie_id, date, time, created_at, updated_at) VALUES %L ON CONFLICT (cinema_id, movie_id, date, time) DO NOTHING',
              showtimesToInsertBatch
            );
            await client.query(insertQuery);
            console.log(`✅ 批量插入剩餘 ${showtimesToInsertBatch.length} 筆場次`);
          } catch (batchInsertError) {
            console.error('❌ 批量插入剩餘場次失敗:', batchInsertError.message);
          }
        }

        // 提交事務
        await client.query('COMMIT');
        successfulTheaters++;
        console.log(`✅ 成功匯入 ${theaterName} 的場次資料 (共 ${theaterShowtimes} 筆)`);
        
      } catch (error) {
        // 回滾事務
        await client.query('ROLLBACK');
        console.error(`❌ 處理電影院 ${theaterName} 時出錯:`, error.message);
      }
    }
    
    console.log('\n🎉 匯入完成！');
    console.log('='.repeat(40));
    console.log(`✅ 成功處理電影院: ${successfulTheaters}/${showtimesData.length}`);
    console.log(`🏢 電影數量: ${processedMovies.size}`);
    console.log(`🎟️  總場次數: ${totalShowtimes}`);
    console.log('='.repeat(40));
    
  } catch (error) {
    console.error('❌ 執行失敗:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
      // 不再關閉共享連接池
      // await pool.end();
    }
  }
}

// 執行主函數
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 執行匯入程序時發生錯誤:', err);
    process.exit(1);
  });
}

// 導出函數供其他模組使用
module.exports = {
  importShowtimes: main,
  getOrCreateMovieId,
  getOrCreateTheaterId,
  formatDate
};

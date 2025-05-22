const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { Command } = require('commander');

// 設定專案根目錄與輸出目錄
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const SCRAPERS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'scrapers');
const SHOWTIMES_FILE = path.join(SCRAPERS_OUTPUT_DIR, 'atmovies_showtimes.json');

// 資料庫連線設定
const DB_CONFIGS = {
  local: {
    user: 'jonaswhite',
    host: 'localhost',
    database: 'jonaswhite',
    port: 5432,
    ssl: false
  },
  remote: {
    connectionString: process.env.DATABASE_URL || 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
    ssl: {
      rejectUnauthorized: false
    }
  }
};

// 命令行參數解析
const program = new Command();
program
  .option('--local', '使用本地資料庫')
  .option('--remote', '使用遠端資料庫')
  .option('--connection <string>', '自定義資料庫連接字串')
  .option('--file <path>', '指定場次資料檔案路徑', SHOWTIMES_FILE)
  .parse(process.argv);

const options = program.opts();

// 確定使用哪個資料庫配置
let dbConfig;
if (options.connection) {
  dbConfig = {
    connectionString: options.connection,
    ssl: options.connection.includes('render.com') ? { rejectUnauthorized: false } : false
  };
} else if (options.remote) {
  dbConfig = DB_CONFIGS.remote;
} else {
  dbConfig = DB_CONFIGS.local;
}

// 創建資料庫連接池
const pool = new Pool(dbConfig);

// 初始化資料庫連接
async function initDb() {
  const client = await pool.connect();
  try {
    // 測試連接
    await client.query('BEGIN');
    await client.query('SELECT 1');
    console.log('✅ 成功連接到資料庫');
    return client;
  } catch (error) {
    console.error('❌ 無法連接到資料庫:', error);
    await client.release();
    throw error;
  }
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
async function getOrCreateMovieId(client, movieName) {
  if (!movieName) return null;
  
  try {
    // 先嘗試在 chinese_title 或 full_title 中查找完全匹配
    const res = await client.query(
      `SELECT id FROM movies 
       WHERE chinese_title = $1 OR full_title = $1
       LIMIT 1`,
      [movieName]
    );
    
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    
    // 如果找不到完全匹配，嘗試模糊匹配
    const likeRes = await client.query(
      `SELECT id FROM movies 
       WHERE chinese_title LIKE $1 OR full_title LIKE $1
       LIMIT 1`,
      [`%${movieName}%`]
    );
    
    if (likeRes.rows.length > 0) {
      console.log(`🔍 找到模糊匹配的電影: ${movieName} -> ${likeRes.rows[0].id}`);
      return likeRes.rows[0].id;
    }
    
    // 如果還是找不到，創建新電影
    try {
      const insertRes = await client.query(
        `INSERT INTO movies (chinese_title, full_title, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [movieName, movieName]  // 將相同的名稱同時存入 chinese_title 和 full_title
      );
      
      console.log(`✅ 創建新電影: ${movieName} (ID: ${insertRes.rows[0].id})`);
      return insertRes.rows[0].id;
    } catch (insertError) {
      // 如果插入失敗（例如並發創建），再次嘗試查詢
      console.log(`🔄 嘗試重新查詢電影: ${movieName}`);
      const retryRes = await client.query(
        `SELECT id FROM movies 
         WHERE chinese_title = $1 OR full_title = $1
         LIMIT 1`,
        [movieName]
      );
      
      if (retryRes.rows.length > 0) {
        return retryRes.rows[0].id;
      }
      
      throw insertError; // 重新拋出錯誤
    }
  } catch (error) {
    console.error(`❌ 處理電影 ${movieName} 時出錯:`, error.message);
    return null;
  }
}

// 根據電影院 ID 獲取或創建電影院記錄
async function getOrCreateTheaterId(client, atmoviesTheaterId, theaterName) {
  if (!atmoviesTheaterId) return null;
  
  try {
    // 先嘗試查找
    const res = await client.query(
      `SELECT id FROM cinemas 
       WHERE source = 'atmovies' AND external_id = $1`,
      [atmoviesTheaterId]
    );
    
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    
    // 如果找不到，創建新記錄
    const insertRes = await client.query(
      `INSERT INTO cinemas (name, external_id, source, created_at, updated_at)
       VALUES ($1, $2, 'atmovies', NOW(), NOW())
       RETURNING id`,
      [theaterName || `未知電影院-${atmoviesTheaterId}`, atmoviesTheaterId]
    );
    
    return insertRes.rows[0].id;
  } catch (error) {
    console.error(`❌ 處理電影院 ${theaterName} (${atmoviesTheaterId}) 時出錯:`, error);
    return null;
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
    
    console.log(`📂 讀取場次資料：${options.file || SHOWTIMES_FILE}`);
    console.log(`📅 場次資料日期：${showtimesData[0]?.atmovies_showtimes_by_date[0]?.date || '未知'}`);
    
    // 初始化資料庫連接
    client = await initDb();
    
    let totalShowtimes = 0;
    let successfulTheaters = 0;
    const processedMovies = new Set();
    
    // 處理每個電影院的場次資料
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
            
            if (!movieName) {
              console.error('❌ 缺少電影名稱');
              continue;
            }
            
            if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
              console.error(`❌ 無效的場次時間格式: ${timeStr}`);
              continue;
            }
            
            try {
              // 獲取或創建電影 ID
              const movieId = await getOrCreateMovieId(client, movieName);
              if (!movieId) {
                throw new Error(`無法獲取或創建電影: ${movieName}`);
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
              
              console.log(`🕒 處理場次: ${dateStr} ${timeWithSeconds} - ${movieName}`);
              
              try {
                // 先檢查場次是否已存在
                const checkRes = await client.query(
                  `SELECT id FROM showtimes 
                   WHERE cinema_id = $1 AND movie_id = $2 AND date = $3 AND time = $4
                   LIMIT 1`,
                  [theaterId, movieId, dateStr, timeWithSeconds]
                );
                
                if (checkRes.rows.length === 0) {
                  // 場次不存在，插入新場次
                  const insertQuery = `
                    INSERT INTO showtimes (cinema_id, movie_id, date, time, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, NOW(), NOW())
                    RETURNING id`;
                  
                  await client.query(insertQuery, [
                    theaterId,  // cinema_id
                    movieId,    // movie_id
                    dateStr,    // date
                    timeWithSeconds  // time
                  ]);
                  
                  console.log(`✅ 新增場次: ${dateStr} ${timeWithSeconds} - ${movieName}`);
                } else {
                  console.log(`⏭️ 場次已存在: ${dateStr} ${timeWithSeconds} - ${movieName}`);
                }
                
                totalShowtimes++;
                theaterShowtimes++;
              } catch (insertError) {
                console.error(`❌ 插入場次失敗 (${movieName} - ${timeWithSeconds}):`, insertError.message);
                // 繼續處理下一個場次
              }
              
            } catch (error) {
              console.error(`❌ 處理場次失敗 (${movieName} - ${timeStr}):`, error.message);
              // 繼續處理下一個場次
            }
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
      await pool.end();
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

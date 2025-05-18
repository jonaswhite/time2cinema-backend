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
    // 先嘗試查找完全匹配
    const res = await client.query(
      'SELECT id FROM movies WHERE title = $1',
      [movieName]
    );
    
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    
    // 如果找不到完全匹配，嘗試模糊匹配
    const likeRes = await client.query(
      'SELECT id FROM movies WHERE title LIKE $1 LIMIT 1',
      [`%${movieName}%`]
    );
    
    if (likeRes.rows.length > 0) {
      return likeRes.rows[0].id;
    }
    
    // 如果還是找不到，創建新電影
    const insertRes = await client.query(
      `INSERT INTO movies (title, created_at, updated_at)
       VALUES ($1, NOW(), NOW())
       RETURNING id`,
      [movieName]
    );
    
    return insertRes.rows[0].id;
  } catch (error) {
    console.error(`❌ 處理電影 ${movieName} 時出錯:`, error);
    return null;
  }
}

// 根據電影院 ID 獲取或創建電影院記錄
async function getOrCreateTheaterId(client, atmoviesTheaterId, theaterName) {
  if (!atmoviesTheaterId) return null;
  
  try {
    // 先嘗試查找
    const res = await client.query(
      'SELECT id FROM theaters WHERE atmovies_theater_id = $1',
      [atmoviesTheaterId]
    );
    
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    
    // 如果找不到，創建新記錄
    const insertRes = await client.query(
      `INSERT INTO theaters (name, atmovies_theater_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
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
  
  try {
    // 讀取場次資料
    const data = await fs.readFile(options.file || SHOWTIMES_FILE, 'utf8');
    const showtimesData = JSON.parse(data);
    
    console.log(`📂 讀取場次資料：${options.file || SHOWTIMES_FILE}`);
    console.log(`📅 場次資料日期：${showtimesData[0]?.atmovies_showtimes_by_date[0]?.date || '未知'}`);
    console.log(`🎬 場次資料電影範例：${
      showtimesData[0]?.atmovies_showtimes_by_date[0]?.showtimes
        .slice(0, 3)
        .map(s => s.movie_name)
        .join(', ') || '無資料'
    }`);
    
    // 初始化資料庫連接
    const client = await initDb();
    
    try {
      await client.query('BEGIN');
      
      // 清空現有場次
      console.log('🧹 清空現有場次資料...');
      await client.query('TRUNCATE TABLE movie_showtimes CASCADE');
      
      // 匯入新場次
      let totalShowtimes = 0;
      let totalTheaters = 0;
      let totalMovies = 0;
      const processedMovies = new Set();
      
      // 先處理所有電影，確保它們都存在於資料庫中
      console.log('🔍 正在檢查並創建電影資料...');
      for (const theater of showtimesData) {
        for (const dateData of theater.atmovies_showtimes_by_date) {
          for (const showtime of dateData.showtimes) {
            if (!processedMovies.has(showtime.movie_name)) {
              const movieId = await getOrCreateMovieId(client, showtime.movie_name);
              if (movieId) {
                processedMovies.add(showtime.movie_name);
                totalMovies++;
              }
            }
          }
        }
      }
      console.log(`✅ 已處理 ${totalMovies} 部電影`);
      
      // 處理場次資料
      console.log('🚀 開始匯入場次資料...');
      for (const theater of showtimesData) {
        const { atmovies_theater_id, atmovies_theater_name, atmovies_showtimes_by_date } = theater;
        
        // 確保電影院存在
        const theaterId = await getOrCreateTheaterId(client, atmovies_theater_id, atmovies_theater_name);
        if (!theaterId) {
          console.warn(`⚠️ 跳過電影院 (找不到或無法創建): ${atmovies_theater_name} (${atmovies_theater_id})`);
          continue;
        }
        
        totalTheaters++;
        let theaterShowtimes = 0;
        
        // 處理每個日期的場次
        for (const dateData of atmovies_showtimes_by_date) {
          const { date, showtimes } = dateData;
          const formattedDate = formatDate(date) || date;
          
          for (const showtime of showtimes) {
            const movieId = await getOrCreateMovieId(client, showtime.movie_name);
            
            if (!movieId) {
              console.warn(`⚠️ 跳過場次 (找不到電影): ${showtime.movie_name}`);
              continue;
            }
            
            // 插入場次資料
            try {
              await client.query(
                `INSERT INTO movie_showtimes 
                 (movie_id, theater_id, showtime, date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                [movieId, theaterId, showtime.time, formattedDate]
              );
              
              totalShowtimes++;
              theaterShowtimes++;
            } catch (error) {
              console.error(`❌ 插入場次失敗 (${showtime.movie_name}):`, error.message);
            }
          }
        }
        
        if (theaterShowtimes > 0) {
          console.log(`  ✅ ${atmovies_theater_name}: 已匯入 ${theaterShowtimes} 筆場次`);
        }
      }
      
      await client.query('COMMIT');
      
      // 輸出統計資訊
      console.log('\n🎉 匯入完成！');
      console.log('='.repeat(40));
      console.log(`🏢 電影院數量: ${totalTheaters}`);
      console.log(`🎬 電影數量: ${totalMovies}`);
      console.log(`🎟️  總場次數: ${totalShowtimes}`);
      console.log('='.repeat(40));
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ 匯入過程中發生錯誤:', error);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
    
  } catch (error) {
    console.error('❌ 執行失敗:', error);
    process.exit(1);
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

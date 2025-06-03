const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 添加超時處理
let isRunning = false;
const TIMEOUT_MS = 300000; // 5分鐘超時

// 線上資料庫連接設定
const remotePool = new Pool({
  connectionString: "postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db",
  ssl: {
    rejectUnauthorized: false
  }
});

// 本地資料庫連接設定
const localPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'time2cinema',
  user: 'postgres',
  password: 'postgres'
});

async function syncShowtimes() {
  if (isRunning) {
    console.log('腳本已在運行中，避免重複執行');
    return;
  }
  
  isRunning = true;
  
  // 設置超時處理
  const timeout = setTimeout(() => {
    console.error('腳本執行超時，強制結束');
    process.exit(1);
  }, TIMEOUT_MS);
  
  console.log('開始同步資料...');
  
  try {
    // 檢查本地資料庫中是否存在必要的表
    console.log('檢查本地資料庫結構...');
    const tableExists = await checkAndCreateTables();
    if (!tableExists) {
      console.log('已創建必要的資料表結構');
    } else {
      console.log('資料表結構已存在');
    }
    
    // 同步電影資料
    console.log('同步電影資料...');
    await syncMovies();
    
    // 同步電影院資料
    console.log('同步電影院資料...');
    await syncCinemas();
    
    // 從線上資料庫獲取所有場次資料
    console.log('從線上資料庫獲取場次資料...');
    const remoteResult = await remotePool.query(`
      SELECT s.*, 
             m.chinese_title AS movie_title,
             c.name AS cinema_name
      FROM showtimes s
      LEFT JOIN movies m ON s.movie_id = m.id
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      ORDER BY s.date, s.time, c.name, m.chinese_title
    `);
    
    console.log(`從線上資料庫獲取了 ${remoteResult.rows.length} 筆場次資料`);
    
    // 清空本地資料庫的場次資料
    console.log('清空本地資料庫的場次資料...');
    await localPool.query('TRUNCATE TABLE showtimes');
    
    // 將場次資料插入到本地資料庫
    console.log('將場次資料插入到本地資料庫...');
    let insertedCount = 0;
    
    for (const showtime of remoteResult.rows) {
      try {
        await localPool.query(`
          INSERT INTO showtimes (
            id, movie_id, cinema_id, date, time, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            movie_id = $2,
            cinema_id = $3,
            date = $4,
            time = $5,
            updated_at = $7
        `, [
          showtime.id,
          showtime.movie_id,
          showtime.cinema_id,
          showtime.date,
          showtime.time,
          showtime.created_at || new Date(),
          showtime.updated_at || new Date()
        ]);
        insertedCount++;
      } catch (err) {
        console.error(`插入場次資料失敗 (ID: ${showtime.id}):`, err);
      }
    }
    
    console.log(`成功將 ${insertedCount} 筆場次資料插入到本地資料庫`);
    
    // 統計每個日期的場次數量
    console.log('統計每個日期的場次數量...');
    const dateStatsResult = await localPool.query(`
      SELECT date::date, COUNT(*) as count
      FROM showtimes
      GROUP BY date::date
      ORDER BY date::date
    `);
    
    // 檢查每個電影院的場次數量
    console.log('\n檢查每個電影院的場次數量:');
    const cinemaStatsResult = await localPool.query(`
      SELECT c.id, c.name, COUNT(s.*) as showtime_count
      FROM cinemas c
      LEFT JOIN showtimes s ON c.id = s.cinema_id
      GROUP BY c.id, c.name
      ORDER BY showtime_count DESC
    `);
    
    cinemaStatsResult.rows.forEach(row => {
      console.log(`${row.name} (ID: ${row.id}): ${row.showtime_count} 場次`);
    });
    
    // 檢查每部電影的場次數量
    console.log('\n檢查每部電影的場次數量:');
    const movieStatsResult = await localPool.query(`
      SELECT m.id, m.chinese_title, COUNT(s.*) as showtime_count
      FROM movies m
      LEFT JOIN showtimes s ON m.id = s.movie_id
      GROUP BY m.id, m.chinese_title
      ORDER BY showtime_count DESC
      LIMIT 20
    `);
    
    movieStatsResult.rows.forEach(row => {
      console.log(`${row.chinese_title} (ID: ${row.id}): ${row.showtime_count} 場次`);
    });
    
    console.log('每個日期的場次數量:');
    dateStatsResult.rows.forEach(row => {
      console.log(`${row.date.toISOString().split('T')[0]}: ${row.count} 場次`);
    });
    
    // 將統計結果寫入檔案
    const statsOutput = dateStatsResult.rows.map(row => 
      `${row.date.toISOString().split('T')[0]}: ${row.count} 場次`
    ).join('\n');
    
    fs.writeFileSync(
      path.resolve(__dirname, 'showtimes_stats.txt'), 
      `場次統計 (${new Date().toISOString()})\n\n${statsOutput}`
    );
    
    console.log('統計結果已寫入 temp/showtimes_stats.txt');
    
  } catch (err) {
    console.error('同步場次資料時發生錯誤:', err);
  } finally {
    // 關閉資料庫連接
    try {
      await remotePool.end();
      await localPool.end();
      console.log('資料庫連接已關閉');
    } catch (err) {
      console.error('關閉資料庫連接時發生錯誤:', err);
    }
    
    // 清除超時計時器
    clearTimeout(timeout);
    isRunning = false;
    
    // 確保腳本結束
    process.exit(0);
  }
}

// 檢查並創建必要的表
async function checkAndCreateTables() {
  try {
    // 檢查 showtimes 表是否存在
    const tableCheck = await localPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'showtimes'
      );
    `);
    
    const showtimesExists = tableCheck.rows[0].exists;
    
    if (!showtimesExists) {
      console.log('創建 movies 表...');
      await localPool.query(`
        CREATE TABLE IF NOT EXISTS movies (
          id SERIAL PRIMARY KEY,
          chinese_title VARCHAR(255),
          english_title VARCHAR(255),
          release_date DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      console.log('創建 cinemas 表...');
      await localPool.query(`
        CREATE TABLE IF NOT EXISTS cinemas (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          address VARCHAR(255),
          lat DECIMAL(10, 8),
          lng DECIMAL(11, 8),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      console.log('創建 showtimes 表...');
      await localPool.query(`
        CREATE TABLE IF NOT EXISTS showtimes (
          id SERIAL PRIMARY KEY,
          movie_id INTEGER REFERENCES movies(id),
          cinema_id INTEGER REFERENCES cinemas(id),
          date DATE NOT NULL,
          time TIME NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      return false; // 表不存在，已創建
    }
    
    return true; // 表已存在
  } catch (err) {
    console.error('檢查或創建表時發生錯誤:', err);
    throw err;
  }
}

// 同步電影資料
async function syncMovies() {
  try {
    // 從線上資料庫獲取所有電影資料
    const remoteMovies = await remotePool.query(`
      SELECT * FROM movies
    `);
    
    console.log(`從線上資料庫獲取了 ${remoteMovies.rows.length} 筆電影資料`);
    
    // 清空本地資料庫的電影資料
    await localPool.query('TRUNCATE TABLE movies CASCADE');
    
    // 將電影資料插入到本地資料庫
    let insertedCount = 0;
    
    for (const movie of remoteMovies.rows) {
      try {
        await localPool.query(`
          INSERT INTO movies (
            id, chinese_title, english_title, release_date, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            chinese_title = $2,
            english_title = $3,
            release_date = $4,
            updated_at = $6
        `, [
          movie.id,
          movie.chinese_title,
          movie.english_title,
          movie.release_date,
          movie.created_at || new Date(),
          movie.updated_at || new Date()
        ]);
        insertedCount++;
      } catch (err) {
        console.error(`插入電影資料失敗 (ID: ${movie.id}):`, err);
      }
    }
    
    console.log(`成功將 ${insertedCount} 筆電影資料插入到本地資料庫`);
  } catch (err) {
    console.error('同步電影資料時發生錯誤:', err);
    throw err;
  }
}

// 同步電影院資料
async function syncCinemas() {
  try {
    // 從線上資料庫獲取所有電影院資料
    const remoteCinemas = await remotePool.query(`
      SELECT * FROM cinemas
    `);
    
    console.log(`從線上資料庫獲取了 ${remoteCinemas.rows.length} 筆電影院資料`);
    
    // 清空本地資料庫的電影院資料
    await localPool.query('TRUNCATE TABLE cinemas CASCADE');
    
    // 將電影院資料插入到本地資料庫
    let insertedCount = 0;
    
    for (const cinema of remoteCinemas.rows) {
      try {
        await localPool.query(`
          INSERT INTO cinemas (
            id, name, address, lat, lng, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = $2,
            address = $3,
            lat = $4,
            lng = $5,
            updated_at = $7
        `, [
          cinema.id,
          cinema.name,
          cinema.address,
          cinema.lat,
          cinema.lng,
          cinema.created_at || new Date(),
          cinema.updated_at || new Date()
        ]);
        insertedCount++;
      } catch (err) {
        console.error(`插入電影院資料失敗 (ID: ${cinema.id}):`, err);
      }
    }
    
    console.log(`成功將 ${insertedCount} 筆電影院資料插入到本地資料庫`);
  } catch (err) {
    console.error('同步電影院資料時發生錯誤:', err);
    throw err;
  }
}

// 使用 Promise 包裝並捕捉任何未處理的錯誤
syncShowtimes().catch(err => {
  console.error('未處理的錯誤:', err);
  process.exit(1);
});

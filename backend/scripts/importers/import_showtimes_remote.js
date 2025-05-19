const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// 從環境變數中獲取資料庫連接字串
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db';

// 創建資料庫連接池
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 需要這個選項來連接到 Render 的 PostgreSQL
  }
});

// 確保必要的資料表存在
async function ensureTablesExist(client) {
  // 創建 cinemas 表（如果不存在）
  await client.query(`
    CREATE TABLE IF NOT EXISTS cinemas (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      source TEXT,
      external_id TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      city TEXT,
      district TEXT,
      type TEXT,
      UNIQUE(source, external_id)
    )
  `);
  
  // 創建索引（如果不存在）
  await client.query('CREATE INDEX IF NOT EXISTS idx_cinemas_external_id ON cinemas(external_id)');

  // 創建 showtimes 表（如果不存在）
  await client.query(`
    CREATE TABLE IF NOT EXISTS showtimes (
      id SERIAL PRIMARY KEY,
      movie_id INTEGER,
      cinema_id INTEGER NOT NULL,
      date DATE NOT NULL,
      time TIME NOT NULL,
      source TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE SET NULL,
      FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE
    )
  `);
  
  // 創建索引（如果不存在）
  await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_movie_id ON showtimes(movie_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_cinema_id ON showtimes(cinema_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(date)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_time ON showtimes(time)');
}

async function importShowtimes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. 確保必要的資料表存在
    console.log('檢查資料表...');
    await ensureTablesExist(client);
    
    // 2. 讀取 JSON 文件
    const filePath = path.join(__dirname, '../../output/scrapers/atmovies_showtimes.json');
    const data = await fs.readFile(filePath, 'utf8');
    const theaters = JSON.parse(data);
    
    console.log(`準備匯入 ${theaters.length} 家電影院的場次資料`);
    
    // 3. 清空現有場次資料
    console.log('清空現有場次資料...');
    await client.query('TRUNCATE TABLE showtimes CASCADE');
    
    // 4. 匯入新資料
    let totalShowtimes = 0;
    
    for (const theater of theaters) {
      const { atmovies_theater_id, atmovies_theater_name, atmovies_showtimes_by_date } = theater;
      
      // 確保電影院存在，如果不存在則創建
      let cinemaId;
      const cinemaRes = await client.query(
        'SELECT id FROM cinemas WHERE source = $1 AND external_id = $2',
        ['atmovies', atmovies_theater_id]
      );
      
      if (cinemaRes.rows.length === 0) {
        // 創建新電影院
        const newCinema = await client.query(
          `INSERT INTO cinemas 
           (name, source, external_id, created_at, updated_at) 
           VALUES ($1, $2, $3, NOW(), NOW()) 
           RETURNING id`,
          [atmovies_theater_name, 'atmovies', atmovies_theater_id]
        );
        cinemaId = newCinema.rows[0].id;
        console.log(`✅ 已創建新電影院: ${atmovies_theater_name} (ID: ${cinemaId})`);
      } else {
        cinemaId = cinemaRes.rows[0].id;
        console.log(`ℹ️  找到現有電影院: ${atmovies_theater_name} (ID: ${cinemaId})`);
      }
      
      // 處理每個日期的場次
      for (const dateData of atmovies_showtimes_by_date) {
        const { date, showtimes } = dateData;
        
        for (const showtime of showtimes) {
          // 確保電影存在，先嘗試精確匹配 full_title
          let movieRes = await client.query(
            'SELECT id FROM movies WHERE full_title = $1',
            [showtime.movie_name]
          );
          
          // 如果找不到，嘗試模糊匹配
          if (movieRes.rows.length === 0) {
            movieRes = await client.query(
              'SELECT id FROM movies WHERE chinese_title LIKE $1 OR english_title LIKE $1 OR full_title LIKE $1 LIMIT 1',
              [`%${showtime.movie_name}%`]
            );
          }
          
          if (movieRes.rows.length === 0) {
            console.warn(`找不到電影: ${showtime.movie_name}`);
            continue;
          }
          
          const movieId = movieRes.rows[0].id;
          console.log(`  處理電影: ${showtime.movie_name} (ID: ${movieId})`);
          
          // 插入場次資料
          await client.query(
            `INSERT INTO showtimes 
             (movie_id, cinema_id, date, time, source, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [movieId, cinemaId, date, showtime.time, 'atmovies']
          );
          
          console.log(`  已新增場次: ${date} ${showtime.time} - ${showtime.movie_name}`);
          
          totalShowtimes++;
        }
      }
    }
    
    await client.query('COMMIT');
    console.log(`成功匯入 ${totalShowtimes} 筆場次資料`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('匯入場次資料時發生錯誤:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// 執行匯入
importShowtimes()
  .then(() => console.log('場次資料匯入完成'))
  .catch(err => {
    console.error('場次資料匯入失敗:', err);
    process.exit(1);
  });

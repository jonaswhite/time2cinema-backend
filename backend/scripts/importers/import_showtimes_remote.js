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

async function importShowtimes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. 讀取 JSON 文件
    const filePath = path.join(__dirname, '../../output/scrapers/atmovies_showtimes.json');
    const data = await fs.readFile(filePath, 'utf8');
    const theaters = JSON.parse(data);
    
    console.log(`準備匯入 ${theaters.length} 家電影院的場次資料`);
    
    // 2. 清空現有場次資料
    console.log('清空現有場次資料...');
    await client.query('TRUNCATE TABLE movie_showtimes CASCADE');
    
    // 3. 匯入新資料
    let totalShowtimes = 0;
    
    for (const theater of theaters) {
      const { atmovies_theater_id, atmovies_theater_name, atmovies_showtimes_by_date } = theater;
      
      // 確保電影院存在
      const theaterRes = await client.query(
        'SELECT id FROM theaters WHERE atmovies_theater_id = $1',
        [atmovies_theater_id]
      );
      
      if (theaterRes.rows.length === 0) {
        console.warn(`找不到電影院: ${atmovies_theater_name} (${atmovies_theater_id})`);
        continue;
      }
      
      const theaterId = theaterRes.rows[0].id;
      
      // 處理每個日期的場次
      for (const dateData of atmovies_showtimes_by_date) {
        const { date, showtimes } = dateData;
        
        for (const showtime of showtimes) {
          // 確保電影存在
          const movieRes = await client.query(
            'SELECT id FROM movies WHERE title LIKE $1',
            [`%${showtime.movie_name}%`]
          );
          
          if (movieRes.rows.length === 0) {
            console.warn(`找不到電影: ${showtime.movie_name}`);
            continue;
          }
          
          const movieId = movieRes.rows[0].id;
          
          // 插入場次資料
          await client.query(
            `INSERT INTO movie_showtimes 
             (movie_id, theater_id, showtime, date, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [movieId, theaterId, showtime.time, date]
          );
          
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

// 檢查資料庫中是否有今天 (2025-05-07) 的場次資料
const { Pool } = require('pg');

// 使用與應用相同的資料庫連線設定
const pool = new Pool({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432,
});

// 設定時區
pool.query('SET timezone = "Asia/Taipei"');

async function checkShowtimes() {
  try {
    console.log('正在查詢資料庫...');
    
    // 查詢 2025-05-07 的場次數量
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM showtimes WHERE DATE(date) = '2025-05-07'"
    );
    const count = parseInt(countResult.rows[0].count);
    
    console.log(`資料庫中 2025-05-07 的場次數量: ${count}`);
    
    if (count > 0) {
      // 查詢這些場次的更新時間
      const updateTimeResult = await pool.query(
        "SELECT MIN(updated_at) as earliest, MAX(updated_at) as latest FROM showtimes WHERE DATE(date) = '2025-05-07'"
      );
      
      if (updateTimeResult.rows.length > 0) {
        const { earliest, latest } = updateTimeResult.rows[0];
        console.log(`最早更新時間: ${earliest ? earliest.toISOString() : '無資料'}`);
        console.log(`最晚更新時間: ${latest ? latest.toISOString() : '無資料'}`);
      }
      
      // 查詢電影院和電影的分布情況
      const cinemaResult = await pool.query(
        "SELECT c.name, COUNT(*) FROM showtimes s JOIN cinemas c ON s.cinema_id = c.id WHERE DATE(s.date) = '2025-05-07' GROUP BY c.name ORDER BY COUNT(*) DESC LIMIT 10"
      );
      
      console.log('\n前10家有場次的電影院:');
      cinemaResult.rows.forEach(row => {
        console.log(`${row.name}: ${row.count} 場次`);
      });
      
      const movieResult = await pool.query(
        "SELECT movie_name, COUNT(*) FROM showtimes WHERE DATE(date) = '2025-05-07' GROUP BY movie_name ORDER BY COUNT(*) DESC LIMIT 10"
      );
      
      console.log('\n前10部有場次的電影:');
      movieResult.rows.forEach(row => {
        console.log(`${row.movie_name}: ${row.count} 場次`);
      });
      
      // 查詢一些範例資料
      const sampleResult = await pool.query(
        "SELECT s.cinema_id, c.name as cinema_name, s.date, s.time, s.movie_name, s.updated_at FROM showtimes s JOIN cinemas c ON s.cinema_id = c.id WHERE DATE(s.date) = '2025-05-07' ORDER BY s.updated_at DESC LIMIT 5"
      );
      
      console.log('\n最近更新的5筆場次資料:');
      sampleResult.rows.forEach(row => {
        console.log(`${row.cinema_name} | ${row.date.toISOString().split('T')[0]} | ${row.time} | ${row.movie_name} | 更新時間: ${row.updated_at.toISOString()}`);
      });
    }
  } catch (err) {
    console.error('查詢錯誤:', err);
  } finally {
    await pool.end();
  }
}

checkShowtimes();

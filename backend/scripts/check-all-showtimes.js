// 檢查資料庫中的所有場次資料
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

async function checkAllShowtimes() {
  try {
    console.log('正在查詢資料庫...');
    
    // 查詢總場次數量
    const totalResult = await pool.query(
      "SELECT COUNT(*) FROM showtimes"
    );
    const totalCount = parseInt(totalResult.rows[0].count);
    
    console.log(`資料庫中總場次數量: ${totalCount}`);
    
    // 查詢不同日期的場次數量
    const dateCountResult = await pool.query(
      "SELECT DATE(date) as show_date, COUNT(*) FROM showtimes GROUP BY DATE(date) ORDER BY show_date DESC"
    );
    
    console.log('\n各日期場次數量:');
    dateCountResult.rows.forEach(row => {
      console.log(`${row.show_date}: ${row.count} 場次`);
    });
    
    // 查詢最近更新的場次
    const latestUpdateResult = await pool.query(
      "SELECT MIN(updated_at) as earliest, MAX(updated_at) as latest FROM showtimes"
    );
    
    if (latestUpdateResult.rows.length > 0) {
      const { earliest, latest } = latestUpdateResult.rows[0];
      console.log(`\n最早更新時間: ${earliest ? earliest.toISOString() : '無資料'}`);
      console.log(`最晚更新時間: ${latest ? latest.toISOString() : '無資料'}`);
    }
    
    // 查詢電影院數量
    const cinemaResult = await pool.query(
      "SELECT COUNT(DISTINCT cinema_id) FROM showtimes"
    );
    
    console.log(`\n有場次的電影院數量: ${cinemaResult.rows[0].count}`);
    
    // 查詢電影數量
    const movieResult = await pool.query(
      "SELECT COUNT(DISTINCT movie_name) FROM showtimes"
    );
    
    console.log(`有場次的電影數量: ${movieResult.rows[0].count}`);
    
    // 查詢一些範例資料
    const sampleResult = await pool.query(
      "SELECT s.cinema_id, c.name as cinema_name, s.date, s.time, s.movie_name, s.updated_at FROM showtimes s JOIN cinemas c ON s.cinema_id = c.id ORDER BY s.updated_at DESC LIMIT 5"
    );
    
    console.log('\n最近更新的5筆場次資料:');
    sampleResult.rows.forEach(row => {
      console.log(`${row.cinema_name} | ${row.date.toISOString().split('T')[0]} | ${row.time} | ${row.movie_name} | 更新時間: ${row.updated_at.toISOString()}`);
    });
  } catch (err) {
    console.error('查詢錯誤:', err);
  } finally {
    await pool.end();
  }
}

checkAllShowtimes();

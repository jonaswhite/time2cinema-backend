// 查詢《罪人》今天的場次資訊
const { Pool } = require('pg');

// 資料庫連接設定
const pool = new Pool({
  user: 'jonaswhite',
  database: 'jonaswhite',
  host: 'localhost',
  port: 5432,
});

async function queryShowtimes() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const formattedDate = today.toISOString().split('T')[0];
    console.log(`查詢日期: ${formattedDate}`);
    
    // 查詢《罪人》今天的場次
    const result = await pool.query(
      'SELECT c.name as cinema_name, s.date, s.time FROM showtimes s ' +
      'JOIN cinemas c ON s.cinema_id = c.id ' +
      'WHERE s.movie_name = $1 AND DATE(s.date) = $2 ' +
      'ORDER BY c.name, s.time',
      ['罪人', formattedDate]
    );
    
    console.log(`找到 ${result.rowCount} 筆《罪人》今天的場次資料:`);
    
    if (result.rows.length > 0) {
      // 按電影院分組顯示
      const cinemaGroups = {};
      
      result.rows.forEach(row => {
        const cinemaName = row.cinema_name;
        if (!cinemaGroups[cinemaName]) {
          cinemaGroups[cinemaName] = [];
        }
        
        const time = row.time;
        cinemaGroups[cinemaName].push(time);
      });
      
      // 顯示分組結果
      Object.keys(cinemaGroups).forEach(cinema => {
        console.log(`\n${cinema}:`);
        console.log(cinemaGroups[cinema].join(', '));
      });
    }
    
    // 查詢《會計師 2》的場次
    console.log('\n\n查詢《會計師 2》的場次:');
    const accountantResult = await pool.query(
      'SELECT c.name as cinema_name, s.date, s.time, s.movie_name FROM showtimes s ' +
      'JOIN cinemas c ON s.cinema_id = c.id ' +
      'WHERE s.movie_name ILIKE $1 AND DATE(s.date) >= $2 ' +
      'ORDER BY c.name, s.date, s.time',
      ['%會計師%2%', formattedDate]
    );
    
    console.log(`找到 ${accountantResult.rowCount} 筆《會計師 2》的場次資料`);
    
    if (accountantResult.rows.length > 0) {
      accountantResult.rows.forEach(row => {
        console.log(`${row.cinema_name} - ${row.date.toISOString().split('T')[0]} - ${row.time} - ${row.movie_name}`);
      });
    }
    
    // 查詢所有電影名稱，看看是否有類似《會計師 2》的電影
    console.log('\n\n查詢所有電影名稱:');
    const moviesResult = await pool.query(
      'SELECT DISTINCT movie_name FROM showtimes WHERE movie_name ILIKE $1 ORDER BY movie_name',
      ['%會計師%']
    );
    
    console.log(`找到 ${moviesResult.rowCount} 筆含有"會計師"的電影名稱:`);
    moviesResult.rows.forEach(row => {
      console.log(row.movie_name);
    });
    
  } catch (err) {
    console.error('查詢失敗:', err);
  } finally {
    // 關閉連接池
    await pool.end();
  }
}

queryShowtimes();

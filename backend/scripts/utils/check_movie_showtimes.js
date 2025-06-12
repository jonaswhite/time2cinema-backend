const { Pool } = require('pg');

// 建立資料庫連線
const pool = new Pool({
  connectionString: "postgresql://postgres.bnfplxbaqnmwpjvjwqzx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  ssl: {
    rejectUnauthorized: false
  }
});

// 格式化日期為 YYYY-MM-DD 的函數
const formatDate = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 檢查特定電影的場次
async function checkMovieShowtimes(movieName) {
  try {
    console.log(`檢查電影「${movieName}」的場次資料...`);
    
    // 取得今天的日期
    const today = new Date();
    const todayStr = formatDate(today);
    console.log(`今天日期: ${todayStr}`);
    
    // 1. 檢查電影是否存在於資料庫
    console.log(`\n1. 檢查電影是否存在於資料庫...`);
    const movieQuery = `
      SELECT id, title, original_title 
      FROM movies 
      WHERE title ILIKE $1 OR original_title ILIKE $1
    `;
    
    const movieResult = await pool.query(movieQuery, [`%${movieName}%`]);
    
    if (movieResult.rows.length === 0) {
      console.log(`找不到電影「${movieName}」，請檢查名稱是否正確。`);
      return;
    }
    
    console.log(`找到 ${movieResult.rows.length} 個相關電影:`);
    movieResult.rows.forEach(movie => {
      console.log(`- ID: ${movie.id}, 標題: ${movie.title}, 原始標題: ${movie.original_title || 'N/A'}`);
    });
    
    // 2. 檢查電影的場次資料
    console.log(`\n2. 檢查電影的場次資料...`);
    
    // 對於每個找到的電影，檢查其場次資料
    for (const movie of movieResult.rows) {
      console.log(`\n檢查電影 ID ${movie.id} (${movie.title}) 的場次資料:`);
      
      const showtimesQuery = `
        SELECT 
          s.id, s.cinema_id, s.date, s.time, s.movie_id, 
          m.title as movie_title,
          c.name as cinema_name
        FROM 
          showtimes s
        LEFT JOIN 
          movies m ON s.movie_id = m.id
        LEFT JOIN 
          cinemas c ON s.cinema_id = c.id
        WHERE 
          s.movie_id = $1 AND DATE(s.date) = DATE($2)
        ORDER BY 
          s.cinema_id, s.date, s.time
        LIMIT 10
      `;
      
      const showtimesResult = await pool.query(showtimesQuery, [movie.id, todayStr]);
      
      if (showtimesResult.rows.length === 0) {
        console.log(`電影 ID ${movie.id} (${movie.title}) 在 ${todayStr} 沒有場次資料。`);
        
        // 檢查是否有其他日期的場次資料
        const otherDatesQuery = `
          SELECT DISTINCT DATE(date) as show_date
          FROM showtimes
          WHERE movie_id = $1
          ORDER BY show_date
          LIMIT 5
        `;
        
        const otherDatesResult = await pool.query(otherDatesQuery, [movie.id]);
        
        if (otherDatesResult.rows.length > 0) {
          console.log(`但在其他日期有場次資料:`);
          otherDatesResult.rows.forEach(row => {
            console.log(`- ${row.show_date}`);
          });
        } else {
          console.log(`該電影在資料庫中沒有任何場次資料。`);
        }
      } else {
        console.log(`找到 ${showtimesResult.rows.length} 筆場次資料 (僅顯示前 10 筆):`);
        showtimesResult.rows.forEach(row => {
          console.log(`- 電影院: ${row.cinema_name} (ID: ${row.cinema_id}), 日期: ${formatDate(new Date(row.date))}, 時間: ${row.time}`);
        });
        
        // 統計總場次數
        const countQuery = `
          SELECT COUNT(*) as total
          FROM showtimes
          WHERE movie_id = $1 AND DATE(date) = DATE($2)
        `;
        
        const countResult = await pool.query(countQuery, [movie.id, todayStr]);
        console.log(`總計: ${countResult.rows[0].total} 筆場次資料`);
      }
    }
    
    // 3. 檢查 API 查詢邏輯
    console.log(`\n3. 模擬 API 查詢邏輯...`);
    console.log(`使用電影名稱「${movieName}」查詢場次:`);
    
    // 模擬 API 查詢邏輯
    const apiMovieQuery = `
      SELECT id FROM movies WHERE title ILIKE $1 OR original_title ILIKE $1
    `;
    
    const apiMovieResult = await pool.query(apiMovieQuery, [`%${movieName}%`]);
    
    if (apiMovieResult.rows.length === 0) {
      console.log(`API 邏輯: 找不到電影「${movieName}」`);
      return;
    }
    
    const apiMovieId = apiMovieResult.rows[0].id;
    console.log(`API 邏輯: 找到電影 ID: ${apiMovieId}`);
    
    const apiShowtimesQuery = `
      SELECT 
        s.cinema_id, s.date, s.time, s.movie_id, 
        m.title as movie_title, c.name as cinema_name
      FROM 
        showtimes s
      LEFT JOIN 
        movies m ON s.movie_id = m.id
      LEFT JOIN 
        cinemas c ON s.cinema_id = c.id
      WHERE 
        s.movie_id = $1 AND DATE(s.date) = DATE($2)
      ORDER BY 
        s.cinema_id, s.date, s.time
      LIMIT 5
    `;
    
    const apiShowtimesResult = await pool.query(apiShowtimesQuery, [apiMovieId, todayStr]);
    
    if (apiShowtimesResult.rows.length === 0) {
      console.log(`API 邏輯: 電影 ID ${apiMovieId} 在 ${todayStr} 沒有場次資料`);
    } else {
      console.log(`API 邏輯: 找到 ${apiShowtimesResult.rows.length} 筆場次資料 (僅顯示前 5 筆):`);
      apiShowtimesResult.rows.forEach(row => {
        console.log(`- 電影院: ${row.cinema_name} (ID: ${row.cinema_id}), 日期: ${formatDate(new Date(row.date))}, 時間: ${row.time}`);
      });
      
      // 統計總場次數
      const apiCountQuery = `
        SELECT COUNT(*) as total
        FROM showtimes
        WHERE movie_id = $1 AND DATE(date) = DATE($2)
      `;
      
      const apiCountResult = await pool.query(apiCountQuery, [apiMovieId, todayStr]);
      console.log(`API 邏輯: 總計 ${apiCountResult.rows[0].total} 筆場次資料`);
    }
    
  } catch (error) {
    console.error('檢查場次資料時發生錯誤:', error);
  } finally {
    // 關閉資料庫連線
    await pool.end();
  }
}

// 執行檢查
const movieName = process.argv[2] || '雷霆特攻隊';
checkMovieShowtimes(movieName);

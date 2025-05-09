const { Client } = require('pg');

// 本地資料庫連線設定
const localDbConfig = {
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432,
};

// 線上資料庫連線設定
const remoteDbConfig = {
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
};

async function checkShowtimes() {
  // 檢查本地資料庫
  const localClient = new Client(localDbConfig);
  try {
    await localClient.connect();
    console.log('連線本地資料庫成功，開始檢查場次資料...');
    
    // 查詢場次數量
    const countResult = await localClient.query('SELECT COUNT(*) FROM showtimes');
    console.log(`本地資料庫中有 ${countResult.rows[0].count} 筆場次資料`);
    
    // 查詢最新的場次資料
    const latestResult = await localClient.query(`
      SELECT s.id, s.date, s.time, s.movie_name, c.name as cinema_name 
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      ORDER BY s.date DESC, s.time DESC
      LIMIT 10
    `);
    
    console.log('\n本地資料庫中最新的 10 筆場次資料：');
    latestResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.cinema_name} - ${row.date} ${row.time} - ${row.movie_name}`);
    });
    
    // 查詢今天的場次資料
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
    const todayResult = await localClient.query(`
      SELECT COUNT(*) 
      FROM showtimes 
      WHERE date = $1
    `, [today]);
    
    console.log(`\n本地資料庫中今天 (${today}) 的場次資料有 ${todayResult.rows[0].count} 筆`);
    
    // 查詢不同電影院的場次數量
    const cinemaCountResult = await localClient.query(`
      SELECT c.name, COUNT(*) as count
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      GROUP BY c.name
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\n本地資料庫中場次數量最多的 10 家電影院：');
    cinemaCountResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name}: ${row.count} 筆場次`);
    });
  } catch (err) {
    console.error('檢查本地資料庫時發生錯誤:', err);
  } finally {
    await localClient.end();
  }
  
  // 檢查線上資料庫
  const remoteClient = new Client(remoteDbConfig);
  try {
    await remoteClient.connect();
    console.log('\n連線線上資料庫成功，開始檢查場次資料...');
    
    // 查詢場次數量
    const countResult = await remoteClient.query('SELECT COUNT(*) FROM showtimes');
    console.log(`線上資料庫中有 ${countResult.rows[0].count} 筆場次資料`);
    
    // 查詢最新的場次資料
    const latestResult = await remoteClient.query(`
      SELECT s.id, s.date, s.time, s.movie_name, c.name as cinema_name 
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      ORDER BY s.date DESC, s.time DESC
      LIMIT 10
    `);
    
    console.log('\n線上資料庫中最新的 10 筆場次資料：');
    if (latestResult.rows.length === 0) {
      console.log('沒有找到任何場次資料');
    } else {
      latestResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.cinema_name} - ${row.date} ${row.time} - ${row.movie_name}`);
      });
    }
    
    // 查詢今天的場次資料
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
    const todayResult = await remoteClient.query(`
      SELECT COUNT(*) 
      FROM showtimes 
      WHERE date = $1
    `, [today]);
    
    console.log(`\n線上資料庫中今天 (${today}) 的場次資料有 ${todayResult.rows[0].count} 筆`);
    
  } catch (err) {
    console.error('檢查線上資料庫時發生錯誤:', err);
  } finally {
    await remoteClient.end();
  }
}

checkShowtimes().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

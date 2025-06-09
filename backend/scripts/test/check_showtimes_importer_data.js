const { Client } = require('pg');

// 本地資料庫連線設定
const localDbConfig = {
  user: 'jonaswhite',
  host: 'localhost',
  database: 'time2cinema',
  password: '',
  port: 5432,
};

// 線上資料庫連線設定
const remoteDbConfig = {
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
};

async function checkImporterData() {
  // 檢查本地資料庫
  const localClient = new Client(localDbConfig);
  try {
    await localClient.connect();
    console.log('===== 本地資料庫中 5/9 的場次資料 =====');
    
    // 查詢 5/9 的場次數量
    const countResult = await localClient.query(`
      SELECT COUNT(*) 
      FROM showtimes 
      WHERE date = '2025-05-09'
    `);
    
    console.log(`本地資料庫中 5/9 的場次資料有 ${countResult.rows[0].count} 筆`);
    
    // 查詢有 5/9 場次的電影院數量
    const cinemaCountResult = await localClient.query(`
      SELECT COUNT(DISTINCT cinema_id) 
      FROM showtimes 
      WHERE date = '2025-05-09'
    `);
    
    console.log(`本地資料庫中有 ${cinemaCountResult.rows[0].count} 家電影院有 5/9 的場次資料`);
    
    // 查詢各電影院的場次數量
    const cinemaShowtimesResult = await localClient.query(`
      SELECT c.name, COUNT(*) as count
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.date = '2025-05-09'
      GROUP BY c.name
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\n本地資料庫中 5/9 場次數量最多的 10 家電影院：');
    cinemaShowtimesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name}: ${row.count} 筆場次`);
    });
    
    // 查詢 5/9 的前 10 筆場次資料
    const showtimesResult = await localClient.query(`
      SELECT s.time, s.movie_name, c.name as cinema_name 
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.date = '2025-05-09'
      ORDER BY s.time
      LIMIT 10
    `);
    
    console.log('\n本地資料庫中 5/9 的前 10 筆場次資料：');
    showtimesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.cinema_name} - ${row.time} - ${row.movie_name}`);
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
    console.log('\n===== 線上資料庫中 5/9 的場次資料 =====');
    
    // 查詢 5/9 的場次數量
    const countResult = await remoteClient.query(`
      SELECT COUNT(*) 
      FROM showtimes 
      WHERE date = '2025-05-09'
    `);
    
    console.log(`線上資料庫中 5/9 的場次資料有 ${countResult.rows[0].count} 筆`);
    
    // 查詢有 5/9 場次的電影院數量
    const cinemaCountResult = await remoteClient.query(`
      SELECT COUNT(DISTINCT cinema_id) 
      FROM showtimes 
      WHERE date = '2025-05-09'
    `);
    
    console.log(`線上資料庫中有 ${cinemaCountResult.rows[0].count} 家電影院有 5/9 的場次資料`);
    
    // 查詢各電影院的場次數量
    const cinemaShowtimesResult = await remoteClient.query(`
      SELECT c.name, COUNT(*) as count
      FROM showtimes s
      JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.date = '2025-05-09'
      GROUP BY c.name
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\n線上資料庫中 5/9 場次數量最多的 10 家電影院：');
    cinemaShowtimesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name}: ${row.count} 筆場次`);
    });
  } catch (err) {
    console.error('檢查線上資料庫時發生錯誤:', err);
  } finally {
    await remoteClient.end();
  }
}

checkImporterData().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

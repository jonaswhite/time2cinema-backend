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
  connectionString: 'postgresql://postgres.bnfplxbaqnmwpjvjwqzx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
};

async function checkImporterData() {
  // 檢查本地資料庫
  const localClient = new Client(localDbConfig);
  try {
    await localClient.connect();
    console.log('===== 本地資料庫中的票房資料 =====');
    
    // 檢查是否有 release_date 欄位
    const checkColumnResult = await localClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'boxoffice' AND column_name = 'release_date'
    `);
    
    if (checkColumnResult.rows.length === 0) {
      console.log('警告: boxoffice 表中缺少 release_date 欄位');
      console.log('建議執行以下 SQL 語句添加欄位:');
      console.log('ALTER TABLE boxoffice ADD COLUMN release_date DATE;');
    } else {
      console.log('boxoffice 表中已有 release_date 欄位');
    }
    
    // 查詢票房資料總數
    const countResult = await localClient.query('SELECT COUNT(*) FROM boxoffice');
    console.log(`本地資料庫中有 ${countResult.rows[0].count} 筆票房資料`);
    
    // 查詢最新一週的票房資料
    const latestWeekResult = await localClient.query(`
      SELECT MAX(week_start_date) as latest_week FROM boxoffice
    `);
    
    const latestWeek = latestWeekResult.rows[0].latest_week;
    console.log(`最新一週的票房資料日期為: ${latestWeek}`);
    
    // 查詢最新一週的票房資料數量
    const latestWeekCountResult = await localClient.query(`
      SELECT COUNT(*) FROM boxoffice WHERE week_start_date = $1
    `, [latestWeek]);
    
    console.log(`最新一週 (${latestWeek}) 有 ${latestWeekCountResult.rows[0].count} 筆票房資料`);
    
    // 查詢最新一週的前 10 名票房電影
    const top10Result = await localClient.query(`
      SELECT movie_id, rank, tickets, totalsales, 
             release_date, week_start_date
      FROM boxoffice 
      WHERE week_start_date = $1 
      ORDER BY rank ASC 
      LIMIT 10
    `, [latestWeek]);
    
    console.log('\n最新一週票房前 10 名:');
    top10Result.rows.forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.movie_id}`);
      console.log(`   排名: ${movie.rank}`);
      console.log(`   週票數: ${movie.tickets || '無資料'}`);
      console.log(`   總票房: ${movie.totalsales || '無資料'}`);
      console.log(`   上映日期: ${movie.release_date ? movie.release_date.toISOString().split('T')[0] : '無資料'}`);
      console.log('---');
    });
    
    // 檢查有多少電影有上映日期資料
    const releaseDateCountResult = await localClient.query(`
      SELECT COUNT(*) FROM boxoffice 
      WHERE week_start_date = $1 AND release_date IS NOT NULL
    `, [latestWeek]);
    
    const withReleaseDateCount = releaseDateCountResult.rows[0].count;
    const totalMoviesInLatestWeek = latestWeekCountResult.rows[0].count;
    
    console.log(`\n在最新一週的 ${totalMoviesInLatestWeek} 部電影中，有 ${withReleaseDateCount} 部電影有上映日期資料`);
    console.log(`上映日期資料覆蓋率: ${Math.round(withReleaseDateCount / totalMoviesInLatestWeek * 100)}%`);
    
  } catch (error) {
    console.error('檢查票房匯入資料時發生錯誤:', error);
  } finally {
    await localClient.end();
  }
}

// 執行檢查
checkImporterData().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

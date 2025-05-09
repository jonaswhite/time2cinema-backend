const { Client } = require('pg');

// 線上資料庫連線設定
const remoteDbConfig = {
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
};

async function checkRemoteBoxofficeDb() {
  // 檢查線上資料庫
  const remoteClient = new Client(remoteDbConfig);
  try {
    await remoteClient.connect();
    console.log('連線線上資料庫成功，開始檢查票房資料...');
    
    // 檢查 boxoffice 表結構
    const tableInfoResult = await remoteClient.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'boxoffice'
      ORDER BY ordinal_position
    `);
    
    console.log('\n線上 boxoffice 表結構:');
    tableInfoResult.rows.forEach(column => {
      console.log(`${column.column_name}: ${column.data_type}`);
    });
    
    // 檢查是否有 release_date 欄位
    const hasReleaseDate = tableInfoResult.rows.some(column => column.column_name === 'release_date');
    if (!hasReleaseDate) {
      console.log('\n警告: 線上 boxoffice 表中缺少 release_date 欄位');
    } else {
      console.log('\n線上 boxoffice 表中已有 release_date 欄位');
    }
    
    // 查詢票房資料總數
    const countResult = await remoteClient.query('SELECT COUNT(*) FROM boxoffice');
    console.log(`\n線上資料庫中有 ${countResult.rows[0].count} 筆票房資料`);
    
    // 查詢不同週次的票房資料數量
    const weekCountResult = await remoteClient.query(`
      SELECT week_start_date, COUNT(*) 
      FROM boxoffice 
      GROUP BY week_start_date 
      ORDER BY week_start_date DESC
    `);
    
    console.log('\n各週票房資料數量:');
    weekCountResult.rows.forEach(row => {
      console.log(`${row.week_start_date.toISOString().split('T')[0]}: ${row.count} 筆`);
    });
    
    // 查詢最新一週的前 10 名票房電影
    const latestWeek = weekCountResult.rows[0]?.week_start_date;
    if (latestWeek) {
      const top10Result = await remoteClient.query(`
        SELECT movie_id, rank, tickets, totalsales, 
               release_date, week_start_date, source
        FROM boxoffice 
        WHERE week_start_date = $1 
        ORDER BY rank ASC 
        LIMIT 10
      `, [latestWeek]);
      
      console.log(`\n最新一週 (${latestWeek.toISOString().split('T')[0]}) 票房前 10 名:`);
      top10Result.rows.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.movie_id}`);
        console.log(`   排名: ${movie.rank}`);
        console.log(`   週票數: ${movie.tickets || '無資料'}`);
        console.log(`   總票房: ${movie.totalsales || '無資料'}`);
        console.log(`   上映日期: ${movie.release_date ? movie.release_date.toISOString().split('T')[0] : '無資料'}`);
        console.log(`   資料來源: ${movie.source || '無資料'}`);
        console.log('---');
      });
    }
    
    // 檢查索引
    const indexResult = await remoteClient.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'boxoffice'
    `);
    
    console.log('\n線上 boxoffice 表的索引:');
    indexResult.rows.forEach(index => {
      console.log(`${index.indexname}: ${index.indexdef}`);
    });
    
    // 檢查是否有 release_date 的索引
    const hasReleaseDateIndex = indexResult.rows.some(index => 
      index.indexname.includes('release_date') || index.indexdef.includes('release_date')
    );
    
    if (!hasReleaseDateIndex && hasReleaseDate) {
      console.log('\n建議為 release_date 欄位創建索引:');
      console.log('CREATE INDEX IF NOT EXISTS idx_boxoffice_release_date ON boxoffice(release_date);');
    } else if (hasReleaseDateIndex) {
      console.log('\n線上 boxoffice 表中已有 release_date 索引');
    }
    
    // 檢查有多少電影有上映日期資料
    const releaseDateCountResult = await remoteClient.query(`
      SELECT COUNT(*) FROM boxoffice 
      WHERE week_start_date = $1 AND release_date IS NOT NULL
    `, [latestWeek]);
    
    const withReleaseDateCount = releaseDateCountResult.rows[0].count;
    const totalMoviesInLatestWeek = weekCountResult.rows.length > 0 ? weekCountResult.rows[0].count : 0;
    
    console.log(`\n在最新一週的 ${totalMoviesInLatestWeek} 部電影中，有 ${withReleaseDateCount} 部電影有上映日期資料`);
    console.log(`上映日期資料覆蓋率: ${Math.round(withReleaseDateCount / totalMoviesInLatestWeek * 100)}%`);
    
  } catch (error) {
    console.error('檢查線上票房資料庫時發生錯誤:', error);
  } finally {
    await remoteClient.end();
  }
}

// 執行檢查
checkRemoteBoxofficeDb().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

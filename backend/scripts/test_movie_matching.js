const { Pool } = require('pg');
const MovieMatcher = require('./utils/movieMatcher');

// 資料庫連線設定
const pool = new Pool({
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
});

async function testMatching() {
  const client = await pool.connect();
  const movieMatcher = new MovieMatcher(client);
  
  // 測試案例
  const testCases = [
    '雷霆特攻隊',
    '怪獸8號：Mission Recon',
    '會計師 2',
    'MINECRAFT 麥塊電影',
    '夏之庭 4K數位修復版',
    '超人力霸王雅克 THE MOVIE 超次元大決戰！光與暗的雅克',
    '電影蠟筆小新：我們的恐龍日記'
  ];
  
  console.log('🎬 開始測試電影名稱匹配...\n');
  
  for (const title of testCases) {
    const match = await movieMatcher.findBestMatch(title);
    
    if (match) {
      console.log(`✅ 匹配成功: "${title}"`);
      console.log(`   -> "${match.title}" (相似度: ${(match.score * 100).toFixed(1)}%, 匹配欄位: ${match.matchedField})`);
    } else {
      console.log(`❌ 找不到匹配: "${title}"`);
    }
    console.log('');
  }
  
  await client.release();
  await pool.end();
}

testMatching().catch(console.error);

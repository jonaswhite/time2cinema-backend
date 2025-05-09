const fs = require('fs');
const path = require('path');

// 讀取 scraper 輸出的 JSON 檔案
const scrapedDataPath = path.join(__dirname, '../../cache/boxoffice-2025-05-08.json');

try {
  // 檢查檔案是否存在
  if (!fs.existsSync(scrapedDataPath)) {
    console.error(`找不到票房資料檔案: ${scrapedDataPath}`);
    console.log('請先執行票房爬蟲以生成資料');
    process.exit(1);
  }

  const scrapedData = JSON.parse(fs.readFileSync(scrapedDataPath, 'utf8'));
  
  // 檢查資料結構
  if (!scrapedData.data || !Array.isArray(scrapedData.data)) {
    console.error('票房資料格式不正確，找不到 data 陣列');
    process.exit(1);
  }

  const boxOfficeData = scrapedData.data;
  
  // 分析票房資料
  console.log(`===== 票房爬蟲抓取的資料 =====`);
  console.log(`總共抓取了 ${boxOfficeData.length} 部電影的票房資料`);
  
  // 檢查上映日期欄位 (可能是「上映日期」或「上映日」)
  const moviesWithReleaseDate = boxOfficeData.filter(movie => movie.上映日期 || movie.上映日);
  console.log(`其中 ${moviesWithReleaseDate.length} 部電影有上映日期資料`);
  
  // 顯示前 10 部電影的票房資料
  console.log('\n前 10 部電影的票房資料:');
  boxOfficeData.slice(0, 10).forEach((movie, index) => {
    console.log(`${index + 1}. ${movie.片名}`);
    console.log(`   排名: ${movie.序號}`);
    console.log(`   國別: ${movie.國別}`);
    console.log(`   上映日期: ${movie.上映日期 || movie.上映日 || '無資料'}`);
    console.log(`   票數: ${movie.票數 || '無資料'}`);
    console.log(`   總票數: ${movie.總票數 || '無資料'}`);
    console.log('---');
  });
  
  // 檢查是否有缺少上映日期的電影
  const moviesWithoutReleaseDate = boxOfficeData.filter(movie => !movie.上映日期 && !movie.上映日);
  if (moviesWithoutReleaseDate.length > 0) {
    console.log(`\n警告: 有 ${moviesWithoutReleaseDate.length} 部電影缺少上映日期資料`);
    console.log('缺少上映日期的電影:');
    moviesWithoutReleaseDate.slice(0, 5).forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.片名}`);
    });
    if (moviesWithoutReleaseDate.length > 5) {
      console.log(`...以及其他 ${moviesWithoutReleaseDate.length - 5} 部電影`);
    }
  }
  
} catch (error) {
  console.error('檢查票房爬蟲資料時發生錯誤:', error);
}

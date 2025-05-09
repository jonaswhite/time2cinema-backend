const fs = require('fs');
const path = require('path');

// 讀取 scraper 輸出的 JSON 檔案
const scrapedDataPath = path.join(__dirname, '../output/scrapers/atmovies_showtimes.json');
const scrapedData = JSON.parse(fs.readFileSync(scrapedDataPath, 'utf8'));

// 檢查 5/9 的場次資料
const date = '20250509';
let totalTheaters = 0;
let theatersWithShowtimes = 0;
let totalShowtimes = 0;
let theatersWithShowtimesList = [];

scrapedData.forEach(theater => {
  totalTheaters++;
  
  // 尋找指定日期的場次
  const dateData = theater.atmovies_showtimes_by_date.find(d => d.date === date);
  if (dateData && dateData.showtimes && dateData.showtimes.length > 0) {
    theatersWithShowtimes++;
    totalShowtimes += dateData.showtimes.length;
    theatersWithShowtimesList.push({
      name: theater.atmovies_theater_name,
      count: dateData.showtimes.length
    });
  }
});

// 輸出結果
console.log(`===== Scraper 抓取的 5/9 場次資料 =====`);
console.log(`總共抓取了 ${totalTheaters} 家電影院的資料`);
console.log(`其中 ${theatersWithShowtimes} 家電影院有 5/9 的場次資料`);
console.log(`5/9 總共有 ${totalShowtimes} 筆場次資料`);

// 顯示前 10 家有場次資料的電影院
console.log('\n前 10 家有 5/9 場次資料的電影院:');
theatersWithShowtimesList.sort((a, b) => b.count - a.count);
theatersWithShowtimesList.slice(0, 10).forEach((theater, index) => {
  console.log(`${index + 1}. ${theater.name}: ${theater.count} 筆場次`);
});

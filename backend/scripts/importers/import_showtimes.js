const fs = require('fs');
const { Client } = require('pg');
const path = require('path');

// 設定專案根目錄與輸出目錄
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const SCRAPERS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'scrapers');

// 讀取 JSON 檔案
const showtimesFilePath = path.join(SCRAPERS_OUTPUT_DIR, 'atmovies_showtimes.json');
const showtimesData = JSON.parse(fs.readFileSync(showtimesFilePath, 'utf8'));
console.log(`讀取場次資料：${showtimesFilePath}`);
console.log(`場次資料日期：${showtimesData[0]?.atmovies_showtimes_by_date[0]?.date || '未知'}`);
console.log(`場次資料電影範例：${showtimesData[0]?.atmovies_showtimes_by_date[0]?.showtimes.slice(0, 3).map(s => s.movie_name).join(', ') || '無資料'}`);


// PostgreSQL 連線設定
const client = new Client({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432,
});

// 將 YYYYMMDD 格式轉換為 YYYY-MM-DD
function formatDate(dateStr) {
  // 確保日期格式正確
  if (dateStr && dateStr.length === 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  
  // 如果日期格式不正確，返回今天的日期
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 建立電影院名稱對應表
async function buildCinemaMap() {
  const cinemaMap = {};
  const result = await client.query('SELECT id, name, external_id FROM cinemas');
  
  // 特殊名稱對應表（手動設定一些難以自動匹配的對應）
  const specialMappings = {
    '喜樂時代影城': ['喜樂時代影城南港店', '喜樂時代影城永和店', '喜樂時代影城今日店'],
    'MUVIE CINEMAS台北松仁威秀': ['MUVIE CINEMAS松仁威秀'],
    '台北新光影城': ['台北獅子林新光影城'],
    'in89豪華數位影城': ['台北西門町in89豪華數位影城'],
    '真善美戲院': ['台北真善美劇院'],
    '國賓戲院': ['國賓大戲院'],
    '喜樂時代影城西門今日店': ['喜樂時代影城今日店'],
    '百老匯影城公館店': ['百老匯數位影城'],
    '欣欣秀泰影城': ['台北欣欣秀泰影城'],
    '國賓長春影城': ['台北長春國賓影城'],
    '永和喜樂時代影城': ['喜樂時代影城永和店']
  };
  
  // 建立反向對應表
  const reverseSpecialMappings = {};
  Object.entries(specialMappings).forEach(([atmoviesName, cinemaNames]) => {
    cinemaNames.forEach(cinemaName => {
      reverseSpecialMappings[cinemaName] = atmoviesName;
    });
  });
  
  for (const row of result.rows) {
    // 1. 存原始名稱
    cinemaMap[row.name] = row.id;
    
    // 2. 處理名稱對應，移除「影城」等後綴以增加匹配機會
    let simpleName = row.name.replace(/影城|電影院|戲院|數位影城|豪華影城|數位劇院/g, '').trim();
    cinemaMap[simpleName] = row.id;
    
    // 3. 移除地區前綴（如「台北」、「臺北」）
    let nameWithoutCity = row.name.replace(/^(台北|臺北|台灣|臺灣)/, '').trim();
    cinemaMap[nameWithoutCity] = row.id;
    
    // 4. 處理簡化名稱（移除地區前綴和影城後綴）
    let simpleNameWithoutCity = nameWithoutCity.replace(/影城|電影院|戲院|數位影城|豪華影城|數位劇院/g, '').trim();
    cinemaMap[simpleNameWithoutCity] = row.id;
    
    // 5. 處理特殊名稱對應
    if (reverseSpecialMappings[row.name]) {
      cinemaMap[reverseSpecialMappings[row.name]] = row.id;
    }
  }
  
  return cinemaMap;
}

async function importShowtimes() {
  try {
    await client.connect();
    console.log('連線成功，開始匯入場次資料...');
    
    // 建立電影院名稱對應表
    const cinemaMap = await buildCinemaMap();
    console.log(`找到 ${Object.keys(cinemaMap).length} 個電影院名稱對應`);
    
    // 計數器
    let totalImported = 0;
    let skippedDueToCinema = 0;
    
    // 設定資料庫時區為台灣時區
    await client.query("SET timezone = 'Asia/Taipei'");
    console.log('已設定資料庫時區為台灣時區');
    
    // 清空舊資料
    await client.query('TRUNCATE TABLE showtimes');
    console.log('已清空舊的場次資料');
    
    // 開始匯入
    for (const theater of showtimesData) {
      const theaterName = theater.atmovies_theater_name;
      
      // 尋找對應的 cinema_id
      let cinemaId = null;
      
      // 先嘗試完整名稱
      if (cinemaMap[theaterName]) {
        cinemaId = cinemaMap[theaterName];
      } else {
        // 嘗試簡化名稱
        const simpleName = theaterName.replace(/影城|電影院|戲院|數位影城|豪華影城|數位劇院/g, '').trim();
        if (cinemaMap[simpleName]) {
          cinemaId = cinemaMap[simpleName];
        }
      }
      
      if (!cinemaId) {
        console.log(`找不到電影院對應: ${theaterName}`);
        skippedDueToCinema++;
        continue;
      }
      
      // 處理每一天的場次
      for (const dateInfo of theater.atmovies_showtimes_by_date) {
        const formattedDate = formatDate(dateInfo.date);
        
        // 處理每個場次
        for (const showtime of dateInfo.showtimes) {
          const query = `
            INSERT INTO showtimes (cinema_id, date, time, movie_name, source)
            VALUES ($1, $2, $3, $4, $5)
          `;
          
          const values = [
            cinemaId,
            formattedDate,
            showtime.time,
            showtime.movie_name,
            'atmovies'
          ];
          
          try {
            await client.query(query, values);
            totalImported++;
          } catch (err) {
            console.error(`匯入場次錯誤 (${theaterName}, ${formattedDate}, ${showtime.time}, ${showtime.movie_name}):`, err.message);
          }
        }
      }
    }
    
    console.log(`匯入完成！共匯入 ${totalImported} 筆場次資料`);
    console.log(`跳過 ${skippedDueToCinema} 個找不到對應電影院的資料`);
    
  } catch (err) {
    console.error('匯入過程發生錯誤:', err);
  } finally {
    await client.end();
  }
}

importShowtimes();

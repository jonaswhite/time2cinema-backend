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

// 資料庫連線設定
const localDbConfig = {
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432,
};

// 線上資料庫連線設定 (Render.com)
const remoteDbConfig = {
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
};

// 電影名稱到 ID 的映射緩存
let movieNameToIdMap = {};

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

// 根據電影名稱獲取電影 ID
async function getOrCreateMovieId(dbClient, movieName) {
  // 如果已經在緩存中，直接返回
  if (movieNameToIdMap[movieName]) {
    return movieNameToIdMap[movieName];
  }
  
  try {
    // 第一步：先查詢電影是否存在
    const checkQuery = 'SELECT id FROM movies WHERE title = $1';
    const checkResult = await dbClient.query(checkQuery, [movieName]);
    
    // 如果電影存在，返回其 ID
    if (checkResult.rows.length > 0) {
      const movieId = checkResult.rows[0].id;
      // 加入緩存
      movieNameToIdMap[movieName] = movieId;
      return movieId;
    }
    
    // 第二步：如果電影不存在，創建新電影
    console.log(`電影「${movieName}」不存在於資料庫中，正在創建...`);
    
    try {
      // 插入新電影
      const insertQuery = `
        INSERT INTO movies (title, source, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id
      `;
      
      const insertResult = await dbClient.query(insertQuery, [movieName, 'atmovies']);
      const newMovieId = insertResult.rows[0].id;
      
      // 加入緩存
      movieNameToIdMap[movieName] = newMovieId;
      console.log(`已成功創建電影「${movieName}」，ID: ${newMovieId}`);
      
      return newMovieId;
    } catch (insertErr) {
      console.error(`創建電影失敗「${movieName}」:`, insertErr.message);
      
      // 再次嘗試查詢，可能是競爭條件導致的失敗
      const finalCheckResult = await dbClient.query(checkQuery, [movieName]);
      if (finalCheckResult.rows.length > 0) {
        const movieId = finalCheckResult.rows[0].id;
        movieNameToIdMap[movieName] = movieId;
        console.log(`在插入失敗後找到電影「${movieName}」，ID: ${movieId}`);
        return movieId;
      }
      
      return null;
    }
  } catch (err) {
    console.error(`獲取或創建電影 ID 時發生錯誤 (${movieName}):`, err.message);
    return null;
  }
}

// 建立電影院名稱對應表
async function buildCinemaMap(dbClient) {
  const cinemaMap = {};
  const result = await dbClient.query('SELECT id, name, external_id FROM cinemas');
  
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
    '永和喜樂時代影城': ['喜樂時代影城永和店'],
    // 新增一些可能的對應
    '林口三井OUTLET威秀影城': ['林口MITSUI OUTLET PARK威秀影城', '林口三井威秀'],
    '新莊鴻金寶麻吉影城': ['鴻金寶麻吉影城'],
    '三重天台戲院': ['天台影城'],
    '國賓林口昕境廣場': ['林口昕境國賓影城'],
    '國賓新莊晶冠廣場影城': ['晶冠廣場國賓影城'],
    '國賓影城淡水禮萊廣場': ['淡水禮萊國賓影城'],
    '台北南港LaLaport威秀影城': ['喜樂時代影城南港店']
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

async function importShowtimes(dbClient, isRemote = false) {
  try {
    await dbClient.connect();
    console.log(`連線${isRemote ? '線上' : '本地'}資料庫成功，開始匯入場次資料...`);
    
    // 建立電影院名稱對應表
    const cinemaMap = await buildCinemaMap(dbClient);
    console.log(`找到 ${Object.keys(cinemaMap).length} 個電影院名稱對應`);
    
    // 計數器
    let totalImported = 0;
    let skippedDueToCinema = 0;
    let skippedDueToMovie = 0;
    
    // 設定資料庫時區為台灣時區
    await dbClient.query("SET timezone = 'Asia/Taipei'");
    console.log('已設定資料庫時區為台灣時區');
    
    // 清空舊資料
    await dbClient.query('TRUNCATE TABLE showtimes');
    console.log('已清空舊的場次資料');
    
    // 先收集所有電影名稱並確保它們存在於資料庫中
    const allMovieNames = new Set();
    for (const theater of showtimesData) {
      for (const dateInfo of theater.atmovies_showtimes_by_date) {
        for (const showtime of dateInfo.showtimes) {
          allMovieNames.add(showtime.movie_name);
        }
      }
    }
    
    console.log(`共發現 ${allMovieNames.size} 部不同的電影，正在確保它們存在於資料庫中...`);
    
    // 確保所有電影存在於資料庫中
    for (const movieName of allMovieNames) {
      await getOrCreateMovieId(dbClient, movieName);
    }
    
    console.log('所有電影已確保存在於資料庫中，開始匯入場次資料...');
    
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
        
        // 先收集所有電影名稱
        const movieNames = dateInfo.showtimes.map(s => s.movie_name);
        const uniqueMovieNames = [...new Set(movieNames)];
        
        // 先確保所有電影存在
        for (const movieName of uniqueMovieNames) {
          try {
            // 先查詢電影是否存在
            const checkQuery = 'SELECT id FROM movies WHERE title = $1';
            const checkResult = await dbClient.query(checkQuery, [movieName]);
            
            // 如果電影不存在，創建新電影
            if (checkResult.rows.length === 0) {
              console.log(`電影「${movieName}」不存在，正在創建...`);
              
              const insertQuery = `
                INSERT INTO movies (title, source, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                RETURNING id
              `;
              
              const insertResult = await dbClient.query(insertQuery, [movieName, 'atmovies']);
              const newMovieId = insertResult.rows[0].id;
              
              // 加入緩存
              movieNameToIdMap[movieName] = newMovieId;
              console.log(`已創建電影「${movieName}」，ID: ${newMovieId}`);
            } else {
              // 如果電影存在，記錄 ID
              const movieId = checkResult.rows[0].id;
              movieNameToIdMap[movieName] = movieId;
            }
          } catch (err) {
            console.error(`創建電影錯誤「${movieName}」:`, err.message);
          }
        }
        
        // 處理每個場次
        for (const showtime of dateInfo.showtimes) {
          // 從緩存中獲取電影 ID
          const movieId = movieNameToIdMap[showtime.movie_name];
          
          if (!movieId) {
            console.log(`無法獲取電影 ID: ${showtime.movie_name}`);
            skippedDueToMovie++;
            continue;
          }
          
          // 使用事務確保原子性
          try {
            const query = `
              INSERT INTO showtimes (cinema_id, date, time, movie_id, source)
              VALUES ($1, $2, $3, $4, $5)
            `;
            
            const values = [
              cinemaId,
              formattedDate,
              showtime.time,
              movieId,
              'atmovies'
            ];
            
            await dbClient.query(query, values);
            totalImported++;
          } catch (err) {
            console.error(`匯入場次錯誤 (${theaterName}, ${formattedDate}, ${showtime.time}, ${showtime.movie_name}):`, err.message);
          }
        }
      }
    }
    
    console.log(`匯入${isRemote ? '線上' : '本地'}資料庫完成！共匯入 ${totalImported} 筆場次資料`);
    console.log(`跳過 ${skippedDueToCinema} 個找不到對應電影院的資料`);
    console.log(`跳過 ${skippedDueToMovie} 個無法獲取電影 ID 的場次`);
    
    return { totalImported, skippedDueToCinema, skippedDueToMovie };
  } catch (err) {
    console.error(`匯入${isRemote ? '線上' : '本地'}資料庫過程發生錯誤:`, err);
    return { error: err.message };
  } finally {
    await dbClient.end();
  }
}

// 主函數：執行本地和線上資料庫的匯入
async function main() {
  console.log('開始匯入場次資料到本地和線上資料庫...');
  
  // 建立本地資料庫客戶端
  const localClient = new Client(localDbConfig);
  
  // 建立線上資料庫客戶端
  const remoteClient = new Client(remoteDbConfig);
  
  // 先匯入本地資料庫
  console.log('\n========== 匯入本地資料庫 ==========');
  const localResult = await importShowtimes(localClient, false);
  
  // 再匯入線上資料庫
  console.log('\n========== 匯入線上資料庫 ==========');
  const remoteResult = await importShowtimes(remoteClient, true);
  
  console.log('\n========== 匯入結果摘要 ==========');
  console.log(`本地資料庫：匯入 ${localResult.totalImported || 0} 筆，跳過 ${localResult.skippedDueToCinema || 0} 個電影院`);
  console.log(`線上資料庫：匯入 ${remoteResult.totalImported || 0} 筆，跳過 ${remoteResult.skippedDueToCinema || 0} 個電影院`);
  
  if (localResult.error) {
    console.error(`本地資料庫匯入錯誤：${localResult.error}`);
  }
  
  if (remoteResult.error) {
    console.error(`線上資料庫匯入錯誤：${remoteResult.error}`);
  }
  
  console.log('\n匯入程序完成！');
}

// 執行主函數
main().catch(err => {
  console.error('執行匯入程序時發生錯誤:', err);
});

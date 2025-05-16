const fetch = require('node-fetch');

// 測試場次 API
async function testShowtimesApi() {
  try {
    // 取得今天的日期
    const today = new Date();
    const todayStr = formatDateKey(today);
    
    console.log(`今天日期: ${todayStr}`);
    
    // 測試電影 ID 列表 (從前面的檢查結果中取得)
    const movieIds = [
      '絕命終結站 血脈',
      '雷霆特攻隊',
      '獵金·遊戲',
      '會計師2',
      '奧德蓋任務'
    ];
    
    // 測試每個電影 ID
    for (const movieId of movieIds) {
      console.log(`\n測試電影 "${movieId}" 的場次資料:`);
      
      // 使用 API_URL 環境變量或默認值
      const API_URL = process.env.API_URL || 'http://localhost:4000';
      const url = `${API_URL}/api/showtimes/movie/${encodeURIComponent(movieId)}?date=${todayStr}`;
      
      console.log(`請求 URL: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`API 請求失敗: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      
      // 檢查返回的數據
      if (!Array.isArray(data)) {
        console.error(`API 返回的數據不是數組:`, typeof data);
        console.error('數據內容:', JSON.stringify(data).substring(0, 200) + '...');
        continue;
      }
      
      if (data.length === 0) {
        console.log(`電影 "${movieId}" 在 ${todayStr} 沒有場次資料`);
        continue;
      }
      
      console.log(`成功獲取 ${data.length} 個電影院的場次資料`);
      
      // 顯示第一個電影院的場次資料摘要
      if (data.length > 0) {
        const firstTheater = data[0];
        console.log(`電影院: ${firstTheater.theater_name} (ID: ${firstTheater.theater_id})`);
        
        if (Array.isArray(firstTheater.showtimes_by_date)) {
          console.log(`場次日期數量: ${firstTheater.showtimes_by_date.length}`);
          
          // 顯示第一個日期的場次資料
          if (firstTheater.showtimes_by_date.length > 0) {
            const firstDate = firstTheater.showtimes_by_date[0];
            console.log(`日期: ${firstDate.date}`);
            console.log(`場次數量: ${Array.isArray(firstDate.showtimes) ? firstDate.showtimes.length : 'N/A'}`);
            
            // 顯示前三個場次
            if (Array.isArray(firstDate.showtimes) && firstDate.showtimes.length > 0) {
              console.log('前三個場次:');
              for (let i = 0; i < Math.min(3, firstDate.showtimes.length); i++) {
                console.log(`  - ${firstDate.showtimes[i].time} (電影: ${firstDate.showtimes[i].movie_title})`);
              }
            }
          }
        } else {
          console.error('showtimes_by_date 不是陣列:', firstTheater.showtimes_by_date);
        }
      }
    }
  } catch (error) {
    console.error('測試場次 API 時發生錯誤:', error);
  }
}

// 格式化日期為 YYYY-MM-DD 的函數
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 執行測試
testShowtimesApi();

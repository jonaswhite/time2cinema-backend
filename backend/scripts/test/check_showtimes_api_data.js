const axios = require('axios');

// 測試本地和線上 API 接口
async function checkApiData() {
  // 測試本地 API
  try {
    console.log('===== 本地 API 返回的 5/9 場次資料 =====');
    const localResponse = await axios.get('http://localhost:4000/api/showtimes');
    
    // 計算總電影院數量
    console.log(`本地 API 返回了 ${localResponse.data.length} 家電影院的資料`);
    
    // 計算 5/9 的場次數量
    let totalShowtimes = 0;
    let theatersWithToday = 0;
    const today = '2025-05-09';
    
    localResponse.data.forEach(theater => {
      const todayData = theater.showtimes_by_date.find(d => d.date === today);
      if (todayData) {
        theatersWithToday++;
        totalShowtimes += todayData.showtimes.length;
      }
    });
    
    console.log(`其中 ${theatersWithToday} 家電影院有 5/9 的場次資料`);
    console.log(`5/9 總共有 ${totalShowtimes} 筆場次資料`);
    
    // 顯示前 10 家電影院的 5/9 場次數量
    const theaterShowtimes = [];
    localResponse.data.forEach(theater => {
      const todayData = theater.showtimes_by_date.find(d => d.date === today);
      if (todayData) {
        theaterShowtimes.push({
          name: theater.theater_name,
          count: todayData.showtimes.length
        });
      }
    });
    
    console.log('\n本地 API 返回的 5/9 場次數量最多的 10 家電影院：');
    theaterShowtimes.sort((a, b) => b.count - a.count);
    theaterShowtimes.slice(0, 10).forEach((theater, index) => {
      console.log(`${index + 1}. ${theater.name}: ${theater.count} 筆場次`);
    });
    
    // 顯示第一家電影院的前 10 筆場次
    if (localResponse.data.length > 0 && theaterShowtimes.length > 0) {
      const firstTheater = localResponse.data.find(t => t.theater_name === theaterShowtimes[0].name);
      const todayData = firstTheater.showtimes_by_date.find(d => d.date === today);
      
      console.log(`\n${firstTheater.theater_name} 的前 10 筆場次資料：`);
      todayData.showtimes.slice(0, 10).forEach((showtime, index) => {
        console.log(`${index + 1}. ${showtime.time} - ${showtime.movie_name}`);
      });
    }
  } catch (error) {
    console.error('測試本地 API 失敗:', error.message);
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error('錯誤數據:', error.response.data);
    }
  }
  
  // 測試線上 API
  try {
    console.log('\n===== 線上 API 返回的 5/9 場次資料 =====');
    const remoteResponse = await axios.get('https://time2cinema-backend.onrender.com/api/showtimes');
    
    // 計算總電影院數量
    console.log(`線上 API 返回了 ${remoteResponse.data.length} 家電影院的資料`);
    
    // 計算 5/9 的場次數量
    let totalShowtimes = 0;
    let theatersWithToday = 0;
    const today = '2025-05-09';
    
    remoteResponse.data.forEach(theater => {
      const todayData = theater.showtimes_by_date.find(d => d.date === today);
      if (todayData) {
        theatersWithToday++;
        totalShowtimes += todayData.showtimes.length;
      }
    });
    
    console.log(`其中 ${theatersWithToday} 家電影院有 5/9 的場次資料`);
    console.log(`5/9 總共有 ${totalShowtimes} 筆場次資料`);
    
    // 顯示前 10 家電影院的 5/9 場次數量
    const theaterShowtimes = [];
    remoteResponse.data.forEach(theater => {
      const todayData = theater.showtimes_by_date.find(d => d.date === today);
      if (todayData) {
        theaterShowtimes.push({
          name: theater.theater_name,
          count: todayData.showtimes.length
        });
      }
    });
    
    console.log('\n線上 API 返回的 5/9 場次數量最多的 10 家電影院：');
    theaterShowtimes.sort((a, b) => b.count - a.count);
    theaterShowtimes.slice(0, 10).forEach((theater, index) => {
      console.log(`${index + 1}. ${theater.name}: ${theater.count} 筆場次`);
    });
  } catch (error) {
    console.error('測試線上 API 失敗:', error.message);
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error('錯誤數據:', error.response.data);
    }
  }
}

// 執行檢查
checkApiData().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

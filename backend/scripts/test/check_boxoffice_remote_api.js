const axios = require('axios');

// 測試線上 API 接口
async function checkRemoteApiData() {
  try {
    console.log('===== 線上 API 返回的票房資料 =====');
    const remoteResponse = await axios.get('https://interested-shirl-jonaswhite-1cd398c7.koyeb.app/api/boxoffice');
    
    // 計算總電影數量
    console.log(`線上 API 返回了 ${remoteResponse.data.length} 部電影的票房資料`);
    
    // 檢查上映日期欄位
    const moviesWithReleaseDate = remoteResponse.data.filter(movie => movie.release_date);
    console.log(`其中 ${moviesWithReleaseDate.length} 部電影有上映日期資料`);
    console.log(`上映日期資料覆蓋率: ${Math.round(moviesWithReleaseDate.length / remoteResponse.data.length * 100)}%`);
    
    // 顯示前 10 部電影的票房資料
    console.log('\n線上 API 返回的票房前 10 名:');
    remoteResponse.data.slice(0, 10).forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.movie_id}`);
      console.log(`   排名: ${movie.rank}`);
      console.log(`   週票數: ${movie.tickets || '無資料'}`);
      console.log(`   總票房: ${movie.totalsales || '無資料'}`);
      console.log(`   上映日期: ${movie.release_date || '無資料'}`);
      console.log(`   週開始日期: ${movie.week_start_date || '無資料'}`);
      console.log('---');
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
checkRemoteApiData().catch(err => {
  console.error('執行檢查程序時發生錯誤:', err);
});

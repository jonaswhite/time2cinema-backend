const axios = require('axios');

// 測試本地和線上 API 接口
async function checkApiData() {
  // 測試本地 API
  try {
    console.log('===== 本地 API 返回的票房資料 =====');
    const localResponse = await axios.get('http://localhost:4000/api/boxoffice');
    
    // 計算總電影數量
    console.log(`本地 API 返回了 ${localResponse.data.length} 部電影的票房資料`);
    
    // 檢查上映日期欄位
    const moviesWithReleaseDate = localResponse.data.filter(movie => movie.release_date);
    console.log(`其中 ${moviesWithReleaseDate.length} 部電影有上映日期資料`);
    console.log(`上映日期資料覆蓋率: ${Math.round(moviesWithReleaseDate.length / localResponse.data.length * 100)}%`);
    
    // 顯示前 10 部電影的票房資料
    console.log('\n本地 API 返回的票房前 10 名:');
    localResponse.data.slice(0, 10).forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.movie_id}`);
      console.log(`   排名: ${movie.rank}`);
      console.log(`   週票數: ${movie.tickets || '無資料'}`);
      console.log(`   總票房: ${movie.totalsales || '無資料'}`);
      console.log(`   上映日期: ${movie.release_date || '無資料'}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('測試本地 API 失敗:', error.message);
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error('錯誤數據:', error.response.data);
    }
  }
  
  // 測試線上 API
  try {
    console.log('\n===== 線上 API 返回的票房資料 =====');
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
      console.log('---');
    });
    
  } catch (error) {
    console.error('測試線上 API 失敗:', error.message);
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error('錯誤數據:', error.response.data);
    }
  }
  
  // 測試 TMDB API 整合
  try {
    console.log('\n===== 本地 TMDB API 返回的票房資料（帶海報） =====');
    const tmdbResponse = await axios.get('http://localhost:4000/api/tmdb/boxoffice-with-posters');
    
    // 計算總電影數量
    console.log(`本地 TMDB API 返回了 ${tmdbResponse.data.length} 部電影的票房資料`);
    
    // 檢查海報欄位
    const moviesWithPoster = tmdbResponse.data.filter(movie => movie.posterUrl);
    console.log(`其中 ${moviesWithPoster.length} 部電影有海報資料`);
    console.log(`海報資料覆蓋率: ${Math.round(moviesWithPoster.length / tmdbResponse.data.length * 100)}%`);
    
    // 顯示前 5 部有海報的電影
    console.log('\n本地 TMDB API 返回的有海報的電影:');
    moviesWithPoster.slice(0, 5).forEach((movie, index) => {
      console.log(`${index + 1}. ${movie.title}`);
      console.log(`   海報網址: ${movie.posterUrl}`);
      console.log(`   上映日期: ${movie.releaseDate || '無資料'}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('測試本地 TMDB API 失敗:', error.message);
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

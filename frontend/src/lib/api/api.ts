// API 設定檔
let API_URL = '';

// 根據環境動態決定 API URL
if (typeof window !== 'undefined') {
  // 瀏覽器環境
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // 本地開發環境
    API_URL = 'http://localhost:4002';
  } else {
    // 生產環境（Vercel）
    API_URL = 'https://interested-shirl-jonaswhite-1cd398c7.koyeb.app';
  }
} else {
  // 服務器端渲染環境
  API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://interested-shirl-jonaswhite-1cd398c7.koyeb.app';
}

// 確保 API_URL 結尾沒有斜線
if (API_URL.endsWith('/')) {
  API_URL = API_URL.slice(0, -1);
}

export default API_URL;

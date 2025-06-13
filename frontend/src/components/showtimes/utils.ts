import { Cinema, TheaterShowtimes } from './types';

// 根據日期字串取得「今天、明天、後天」的標籤
export const getDateLabel = (dateStr: string): string => {
  // 確保日期格式為 YYYY-MM-DD
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error('無效的日期格式:', dateStr);
    return dateStr;
  }
  
  try {
    // 將字串轉換為 Date 對象
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    
    // 取得本地時間的今天日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 計算明天和後天的日期
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);
    
    // 格式化日期用於比較
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const todayStr = formatDate(today);
    const tomorrowStr = formatDate(tomorrow);
    const dayAfterTomorrowStr = formatDate(dayAfterTomorrow);
    
    // 比較日期並返回對應的標籤
    if (dateStr === todayStr) {
      const month = targetDate.getMonth() + 1;
      const day = targetDate.getDate();
      return `今天 (${month}/${day})`;
    } else if (dateStr === tomorrowStr) {
      const month = targetDate.getMonth() + 1;
      const day = targetDate.getDate();
      return `明天 (${month}/${day})`;
    } else if (dateStr === dayAfterTomorrowStr) {
      const month = targetDate.getMonth() + 1;
      const day = targetDate.getDate();
      return `後天 (${month}/${day})`;
    }
    
    // 如果不是今天、明天、後天，則顯示日期
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  } catch (error) {
    console.error('轉換日期標籤時發生錯誤:', error);
    return dateStr;
  }
};

// 格式化日期為 API 查詢的格式
export const formatDateKey = (date: Date): string => {
  try {
    // 確保是有效的 Date 對象
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.error('無效的日期對象:', date);
      return '';
    }
    
    // 使用本地日期格式化，避免時區問題
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const formattedDate = `${year}-${month}-${day}`;
    console.log(`格式化日期: ${year}-${month}-${day} (本地時間)`);
    return formattedDate;
  } catch (error) {
    console.error('格式化日期時發生錯誤:', error);
    return '';
  }
};

// 創建日期標籤
export const createDateTabs = () => {
  const tabs = [];
  
  // 使用本地時間，已經是台灣時間
  const now = new Date();
  // 不需要再加 8 小時，因為 new Date() 已經是本地時間
  
  // 今天
  const today = new Date(now);
  const todayStr = formatDateKey(today);
  tabs.push({
    label: getDateLabel(todayStr),
    date: today,
  });
  
  // 明天
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateKey(tomorrow);
  tabs.push({
    label: getDateLabel(tomorrowStr),
    date: tomorrow,
  });
  
  // 後天
  const dayAfterTomorrow = new Date(now);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const dayAfterTomorrowStr = formatDateKey(dayAfterTomorrow);
  tabs.push({
    label: getDateLabel(dayAfterTomorrowStr),
    date: dayAfterTomorrow,
  });
  
  console.log(`創建的日期標籤:`, tabs.map(tab => `${tab.label}: ${formatDateKey(tab.date)}`));
  
  return tabs;
};

// 清理和標準化電影院名稱的函數
export const cleanTheaterName = (name: string): string => {
  if (!name) return '';
  
  return name
    .replace(/影城$|大戲院$|影院$|劇場$|戲院$|數位影城$|數位劇院$|數位戲院$|電影城$|電影館$|藝術館$|藝文館$|國際影城$|巨幕影城$/, "")
    .replace(/^喜滿客|^美麗華|^國賠|^威秀|^新光|^秀泰|^華納|^in89|^IN89|^atmovies|^ATmovies/, "")
    .replace(/\s+/g, "")
    .replace(/[^\w\s\u4e00-\u9fff]/g, "") // 移除特殊字元，保留中文和英文數字
    .toLowerCase()
    .trim();
};

// 尋找有場次的電影院
export const findCinemasWithShowtimes = (showtimesData: TheaterShowtimes[], cinemaQuery?: string): string[] => {
  // 更健壯的輸入檢查
  if (!showtimesData) {
    console.error('場次資料為空');
    return [];
  }
  
  // 確保輸入是陣列
  if (!Array.isArray(showtimesData)) {
    console.error('場次資料不是陣列格式:', typeof showtimesData);
    return [];
  }
  
  // 檢查陣列是否為空
  if (showtimesData.length === 0) {
    console.log('沒有找到任何場次資料');
    return [];
  }
  
  // 將場次資料序列化以便於檢查
  const serializedShowtimes = JSON.stringify(showtimesData[0]);
  console.log(`場次數據結構的第一個項目: – ${JSON.stringify(serializedShowtimes).substring(0, 200)}`);
  
  const cinemasWithShowtimes = new Set<string>();
  

  
  // 遍歷所有場次資料
  for (const theater of showtimesData) {
    if (!theater) {
      continue;
    }
    
    // 兼容後端返回的不同欄位名稱
    const theaterId = theater.theaterId || theater.theater_id || (theater.theaterName || theater.theater_name ? theater.theaterName || theater.theater_name : null);
    const theaterName = theater.theaterName || theater.theater_name || '';
    
    if (!theaterId) {
      console.log('跳過沒有 ID 的電影院');
      continue;
    }
    
    // 檢查是否有場次資料
    let hasShowtimes = false;
    
    // 如果有 showtimes_by_date 結構
    if (Array.isArray(theater.showtimes_by_date) && theater.showtimes_by_date.length > 0) {
      // 檢查每個日期組是否有場次
      for (const dateGroup of theater.showtimes_by_date) {
        if (Array.isArray(dateGroup.showtimes) && dateGroup.showtimes.length > 0) {
          hasShowtimes = true;
          break;
        }
      }
    } 
    // 如果有 showtimes 陣列
    else if (Array.isArray(theater.showtimes) && theater.showtimes.length > 0) {
      hasShowtimes = true;
    }
    
    if (!hasShowtimes) {
      console.log(`跳過沒有場次的電影院: ${theaterName} (ID: ${theaterId})`);
      continue;
    }
    
    // 清理場次資料中的電影院名稱
    const cleanedTheaterName = cleanTheaterName(theaterName);
    
    // 如果有搜尋關鍵字，檢查電影院名稱是否包含關鍵字
    if (cinemaQuery && cinemaQuery.trim() !== '') {
      const cleanedQuery = cleanTheaterName(cinemaQuery);
      if (!cleanedTheaterName.includes(cleanedQuery)) {
        console.log(`跳過不匹配查詢的電影院: ${theaterName} (清理後: ${cleanedTheaterName}, 查詢: ${cleanedQuery})`);
        continue; // 不匹配查詢，跳過
      }
    }
    
    // 將電影院ID添加到結果中 (確保轉換為字串類型)
    const idToAdd = String(theaterId);
    cinemasWithShowtimes.add(idToAdd);
    console.log(`添加電影院: ${theaterName} (ID: ${idToAdd})`);
  }
  
  const result = Array.from(cinemasWithShowtimes);
  console.log(`根據查詢 "${cinemaQuery || '全部'}" 找到 ${result.length} 個有場次的電影院`);
  
  return result;
};

// Mapbox token
export const MAPBOX_TOKEN = "pk.eyJ1Ijoiam9uYXN3aGl0ZSIsImEiOiJjbWEydDFwcWswMTdwMm1vaDFuNzcwa21qIn0.yYklARsM9Thk2vuygcDzXg";

// 計算兩個地理座標之間的距離（公里）
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  // 使用簡化版的 Haversine 公式計算距離
  // 這是一個快速大略的計算，不需要絕對精確
  const R = 6371; // 地球半徑（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  // 簡化版計算，適合小距離
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
};

// 根據用戶位置對電影院進行排序
export const sortCinemasByDistance = (cinemas: Cinema[], userLat: number, userLng: number): Cinema[] => {
  if (!cinemas || cinemas.length === 0) return [];
  
  return [...cinemas].sort((a, b) => {
    // 使用 lat/lng 或 latitude/longitude，並提供預設值
    const aLat = a.lat ?? a.latitude ?? 0;
    const aLng = a.lng ?? a.longitude ?? 0;
    const bLat = b.lat ?? b.latitude ?? 0;
    const bLng = b.lng ?? b.longitude ?? 0;
    
    const distanceA = calculateDistance(userLat, userLng, aLat, aLng);
    const distanceB = calculateDistance(userLat, userLng, bLat, bLng);
    return distanceA - distanceB;
  });
};

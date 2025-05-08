import { Request, Response } from 'express';
import pool from '../db';

// 場次數據介面
interface Showtime {
  id: number;
  cinema_id: number;
  date: string;
  time: string;
  movie_name: string;
  source: string;
  created_at: Date;
  updated_at: Date;
}

interface ShowtimesByDate {
  date: string;
  showtimes: Showtime[];
}

interface TheaterShowtimes {
  theater_id: string;
  theater_name: string;
  showtimes_by_date: ShowtimesByDate[];
}

// 從資料庫獲取場次數據並轉換為前端需要的格式
const formatShowtimesData = async (): Promise<TheaterShowtimes[]> => {
  try {
    // 獲取所有電影院
    const cinemasResult = await pool.query('SELECT id, name FROM cinemas');
    const cinemas = cinemasResult.rows;
    
    // 獲取未來三天的場次數據（使用台灣時間）
    const now = new Date();
    // 使用本地時間，設定為當天開始時間
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 使用 DATE() 函數確保只比較日期部分，不受時區影響
    const formattedDate = formatDate(today);
    console.log(`查詢今天及以後的場次，今天日期: ${formattedDate}`);
    
    const showtimesResult = await pool.query(
      'SELECT cinema_id, date, time, movie_name FROM showtimes WHERE DATE(date) >= DATE($1) ORDER BY cinema_id, date, time',
      [formattedDate]
    );
    
    console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
    
    // 將數據按電影院分組
    const showtimesByCinema: Record<number, any[]> = {};
    
    showtimesResult.rows.forEach((row: any) => {
      if (!showtimesByCinema[row.cinema_id]) {
        showtimesByCinema[row.cinema_id] = [];
      }
      showtimesByCinema[row.cinema_id].push(row);
    });
    
    // 格式化數據為前端需要的格式
    const formattedData: TheaterShowtimes[] = [];
    
    cinemas.forEach((cinema: any) => {
      const cinemaShowtimes = showtimesByCinema[cinema.id] || [];
      
      // 按日期分組
      const showtimesByDate: Record<string, any[]> = {};
      
      // 取得今天的日期字串，用於比較
      const todayStr = formatDate(today);
      console.log(`今天日期字串: ${todayStr}`);
      
      cinemaShowtimes.forEach((showtime: any) => {
        // 將場次日期轉換為 YYYY-MM-DD 格式
        const showDateObj = new Date(showtime.date);
        const dateStr = formatDate(showDateObj);
        
        // 只處理今天及以後的場次
        if (dateStr >= todayStr) {
          if (!showtimesByDate[dateStr]) {
            showtimesByDate[dateStr] = [];
          }
          showtimesByDate[dateStr].push({
            time: showtime.time,
            movie_name: showtime.movie_name
          });
        }
      });
      
      // 格式化日期數據
      const formattedDates: ShowtimesByDate[] = [];
      
      Object.keys(showtimesByDate).forEach(dateStr => {
        formattedDates.push({
          date: dateStr,
          showtimes: showtimesByDate[dateStr]
        });
      });
      
      // 只有當有場次數據時才添加電影院
      if (formattedDates.length > 0) {
        formattedData.push({
          theater_id: cinema.id.toString(),
          theater_name: cinema.name,
          showtimes_by_date: formattedDates
        });
      }
    });
    
    return formattedData;
  } catch (error) {
    console.error('從資料庫獲取場次數據失敗:', error);
    return [];
  }
};

// 獲取所有場次
export const getAllShowtimes = async (req: Request, res: Response) => {
  try {
    const showtimes = await formatShowtimesData();
    res.json(showtimes);
  } catch (error) {
    console.error('獲取場次數據失敗:', error);
    res.status(500).json({ error: '獲取場次數據失敗' });
  }
};

// 獲取特定電影院的場次
export const getShowtimesByTheater = async (req: Request, res: Response) => {
  try {
    const { theaterId } = req.params;
    
    if (!theaterId) {
      return res.status(400).json({ error: '請提供電影院ID' });
    }
    
    // 直接從資料庫查詢特定電影院的場次（使用台灣時間）
    const now = new Date();
    // 使用本地時間，設定為當天開始時間
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 使用 DATE() 函數確保只比較日期部分
    const formattedDate = formatDate(today);
    console.log(`查詢電影院 ${theaterId} 的場次，今天日期: ${formattedDate}`);
    
    const showtimesResult = await pool.query(
      'SELECT cinema_id, date, time, movie_name FROM showtimes WHERE cinema_id = $1 AND DATE(date) >= DATE($2) ORDER BY date, time',
      [theaterId, formattedDate]
    );
    
    console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
    
    // 獲取電影院信息
    const cinemaResult = await pool.query('SELECT id, name FROM cinemas WHERE id = $1', [theaterId]);
    
    if (cinemaResult.rows.length === 0) {
      return res.status(404).json({ error: '找不到指定電影院' });
    }
    
    const cinema = cinemaResult.rows[0];
    
    // 按日期分組
    const showtimesByDate: Record<string, any[]> = {};
    
    showtimesResult.rows.forEach((showtime: any) => {
      const dateStr = showtime.date.toISOString().split('T')[0];
      if (!showtimesByDate[dateStr]) {
        showtimesByDate[dateStr] = [];
      }
      showtimesByDate[dateStr].push({
        time: showtime.time,
        movie_name: showtime.movie_name
      });
    });
    
    // 格式化日期數據
    const formattedDates: ShowtimesByDate[] = [];
    
    Object.keys(showtimesByDate).forEach(dateStr => {
      formattedDates.push({
        date: dateStr,
        showtimes: showtimesByDate[dateStr]
      });
    });
    
    const theaterShowtimes = {
      theater_id: cinema.id.toString(),
      theater_name: cinema.name,
      showtimes_by_date: formattedDates
    };
    
    res.json(theaterShowtimes);
  } catch (error) {
    console.error('獲取場次數據失敗:', error);
    res.status(500).json({ error: '獲取場次數據失敗' });
  }
};

// 格式化日期為 YYYY-MM-DD 的函數
export const formatDate = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 獲取特定日期的場次
export const getShowtimesByDate = async (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({ error: '請提供日期' });
    }
    
    // 解析日期
    const targetDate = new Date(date);
    
    // 確保日期有效
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: '無效的日期格式，請使用 YYYY-MM-DD 格式' });
    }
    
    console.log(`查詢日期: ${date}, 目標日期: ${targetDate.toISOString()}`);
    
    // 直接從資料庫查詢特定日期的場次，使用 DATE() 函數確保只比較日期部分
    const showtimesResult = await pool.query(
      'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
      'JOIN cinemas c ON s.cinema_id = c.id ' +
      'WHERE DATE(s.date) = DATE($1) ' +
      'ORDER BY s.cinema_id, s.time',
      [date] // 直接使用輸入的日期字串
    );
    
    console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
    
    // 按電影院分組
    const theaterMap: Record<string, any> = {};
    
    showtimesResult.rows.forEach((row: any) => {
      const cinemaId = row.cinema_id.toString();
      const rowDateStr = row.date.toISOString().split('T')[0];
      
      if (!theaterMap[cinemaId]) {
        theaterMap[cinemaId] = {
          theater_id: cinemaId,
          theater_name: row.cinema_name,
          showtimes_by_date: [{
            date: rowDateStr,
            showtimes: []
          }]
        };
      }
      
      theaterMap[cinemaId].showtimes_by_date[0].showtimes.push({
        time: row.time,
        movie_name: row.movie_name
      });
    });
    
    // 將映射轉換為數組格式
    const dateShowtimes = Object.values(theaterMap);
    
    res.json(dateShowtimes);
  } catch (error) {
    console.error('獲取場次數據失敗:', error);
    res.status(500).json({ error: '獲取場次數據失敗' });
  }
};

// 獲取特定電影的場次
export const getShowtimesByMovie = async (req: Request, res: Response) => {
  try {
    const { movieName } = req.params;
    // 取得查詢日期參數，如果沒有提供，則使用今天的日期
    const { date } = req.query;
    
    if (!movieName) {
      return res.status(400).json({ error: '請提供電影名稱' });
    }
    
    const decodedMovieName = decodeURIComponent(movieName);
    console.log(`處理電影場次請求: "${decodedMovieName}"`);
    
    // 獲取當前台灣時間的日期
    const now = new Date();
    // 設置為台灣時間的零點時分秒
    now.setHours(0, 0, 0, 0);
    
    // 格式化日期的函數
    const formatDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // 計算今天、明天和後天的日期
    const todayStr = formatDate(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);
    const dayAfterTomorrow = new Date(now);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterTomorrowStr = formatDate(dayAfterTomorrow);
    
    // 根據查詢參數決定查詢日期
    let queryDate = todayStr;
    
    // 如果提供了日期參數，則使用提供的日期
    if (date) {
      // 如果日期是「今天」、「明天」或「後天」，則轉換為對應的日期
      if (date === '今天') {
        queryDate = todayStr;
      } else if (date === '明天') {
        queryDate = tomorrowStr;
      } else if (date === '後天') {
        queryDate = dayAfterTomorrowStr;
      } else {
        // 如果是日期字串，則直接使用
        queryDate = date as string;
      }
    }
    
    console.log(`查詢日期: ${queryDate}`);
    
    // 只查詢指定日期的場次，而不是「大於等於」某日期的場次
    console.log(`查詢特定日期的場次: ${queryDate}`);
    
    // 使用多種匹配策略，以提高查詢成功率
    console.log(`實際查詢電影名稱: "${decodedMovieName}"`);
    console.log(`使用 DATE() 函數確保只比較日期部分，查詢日期: ${queryDate}`);
    
    // 先準備各種可能的電影名稱變形
    const movieNameVariations = [
      decodedMovieName,                                // 原始名稱（精確匹配）
      `%${decodedMovieName}%`,                        // 模糊匹配
      decodedMovieName.replace(/\s+/g, ''),           // 去除空格
      `%${decodedMovieName.replace(/\s+/g, '')}%`,    // 去除空格後模糊匹配
      decodedMovieName.split(' ')[0],                 // 只取第一個詞（精確匹配）
      `%${decodedMovieName.split(' ')[0]}%`           // 只取第一個詞（模糊匹配）
    ];
    
    console.log(`準備的電影名稱變形: ${movieNameVariations.join(', ')}`);
    
    // 記錄已嘗試的電影名稱變形
    const triedVariations: string[] = [];
    
    // 先嘗試精確匹配原始名稱
    console.log(`嘗試精確匹配原始名稱: "${movieNameVariations[0]}"`);
    triedVariations.push(movieNameVariations[0]);
    let showtimesResult = await pool.query(
      'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
      'JOIN cinemas c ON s.cinema_id = c.id ' +
      'WHERE s.movie_name = $1 AND DATE(s.date) = DATE($2) ' +
      'ORDER BY s.cinema_id, s.date, s.time',
      [movieNameVariations[0], queryDate]
    );
    
    // 如果精確匹配沒有結果，嘗試模糊匹配
    if (!showtimesResult || showtimesResult.rowCount === 0) {
      console.log(`精確匹配沒有結果，嘗試模糊匹配: "${movieNameVariations[1]}"`);
      triedVariations.push(movieNameVariations[1]);
      showtimesResult = await pool.query(
        'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
        'JOIN cinemas c ON s.cinema_id = c.id ' +
        'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = DATE($2) ' +
        'ORDER BY s.cinema_id, s.date, s.time',
        [movieNameVariations[1], queryDate]
      );
    }
    
    // 如果仍然沒有結果，嘗試去除空格後精確匹配
    if (!showtimesResult || showtimesResult.rowCount === 0) {
      console.log(`模糊匹配沒有結果，嘗試去除空格後精確匹配: "${movieNameVariations[2]}"`);
      triedVariations.push(movieNameVariations[2]);
      showtimesResult = await pool.query(
        'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
        'JOIN cinemas c ON s.cinema_id = c.id ' +
        'WHERE s.movie_name = $1 AND DATE(s.date) = DATE($2) ' +
        'ORDER BY s.cinema_id, s.date, s.time',
        [movieNameVariations[2], queryDate]
      );
    }
    
    // 如果仍然沒有結果，嘗試去除空格後模糊匹配
    if (!showtimesResult || showtimesResult.rowCount === 0) {
      console.log(`去除空格後精確匹配沒有結果，嘗試去除空格後模糊匹配: "${movieNameVariations[3]}"`);
      triedVariations.push(movieNameVariations[3]);
      showtimesResult = await pool.query(
        'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
        'JOIN cinemas c ON s.cinema_id = c.id ' +
        'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = DATE($2) ' +
        'ORDER BY s.cinema_id, s.date, s.time',
        [movieNameVariations[3], queryDate]
      );
    }
    
    // 如果仍然沒有結果，嘗試只匹配第一個詞（精確匹配）
    if (!showtimesResult || showtimesResult.rowCount === 0) {
      console.log(`去除空格後模糊匹配沒有結果，嘗試只匹配第一個詞: "${movieNameVariations[4]}"`);
      triedVariations.push(movieNameVariations[4]);
      showtimesResult = await pool.query(
        'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
        'JOIN cinemas c ON s.cinema_id = c.id ' +
        'WHERE s.movie_name = $1 AND DATE(s.date) = DATE($2) ' +
        'ORDER BY s.cinema_id, s.date, s.time',
        [movieNameVariations[4], queryDate]
      );
    }
    
    // 如果仍然沒有結果，嘗試只匹配第一個詞（模糊匹配）
    if (!showtimesResult || showtimesResult.rowCount === 0) {
      console.log(`只匹配第一個詞沒有結果，嘗試模糊匹配第一個詞: "${movieNameVariations[5]}"`);
      triedVariations.push(movieNameVariations[5]);
      showtimesResult = await pool.query(
        'SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
        'JOIN cinemas c ON s.cinema_id = c.id ' +
        'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = DATE($2) ' +
        'ORDER BY s.cinema_id, s.date, s.time',
        [movieNameVariations[5], queryDate]
      );
    }
    
    // 記錄所有已嘗試的電影名稱變形
    console.log(`已嘗試的電影名稱變形: ${triedVariations.join(', ')}`);
    
    // 確保 showtimesResult 不為 null
    if (showtimesResult && showtimesResult.rowCount !== null && showtimesResult.rowCount > 0 && 
        showtimesResult.rows && showtimesResult.rows.length > 0 && showtimesResult.rows[0]) {
      console.log(`成功匹配到電影名稱: ${showtimesResult.rows[0].movie_name}`);
    }
    
    // 安全地計算行數，確保不會出現 null 錯誤
    const rowCount = showtimesResult && showtimesResult.rowCount !== null ? showtimesResult.rowCount : 0;
    console.log(`查詢結果: 找到 ${rowCount} 筆場次資料`);
    
    // 按電影院和日期分組
    const theaterMap: Record<string, any> = {};
    
    // 確保 showtimesResult 不為 null
    if (!showtimesResult || !showtimesResult.rows || showtimesResult.rows.length === 0) {
      // 如果沒有找到任何場次，返回空數組
      return res.json([]);
    }
    
    showtimesResult.rows.forEach((row: any) => {
      if (!row || !row.cinema_id || !row.date) {
        console.warn('發現無效的場次資料:', row);
        return; // 跳過無效的資料
      }
      
      const cinemaId = row.cinema_id.toString();
      const dateObj = new Date(row.date);
      
      if (isNaN(dateObj.getTime())) {
        console.warn(`無效的日期格式: ${row.date}`);
        return; // 跳過無效的日期
      }
      
      // 使用查詢日期作為返回的日期，而不是使用資料庫中的日期
      // 這樣可以確保前端收到的日期是正確的
      const dateStr = queryDate;
      
      if (!theaterMap[cinemaId]) {
        theaterMap[cinemaId] = {
          theater_id: cinemaId,
          theater_name: row.cinema_name,
          showtimes_by_date: {}
        };
      }
      
      if (!theaterMap[cinemaId].showtimes_by_date[dateStr]) {
        theaterMap[cinemaId].showtimes_by_date[dateStr] = {
          date: dateStr,
          showtimes: []
        };
      }
      
      theaterMap[cinemaId].showtimes_by_date[dateStr].showtimes.push({
        time: row.time,
        movie_name: row.movie_name
      });
    });
    
    // 將映射轉換為數組格式
    const movieShowtimes = Object.values(theaterMap).map((theater: any) => {
      return {
        theater_id: theater.theater_id,
        theater_name: theater.theater_name,
        showtimes_by_date: Object.values(theater.showtimes_by_date)
      };
    });
    
    res.json(movieShowtimes);
  } catch (error) {
    console.error(`獲取場次數據失敗 (電影: ${req.params.movieName}):`, error);
    res.status(500).json({ error: '獲取場次數據失敗', message: error instanceof Error ? error.message : '未知錯誤' });
  }
};


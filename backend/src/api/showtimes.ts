import { Request, Response } from 'express';
import pool from '../db';

// 格式化日期為 YYYY-MM-DD 的函數
export const formatDate = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 場次數據介面
interface Showtime {
  id: number;
  cinema_id: number;
  date: string;
  time: string;
  movie_id: number;
  movie_title?: string;
  source: string;
  created_at: Date;
  updated_at: Date;
}

interface ShowtimesByDate {
  date: string;
  showtimes: {
    time: string;
    movie_id: number;
    movie_title: string;
  }[];
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
    
    const showtimesResult = await pool.query(`
      SELECT 
        s.id, s.cinema_id, s.date, s.time, s.movie_id, 
        m.title as movie_title
      FROM 
        showtimes s
      LEFT JOIN 
        movies m ON s.movie_id = m.id
      WHERE 
        DATE(s.date) >= DATE($1) 
      ORDER BY 
        s.cinema_id, s.date, s.time
    `, [formattedDate]);
    
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
        
        // 確保電影標題存在，如果不存在則使用「未知電影」
        const movieTitle = showtime.movie_title || `未知電影 #${showtime.movie_id || 'N/A'}`;
        
        // 只處理今天及以後的場次
        if (dateStr >= todayStr) {
          if (!showtimesByDate[dateStr]) {
            showtimesByDate[dateStr] = [];
          }
          showtimesByDate[dateStr].push({
            time: showtime.time || '00:00',
            movie_id: showtime.movie_id || 0,
            movie_title: movieTitle
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
    
    console.log(`查詢電影院場次: ${theaterId}`);
    
    // 獲取未來三天的場次數據（使用台灣時間）
    const now = new Date();
    // 使用本地時間，設定為當天開始時間
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // 使用 DATE() 函數確保只比較日期部分，不受時區影響
    const formattedDate = formatDate(today);
    console.log(`查詢今天及以後的場次，今天日期: ${formattedDate}`);
    
    // 獲取該電影院的所有場次，使用 LEFT JOIN 獲取電影詳細資訊
    const showtimesResult = await pool.query(`
      SELECT 
        s.cinema_id, s.date, s.time, s.movie_id, 
        m.title as movie_title
      FROM 
        showtimes s
      LEFT JOIN 
        movies m ON s.movie_id = m.id
      WHERE 
        s.cinema_id = $1 AND DATE(s.date) >= DATE($2)
      ORDER BY 
        s.date, s.time
    `, [theaterId, formattedDate]);
    
    console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
    
    // 獲取電影院信息
    const cinemaResult = await pool.query('SELECT id, name FROM cinemas WHERE id = $1', [theaterId]);
    
    if (cinemaResult.rows.length === 0) {
      return res.status(404).json({ error: '找不到指定電影院' });
    }
    
    const cinema = cinemaResult.rows[0];
    
    // 按日期分組
    const showtimesByDate: Record<string, any[]> = {};
    
    showtimesResult.rows.forEach((row: any) => {
      // 將場次日期轉換為 YYYY-MM-DD 格式
      const showDateObj = new Date(row.date);
      const dateStr = formatDate(showDateObj);
      
      // 確保電影標題存在，如果不存在則使用「未知電影」
      const movieTitle = row.movie_title || `未知電影 #${row.movie_id || 'N/A'}`;
      
      if (!showtimesByDate[dateStr]) {
        showtimesByDate[dateStr] = [];
      }
      
      showtimesByDate[dateStr].push({
        time: row.time || '00:00',
        movie_id: row.movie_id || 0,
        movie_title: movieTitle
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

// 獲取特定日期的場次
export const getShowtimesByDate = async (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({ error: '請提供日期' });
    }
    
    console.log(`查詢日期場次: ${date}`);
    
    // 獲取該日期的所有場次，使用 LEFT JOIN 獲取電影詳細資訊
    const showtimesResult = await pool.query(`
      SELECT 
        s.cinema_id, s.date, s.time, s.movie_id, 
        m.title as movie_title, c.name as cinema_name
      FROM 
        showtimes s
      LEFT JOIN 
        movies m ON s.movie_id = m.id
      LEFT JOIN 
        cinemas c ON s.cinema_id = c.id
      WHERE 
        DATE(s.date) = DATE($1)
      ORDER BY 
        s.cinema_id, s.date, s.time
    `, [date]);
    
    console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
    
    // 按電影院分組
    const theaterMap: Record<string, any> = {};
    
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
      
      const rowDateStr = formatDate(dateObj);
      
      // 確保電影院名稱存在，如果不存在則使用「未知電影院」
      const cinemaName = row.cinema_name || `未知電影院 #${cinemaId}`;
      
      // 確保電影標題存在，如果不存在則使用「未知電影」
      const movieTitle = row.movie_title || `未知電影 #${row.movie_id || 'N/A'}`;
      
      if (!theaterMap[cinemaId]) {
        theaterMap[cinemaId] = {
          theater_id: cinemaId,
          theater_name: cinemaName,
          showtimes_by_date: [{
            date: rowDateStr,
            showtimes: []
          }]
        };
      }
      
      theaterMap[cinemaId].showtimes_by_date[0].showtimes.push({
        time: row.time || '00:00',
        movie_id: row.movie_id || 0,
        movie_title: movieTitle
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
    const { date } = req.query;
    
    if (!movieName) {
      return res.status(400).json({ error: '請提供電影ID或名稱' });
    }
    
    // 如果提供了日期參數，使用該日期；否則使用今天的日期
    let queryDate: string;
    if (date) {
      queryDate = date as string;
    } else {
      const today = new Date();
      queryDate = formatDate(today);
    }
    
    console.log(`查詢日期: ${queryDate}`);
    
    // 檢查 movieName 是否為數字（電影ID）
    const isMovieId = !isNaN(Number(movieName));
    let showtimesResult;
    
    if (isMovieId) {
      // 如果是電影ID，直接使用ID查詢
      console.log(`使用電影ID查詢場次: ${movieName}`);
      showtimesResult = await pool.query(`
        SELECT 
          s.cinema_id, s.date, s.time, s.movie_id, 
          m.title as movie_title, c.name as cinema_name
        FROM 
          showtimes s
        LEFT JOIN 
          movies m ON s.movie_id = m.id
        LEFT JOIN 
          cinemas c ON s.cinema_id = c.id
        WHERE 
          s.movie_id = $1 AND DATE(s.date) = DATE($2)
        ORDER BY 
          s.cinema_id, s.date, s.time
      `, [movieName, queryDate]);
    } else {
      // 如果是電影名稱，先查找對應的電影ID，然後再查詢場次
      const decodedMovieName = decodeURIComponent(movieName);
      console.log(`使用電影名稱查詢場次: ${decodedMovieName}`);
      
      // 先查找電影ID
      const movieResult = await pool.query(`
        SELECT id FROM movies WHERE title ILIKE $1 OR original_title ILIKE $1
      `, [`%${decodedMovieName}%`]);
      
      if (movieResult.rows.length === 0) {
        console.log(`找不到電影: ${decodedMovieName}`);
        return res.json([]);
      }
      
      const movieId = movieResult.rows[0].id;
      console.log(`找到電影ID: ${movieId}`);
      
      // 使用電影ID查詢場次
      showtimesResult = await pool.query(`
        SELECT 
          s.cinema_id, s.date, s.time, s.movie_id, 
          m.title as movie_title, c.name as cinema_name
        FROM 
          showtimes s
        LEFT JOIN 
          movies m ON s.movie_id = m.id
        LEFT JOIN 
          cinemas c ON s.cinema_id = c.id
        WHERE 
          s.movie_id = $1 AND DATE(s.date) = DATE($2)
        ORDER BY 
          s.cinema_id, s.date, s.time
      `, [movieId, queryDate]);
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
      
      // 確保電影院名稱存在，如果不存在則使用「未知電影院」
      const cinemaName = row.cinema_name || `未知電影院 #${cinemaId}`;
      
      // 確保電影標題存在，如果不存在則使用「未知電影」
      const movieTitle = row.movie_title || `未知電影 #${row.movie_id || 'N/A'}`;
      
      if (!theaterMap[cinemaId]) {
        theaterMap[cinemaId] = {
          theater_id: cinemaId,
          theater_name: cinemaName,
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
        time: row.time || '00:00',
        movie_id: row.movie_id || 0,
        movie_title: movieTitle
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


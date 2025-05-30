"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShowtimesByDate = exports.getShowtimesByMovie = exports.getShowtimesByTheater = exports.router = void 0;
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
// 設定路由
exports.router = (0, express_1.Router)();
// 獲取所有場次資料
exports.router.get('/', async (req, res) => {
    try {
        const result = await db_1.default.query('SELECT * FROM showtimes');
        res.json(result.rows);
    }
    catch (error) {
        console.error('獲取場次資料失敗:', error);
        res.status(500).json({ error: '獲取場次資料失敗' });
    }
});
// 獲取特定日期的場次
exports.router.get('/date/:date', (req, res) => {
    (0, exports.getShowtimesByDate)(req, res);
});
// 獲取特定電影院的場次
exports.router.get('/theater/:theaterId', (req, res) => {
    (0, exports.getShowtimesByTheater)(req, res);
});
// 獲取特定電影的場次
exports.router.get('/movie/:movieName', (req, res) => {
    (0, exports.getShowtimesByMovie)(req, res);
});
// 根據日期字串取得「今天、明天、後天」的標籤
function getDateLabel(date) {
    // 格式化日期為 YYYY-MM-DD 的函數
    const formatDate = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    // 將輸入日期轉換為 YYYY-MM-DD 格式
    let dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    const dateStr = formatDate(dateObj);
    // 直接返回日期字串，不做「今天、明天、後天」的轉換
    return dateStr;
}
// 從資料庫獲取場次數據並轉換為前端需要的格式
const formatShowtimesData = async () => {
    try {
        // 獲取所有電影院
        const cinemasResult = await db_1.default.query('SELECT id, name FROM cinemas');
        const cinemas = cinemasResult.rows;
        // 獲取未來三天的場次數據（使用台灣時間）
        const now = new Date();
        // 調整為台灣時區 (UTC+8)
        const taiwanOffset = 8 * 60 * 60 * 1000; // 8小時的毫秒數
        const taiwanNow = new Date(now.getTime() + taiwanOffset);
        // 設置為台灣時間的零點時分秒
        taiwanNow.setHours(0, 0, 0, 0);
        // 格式化為 YYYY-MM-DD 格式
        const formatDate = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const todayStr = formatDate(taiwanNow);
        // 獲取未來三天的場次數據
        const showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
            'JOIN cinemas c ON s.cinema_id = c.id ' +
            'WHERE DATE(s.date) >= $1 ' +
            'ORDER BY s.cinema_id, s.date, s.time', [todayStr]);
        // 按電影院和日期分組
        const formattedData = [];
        // 先按電影院分組
        const showtimesByCinema = {};
        showtimesResult.rows.forEach((row) => {
            const cinemaId = row.cinema_id.toString();
            const dateObj = new Date(row.date);
            const dateStr = formatDate(dateObj);
            if (!showtimesByCinema[cinemaId]) {
                showtimesByCinema[cinemaId] = {};
            }
            if (!showtimesByCinema[cinemaId][dateStr]) {
                showtimesByCinema[cinemaId][dateStr] = [];
            }
            showtimesByCinema[cinemaId][dateStr].push({
                time: row.time,
                movie_name: row.movie_name
            });
        });
        // 將分組數據轉換為前端需要的格式
        cinemas.forEach((cinema) => {
            const showtimesByDate = showtimesByCinema[cinema.id];
            if (!showtimesByDate) {
                return; // 跳過沒有場次的電影院
            }
            const formattedDates = [];
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
    }
    catch (error) {
        console.error('從資料庫獲取場次數據失敗:', error);
        return [];
    }
};
// 獲取特定電影院的場次
const getShowtimesByTheater = async (req, res) => {
    try {
        const { theaterId } = req.params;
        if (!theaterId) {
            return res.status(400).json({ error: '請提供電影院ID' });
        }
        // 獲取電影院資訊
        const cinemaResult = await db_1.default.query('SELECT id, name FROM cinemas WHERE id = $1', [theaterId]);
        if (cinemaResult.rowCount === 0) {
            return res.status(404).json({ error: '找不到指定的電影院' });
        }
        const cinema = cinemaResult.rows[0];
        // 獲取當前台灣時間的日期
        const now = new Date();
        // 設置為台灣時間的零點時分秒
        now.setHours(0, 0, 0, 0);
        // 格式化為 YYYY-MM-DD 格式
        const formatDate = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const todayStr = formatDate(now);
        // 獲取該電影院的場次
        const showtimesResult = await db_1.default.query('SELECT date, time, movie_name FROM showtimes ' +
            'WHERE cinema_id = $1 AND DATE(date) >= $2 ' +
            'ORDER BY date, time', [theaterId, todayStr]);
        // 按日期分組
        const showtimesByDate = {};
        showtimesResult.rows.forEach((row) => {
            const dateObj = new Date(row.date);
            const dateStr = formatDate(dateObj);
            if (!showtimesByDate[dateStr]) {
                showtimesByDate[dateStr] = [];
            }
            showtimesByDate[dateStr].push({
                time: row.time,
                movie_name: row.movie_name
            });
        });
        // 格式化為前端需要的格式
        const formattedDates = [];
        Object.keys(showtimesByDate).forEach(dateStr => {
            // 移除日期標籤邏輯，只使用純日期
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
    }
    catch (error) {
        console.error('獲取場次數據失敗:', error);
        res.status(500).json({ error: '獲取場次數據失敗' });
    }
};
exports.getShowtimesByTheater = getShowtimesByTheater;
// 獲取特定電影的場次
const getShowtimesByMovie = async (req, res) => {
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
        const formatDate = (d) => {
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
            }
            else if (date === '明天') {
                queryDate = tomorrowStr;
            }
            else if (date === '後天') {
                queryDate = dayAfterTomorrowStr;
            }
            else {
                // 如果是日期字串，則直接使用
                queryDate = date;
            }
        }
        console.log(`查詢日期: ${queryDate}`);
        // 只查詢指定日期的場次，而不是「大於等於」某日期的場次
        console.log(`查詢特定日期的場次: ${queryDate}`);
        // 使用多種匹配策略，以提高查詢成功率
        console.log(`實際查詢電影名稱: "${decodedMovieName}"`);
        // 先準備各種可能的電影名稱變形
        const movieNameVariations = [
            decodedMovieName, // 原始名稱（精確匹配）
            `%${decodedMovieName}%`, // 模糊匹配
            decodedMovieName.replace(/\s+/g, ''), // 去除空格
            `%${decodedMovieName.replace(/\s+/g, '')}%`, // 去除空格後模糊匹配
            decodedMovieName.split(/\s+/)[0], // 只取第一個詞
            `%${decodedMovieName.split(/\s+/)[0]}%` // 第一個詞模糊匹配
        ];
        // 記錄所有已嘗試的電影名稱變形
        const triedVariations = [];
        let showtimesResult = { rowCount: 0, rows: [] };
        // 嘗試精確匹配
        triedVariations.push(movieNameVariations[0]);
        showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
            'JOIN cinemas c ON s.cinema_id = c.id ' +
            'WHERE s.movie_name = $1 AND DATE(s.date) = $2 ' +
            'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[0], queryDate]);
        // 如果精確匹配沒有結果，嘗試模糊匹配
        if (showtimesResult.rowCount === 0) {
            console.log(`精確匹配沒有結果，嘗試模糊匹配: "${movieNameVariations[1]}"`);
            triedVariations.push(movieNameVariations[1]);
            showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
                'JOIN cinemas c ON s.cinema_id = c.id ' +
                'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = $2 ' +
                'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[1], queryDate]);
        }
        // 如果仍然沒有結果，嘗試去除空格後精確匹配
        if (showtimesResult.rowCount === 0) {
            console.log(`模糊匹配沒有結果，嘗試去除空格後精確匹配: "${movieNameVariations[2]}"`);
            triedVariations.push(movieNameVariations[2]);
            showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
                'JOIN cinemas c ON s.cinema_id = c.id ' +
                'WHERE s.movie_name = $1 AND DATE(s.date) = $2 ' +
                'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[2], queryDate]);
        }
        // 如果仍然沒有結果，嘗試去除空格後模糊匹配
        if (showtimesResult.rowCount === 0) {
            console.log(`去除空格後精確匹配沒有結果，嘗試去除空格後模糊匹配: "${movieNameVariations[3]}"`);
            triedVariations.push(movieNameVariations[3]);
            showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
                'JOIN cinemas c ON s.cinema_id = c.id ' +
                'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = $2 ' +
                'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[3], queryDate]);
        }
        // 如果仍然沒有結果，嘗試只匹配第一個詞（精確匹配）
        if (showtimesResult.rowCount === 0) {
            console.log(`去除空格後模糊匹配沒有結果，嘗試只匹配第一個詞: "${movieNameVariations[4]}"`);
            triedVariations.push(movieNameVariations[4]);
            showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
                'JOIN cinemas c ON s.cinema_id = c.id ' +
                'WHERE s.movie_name = $1 AND DATE(s.date) = $2 ' +
                'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[4], queryDate]);
        }
        // 如果仍然沒有結果，嘗試只匹配第一個詞（模糊匹配）
        if (showtimesResult.rowCount === 0) {
            console.log(`只匹配第一個詞沒有結果，嘗試模糊匹配第一個詞: "${movieNameVariations[5]}"`);
            triedVariations.push(movieNameVariations[5]);
            showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
                'JOIN cinemas c ON s.cinema_id = c.id ' +
                'WHERE s.movie_name ILIKE $1 AND DATE(s.date) = $2 ' +
                'ORDER BY s.cinema_id, s.date, s.time', [movieNameVariations[5], queryDate]);
        }
        // 記錄所有已嘗試的電影名稱變形
        console.log(`已嘗試的電影名稱變形: ${triedVariations.join(', ')}`);
        if (showtimesResult.rowCount > 0) {
            console.log(`成功匹配到電影名稱: ${showtimesResult.rows[0].movie_name}`);
        }
        console.log(`查詢結果: 找到 ${showtimesResult.rowCount} 筆場次資料`);
        // 按電影院和日期分組
        const theaterMap = {};
        if (!showtimesResult.rows || showtimesResult.rows.length === 0) {
            // 如果沒有找到任何場次，返回空數組
            return res.json([]);
        }
        showtimesResult.rows.forEach((row) => {
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
            const dateStr = dateObj.toISOString().split('T')[0];
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
        const movieShowtimes = Object.values(theaterMap).map((theater) => {
            return {
                theater_id: theater.theater_id,
                theater_name: theater.theater_name,
                showtimes_by_date: Object.values(theater.showtimes_by_date)
            };
        });
        res.json(movieShowtimes);
    }
    catch (error) {
        console.error(`獲取場次數據失敗 (電影: ${req.params.movieName}):`, error);
        res.status(500).json({ error: '獲取場次數據失敗', message: error instanceof Error ? error.message : '未知錯誤' });
    }
};
exports.getShowtimesByMovie = getShowtimesByMovie;
// 獲取特定日期的場次
const getShowtimesByDate = async (req, res) => {
    try {
        const { date } = req.params;
        if (!date) {
            return res.status(400).json({ error: '請提供日期' });
        }
        // 解析日期（確保使用台灣時間）
        const targetDate = new Date(date);
        // 確保日期有效
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({ error: '無效的日期格式，請使用 YYYY-MM-DD 格式' });
        }
        console.log(`查詢日期: ${date}, 目標日期: ${targetDate.toISOString()}`);
        // 直接從資料庫查詢特定日期的場次，使用 DATE() 函數確保只比較日期部分
        const showtimesResult = await db_1.default.query('SELECT s.cinema_id, s.date, s.time, s.movie_name, c.name as cinema_name FROM showtimes s ' +
            'JOIN cinemas c ON s.cinema_id = c.id ' +
            'WHERE DATE(s.date) = DATE($1) ' +
            'ORDER BY s.cinema_id, s.time', [date] // 直接使用輸入的日期字串
        );
        console.log(`找到 ${showtimesResult.rowCount} 筆場次資料`);
        // 格式化為 YYYY-MM-DD
        const formatDate = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        // 按電影院分組
        const theaterMap = {};
        showtimesResult.rows.forEach((row) => {
            const cinemaId = row.cinema_id.toString();
            const rowDateStr = formatDate(row.date);
            // 移除日期標籤邏輯和 label 欄位
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
    }
    catch (error) {
        console.error('獲取場次數據失敗:', error);
        res.status(500).json({ error: '獲取場次數據失敗' });
    }
};
exports.getShowtimesByDate = getShowtimesByDate;

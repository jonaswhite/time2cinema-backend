"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSimplifiedShowtimesByMovie = exports.formatDate = void 0;
const db_1 = __importDefault(require("../db"));
// 格式化日期為 YYYY-MM-DD 的函數
const formatDate = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
exports.formatDate = formatDate;
/**
 * 獲取特定電影的簡化場次資料
 * 這個 API 端點返回更簡單的數據結構，專為前端顯示設計
 */
const getSimplifiedShowtimesByMovie = async (req, res) => {
    try {
        const { movieId: movieIdParam } = req.params;
        const { date } = req.query;
        if (!movieIdParam) {
            return res.status(400).json({ error: '請提供電影ID' });
        }
        // 如果提供了日期參數，使用該日期；否則使用今天的日期
        let queryDate;
        if (date) {
            queryDate = date;
        }
        else {
            const today = new Date();
            queryDate = (0, exports.formatDate)(today);
        }
        console.log(`[簡化API] 查詢電影 ${movieIdParam} 在 ${queryDate} 的場次`);
        // 檢查 movieIdParam 是否為數字（電影ID）
        const isMovieId = !isNaN(Number(movieIdParam));
        let showtimesResult;
        if (isMovieId) {
            // 如果是電影ID，直接使用ID查詢
            console.log(`[簡化API] 使用電影ID查詢: ${movieIdParam}`);
            showtimesResult = await db_1.default.query(`
        SELECT 
          s.cinema_id, s.date, s.time, 
          c.name as cinema_name
        FROM 
          showtimes s
        LEFT JOIN 
          cinemas c ON s.cinema_id = c.id
        WHERE 
          s.movie_id = $1 AND DATE(s.date) = DATE($2)
        ORDER BY 
          s.cinema_id, s.time
      `, [movieIdParam, queryDate]);
        }
        else {
            // 如果是電影名稱，先查找對應的電影ID，然後再查詢場次
            const decodedMovieName = decodeURIComponent(movieIdParam);
            console.log(`[簡化API] 使用電影名稱查詢: ${decodedMovieName}`);
            // 先查找電影ID
            const movieResult = await db_1.default.query(`
        SELECT id FROM movies WHERE title ILIKE $1 OR original_title ILIKE $1
      `, [`%${decodedMovieName}%`]);
            if (movieResult.rows.length === 0) {
                console.log(`[簡化API] 找不到電影: ${decodedMovieName}`);
                return res.json([]);
            }
            const foundMovieId = movieResult.rows[0].id;
            console.log(`[簡化API] 找到電影ID: ${foundMovieId}`);
            // 使用電影ID查詢場次
            showtimesResult = await db_1.default.query(`
        SELECT 
          s.cinema_id, s.date, s.time, 
          c.name as cinema_name
        FROM 
          showtimes s
        LEFT JOIN 
          cinemas c ON s.cinema_id = c.id
        WHERE 
          s.movie_id = $1 AND DATE(s.date) = DATE($2)
        ORDER BY 
          s.cinema_id, s.time
      `, [foundMovieId, queryDate]);
        }
        // 安全地計算行數
        const rowCount = showtimesResult?.rowCount || 0;
        console.log(`[簡化API] 查詢結果: 找到 ${rowCount} 筆場次資料`);
        // 如果沒有找到任何場次，返回空數組
        if (!showtimesResult || !showtimesResult.rows || showtimesResult.rows.length === 0) {
            return res.json([]);
        }
        // 按電影院分組
        const cinemaMap = {};
        showtimesResult.rows.forEach((row) => {
            if (!row || !row.cinema_id)
                return;
            const cinemaId = row.cinema_id.toString();
            const cinemaName = row.cinema_name || `未知電影院 #${cinemaId}`;
            const time = row.time || '00:00';
            if (!cinemaMap[cinemaId]) {
                cinemaMap[cinemaId] = {
                    cinema_id: cinemaId,
                    cinema_name: cinemaName,
                    date: queryDate,
                    times: []
                };
            }
            // 避免重複的時間
            if (!cinemaMap[cinemaId].times.includes(time)) {
                cinemaMap[cinemaId].times.push(time);
            }
        });
        // 將映射轉換為數組
        const simplifiedShowtimes = Object.values(cinemaMap);
        // 按照電影院名稱排序
        simplifiedShowtimes.sort((a, b) => a.cinema_name.localeCompare(b.cinema_name));
        res.json(simplifiedShowtimes);
    }
    catch (error) {
        console.error(`[簡化API] 獲取場次數據失敗 (電影: ${req.params.movieId}):`, error);
        res.status(500).json({ error: '獲取場次數據失敗', message: error instanceof Error ? error.message : '未知錯誤' });
    }
};
exports.getSimplifiedShowtimesByMovie = getSimplifiedShowtimesByMovie;

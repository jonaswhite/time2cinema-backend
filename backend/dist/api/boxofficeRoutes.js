"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.boxofficeRouter = void 0;
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../db"));
const router = express_1.default.Router();
// 獲取所有票房資料（統一回傳格式）
router.get('/', async (req, res) => {
    try {
        // 檢查是否需要強制更新
        const forceRefresh = req.query.refresh === 'true';
        // 使用 LEFT JOIN 查詢來獲取電影詳細資訊，確保即使電影不存在也能返回票房資料
        const result = await db_1.default.query(`
      SELECT 
        b.movie_id, b.rank, b.tickets, b.totalsales, b.release_date, b.week_start_date,
        m.title, m.original_title, m.poster_url, m.runtime, m.tmdb_id
      FROM 
        boxoffice b
      LEFT JOIN 
        movies m ON b.movie_id = m.id
      WHERE 
        b.week_start_date = (SELECT MAX(week_start_date) FROM boxoffice)
      ORDER BY 
        b.rank
    `);
        // 格式化回應資料，增加對空值的處理
        const moviesWithDetails = result.rows.map(row => {
            // 確保標題存在，如果不存在則使用「未知電影」
            const title = row.title || `未知電影 #${row.rank || 'N/A'}`;
            return {
                id: row.movie_id || null, // 確保 id 不會是 undefined
                title: title,
                original_title: row.original_title || null,
                rank: row.rank || 0,
                tickets: row.tickets || 0,
                totalsales: row.totalsales || 0,
                release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
                week_start_date: row.week_start_date.toISOString().split('T')[0],
                posterUrl: row.poster_url || null,
                runtime: row.runtime || null,
                tmdb_id: row.tmdb_id || null
            };
        });
        res.json(moviesWithDetails);
    }
    catch (error) {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    }
});
// 獲取特定日期的票房資料
router.get('/date/:date', async (req, res) => {
    const { date } = req.params;
    if (!date) {
        res.status(400).json({ error: '請提供日期' });
        return;
    }
    try {
        // 使用 LEFT JOIN 查詢來獲取電影詳細資訊
        const result = await db_1.default.query(`
      SELECT 
        b.movie_id, b.rank, b.tickets, b.totalsales, b.release_date, b.week_start_date,
        m.title, m.original_title, m.poster_url, m.runtime, m.tmdb_id
      FROM 
        boxoffice b
      LEFT JOIN 
        movies m ON b.movie_id = m.id
      WHERE 
        b.week_start_date = $1
      ORDER BY 
        b.rank
    `, [date]);
        // 格式化回應資料，增加對空值的處理
        const moviesWithDetails = result.rows.map(row => {
            // 確保標題存在，如果不存在則使用「未知電影」
            const title = row.title || `未知電影 #${row.rank || 'N/A'}`;
            return {
                id: row.movie_id || null, // 確保 id 不會是 undefined
                title: title,
                original_title: row.original_title || null,
                rank: row.rank || 0,
                tickets: row.tickets || 0,
                totalsales: row.totalsales || 0,
                release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
                week_start_date: row.week_start_date.toISOString().split('T')[0],
                posterUrl: row.poster_url || null,
                runtime: row.runtime || null,
                tmdb_id: row.tmdb_id || null
            };
        });
        res.json(moviesWithDetails);
    }
    catch (error) {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    }
});
// 獲取特定電影的票房資料
router.get('/movie/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ error: '請提供電影ID' });
        return;
    }
    try {
        // 使用 LEFT JOIN 查詢來獲取電影詳細資訊
        const result = await db_1.default.query(`
      SELECT 
        b.movie_id, b.rank, b.tickets, b.totalsales, b.week_start_date,
        m.title, m.original_title, m.poster_url, m.runtime, m.release_date, m.tmdb_id
      FROM 
        boxoffice b
      LEFT JOIN 
        movies m ON b.movie_id = m.id
      WHERE 
        b.movie_id = $1
      ORDER BY 
        b.week_start_date DESC
    `, [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: '找不到指定電影的票房資料' });
            return;
        }
        // 格式化回應資料，增加對空值的處理
        const formatted = result.rows.map(row => {
            // 確保標題存在，如果不存在則使用「未知電影」
            const title = row.title || `未知電影 #${row.rank || 'N/A'}`;
            return {
                id: row.movie_id || null, // 確保 id 不會是 undefined
                title: title,
                original_title: row.original_title || null,
                rank: row.rank || 0,
                tickets: row.tickets || 0,
                totalsales: row.totalsales || 0,
                release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
                week_start_date: row.week_start_date.toISOString().split('T')[0],
                posterUrl: row.poster_url || null,
                runtime: row.runtime || null,
                tmdb_id: row.tmdb_id || null
            };
        });
        res.json(formatted);
    }
    catch (error) {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    }
});
// 獲取最新一週的票房排行榜
router.get('/latest', async (req, res) => {
    try {
        // 獲取最新的票房日期
        const dateResult = await db_1.default.query('SELECT week_start_date FROM boxoffice ORDER BY week_start_date DESC LIMIT 1');
        if (dateResult.rows.length === 0) {
            res.status(404).json({ error: '找不到票房資料' });
            return;
        }
        const latestDate = dateResult.rows[0].week_start_date;
        // 使用 LEFT JOIN 查詢來獲取電影詳細資訊
        const result = await db_1.default.query(`
      SELECT 
        b.movie_id, b.rank, b.tickets, b.totalsales, b.week_start_date,
        m.title, m.original_title, m.poster_url, m.runtime, m.release_date, m.tmdb_id
      FROM 
        boxoffice b
      LEFT JOIN 
        movies m ON b.movie_id = m.id
      WHERE 
        b.week_start_date = $1
      ORDER BY 
        b.rank
    `, [latestDate]);
        // 格式化回應資料，增加對空值的處理
        const moviesWithDetails = result.rows.map(row => {
            // 確保標題存在，如果不存在則使用「未知電影」
            const title = row.title || `未知電影 #${row.rank || 'N/A'}`;
            return {
                id: row.movie_id || null, // 確保 id 不會是 undefined
                title: title,
                original_title: row.original_title || null,
                rank: row.rank || 0,
                tickets: row.tickets || 0,
                totalsales: row.totalsales || 0,
                release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
                week_start_date: row.week_start_date.toISOString().split('T')[0],
                posterUrl: row.poster_url || null,
                runtime: row.runtime || null,
                tmdb_id: row.tmdb_id || null
            };
        });
        res.json(moviesWithDetails);
    }
    catch (error) {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    }
});
exports.boxofficeRouter = router;

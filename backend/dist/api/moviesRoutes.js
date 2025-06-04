"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moviesRouter = void 0;
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../db"));
const router = express_1.default.Router();
// 獲取所有電影
router.get('/', async (req, res) => {
    try {
        const result = await db_1.default.query(`
      SELECT * FROM movies ORDER BY title
    `);
        res.json(result.rows);
    }
    catch (error) {
        console.error('獲取電影資料失敗:', error);
        res.status(500).json({ error: '獲取電影資料失敗' });
    }
});
// 根據電影名稱獲取電影
router.get('/name/:movieName', async (req, res) => {
    try {
        const { movieName } = req.params;
        const decodedMovieName = decodeURIComponent(movieName);
        if (!decodedMovieName) {
            res.status(400).json({ error: '請提供電影名稱' });
            return;
        }
        console.log(`後端 API 收到按名稱查詢電影的請求: ${decodedMovieName}`); // 新增日誌
        const query = `
      SELECT * FROM movies
      WHERE lower(full_title) = lower($1) OR lower(chinese_title) = lower($1) OR lower(english_title) = lower($1)
      LIMIT 1;
    `;
        const result = await db_1.default.query(query, [decodedMovieName]);
        if (result.rows.length === 0) {
            console.log(`後端 API 找不到電影: ${decodedMovieName}`); // 新增日誌
            res.status(404).json({ error: '找不到指定的電影' });
            return;
        }
        console.log(`後端 API 找到電影: ${decodedMovieName}`, result.rows[0]); // 新增日誌
        res.json(result.rows[0]);
    }
    catch (error) {
        const originalMovieNameParam = req.params.movieName;
        console.error(`按名稱獲取電影資料失敗 (${originalMovieNameParam ? decodeURIComponent(originalMovieNameParam) : 'unknown movieName'}):`, error);
        res.status(500).json({ error: '按名稱獲取電影資料失敗' });
    }
});
// 搜尋電影
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        if (!query) {
            res.status(400).json({ error: '請提供搜尋關鍵字' });
            return;
        }
        const result = await db_1.default.query(`
      SELECT * FROM movies 
      WHERE chinese_title ILIKE $1 OR english_title ILIKE $1 OR full_title ILIKE $1
      ORDER BY title
    `, [`%${query}%`]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('搜尋電影失敗:', error);
        res.status(500).json({ error: '搜尋電影失敗' });
    }
});
// 根據 TMDB ID 獲取電影
router.get('/tmdb/:tmdbId', async (req, res) => {
    try {
        const { tmdbId } = req.params;
        if (!tmdbId) {
            res.status(400).json({ error: '請提供 TMDB ID' });
            return;
        }
        const result = await db_1.default.query(`
      SELECT * FROM movies WHERE tmdb_id = $1
    `, [tmdbId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: '找不到指定的電影' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('獲取電影資料失敗:', error);
        res.status(500).json({ error: '獲取電影資料失敗' });
    }
});
// 獲取特定電影 (這個路由必須放在最後，因為它會匹配所有 /:id 格式的請求)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({ error: '請提供電影ID' });
            return;
        }
        const result = await db_1.default.query(`
      SELECT * FROM movies WHERE id = $1
    `, [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: '找不到指定的電影' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('獲取電影資料失敗:', error);
        res.status(500).json({ error: '獲取電影資料失敗' });
    }
});
exports.moviesRouter = router;

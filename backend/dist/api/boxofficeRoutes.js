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
router.get('/', (req, res) => {
    db_1.default.query('SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice ORDER BY rank')
        .then(result => {
        // 統一格式，包含 totalsales 和 release_date 欄位
        const formatted = result.rows.map(row => ({
            movie_id: row.movie_id,
            rank: row.rank,
            tickets: row.tickets,
            totalsales: row.totalsales,
            release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
            week_start_date: row.week_start_date ? row.week_start_date.toISOString().split('T')[0] : null
        }));
        res.json(formatted);
    })
        .catch(error => {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    });
});
// 獲取特定日期的票房資料
router.get('/date/:date', (req, res) => {
    const { date } = req.params;
    if (!date) {
        res.status(400).json({ error: '請提供日期' });
        return;
    }
    db_1.default.query('SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice WHERE week_start_date = $1 ORDER BY rank', [date])
        .then(result => {
        const formatted = result.rows.map(row => ({
            movie_id: row.movie_id,
            rank: row.rank,
            tickets: row.tickets,
            totalsales: row.totalsales,
            release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
            week_start_date: row.week_start_date ? row.week_start_date.toISOString().split('T')[0] : null
        }));
        res.json(formatted);
    })
        .catch(error => {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    });
});
// 獲取特定電影的票房資料
router.get('/movie/:movieName', (req, res) => {
    const { movieName } = req.params;
    if (!movieName) {
        res.status(400).json({ error: '請提供電影名稱' });
        return;
    }
    const decodedMovieName = decodeURIComponent(movieName);
    db_1.default.query('SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice WHERE movie_id = $1 ORDER BY week_start_date DESC', [decodedMovieName])
        .then(result => {
        if (result.rows.length === 0) {
            res.status(404).json({ error: '找不到指定電影的票房資料' });
            return;
        }
        const formatted = result.rows.map(row => ({
            movie_id: row.movie_id,
            rank: row.rank,
            tickets: row.tickets,
            totalsales: row.totalsales,
            release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
            week_start_date: row.week_start_date ? row.week_start_date.toISOString().split('T')[0] : null
        }));
        res.json(formatted);
    })
        .catch(error => {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    });
});
// 獲取最新一週的票房排行榜
router.get('/latest', (req, res) => {
    // 獲取最新的票房日期
    db_1.default.query('SELECT week_start_date FROM boxoffice ORDER BY week_start_date DESC LIMIT 1')
        .then(dateResult => {
        if (dateResult.rows.length === 0) {
            res.status(404).json({ error: '找不到票房資料' });
            return null; // 返回 null 以中斷連鎖
        }
        const latestDate = dateResult.rows[0].week_start_date;
        // 獲取該日期的票房排行榜
        return db_1.default.query('SELECT movie_id, rank, tickets, totalsales, release_date, week_start_date FROM boxoffice WHERE week_start_date = $1 ORDER BY rank', [latestDate]);
    })
        .then(result => {
        if (result) {
            const formatted = result.rows.map(row => ({
                movie_id: row.movie_id,
                rank: row.rank,
                tickets: row.tickets,
                totalsales: row.totalsales,
                release_date: row.release_date ? row.release_date.toISOString().split('T')[0] : null,
                week_start_date: row.week_start_date ? row.week_start_date.toISOString().split('T')[0] : null
            }));
            res.json(formatted);
        }
    })
        .catch(error => {
        console.error('獲取票房資料失敗:', error);
        res.status(500).json({ error: '獲取票房資料失敗' });
    });
});
exports.boxofficeRouter = router;

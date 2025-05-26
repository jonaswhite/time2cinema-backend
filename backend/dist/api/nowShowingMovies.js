"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNowShowingMovies = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../db"));
// 快取目錄設定
const CACHE_DIR = process.env.NODE_ENV === 'production'
    ? '/tmp/time2cinema-cache' // 使用專屬目錄避免權限問題
    : path_1.default.join(__dirname, '../../cache');
// 快取檔案路徑
const CACHE_FILE = path_1.default.join(CACHE_DIR, 'now-showing-movies.json');
const CACHE_DURATION = 1000 * 60 * 30; // 30 分鐘快取
// 確保快取目錄存在
const ensureCacheDir = () => {
    try {
        if (!fs_extra_1.default.existsSync(CACHE_DIR)) {
            fs_extra_1.default.mkdirSync(CACHE_DIR, {
                recursive: true,
                mode: 0o755 // 明確設定權限
            });
            console.log(`已建立快取目錄: ${CACHE_DIR}`);
        }
        return true;
    }
    catch (error) {
        console.error('無法創建快取目錄:', error);
        return false;
    }
};
// 初始化快取目錄
ensureCacheDir();
// 檢查快取是否有效
const isCacheValid = async () => {
    try {
        const exists = await fs_extra_1.default.pathExists(CACHE_FILE);
        if (!exists)
            return false;
        const stats = await fs_extra_1.default.stat(CACHE_FILE);
        const cacheAge = Date.now() - stats.mtimeMs;
        return cacheAge < CACHE_DURATION;
    }
    catch (error) {
        console.error('檢查快取時出錯:', error);
        return false;
    }
};
// 獲取所有正在上映的電影（有場次的電影）
const getNowShowingMovies = async (req, res, next) => {
    const forceRefresh = req.query.forceRefresh === 'true';
    try {
        console.log('開始獲取上映中電影資料，forceRefresh:', forceRefresh);
        // 檢查快取是否存在且未過期
        if (!forceRefresh && await isCacheValid()) {
            try {
                const cache = await fs_extra_1.default.readJSON(CACHE_FILE);
                console.log('使用快取資料');
                res.json(cache);
                return;
            }
            catch (error) {
                console.error('讀取快取檔案時出錯:', error);
                // 繼續執行資料庫查詢
            }
        }
        console.log('重新生成上映中電影資料');
        // 獲取當前日期（台灣時間）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log('準備查詢資料庫...');
        let result;
        const client = await db_1.default.connect();
        try {
            result = await client.query(`SELECT DISTINCT 
          m.id,
          COALESCE(m.chinese_title, m.english_title, m.full_title, '未知電影') as title,
          m.english_title as original_title,
          m.release_date,
          m.runtime,
          m.tmdb_id,
          m.full_title,
          m.chinese_title,
          m.english_title,
          CASE 
            WHEN m.poster_url IS NULL OR m.poster_url = '' 
            THEN 'https://via.placeholder.com/500x750?text=No+Poster+Available'
            WHEN m.poster_url LIKE 'http%' 
            THEN m.poster_url
            ELSE CONCAT('https://image.tmdb.org/t/p/w500', m.poster_url)
          END as poster_url
        FROM movies m
        INNER JOIN showtimes s ON m.id = s.movie_id
        WHERE s.date >= $1
        GROUP BY m.id, m.chinese_title, m.english_title, m.full_title, m.release_date, m.runtime, m.tmdb_id, m.poster_url
        ORDER BY m.release_date DESC, m.chinese_title, m.english_title`, [today]);
            console.log(`成功查詢到 ${result.rows.length} 部電影`);
            // 處理查詢結果
            const movies = result.rows.map((row) => {
                // 如果沒有海報 URL，使用預設圖片
                let posterUrl = row.poster_url;
                if (!posterUrl || posterUrl === '') {
                    posterUrl = 'https://via.placeholder.com/500x750?text=No+Poster+Available';
                }
                else if (!posterUrl.startsWith('http')) {
                    // 如果是相對路徑，添加基礎 URL
                    posterUrl = `https://image.tmdb.org/t/p/w500${posterUrl}`;
                }
                return {
                    id: row.id,
                    title: row.title || '未知電影',
                    original_title: row.original_title,
                    release_date: row.release_date,
                    poster_url: posterUrl,
                    runtime: row.runtime,
                    tmdb_id: row.tmdb_id,
                    full_title: row.full_title,
                    chinese_title: row.chinese_title || '',
                    english_title: row.english_title
                };
            });
            console.log(`成功查詢到 ${result.rows.length} 部電影`);
        }
        catch (dbError) {
            console.error('資料庫查詢錯誤:', dbError);
            throw new Error('查詢電影資料時發生錯誤');
        }
        finally {
            client.release();
        }
        // 處理電影資料
        const movies = result.rows.map(movie => {
            // 確保有有效的海報 URL
            let posterUrl = movie.poster_url;
            if (!posterUrl || posterUrl === '') {
                // 如果沒有海報，使用預設圖片，並在 URL 中包含電影名稱作為提示
                const movieName = encodeURIComponent(movie.chinese_title || movie.english_title || 'No+Poster');
                posterUrl = `https://via.placeholder.com/500x750?text=${movieName}`;
                // 記錄缺少海報的電影（僅在開發環境）
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`電影 ${movie.chinese_title || movie.english_title} 缺少海報，使用預設圖片`);
                }
            }
            else if (posterUrl.startsWith('/')) {
                // 如果是相對路徑，添加 atmovies 基礎 URL
                posterUrl = `https://www.atmovies.com.tw${posterUrl}`;
            }
            // 如果 poster_url 已經是完整 URL 或 atmovies 的 URL，則保持不變
            return {
                ...movie,
                // 確保所有必要的欄位都有預設值
                title: movie.chinese_title || movie.english_title || '未知電影',
                original_title: movie.english_title || movie.chinese_title || '未知電影',
                poster_url: posterUrl,
                // 確保陣列類型的欄位至少是空陣列
                genres: movie.genres || [],
                production_companies: movie.production_companies || [],
                production_countries: movie.production_countries || [],
                spoken_languages: movie.spoken_languages || []
            };
        });
        // 將結果寫入快取
        try {
            await fs_extra_1.default.writeJSON(CACHE_FILE, movies);
            console.log('已更新上映中電影快取');
        }
        catch (error) {
            console.error('寫入快取檔案時出錯:', error);
        }
        res.json(movies);
    }
    catch (error) {
        console.error('獲取上映中電影時出錯:', error);
        next(error);
    }
};
exports.getNowShowingMovies = getNowShowingMovies;
exports.default = exports.getNowShowingMovies;

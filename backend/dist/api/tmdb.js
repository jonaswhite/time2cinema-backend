"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchMovieFromTMDB = searchMovieFromTMDB;
exports.enrichMoviesWithTMDBData = enrichMoviesWithTMDBData;
exports.getNotFoundMovies = getNotFoundMovies;
exports.getMoviesNotFoundOnTMDB = getMoviesNotFoundOnTMDB;
exports.cleanupNotFoundMovies = cleanupNotFoundMovies;
exports.smartSearchMoviePoster = smartSearchMoviePoster;
const axios_1 = __importDefault(require("axios"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const dayjs_1 = __importDefault(require("dayjs"));
const tmdbCache_1 = require("../db/tmdbCache");
const movieMapping_1 = require("../db/movieMapping");
const db_1 = __importDefault(require("../db"));
// TMDB API 配置
const TMDB_API_KEY = 'd4c9092656c3aa3cfa5761fbf093f7d0';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
// 快取目錄
const CACHE_DIR = path_1.default.resolve(__dirname, '../../cache');
const POSTER_CACHE_DIR = path_1.default.resolve(CACHE_DIR, 'posters');
const NOT_FOUND_CACHE_FILE = path_1.default.resolve(POSTER_CACHE_DIR, 'not_found_movies.json');
// 確保目錄存在
fs_extra_1.default.ensureDirSync(CACHE_DIR);
fs_extra_1.default.ensureDirSync(POSTER_CACHE_DIR);
/**
 * 使用 TMDB API 搜索電影
 */
async function searchMovieFromTMDB(title, releaseDate) {
    try {
        // 先從資料庫快取中查詢
        const cachedMovie = await (0, tmdbCache_1.getMovieFromCache)(title);
        if (cachedMovie) {
            console.log(`從資料庫快取返回 ${title} 的 TMDB 資訊`);
            return cachedMovie;
        }
        // 如果資料庫中沒有，則檢查文件快取
        const safeTitle = title.replace(/[\/:*?"<>|]/g, '_');
        const cacheFile = path_1.default.join(POSTER_CACHE_DIR, `${safeTitle}.json`);
        if (await fs_extra_1.default.pathExists(cacheFile)) {
            const cachedData = await fs_extra_1.default.readJSON(cacheFile);
            console.log(`從文件快取返回 ${title} 的 TMDB 資訊`);
            // 將文件快取中的資料保存到資料庫
            await (0, tmdbCache_1.saveMovieToCache)(cachedData);
            return cachedData;
        }
        // 檢查是否在未找到列表中
        const notFoundMovies = await getNotFoundMovies();
        const isInNotFoundList = notFoundMovies.some(m => m.title === title &&
            (!releaseDate || m.releaseDate === releaseDate) &&
            (0, dayjs_1.default)(m.lastChecked).add(7, 'day').isAfter((0, dayjs_1.default)()));
        if (isInNotFoundList) {
            console.log(`${title} 在未找到列表中且檢查日期在7天內，跳過搜索`);
            return null;
        }
        // 準備搜索參數
        let year = '';
        if (releaseDate) {
            const match = releaseDate.match(/\\d{4}/);
            if (match) {
                year = match[0];
            }
        }
        // 先檢查是否有手動映射
        const mappedTmdbId = (0, movieMapping_1.getTmdbIdByTitle)(title);
        let movieData;
        if (mappedTmdbId) {
            console.log(`使用手動映射獲取 ${title} 的 TMDB ID: ${mappedTmdbId}`);
            // 直接使用 ID 獲取電影詳細資訊
            try {
                const detailUrl = `${TMDB_BASE_URL}/movie/${mappedTmdbId}`;
                const { data: movieDetail } = await axios_1.default.get(detailUrl, {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: 'zh-TW'
                    }
                });
                movieData = { results: [movieDetail] };
            }
            catch (detailError) {
                console.error(`無法使用映射的 ID 獲取 ${title} 的詳細資訊:`, detailError);
                // 如果映射失敗，回退到正常搜索
                movieData = null;
            }
        }
        // 如果沒有映射或映射失敗，使用正常搜索
        if (!movieData) {
            // 搜索電影
            const searchUrl = `${TMDB_BASE_URL}/search/movie`;
            const { data } = await axios_1.default.get(searchUrl, {
                params: {
                    api_key: TMDB_API_KEY,
                    query: title,
                    year: year || undefined,
                    language: 'zh-TW'
                }
            });
            movieData = data;
        }
        if (movieData.results && movieData.results.length > 0) {
            // 取得最相關的結果
            const movie = movieData.results[0];
            // 如果有電影 ID，再取得詳細資訊
            if (movie.id) {
                try {
                    const detailUrl = `${TMDB_BASE_URL}/movie/${movie.id}`;
                    const { data: movieDetail } = await axios_1.default.get(detailUrl, {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: 'zh-TW'
                        }
                    });
                    // 合併搜索結果和詳細資訊
                    const result = {
                        ...movie,
                        ...movieDetail,
                        fullPosterPath: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null,
                        fullBackdropPath: movie.backdrop_path ? `${TMDB_IMAGE_BASE_URL}${movie.backdrop_path}` : null
                    };
                    // 寫入文件快取
                    await fs_extra_1.default.writeJSON(cacheFile, result, { spaces: 2 });
                    console.log(`已將 ${title} 的 TMDB 資訊寫入文件快取`);
                    // 同時寫入資料庫快取
                    await (0, tmdbCache_1.saveMovieToCache)(result);
                    console.log(`已將 ${title} 的 TMDB 資訊寫入資料庫快取`);
                    return result;
                }
                catch (detailError) {
                    console.error(`無法獲取 ${title} 的詳細資訊:`, detailError);
                    // 如果取得詳細資訊失敗，仍然返回搜索結果
                    await fs_extra_1.default.writeJSON(cacheFile, movie, { spaces: 2 });
                    await (0, tmdbCache_1.saveMovieToCache)(movie);
                    return movie;
                }
            }
            // 寫入快取
            await fs_extra_1.default.writeJSON(cacheFile, movie, { spaces: 2 });
            await (0, tmdbCache_1.saveMovieToCache)(movie);
            return movie;
        }
        // 沒有搜索結果，添加到未找到列表
        console.log(`TMDB 上找不到 ${title} 的資訊`);
        await addToNotFoundList({
            title,
            releaseDate,
            lastChecked: (0, dayjs_1.default)().format('YYYY-MM-DD')
        });
        return null;
    }
    catch (error) {
        console.error(`搜索 ${title} 的 TMDB 資訊失敗:`, error);
        return null;
    }
}
/**
 * 為票房電影加入 TMDB 資訊
 */
async function enrichMoviesWithTMDBData(movies) {
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
    try {
        // 使用 Promise.allSettled 而非 Promise.all，以避免單個電影的錯誤導致整個處理失敗
        const results = await Promise.allSettled(movies.map(async (movie) => {
            try {
                const tmdbData = await searchMovieFromTMDB(movie.title, movie.releaseDate);
                // 只返回需要的欄位
                return {
                    title: movie.title,
                    releaseDate: movie.releaseDate,
                    totalGross: movie.totalGross,
                    totalSales: movie.totalSales,
                    posterUrl: tmdbData && tmdbData.poster_path
                        ? `${TMDB_IMAGE_BASE_URL}${tmdbData.poster_path}`
                        : null
                };
            }
            catch (error) {
                console.error(`為電影 ${movie.title} 加入 TMDB 資訊時發生錯誤:`, error);
                // 即使發生錯誤，仍然返回基本電影資訊，但沒有海報
                return {
                    title: movie.title,
                    releaseDate: movie.releaseDate,
                    totalGross: movie.totalGross,
                    totalSales: movie.totalSales,
                    posterUrl: null
                };
            }
        }));
        // 處理 Promise.allSettled 的結果
        const enrichedMovies = results.map(result => {
            if (result.status === 'fulfilled' && result.value && result.value.title) {
                return result.value;
            }
            else if (result.status === 'fulfilled' && result.value) {
                // 確保有 title 屬性
                if (!result.value.title) {
                    console.error('電影物件缺少 title 屬性:', result.value);
                    result.value.title = '未知電影';
                }
                return result.value;
            }
            else if (result.status === 'rejected') {
                console.error('處理電影時發生錯誤:', result.reason);
                // 如果有錯誤，返回一個空對象，後續會過濾掉
                return null;
            }
            else {
                // 其他意外情況
                console.error('處理電影時發生未知錯誤');
                return null;
            }
        }).filter(movie => movie !== null); // 過濾掉空值
        return enrichedMovies;
    }
    catch (error) {
        console.error('處理電影海報時發生全局錯誤:', error);
        // 如果發生全局錯誤，返回原始電影列表，但沒有海報
        return movies.map(movie => ({
            title: movie.title,
            releaseDate: movie.releaseDate,
            totalGross: movie.totalGross,
            totalSales: movie.totalSales,
            posterUrl: null
        }));
    }
}
/**
 * 獲取未找到的電影列表
 */
async function getNotFoundMovies() {
    try {
        if (await fs_extra_1.default.pathExists(NOT_FOUND_CACHE_FILE)) {
            return await fs_extra_1.default.readJSON(NOT_FOUND_CACHE_FILE);
        }
        return [];
    }
    catch (error) {
        console.error('讀取未找到電影列表失敗:', error);
        return [];
    }
}
/**
 * 添加電影到未找到列表
 */
async function addToNotFoundList(movie) {
    try {
        const notFoundMovies = await getNotFoundMovies();
        // 檢查是否已存在
        const existingIndex = notFoundMovies.findIndex(m => m.title === movie.title &&
            (!movie.releaseDate || m.releaseDate === movie.releaseDate));
        if (existingIndex !== -1) {
            // 更新現有記錄
            notFoundMovies[existingIndex] = {
                ...notFoundMovies[existingIndex],
                lastChecked: movie.lastChecked
            };
        }
        else {
            // 添加新記錄
            notFoundMovies.push(movie);
        }
        // 寫入檔案
        await fs_extra_1.default.writeJSON(NOT_FOUND_CACHE_FILE, notFoundMovies, { spaces: 2 });
    }
    catch (error) {
        console.error('添加電影到未找到列表失敗:', error);
    }
}
/**
 * 獲取 TMDB 上找不到的電影列表
 */
async function getMoviesNotFoundOnTMDB() {
    return await getNotFoundMovies();
}
/**
 * 清除超過指定天數的未找到記錄
 */
async function cleanupNotFoundMovies(daysToKeep = 7) {
    try {
        const notFoundMovies = await getNotFoundMovies();
        const cutoffDate = (0, dayjs_1.default)().subtract(daysToKeep, 'day');
        const filteredMovies = notFoundMovies.filter(movie => (0, dayjs_1.default)(movie.lastChecked).isAfter(cutoffDate));
        if (filteredMovies.length !== notFoundMovies.length) {
            console.log(`從未找到列表中移除了 ${notFoundMovies.length - filteredMovies.length} 部電影`);
            await fs_extra_1.default.writeJSON(NOT_FOUND_CACHE_FILE, filteredMovies, { spaces: 2 });
        }
    }
    catch (error) {
        console.error('清理未找到電影列表失敗:', error);
    }
}
/**
 * 智能搜索電影海報
 * 使用多種方法嘗試獲取電影海報
 */
async function smartSearchMoviePoster(movieTitle, releaseDate) {
    console.log(`開始智能搜索電影 "${movieTitle}" 的海報`);
    try {
        // 方法 1: 直接使用原始標題搜索
        let tmdbMovie = await searchMovieFromTMDB(movieTitle, releaseDate);
        if (tmdbMovie?.poster_path) {
            console.log(`使用原始標題 "${movieTitle}" 找到海報`);
            return `${TMDB_IMAGE_BASE_URL}${tmdbMovie.poster_path}`;
        }
        // 方法 2: 檢查中英文對照表
        // 先查詢資料庫中是否有這部電影的英文名稱
        const movieMappingQuery = `
      SELECT english_title FROM movie_title_mapping WHERE chinese_title = $1
    `;
        try {
            const mappingResult = await db_1.default.query(movieMappingQuery, [movieTitle]);
            if (mappingResult.rows.length > 0) {
                const englishTitle = mappingResult.rows[0].english_title;
                console.log(`從對照表找到 "${movieTitle}" 的英文名稱: "${englishTitle}"`);
                tmdbMovie = await searchMovieFromTMDB(englishTitle, releaseDate);
                if (tmdbMovie?.poster_path) {
                    console.log(`使用英文標題 "${englishTitle}" 找到海報`);
                    return `${TMDB_IMAGE_BASE_URL}${tmdbMovie.poster_path}`;
                }
            }
        }
        catch (dbError) {
            console.error(`查詢電影對照表時出錯:`, dbError);
            // 繼續嘗試其他方法
        }
        // 方法 3: 逐步縮短標題搜索
        const words = movieTitle.split(/\s+|(?=[\u4e00-\u9fa5])/g).filter(w => w.trim().length > 0);
        if (words.length > 1) {
            // 從最長的子字符串開始，逐步縮短
            for (let length = words.length - 1; length >= 1; length--) {
                const shortenedTitle = words.slice(0, length).join('');
                console.log(`嘗試縮短標題: "${shortenedTitle}"`);
                tmdbMovie = await searchMovieFromTMDB(shortenedTitle, releaseDate);
                if (tmdbMovie?.poster_path) {
                    console.log(`使用縮短標題 "${shortenedTitle}" 找到海報`);
                    return `${TMDB_IMAGE_BASE_URL}${tmdbMovie.poster_path}`;
                }
            }
        }
        // 方法 4: 使用模糊匹配
        // 這裡我們可以使用 TMDB API 的搜索功能，它本身就有一定的模糊匹配能力
        const searchUrl = `${TMDB_BASE_URL}/search/movie`;
        const { data: searchResults } = await axios_1.default.get(searchUrl, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'zh-TW',
                query: movieTitle,
                year: releaseDate ? releaseDate.substring(0, 4) : undefined
            }
        });
        if (searchResults.results && searchResults.results.length > 0) {
            // 找到最可能的匹配
            const bestMatch = searchResults.results[0];
            console.log(`使用模糊匹配找到可能的電影: "${bestMatch.title}"`);
            if (bestMatch.poster_path) {
                return `${TMDB_IMAGE_BASE_URL}${bestMatch.poster_path}`;
            }
        }
        // 如果所有方法都失敗，返回 null
        console.log(`無法找到電影 "${movieTitle}" 的海報`);
        return null;
    }
    catch (error) {
        console.error(`智能搜索電影 "${movieTitle}" 海報時出錯:`, error);
        return null;
    }
}

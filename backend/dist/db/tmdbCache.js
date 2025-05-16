"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTMDBCacheTable = ensureTMDBCacheTable;
exports.migrateCacheToDatabase = migrateCacheToDatabase;
exports.getMovieFromCache = getMovieFromCache;
exports.saveMovieToCache = saveMovieToCache;
const db_1 = __importDefault(require("../db"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
// 確保 TMDB 電影快取表存在
async function ensureTMDBCacheTable() {
    try {
        // 檢查表是否存在
        const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'tmdb_movie_cache'
      );
    `;
        const tableExists = await db_1.default.query(checkTableQuery);
        if (!tableExists.rows[0].exists) {
            console.log('創建 TMDB 電影快取表...');
            // 創建表
            const createTableQuery = `
        CREATE TABLE tmdb_movie_cache (
          id SERIAL PRIMARY KEY,
          tmdb_id INTEGER,
          title TEXT NOT NULL,
          original_title TEXT,
          overview TEXT,
          poster_path TEXT,
          backdrop_path TEXT,
          release_date TEXT,
          runtime INTEGER,
          vote_average REAL,
          genres TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX idx_tmdb_movie_cache_title ON tmdb_movie_cache(title);
      `;
            await db_1.default.query(createTableQuery);
            console.log('TMDB 電影快取表創建成功');
        }
        return true;
    }
    catch (error) {
        console.error('確保 TMDB 電影快取表存在時發生錯誤:', error);
        return false;
    }
}
// 從文件快取中遷移數據到資料庫
async function migrateCacheToDatabase() {
    try {
        // 確保表存在
        await ensureTMDBCacheTable();
        // 快取目錄
        const CACHE_DIR = path_1.default.resolve(__dirname, '../../cache');
        const POSTER_CACHE_DIR = path_1.default.resolve(CACHE_DIR, 'posters');
        // 確保目錄存在
        if (!fs_extra_1.default.existsSync(POSTER_CACHE_DIR)) {
            console.log('快取目錄不存在，跳過遷移');
            return;
        }
        // 讀取所有 JSON 文件
        const files = fs_extra_1.default.readdirSync(POSTER_CACHE_DIR).filter(file => file.endsWith('.json') && !file.includes('not_found_movies'));
        console.log(`找到 ${files.length} 個電影快取文件`);
        // 遍歷文件並導入到資料庫
        for (const file of files) {
            try {
                const filePath = path_1.default.join(POSTER_CACHE_DIR, file);
                const movieData = await fs_extra_1.default.readJSON(filePath);
                if (!movieData.title) {
                    console.log(`跳過無效的電影數據: ${file}`);
                    continue;
                }
                // 檢查電影是否已存在於資料庫
                const checkQuery = `
          SELECT id FROM tmdb_movie_cache WHERE title = $1
        `;
                const existingMovie = await db_1.default.query(checkQuery, [movieData.title]);
                if (existingMovie.rows.length > 0) {
                    // 更新現有記錄
                    const updateQuery = `
            UPDATE tmdb_movie_cache 
            SET 
              tmdb_id = $1,
              original_title = $2,
              overview = $3,
              poster_path = $4,
              backdrop_path = $5,
              release_date = $6,
              runtime = $7,
              vote_average = $8,
              genres = $9,
              updated_at = CURRENT_TIMESTAMP
            WHERE title = $10
          `;
                    await db_1.default.query(updateQuery, [
                        movieData.id,
                        movieData.original_title,
                        movieData.overview,
                        movieData.poster_path,
                        movieData.backdrop_path,
                        movieData.release_date,
                        movieData.runtime,
                        movieData.vote_average,
                        JSON.stringify(movieData.genres || []),
                        movieData.title
                    ]);
                    console.log(`更新電影快取: ${movieData.title}`);
                }
                else {
                    // 插入新記錄
                    const insertQuery = `
            INSERT INTO tmdb_movie_cache (
              tmdb_id, title, original_title, overview, poster_path, 
              backdrop_path, release_date, runtime, vote_average, genres
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `;
                    await db_1.default.query(insertQuery, [
                        movieData.id,
                        movieData.title,
                        movieData.original_title,
                        movieData.overview,
                        movieData.poster_path,
                        movieData.backdrop_path,
                        movieData.release_date,
                        movieData.runtime,
                        movieData.vote_average,
                        JSON.stringify(movieData.genres || [])
                    ]);
                    console.log(`導入電影快取: ${movieData.title}`);
                }
            }
            catch (fileError) {
                console.error(`處理文件 ${file} 時發生錯誤:`, fileError);
            }
        }
        console.log('電影快取遷移完成');
    }
    catch (error) {
        console.error('遷移快取到資料庫時發生錯誤:', error);
    }
}
// 從資料庫獲取電影信息
async function getMovieFromCache(title) {
    try {
        const query = `
      SELECT * FROM tmdb_movie_cache WHERE title = $1
    `;
        const result = await db_1.default.query(query, [title]);
        if (result.rows.length > 0) {
            const movie = result.rows[0];
            // 轉換為 TMDBMovie 格式
            return {
                id: movie.tmdb_id,
                title: movie.title,
                original_title: movie.original_title,
                overview: movie.overview,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                release_date: movie.release_date,
                runtime: movie.runtime,
                vote_average: movie.vote_average,
                genres: movie.genres ? JSON.parse(movie.genres) : [],
                fullPosterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
                fullBackdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : undefined
            };
        }
        return null;
    }
    catch (error) {
        console.error(`從快取獲取電影 ${title} 時發生錯誤:`, error);
        return null;
    }
}
// 將電影信息保存到資料庫
async function saveMovieToCache(movie) {
    try {
        // 檢查電影是否已存在
        const checkQuery = `
      SELECT id FROM tmdb_movie_cache WHERE title = $1
    `;
        const existingMovie = await db_1.default.query(checkQuery, [movie.title]);
        if (existingMovie.rows.length > 0) {
            // 更新現有記錄
            const updateQuery = `
        UPDATE tmdb_movie_cache 
        SET 
          tmdb_id = $1,
          original_title = $2,
          overview = $3,
          poster_path = $4,
          backdrop_path = $5,
          release_date = $6,
          runtime = $7,
          vote_average = $8,
          genres = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE title = $10
      `;
            await db_1.default.query(updateQuery, [
                movie.id,
                movie.original_title,
                movie.overview,
                movie.poster_path,
                movie.backdrop_path,
                movie.release_date,
                movie.runtime,
                movie.vote_average,
                JSON.stringify(movie.genres || []),
                movie.title
            ]);
        }
        else {
            // 插入新記錄
            const insertQuery = `
        INSERT INTO tmdb_movie_cache (
          tmdb_id, title, original_title, overview, poster_path, 
          backdrop_path, release_date, runtime, vote_average, genres
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
            await db_1.default.query(insertQuery, [
                movie.id,
                movie.title,
                movie.original_title,
                movie.overview,
                movie.poster_path,
                movie.backdrop_path,
                movie.release_date,
                movie.runtime,
                movie.vote_average,
                JSON.stringify(movie.genres || [])
            ]);
        }
        return true;
    }
    catch (error) {
        console.error(`保存電影 ${movie.title} 到快取時發生錯誤:`, error);
        return false;
    }
}

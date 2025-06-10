import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// 從專案根目錄的 .env 檔案載入環境變數
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { Pool } from 'pg';

// 資料庫配置 (從環境變數讀取)
if (!process.env.DATABASE_URL) {
  console.error("錯誤：DATABASE_URL 環境變數未設定。");
  process.exit(1);
}

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  // Supabase 通常需要 SSL。rejectUnauthorized: false 在本地開發或特定情況下使用，
  // 當配合 NODE_TLS_REJECT_UNAUTHORIZED=0 時，此設定可能多餘，但保留以明確。
  // 如果您的 Supabase 連線字串已包含 sslmode=require，則 pg 套件會自動處理。
  // 為求一致性與明確，若 DATABASE_URL 中未指定 sslmode，可考慮在此處強制 SSL。
  // 不過，Supabase 提供的標準連線字串通常已處理好 SSL。
  // 暫時保留 rejectUnauthorized: false 以符合先前腳本的行為，並依賴 NODE_TLS_REJECT_UNAUTHORIZED=0。
  ssl: { rejectUnauthorized: false } 
};

// 創建資料庫連接池
const pool = new Pool(dbConfig);

// TMDB API 配置 (從環境變數讀取，若無則使用預設值)
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'd4c9092656c3aa3cfa5761fbf093f7d0';
if (TMDB_API_KEY === 'd4c9092656c3aa3cfa5761fbf093f7d0' && !process.env.TMDB_API_KEY) {
  console.warn("警告：TMDB_API_KEY 環境變數未設定，將使用程式碼中的預設值。建議在 .env 檔案中設定。");
}
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

// 介面定義
interface TMDBSearchResult {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string;
  vote_average: number;
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string;
  runtime: number | null;
  vote_average: number;
  genres: Array<{ id: number; name: string }>;
}

// 從 TMDB 搜索電影
async function searchMovieFromTMDB(chineseTitle: string | null, englishTitle: string | null): Promise<TMDBSearchResult | null> {
  try {
    // Attempt Chinese search if chineseTitle exists
    if (chineseTitle) {

      const response = await axios.get(`${TMDB_API_BASE_URL}/search/movie`, {
        params: {
          api_key: TMDB_API_KEY,
          query: chineseTitle,
          language: 'zh-TW',
          include_adult: true
        }
      });
      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0];
      }
    }

    // Attempt English search if englishTitle exists (and Chinese search didn't return)
    if (englishTitle) {

      const enResponse = await axios.get(`${TMDB_API_BASE_URL}/search/movie`, {
        params: {
          api_key: TMDB_API_KEY,
          query: englishTitle,
          language: 'en-US',
          include_adult: true
        }
      });
      if (enResponse.data.results && enResponse.data.results.length > 0) {
        return enResponse.data.results[0];
      }
    }

    // If neither search yielded results
    return null;
  } catch (error) {
    console.error(`搜索電影 ${chineseTitle || ''} / ${englishTitle || ''} 時發生錯誤:`, error);
    return null;
  }
}

// 獲取電影詳細資訊
async function getMovieDetails(movieId: number): Promise<TMDBMovieDetails | null> {
  try {
    const response = await axios.get(`${TMDB_API_BASE_URL}/movie/${movieId}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'zh-TW'
      }
    });

    return response.data;
  } catch (error) {
    console.error(`獲取電影詳細資訊時發生錯誤 (ID: ${movieId}):`, error);
    return null;
  }
}

// 檢查 TMDB ID 是否已經被使用
async function checkTmdbIdExists(tmdbId: number): Promise<{exists: boolean, movieId?: number, movieTitle?: string}> {
  try {
    const query = `
      SELECT id, chinese_title FROM movies WHERE tmdb_id = $1
    `;
    const result = await pool.query(query, [tmdbId]);
    
    if (result.rows.length > 0) {
      return {
        exists: true,
        movieId: result.rows[0].id,
        movieTitle: result.rows[0].chinese_title
      };
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`檢查 TMDB ID ${tmdbId} 時發生錯誤:`, error);
    // 在這種情況下，假設它不存在，以允許潛在的更新，但記錄錯誤
    return { exists: false }; 
  }
}

// 更新電影資訊
async function updateMovieInfo(movieId: number, tmdbMovie: TMDBMovieDetails): Promise<void> {
  try {
    // 檢查 TMDB ID 是否已經被使用
    const existingMovie = await checkTmdbIdExists(tmdbMovie.id);
    
    if (existingMovie.exists && existingMovie.movieId !== movieId) {
      console.warn(`TMDB ID ${tmdbMovie.id} (for movie ${tmdbMovie.title}, local ID ${movieId}) is already used by movie '${existingMovie.movieTitle}' (local ID ${existingMovie.movieId}). Skipping update to avoid conflict.`);
      return; // 如果 TMDB ID 已被其他電影使用，則不進行任何更新，避免數據污染
    }

    // 準備要更新的欄位
    const updates = [];
    const values = [];
    let valueCount = 1;

    updates.push(`tmdb_id = $${valueCount++}`);
    values.push(tmdbMovie.id);

    if (tmdbMovie.poster_path) {
      updates.push(`poster_url = $${valueCount++}`);
      values.push(`https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}`);
    } else {
      // 如果 TMDB 沒有海報，可以選擇保留現有海報或設為 null
      // updates.push(`poster_url = NULL`); 
    }

    if (tmdbMovie.runtime) {
      updates.push(`runtime = $${valueCount++}`);
      values.push(tmdbMovie.runtime);
    }

    // release_date 以我們自己的資料為準，不從 TMDB 更新
    // if (tmdbMovie.release_date) {
    //   updates.push(`release_date = $${valueCount++}`);
    //   values.push(tmdbMovie.release_date);
    // }
    
    // 考慮更新 english_title (如果我們資料庫中為空，且 TMDB 的 original_title 或 title 有值)
    // TMDB 的 title 可能是當地語言的標題，original_title 通常是原始語言標題
    // 這裡我們用 tmdbMovie.original_title 作為英文標題的候選，如果它看起來像英文
    // 也可以用 tmdbMovie.title，如果 language 參數設為 en-US 時獲取
    // 暫時不處理 english_title 的更新，以保持邏輯簡單，除非有明確需求

    if (updates.length === 0) {
      // console.log(`沒有需要更新的資訊 (ID: ${movieId}, TMDB ID: ${tmdbMovie.id}, 標題: ${tmdbMovie.title})`);
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const updateQuery = `
      UPDATE movies 
      SET ${updates.join(', ')}
      WHERE id = $${valueCount++}
    `;
    values.push(movieId);

    await pool.query(updateQuery, values);

    // console.log(`更新電影成功 (ID: ${movieId}, TMDB ID: ${tmdbMovie.id}, 標題: ${tmdbMovie.title})`);
  } catch (error) {
    console.error(`更新電影資訊時發生錯誤 (ID: ${movieId}):`, error);
  }
}

// 主函數：更新缺少資訊的電影
async function updateMissingMovieData(): Promise<void> {
  try {
    // 獲取所有缺少 TMDB ID 的電影
    const result = await pool.query(`
      SELECT id, chinese_title, english_title, full_title FROM movies 
      WHERE tmdb_id IS NULL AND (last_tmdb_check_at IS NULL OR last_tmdb_check_at < NOW() - interval '7 days')
      ORDER BY id
    `);

    console.log(`找到 ${result.rows.length} 部電影缺少 TMDB ID，開始處理...`);

    // 遍歷每部電影
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (const movie of result.rows) {
      processedCount++;
      const displayTitle = movie.chinese_title || movie.english_title || movie.full_title || '未知標題';

      // 從 TMDB 搜索電影
      const searchResult = await searchMovieFromTMDB(movie.chinese_title, movie.english_title);

      if (searchResult) {
        // 獲取電影詳細資訊
        const movieDetails = await getMovieDetails(searchResult.id);

        if (movieDetails) {
          // 更新電影資訊
          await updateMovieInfo(movie.id, movieDetails);
          successCount++;
        } else {
          console.warn(`  獲取電影 '${displayTitle}' (TMDB ID: ${searchResult.id}) 的詳細資訊失敗`);
          failCount++;
        }
      } else {
        console.warn(`在 TMDB 找不到電影: ${displayTitle} (ID: ${movie.id})`);
        failCount++;
      }

      if (processedCount % 50 === 0 || processedCount === result.rows.length) {
        console.log(`進度: ${processedCount}/${result.rows.length} 已處理, ${successCount} 成功, ${failCount} 失敗`);
      }
      // 更新 last_tmdb_check_at 時間戳
      try {
        await pool.query(
          'UPDATE movies SET last_tmdb_check_at = NOW() WHERE id = $1',
          [movie.id]
        );
      } catch (timestampError) {
        console.error(`更新電影 ID ${movie.id} 的 last_tmdb_check_at 時發生錯誤:`, timestampError);
      }

      // 添加延遲，避免 TMDB API 限流
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`TMDB ID 更新處理完成。總共處理 ${processedCount} 部電影，成功更新 ${successCount} 部，${failCount} 部未能更新或找到。`);
  } catch (error) {
    console.error('更新缺少資訊的電影時發生錯誤:', error);
  } finally {
    // 關閉資料庫連接
    await pool.end();
  }
}

// 執行主函數
updateMissingMovieData().catch(console.error);

import axios from 'axios';
import pool from '../db';

// TMDB API 配置
// 直接使用硬編碼的 API Key
const TMDB_API_KEY = 'd4c9092656c3aa3cfa5761fbf093f7d0';
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
async function searchMovieFromTMDB(title: string): Promise<TMDBSearchResult | null> {
  try {
    console.log(`  嘗試使用中文搜索: ${title}`);
    // 首先嘗試中文搜索
    const response = await axios.get(`${TMDB_API_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: title,
        language: 'zh-TW',
        include_adult: true
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      // 找到結果，返回第一個匹配項
      console.log(`  中文搜索找到結果: ${response.data.results[0].title} (ID: ${response.data.results[0].id})`);
      return response.data.results[0];
    }

    console.log(`  中文搜索沒有結果，嘗試英文搜索: ${title}`);
    // 如果中文搜索沒有結果，嘗試英文搜索
    const enResponse = await axios.get(`${TMDB_API_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: title,
        language: 'en-US',
        include_adult: true
      }
    });

    if (enResponse.data.results && enResponse.data.results.length > 0) {
      // 找到結果，返回第一個匹配項
      console.log(`  英文搜索找到結果: ${enResponse.data.results[0].title} (ID: ${enResponse.data.results[0].id})`);
      return enResponse.data.results[0];
    }

    console.log(`  沒有找到電影: ${title}`);
    return null;
  } catch (error) {
    console.error(`搜索電影 ${title} 時發生錯誤:`, error);
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
async function checkTmdbIdExists(tmdbId: number): Promise<{exists: boolean, movieId?: number, title?: string}> {
  try {
    const query = `
      SELECT id, title FROM movies WHERE tmdb_id = $1
    `;
    const result = await pool.query(query, [tmdbId]);
    
    if (result.rows.length > 0) {
      return {
        exists: true,
        movieId: result.rows[0].id,
        title: result.rows[0].title
      };
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`檢查 TMDB ID ${tmdbId} 時發生錯誤:`, error);
    return { exists: false };
  }
}

// 更新電影資訊
async function updateMovieInfo(movieId: number, tmdbMovie: TMDBMovieDetails): Promise<void> {
  try {
    // 檢查 TMDB ID 是否已經被使用
    const existingMovie = await checkTmdbIdExists(tmdbMovie.id);
    
    if (existingMovie.exists) {
      console.log(`TMDB ID ${tmdbMovie.id} 已經被電影 ${existingMovie.title} (ID: ${existingMovie.movieId}) 使用`);
      
      // 如果是同一部電影，則合併資訊
      if (existingMovie.movieId === movieId) {
        console.log(`該 TMDB ID 屬於同一部電影，繼續更新其他資訊`);
      } else {
        console.log(`將使用其他資訊更新電影，但不更新 TMDB ID`);
        
        // 更新除了 TMDB ID 以外的所有資訊
        const updateQuery = `
          UPDATE movies 
          SET 
            original_title = $1,
            poster_url = $2,
            backdrop_url = $3,
            overview = $4,
            release_date = $5,
            runtime = $6,
            vote_average = $7,
            genres = $8,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $9
        `;
        
        await pool.query(updateQuery, [
          tmdbMovie.original_title,
          tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null,
          tmdbMovie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}` : null,
          tmdbMovie.overview,
          tmdbMovie.release_date,
          tmdbMovie.runtime,
          tmdbMovie.vote_average,
          JSON.stringify(tmdbMovie.genres || []),
          movieId
        ]);
        
        console.log(`更新電影成功 (不包含 TMDB ID) (ID: ${movieId}, 標題: ${tmdbMovie.title})`);
        return;
      }
    }
    
    // 如果 TMDB ID 不存在或屬於同一部電影，則更新所有資訊
    const updateQuery = `
      UPDATE movies 
      SET 
        tmdb_id = $1,
        original_title = $2,
        poster_url = $3,
        backdrop_url = $4,
        overview = $5,
        release_date = $6,
        runtime = $7,
        vote_average = $8,
        genres = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
    `;

    await pool.query(updateQuery, [
      tmdbMovie.id,
      tmdbMovie.original_title,
      tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null,
      tmdbMovie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}` : null,
      tmdbMovie.overview,
      tmdbMovie.release_date,
      tmdbMovie.runtime,
      tmdbMovie.vote_average,
      JSON.stringify(tmdbMovie.genres || []),
      movieId
    ]);

    console.log(`更新電影成功 (ID: ${movieId}, TMDB ID: ${tmdbMovie.id}, 標題: ${tmdbMovie.title})`);
  } catch (error) {
    console.error(`更新電影資訊時發生錯誤 (ID: ${movieId}):`, error);
  }
}

// 主函數：更新缺少資訊的電影
async function updateMissingMovieData(): Promise<void> {
  try {
    // 獲取所有缺少 TMDB ID 的電影
    const result = await pool.query(`
      SELECT id, title FROM movies 
      WHERE tmdb_id IS NULL
      ORDER BY id
    `);

    console.log(`找到 ${result.rows.length} 部缺少資訊的電影`);
    console.log('='.repeat(50));

    // 遍歷每部電影
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (const movie of result.rows) {
      processedCount++;
      console.log(`\n[${processedCount}/${result.rows.length}] 處理電影: ${movie.title} (ID: ${movie.id})`);

      // 從 TMDB 搜索電影
      const searchResult = await searchMovieFromTMDB(movie.title);

      if (searchResult) {
        console.log(`在 TMDB 找到電影: ${searchResult.title} (ID: ${searchResult.id})`);

        // 獲取電影詳細資訊
        console.log(`  獲取電影詳細資訊...`);
        const movieDetails = await getMovieDetails(searchResult.id);

        if (movieDetails) {
          // 更新電影資訊
          await updateMovieInfo(movie.id, movieDetails);
          successCount++;
        } else {
          console.log(`  獲取電影詳細資訊失敗`);
          failCount++;
        }
      } else {
        console.log(`在 TMDB 找不到電影: ${movie.title}`);
        failCount++;
      }

      console.log(`進度: ${processedCount}/${result.rows.length}, 成功: ${successCount}, 失敗: ${failCount}`);
      console.log('-'.repeat(50));

      // 添加延遲，避免 TMDB API 限流
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('更新完成');
  } catch (error) {
    console.error('更新缺少資訊的電影時發生錯誤:', error);
  } finally {
    // 關閉資料庫連接
    await pool.end();
  }
}

// 執行主函數
updateMissingMovieData().catch(console.error);

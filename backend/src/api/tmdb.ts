import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dayjs from 'dayjs';

// 定義票房資料介面
export interface BoxOfficeMovie {
  title: string;
  releaseDate?: string;
  totalGross?: number;
  totalSales?: number;
  rank?: number;
}

// TMDB API 配置
const TMDB_API_KEY = 'd4c9092656c3aa3cfa5761fbf093f7d0';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// 快取目錄
const CACHE_DIR = path.resolve(__dirname, '../../cache');
const POSTER_CACHE_DIR = path.resolve(CACHE_DIR, 'posters');
const NOT_FOUND_CACHE_FILE = path.resolve(POSTER_CACHE_DIR, 'not_found_movies.json');

// 確保目錄存在
fs.ensureDirSync(CACHE_DIR);
fs.ensureDirSync(POSTER_CACHE_DIR);

// 定義 TMDB 電影資訊介面
export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  vote_average?: number;
  release_date?: string;
  genres?: Array<{ id: number; name: string }>;
  fullPosterPath?: string;
  fullBackdropPath?: string;
}

// 定義帶有 TMDB 資訊的票房電影介面
export interface BoxOfficeMovieWithTMDB extends BoxOfficeMovie {
  tmdbId?: number;
  posterPath?: string;
  backdropPath?: string;
  originalTitle?: string;
  overview?: string;
  voteAverage?: number;
  genres?: string[];
}

// 未找到的電影記錄
interface NotFoundMovie {
  title: string;
  releaseDate?: string;
  country?: string;
  lastChecked: string;
}

/**
 * 使用 TMDB API 搜索電影
 */
export async function searchMovieFromTMDB(title: string, releaseDate?: string): Promise<TMDBMovie | null> {
  try {
    // 建立快取檔案名稱，使用電影標題作為檔名
    const safeTitle = title.replace(/[\/:*?"<>|]/g, '_');
    const cacheFile = path.join(POSTER_CACHE_DIR, `${safeTitle}.json`);
    
    // 檢查快取是否存在
    if (await fs.pathExists(cacheFile)) {
      const cachedData = await fs.readJSON(cacheFile);
      console.log(`從快取返回 ${title} 的 TMDB 資訊`);
      return cachedData;
    }
    
    // 檢查是否在未找到列表中
    const notFoundMovies = await getNotFoundMovies();
    const isInNotFoundList = notFoundMovies.some(m => 
      m.title === title && 
      (!releaseDate || m.releaseDate === releaseDate) &&
      dayjs(m.lastChecked).add(7, 'day').isAfter(dayjs())
    );
    
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
    
    // 搜索電影
    const searchUrl = `${TMDB_BASE_URL}/search/movie`;
    const { data } = await axios.get(searchUrl, {
      params: {
        api_key: TMDB_API_KEY,
        query: title,
        year: year || undefined,
        language: 'zh-TW'
      }
    });
    
    if (data.results && data.results.length > 0) {
      // 取得最相關的結果
      const movie = data.results[0];
      
      // 如果有電影 ID，再取得詳細資訊
      if (movie.id) {
        try {
          const detailUrl = `${TMDB_BASE_URL}/movie/${movie.id}`;
          const { data: movieDetail } = await axios.get(detailUrl, {
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
          
          // 寫入快取
          await fs.writeJSON(cacheFile, result, { spaces: 2 });
          console.log(`已將 ${title} 的 TMDB 資訊寫入快取`);
          
          return result;
        } catch (detailError) {
          console.error(`無法獲取 ${title} 的詳細資訊:`, detailError);
          // 如果取得詳細資訊失敗，仍然返回搜索結果
          await fs.writeJSON(cacheFile, movie, { spaces: 2 });
          return movie;
        }
      }
      
      // 寫入快取
      await fs.writeJSON(cacheFile, movie, { spaces: 2 });
      return movie;
    }
    
    // 沒有搜索結果，添加到未找到列表
    console.log(`TMDB 上找不到 ${title} 的資訊`);
    await addToNotFoundList({
      title,
      releaseDate,
      lastChecked: dayjs().format('YYYY-MM-DD')
    });
    
    return null;
  } catch (error) {
    console.error(`搜索 ${title} 的 TMDB 資訊失敗:`, error);
    return null;
  }
}

/**
 * 為票房電影加入 TMDB 資訊
 */
export async function enrichMoviesWithTMDBData(movies: BoxOfficeMovie[]): Promise<any[]> {
  const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
  
  try {
    // 使用 Promise.allSettled 而非 Promise.all，以避免單個電影的錯誤導致整個處理失敗
    const results = await Promise.allSettled(
      movies.map(async (movie) => {
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
        } catch (error) {
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
      })
    );

    // 處理 Promise.allSettled 的結果
    const enrichedMovies = results.map(result => {
      if (result.status === 'fulfilled' && result.value && result.value.title) {
        return result.value;
      } else if (result.status === 'fulfilled' && result.value) {
        // 確保有 title 屬性
        if (!result.value.title) {
          console.error('電影物件缺少 title 屬性:', result.value);
          result.value.title = '未知電影';
        }
        return result.value;
      } else if (result.status === 'rejected') {
        console.error('處理電影時發生錯誤:', result.reason);
        // 如果有錯誤，返回一個空對象，後續會過濾掉
        return null;
      } else {
        // 其他意外情況
        console.error('處理電影時發生未知錯誤');
        return null;
      }
    }).filter(movie => movie !== null); // 過濾掉空值

    return enrichedMovies;
  } catch (error) {
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
export async function getNotFoundMovies(): Promise<NotFoundMovie[]> {
  try {
    if (await fs.pathExists(NOT_FOUND_CACHE_FILE)) {
      return await fs.readJSON(NOT_FOUND_CACHE_FILE);
    }
    return [];
  } catch (error) {
    console.error('讀取未找到電影列表失敗:', error);
    return [];
  }
}

/**
 * 添加電影到未找到列表
 */
async function addToNotFoundList(movie: NotFoundMovie): Promise<void> {
  try {
    const notFoundMovies = await getNotFoundMovies();
    
    // 檢查是否已存在
    const existingIndex = notFoundMovies.findIndex(m => 
      m.title === movie.title && 
      (!movie.releaseDate || m.releaseDate === movie.releaseDate)
    );
    
    if (existingIndex !== -1) {
      // 更新現有記錄
      notFoundMovies[existingIndex] = {
        ...notFoundMovies[existingIndex],
        lastChecked: movie.lastChecked
      };
    } else {
      // 添加新記錄
      notFoundMovies.push(movie);
    }
    
    // 寫入檔案
    await fs.writeJSON(NOT_FOUND_CACHE_FILE, notFoundMovies, { spaces: 2 });
  } catch (error) {
    console.error('添加電影到未找到列表失敗:', error);
  }
}

/**
 * 獲取 TMDB 上找不到的電影列表
 */
export async function getMoviesNotFoundOnTMDB(): Promise<NotFoundMovie[]> {
  return await getNotFoundMovies();
}

/**
 * 清除超過指定天數的未找到記錄
 */
export async function cleanupNotFoundMovies(daysToKeep = 7): Promise<void> {
  try {
    const notFoundMovies = await getNotFoundMovies();
    const cutoffDate = dayjs().subtract(daysToKeep, 'day');
    
    const filteredMovies = notFoundMovies.filter(movie => 
      dayjs(movie.lastChecked).isAfter(cutoffDate)
    );
    
    if (filteredMovies.length !== notFoundMovies.length) {
      console.log(`從未找到列表中移除了 ${notFoundMovies.length - filteredMovies.length} 部電影`);
      await fs.writeJSON(NOT_FOUND_CACHE_FILE, filteredMovies, { spaces: 2 });
    }
  } catch (error) {
    console.error('清理未找到電影列表失敗:', error);
  }
}

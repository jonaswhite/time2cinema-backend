"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
// 使用標準 img 標籤替代 next/image
import { Button } from "@/components/ui/button";
import API_URL from "@/lib/api/api";

// 導入拆分出的組件和類型
import { 
  MovieInfo, 
  DEFAULT_MOVIE,
  Showtime,
  Cinema,
  TheaterShowtimes,
  FormattedShowtime
} from '@/components/showtimes/types';
import { fetchTmdbPoster } from '@/lib/tmdb';
import { formatDateKey, createDateTabs, findCinemasWithShowtimes, getDateLabel } from '@/components/showtimes/utils';
import MapComponent, { MapComponentRef } from "@/components/showtimes/MapComponent";
import CinemaSelector from '@/components/showtimes/CinemaSelector';
import ShowtimesList from '@/components/showtimes/ShowtimesList';

const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMzAwIiBzdHlsZT0iYmFja2dyb3VuZC1jb2xvcjojMjIyOyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSI+Tm8gUG9zdGVyIEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';

// Define RawTheaterData for normalizing theater data from various possible structures
interface RawTheaterData {
  theaterId?: string;       // Potential camelCase ID from some sources
  theaterName?: string;     // Potential camelCase name
  theater_id?: string;      // Potential snake_case ID from backend
  id?: string;              // Potential generic ID (e.g., from a Cinema object if mixed in)
  name?: string;            // Potential generic name (e.g., from a Cinema object if mixed in)
  showtimes?: Showtime[];   // Potential old structure for showtimes directly under theater
  showtimes_by_date?: { date: string; showtimes: Showtime[] }[]; // Correct new structure
  // any other properties that might be encountered before normalization
  [key: string]: any; // Allow other properties to avoid type errors if unexpected fields exist
}

// Define a type for the movie data fetched from the API for metadata
interface MovieMetaData {
  id?: string;
  display_title?: string;
  full_title?: string;
  chinese_title?: string;
  english_title?: string;
  release_date?: string;
  poster_url?: string;
  overview?: string;
  genres?: string[];
  director?: string;
  actors?: string[];
}

type Props = {
  params: { movieId: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

const generateMovieJsonLd = (movieData: MovieInfo, pageUrl: string) => {
  const schema: any = {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": movieData.display_title || movieData.chinese_title || movieData.full_title,
    "url": pageUrl,
  };

  if (movieData.english_title && movieData.english_title !== schema.name) {
    schema.alternateName = movieData.english_title;
  }
  if (movieData.overview) {
    schema.description = movieData.overview;
  }
  if (movieData.poster && movieData.poster !== placeholderImage) { // Avoid using placeholder for schema image
    schema.image = movieData.poster;
  }
  if (movieData.release && movieData.release !== 'N/A') {
    schema.datePublished = movieData.release;
  }
  // Assuming movieData.director is a string (name of director)
  if (movieData.director) {
    schema.director = {
      "@type": "Person",
      "name": movieData.director
    };
  }
  // Assuming movieData.actors is an array of strings (names of actors)
  if (movieData.actors && movieData.actors.length > 0) {
    schema.actor = movieData.actors.map((actorName: string) => ({
      "@type": "Person",
      "name": actorName
    }));
  }
  if (movieData.genres && movieData.genres.length > 0) {
    schema.genre = movieData.genres;
  }
  // Placeholder for AggregateRating - this would typically come from your data
  // if (movieData.ratingValue && movieData.ratingCount) {
  //   schema.aggregateRating = {
  //     "@type": "AggregateRating",
  //     "ratingValue": movieData.ratingValue,
  //     "reviewCount": movieData.ratingCount
  //   };
  // }

  return schema;
};

export default function ShowtimesPage() {
  const router = useRouter();
  const params = useParams();
  const movieId = params?.movieId as string;
  const decodedMovieId = movieId ? decodeURIComponent(movieId) : "";
  
  // 狀態管理
  const [movie, setMovie] = useState<MovieInfo>(DEFAULT_MOVIE);
  const [loading, setLoading] = useState(true);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [cinemasLoading, setCinemasLoading] = useState(true);
  const [showtimes, setShowtimes] = useState<TheaterShowtimes[]>([]);
  const [showtimesLoading, setShowtimesLoading] = useState(true);
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedCinemas, setSelectedCinemas] = useState<string[]>([]);
  const [cinemaQuery, setCinemaQuery] = useState("");
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  // 控制地圖是否應該自動縮放
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const mapRef = useRef<MapComponentRef>(null);

  // 從電影院選擇列表更新選擇時的處理函數
  const handleCinemaSelectionFromList = (newSelection: string[] | ((prevState: string[]) => string[])) => {
    setSelectedCinemas(newSelection);
    setAutoZoomEnabled(true); // 從列表選擇時，啟用自動縮放
  };
  
  // 處理電影院點擊事件，觸發地圖縮放
  const handleCinemaClick = useCallback((cinemaIds: string[]) => {
    console.log('[handleCinemaClick] 選中的電影院 ID 列表:', cinemaIds);
    console.log('[handleCinemaClick] mapRef.current:', mapRef.current);
    
    if (mapRef.current && cinemaIds.length > 0) {
      console.log('[handleCinemaClick] 呼叫 flyToCinema 方法，電影院數量:', cinemaIds.length);
      mapRef.current.flyToCinema(cinemaIds);
    } else if (cinemaIds.length === 0) {
      console.log('[handleCinemaClick] 沒有選中的電影院，不執行縮放');
    } else {
      console.error('[handleCinemaClick] 錯誤: mapRef.current 為空');
    }
  }, []);
  
  // 日期標籤
  const dateTabs = React.useMemo(() => createDateTabs(), []);
  
  // 獲取用戶位置
  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setUserLocation({ lat: latitude, lng: longitude });
            console.log(`獲取到用戶位置: 緯度 ${latitude}, 經度 ${longitude}`);
            setLocationLoading(false);
          },
          (error) => {
            console.error('獲取位置失敗:', error);
            // 如果獲取失敗，使用台北市中心作為預設位置
            setUserLocation({ lat: 25.0330, lng: 121.5654 });
            setLocationLoading(false);
          },
          { timeout: 10000, enableHighAccuracy: false }
        );
      } else {
        console.log('瀏覽器不支援地理位置');
        // 使用台北市中心作為預設位置
        setUserLocation({ lat: 25.0330, lng: 121.5654 });
        setLocationLoading(false);
      }
    };
    
    getUserLocation();
  }, []);
  
  // 正規化電影名稱，處理不同變體
  const normalizeMovieName = (name: string | null | undefined): string => {
    // 確保 name 是字符串
    if (!name || typeof name !== 'string') return '';
    
    try {
      // 移除所有空格、標點符號和特殊字元
      const normalized = name
        .replace(/\s+/g, '') // 移除空格
        .replace(/[\u3000\u00A0]/g, '') // 移除全形空格
        .replace(/[\-\[\]\(\)「」【】《》""'']/g, '') // 移除括號
        .toLowerCase(); // 轉為小寫
      
      return normalized;
    } catch (error) {
      console.error('Error normalizing movie name:', error, 'Name:', name);
      return '';
    }
  };
  
  // 檢查兩個電影名稱是否匹配
  const isMovieNameMatch = (name1: string, name2: string): boolean => {
    const normalized1 = normalizeMovieName(name1);
    const normalized2 = normalizeMovieName(name2);
    
    // 直接匹配
    if (normalized1 === normalized2) return true;
    
    // 檢查數字表示法差異 (例如 "會計師 2" vs "會計師2")
    const digitRegex1 = normalized1.match(/(\D+)(\d+)/);
    const digitRegex2 = normalized2.match(/(\D+)(\d+)/);
    
    if (digitRegex1 && digitRegex2 && 
        digitRegex1[1] === digitRegex2[1] && 
        digitRegex1[2] === digitRegex2[2]) {
      return true;
    }
    
    // 包含關係
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      const longerName = normalized1.length > normalized2.length ? normalized1 : normalized2;
      const shorterName = normalized1.length <= normalized2.length ? normalized1 : normalized2;
      
      // 如果短名稱至少佔長名稱的80%，視為匹配
      if (shorterName.length / longerName.length >= 0.8) {
        return true;
      }
    }
    
    return false;
  };

  // 獲取電影資訊
  useEffect(() => {
    const fetchMovieInfo = async () => {
      if (!decodedMovieId) {
        setMovie({...DEFAULT_MOVIE, poster: placeholderImage });
        setLoading(false);
        return;
      }

      setLoading(true);
      let movieDataForState: MovieInfo = {
        ...DEFAULT_MOVIE, // Spreads display_title, full_title, etc. from DEFAULT_MOVIE
        id: decodedMovieId,
        // If decodedMovieId is a meaningful name, we might set it as a display_title fallback here,
        // but DEFAULT_MOVIE already provides "電影資訊載入中..."
        poster: '', // Initialize poster as empty, will be filled by fetching logic or placeholder
        overview: undefined,
        genres: undefined,
        director: undefined,
        actors: undefined
      };

      try {
        // Step 1: Try fetching from our database API
        console.log(`Fetching movie from DB: ${decodedMovieId}`);
        const dbResponse = await fetch(`${API_URL}/api/movies/name/${encodeURIComponent(decodedMovieId)}`);

        if (dbResponse.ok) {
          const movieFromDb = await dbResponse.json();
          if (movieFromDb && (movieFromDb.full_title || movieFromDb.chinese_title)) {
            const display_title = movieFromDb.chinese_title || movieFromDb.full_title || decodedMovieId;
            movieDataForState = {
              id: movieFromDb.id?.toString() || decodedMovieId,
              display_title: display_title,
              full_title: movieFromDb.full_title || '', // Ensure full_title is a string
              chinese_title: movieFromDb.chinese_title || null,
              english_title: movieFromDb.english_title || null,
              release: movieFromDb.release_date || 'N/A',
              poster: movieFromDb.poster_url || '', // Use poster_url from DB if available
              // Enrich with additional fields for JSON-LD and potential display
              overview: movieFromDb.overview || undefined,
              genres: movieFromDb.genres || undefined,
              director: movieFromDb.director || undefined,
              actors: movieFromDb.actors || undefined,
            };
            // If DB provides a poster, we might still want to check TMDB if it's better or as a primary source for posters.
            // For now, if poster_url exists, we assume it's good enough to potentially skip further TMDB checks for this specific step.
            // However, the logic below will still run if movieDataForState.poster remains empty.
            if (movieFromDb.poster_url) {
              console.log(`Poster from DB: ${movieFromDb.poster_url}`);
              // We will continue to potentially overwrite with TMDB if poster is still empty or if we decide TMDB is preferred.
            }
          } else {
            console.log(`Movie not found in DB or DB data incomplete for: ${decodedMovieId}.`);
          }
        } else {
          console.log(`DB API request failed (${dbResponse.status}) for ${decodedMovieId}.`);
        }

        // Step 2: If poster is still missing or we want to prioritize TMDB, try existing TMDB API endpoint
        // This logic might be redundant if fetchTmdbPoster is comprehensive enough, but kept for now.
        if (!movieDataForState.poster) { 
          console.log(`Fetching from existing TMDB endpoint for: ${movieDataForState.display_title}`);
          const tmdbLegacyResponse = await fetch(`${API_URL}/api/tmdb/boxoffice-with-posters`);
          if (tmdbLegacyResponse.ok) {
            const tmdbApiData = await tmdbLegacyResponse.json();
            const titleToMatchLegacyTmdb = movieDataForState.full_title || movieDataForState.display_title;
            const movieFromTmdb = tmdbApiData.find((m: { title: string; posterUrl?: string; releaseDate?: string }) =>
              isMovieNameMatch(m.title, titleToMatchLegacyTmdb)
            );
            if (movieFromTmdb && movieFromTmdb.posterUrl) {
              console.log(`Found poster in existing TMDB endpoint: ${movieFromTmdb.posterUrl}`);
              movieDataForState.poster = movieFromTmdb.posterUrl;
              if ((!movieDataForState.release || movieDataForState.release === 'N/A') && movieFromTmdb.releaseDate) {
                movieDataForState.release = movieFromTmdb.releaseDate;
              }
            }
          } else {
            console.error(`Existing TMDB API endpoint request failed: ${tmdbLegacyResponse.status}`);
          }
        }

        // Step 3: NEW - If poster is STILL missing, try fetchTmdbPoster utility
        if (!movieDataForState.poster) {
          console.log(`Poster still missing, trying fetchTmdbPoster utility for: ${movieDataForState.display_title}`);
          try {
            const tmdbUtilPoster = await fetchTmdbPoster(
                {
                  chinese_title: movieDataForState.chinese_title,
                  english_title: movieDataForState.english_title,
                  full_title: movieDataForState.full_title
                },
                movieDataForState.tmdb_id // Assumes tmdb_id is on movieDataForState
              );
            if (tmdbUtilPoster) {
              console.log(`Found poster via fetchTmdbPoster utility: ${tmdbUtilPoster}`);
              movieDataForState.poster = tmdbUtilPoster;
            }
          } catch (tmdbUtilError) {
            console.error("Error calling fetchTmdbPoster utility:", movieDataForState.display_title, tmdbUtilError);
          }
        }

        // Final poster assignment: if still no poster after all attempts, use placeholderImage
        if (!movieDataForState.poster) {
          movieDataForState.poster = placeholderImage;
        }

        setMovie(movieDataForState);
        if (movieDataForState.display_title && movieDataForState.display_title !== DEFAULT_MOVIE.display_title) {
          document.title = `${movieDataForState.display_title} - 上映場次 | Time2Cinema`;
        }

      } catch (error) {
        setLoading(false);
      }
    }; // end of fetchMovieInfo async function

    fetchMovieInfo();
  }, [decodedMovieId]); // end of useEffect
  
  // 獲取電影院資料
  useEffect(() => {
    const fetchCinemas = async () => {
      try {
        setCinemasLoading(true);
        const response = await fetch(`${API_URL}/api/cinemas`);
        
        if (!response.ok) {
          throw new Error(`API 請求失敗: ${response.status}`);
        }
        
        const data = await response.json();
        setCinemas(data);
      } catch (error) {
        console.error('獲取電影院資料失敗:', error);
        setCinemas([]);
      } finally {
        setCinemasLoading(false);
      }
    };
    
    fetchCinemas();
  }, []);
  
  // 獲取場次資料
  useEffect(() => {
    const fetchShowtimes = async () => {
      try {
        setShowtimesLoading(true);
        
        // 使用 URL 參數中的電影 ID，而非 movie.id
        // 因為 movie.id 可能在載入場次時尚未載入完成
        const movieIdToUse = decodedMovieId;
        
        if (!movieIdToUse) {
          console.error('無效的電影 ID');
          setShowtimes([]);
          return;
        }
        
        // 格式化今天的日期為 YYYY-MM-DD
        const today = new Date();
        const todayStr = formatDateKey(today);
        
        // 記錄完整的 API 請求 URL
        const apiUrl = `${API_URL}/api/showtimes/movie/${encodeURIComponent(movieIdToUse)}`;
        console.log(`正在獲取場次資料... API URL: ${apiUrl}`);
        
        // 發送 API 請求
        const response = await fetch(apiUrl);
        
        // 詳細記錄回應狀態
        console.log('API 回應狀態:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (!response.ok) {
          throw new Error(`場次 API 請求失敗: ${response.status} ${response.statusText}`);
        }
        
        // 記錄原始回應內容
        const responseText = await response.text();
        console.log(`API 回應原始內容 (前 100 字符): ${responseText.substring(0, 100)}...`);
        
        // 嘗試解析 JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('JSON 解析錯誤:', parseError);
          throw new Error('無法解析 API 回應為 JSON');
        }
        
        // 詳細記錄返回的數據類型
        console.log('API 返回數據類型:', {
          isArray: Array.isArray(data),
          type: typeof data,
          dataKeys: typeof data === 'object' ? Object.keys(data) : 'N/A',
          length: Array.isArray(data) ? data.length : (data && data.theaters ? data.theaters.length : 'N/A')
        });
        
        // 適應不同的數據格式
        let theatersData = [];
        
        // 檢查數據格式
        if (Array.isArray(data)) {
          // 直接使用數組
          theatersData = data;
        } else if (data && typeof data === 'object') {
          // 如果是對象，嘗試找到電影院數組
          if (Array.isArray(data.theaters)) {
            theatersData = data.theaters;
          } else if (Array.isArray(data.showtimes)) {
            theatersData = data.showtimes;
          } else if (data.data && Array.isArray(data.data)) {
            theatersData = data.data;
          }
        }
        
        // 如果沒有找到有效的電影院數組
        if (theatersData.length === 0) {
          console.log(`電影 ${movieIdToUse} 沒有場次資料`);
          setShowtimes([]);
          return;
        }
        
        console.log(`成功獲取 ${theatersData.length} 個電影院的場次資料`);
        
        // 詳細記錄第一個電影院的場次資料
        if (theatersData.length > 0) {
          const firstTheater = theatersData[0];
          console.log('第一個電影院場次資料:', firstTheater);
          
          // 嘗試檢測數據格式並適應
          if (firstTheater.theaterId && firstTheater.theaterName) {
            // 如果使用駐峰式命名，轉換為蛋式命名
            theatersData = theatersData.map((theater: RawTheaterData) => ({
              theater_id: theater.theaterId,
              theater_name: theater.theaterName,
              showtimes_by_date: Array.isArray(theater.showtimes) ? [{
                date: todayStr,
                showtimes: theater.showtimes // Restored showtimes
              }] : [] // Restored empty array fallback
            }));
          } else if (!firstTheater.theater_id || !firstTheater.theater_name) {
            // If essential snake_case properties are missing, try to construct them
            // This is the start of the restored else-if block and the second map call
            theatersData = theatersData.map((theater: RawTheaterData) => ({
              theater_id: theater.theater_id || theater.id || theater.theaterId || `theater-${Math.random().toString(36).substring(2, 9)}`,
              theater_name: theater.theater_name || theater.name || theater.theaterName || '未命名電影院',
              showtimes_by_date: theater.showtimes_by_date || (
                Array.isArray(theater.showtimes) ? [{
                  date: todayStr,
                  showtimes: theater.showtimes
                }] : []
              )
            }));
          }
          // This closing brace was for the 'if (theatersData.length > 0)' block
        }
        
        setShowtimes(theatersData);
      } catch (error) {
        console.error('獲取場次資料失敗:', error);
        setShowtimes([]);
      } finally {
        setShowtimesLoading(false);
      }
    };
    
    fetchShowtimes();
  }, [movie, loading, decodedMovieId, movieId]);
  
  // 有場次的電影院列表
  const filteredCinemas = React.useMemo(() => {
    try {
      console.log('%cfilteredCinemas 計算開始...', 'color: orange; font-weight: bold;');
      console.log('cinemas 狀態:', { cinemasLoading, cinemasLength: cinemas.length, showtimesLength: showtimes.length, showtimesLoading });
      
      // 確保電影院數據已經載入
      if (cinemasLoading || !Array.isArray(cinemas) || cinemas.length === 0) {
        console.log('電影院數據尚未載入完成，返回空陣列');
        return [];
      }
      
      // 確保場次數據已經載入
      if (showtimesLoading) {
        console.log('場次數據尚未載入完成，返回空陣列');
        return [];
      }
      
      // 檢查場次數據的格式
      if (!Array.isArray(showtimes)) {
        console.error('場次數據不是陣列格式:', typeof showtimes);
        return [];
      }
      
      // 檢查場次數據是否為空
      if (showtimes.length === 0) {
        console.log('沒有找到任何場次數據，返回空陣列');
        return [];
      }
      
      console.log('場次數據結構的第一個項目:', JSON.stringify(showtimes[0]).substring(0, 200) + '...');
      
      // 找出有場次的電影院ID
      const cinemaIdsWithShowtimes = findCinemasWithShowtimes(showtimes, cinemaQuery);
      console.log('[filteredCinemas] IDs from findCinemasWithShowtimes:', cinemaIdsWithShowtimes);

      const filtered = cinemas.filter(cinema => 
        cinemaIdsWithShowtimes.includes(String(cinema.id))
      );
      console.log('[filteredCinemas] Primary filter result (filtered):', JSON.parse(JSON.stringify(filtered.map(c => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, latitude: c.latitude, longitude: c.longitude })))));
      
      // 過濾出有場次的電影院，確保 ID 比較時都是字串類型
      // const filtered = cinemas.filter(cinema => {
      //   const cinemaId = String(cinema.id);
      //   return cinemasWithShowtimes.some(id => String(id) === cinemaId);
      // });
      // console.log(`過濾後剩下 ${filtered.length} 個電影院`);
      
      // 如果過濾後沒有電影院，但有場次資料，則直接從場次資料建立電影院列表
      if (filtered.length === 0 && cinemaIdsWithShowtimes.length > 0) {
        console.log('%c[filteredCinemas] Fallback logic triggered: Main filter is empty, but showtimes exist.', 'color: yellow;');
        console.log('從場次資料中直接建立電影院列表');
        
        // 建立一個 Map 來去除重複的電影院
        const cinemaMap = new Map<string, Cinema>(); // Key is string ID, value is Cinema object

        showtimes.forEach(theater => {
          // Handle potential variations in theater ID and name properties
          const currentTheaterId = theater?.theaterId || theater?.theater_id;
          const currentTheaterName = theater?.theaterName || theater?.theater_name;

          if (currentTheaterId && currentTheaterName) {
            const theaterIdStr = String(currentTheaterId);
            // Find the full cinema object from the main 'cinemas' state
            // The 'cinemas' state should already have 'lat' and 'lng' populated by the API
            const fullCinemaData = cinemas.find(c => String(c.id) === theaterIdStr);

            if (fullCinemaData) {
              // Use the found cinema object. It should already have lat/lng from the /api/cinemas call.
              cinemaMap.set(theaterIdStr, fullCinemaData);
            } else {
              // This case means a cinema ID from showtimes data isn't in the main cinemas list.
              // This indicates a data inconsistency. For robustness, create a placeholder with default coords and log prominently.
              console.warn(`%c[filteredCinemas Fallback] 警告: 在 'cinemas' 狀態中找不到 ID 為 ${theaterIdStr} 的電影院 (${currentTheaterName}). 將使用預設座標.`, 'color: red;');
              cinemaMap.set(theaterIdStr, {
                id: theaterIdStr,
                name: currentTheaterName,
                address: '', // Address will be missing
                latitude: 25.0330, // Default Taipei coordinates
                longitude: 121.5654,
                lat: 25.0330,
                lng: 121.5654,
                // Populate other fields from Cinema interface with defaults or undefined
                city: undefined,
                district: undefined,
                type: undefined,
                special: undefined,
                showtimes: [], // Or undefined, depending on how Cinema type is used
                distance: undefined,
              });
            }
          }
        });
        
        const cinemasFromShowtimes = Array.from(cinemaMap.values());
        return cinemasFromShowtimes;
      }
      
      return filtered;
    } catch (error) {
      console.error('filteredCinemas 計算錯誤:', error);
      return [];
    }
  }, [cinemas, cinemasLoading, cinemaQuery, showtimes, showtimesLoading]);
  
  // 根據選擇的日期和電影院篩選場次，並將其分組
  const allShowtimesByCinema = React.useMemo<Record<string, FormattedShowtime[]>>(() => {
    const groups: Record<string, FormattedShowtime[]> = {};
    if (showtimesLoading || !showtimes || !dateTabs || dateTabs.length === 0) {
      return groups;
    }

    const selectedDateObject = dateTabs[selectedDateIdx]?.date;
    if (!selectedDateObject) {
        return groups; 
    }
    const selectedDateString = formatDateKey(selectedDateObject);

    showtimes.forEach(theaterData => {
      if (!theaterData || !theaterData.theater_id || !theaterData.showtimes_by_date) {
        return;
      }

      const theaterId = String(theaterData.theater_id); // Ensure theaterId is string for key usage
      const theaterName = theaterData.theater_name || `電影院 ${theaterId}`;

      theaterData.showtimes_by_date.forEach(dateGroup => {
        if (dateGroup.date === selectedDateString) {
          if (!groups[theaterId]) {
            groups[theaterId] = [];
          }
          if (dateGroup.showtimes && Array.isArray(dateGroup.showtimes)) {
            dateGroup.showtimes.forEach((st, st_idx) => { // Added st_idx for unique ID generation
              // Basic validation for a showtime object - st.id might be optional in Showtime
              if (!st || !st.time) { 
                // console.warn('allShowtimesByCinema: Invalid showtime object (missing time):', st, 'in theater:', theaterId, 'date:', dateGroup.date);
                return;
              }

              let ft = st.time; // st.time is string as per Showtime type
              if (typeof ft === 'string' && ft.length === 8 && ft.charAt(2) === ':' && ft.charAt(5) === ':') {
                ft = ft.substring(0, 5); 
              }

              const formattedShowtime: FormattedShowtime = {
                ...st, 
                id: st.id ? String(st.id) : `${theaterId}-${selectedDateString}-${st.time}-${st_idx}`, // Ensure id is string and unique
                movie_id: String(st.movie_id || decodedMovieId), // Ensure movie_id is string
                movie_display_title: st.movie_display_title || st.movie_name || movie?.display_title || "未知電影", 
                theater_id: theaterId, 
                theater_name: theaterName, 
                date: selectedDateString, // Correct: use selectedDateString (which is dateGroup.date)
                time: st.time, 
                type: st.type || "", // Default for type if undefined from st.type
                link: st.booking_link || st.link || "", // Default for link, prioritizing booking_link
                formattedTime: ft, // ft is string
                isAvailable: true, 
                formattedPrice: st.ticket_price ? `$${st.ticket_price}` : "洽詢影城",
                lang: st.lang || "",
                // booking_link is already part of ...st if st.booking_link exists, 
                // or it will be st.link if st.booking_link is undefined but st.link exists.
                // If FormattedShowtime's booking_link is optional, this is fine.
                // Let's re-check FormattedShowtime: booking_link?: string. So this is fine.
                // The explicit booking_link: st.booking_link || st.link line was actually redundant if we handle 'link' correctly.
                // Let's ensure the main 'link' field gets the priority booking_link if available.
              };
              groups[theaterId].push(formattedShowtime);
            });
          } else {
            // console.warn('allShowtimesByCinema: dateGroup.showtimes is not an array or undefined for theater:', theaterId, 'date:', dateGroup.date);
          }
        }
      });
    });

    return groups;
  }, [showtimes, showtimesLoading, selectedDateIdx, dateTabs, movie, decodedMovieId]);

  // 僅選中電影院的場次 group by 電影院，依照選擇的日期
  const showtimesByCinema = React.useMemo<Record<string, FormattedShowtime[]>>(() => {
    try {
      const groups: Record<string, FormattedShowtime[]> = {};
      
      // 如果沒有選擇電影院或資料載入中，返回空結果
      if (!Array.isArray(selectedCinemas) || selectedCinemas.length === 0 ||
          !allShowtimesByCinema || Object.keys(allShowtimesByCinema).length === 0) {
        return groups;
      }
      
      // 從 allShowtimesByCinema 中篩選出選中的電影院場次
      selectedCinemas.forEach(cinemaId => {
        if (allShowtimesByCinema[cinemaId]) {
          groups[cinemaId] = allShowtimesByCinema[cinemaId];
        }
      });
      
      return groups;
    } catch (error) {
      console.error('處理場次資料時出錯:', error);
      return {};
    }
  }, [allShowtimesByCinema, selectedCinemas]);

  // 測試函數：獲取特定電影的海報
  const testFetchRobotPoster = async () => {
    try {
      console.log('開始測試「再見機器人」海報獲取...');
      const posterUrl = await fetchTmdbPoster(
        {
          chinese_title: '再見機器人',
          english_title: 'Robot Dreams'
        }
        // tmdb_id is likely unknown in this specific test context
      );
      console.log('「再見機器人」海報URL:', posterUrl);
      
      if (posterUrl) {
        alert(`成功獲取海報: ${posterUrl}`);
      } else {
        alert('無法找到「再見機器人」的海報');
      }
    } catch (error) {
      console.error('測試海報獲取時出錯:', error);
      alert('測試海報獲取時出錯，請查看控制台');
    }
  };

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const pageUrl = `${siteUrl}/showtimes/${encodeURIComponent(decodedMovieId)}`;

  return (
    <>
      {/* JSON-LD Script for Movie Schema */}
      {movie && movie.id && movie.display_title !== DEFAULT_MOVIE.display_title && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(generateMovieJsonLd(movie, pageUrl)) }}
        />
      )}
      <div className="min-h-screen bg-gray-100">
      {/* 測試按鈕 - 僅在開發環境顯示 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 z-50">
          <button 
            onClick={testFetchRobotPoster}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full shadow-lg"
            title="測試「再見機器人」海報獲取"
          >
            測試「再見機器人」海報
          </button>
        </div>
      )}
      <main className="flex min-h-screen flex-col items-center px-4 md:px-8 py-6 bg-black text-white">
      <div className="w-full max-w-lg mx-auto flex items-center mb-6 md:mb-8">
        <Button variant="outline" onClick={() => router.push('/')} className="mr-4 text-sm py-1 px-3">
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold truncate">{movie.display_title}</h1>
        </div>
        <div className="w-16 md:w-20 h-24 md:h-30 overflow-hidden rounded-md shadow-lg relative">
          <img 
            src={movie.poster || placeholderImage} 
            alt={movie.display_title} 
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // 當圖片載入失敗時，使用預設圖片
              const target = e.target as HTMLImageElement;
              target.src = placeholderImage;
            }}
          />
        </div>
      </div>
      
      <div className="w-full max-w-lg mx-auto space-y-6 md:space-y-8">
        {/* 地圖組件 - 傳送場次資訊，只顯示有場次的電影院 */}
        <MapComponent 
          ref={mapRef}
          cinemas={filteredCinemas} 
          selectedCinemas={selectedCinemas} 
          setSelectedCinemas={setSelectedCinemas} 
          showtimesByCinema={allShowtimesByCinema}
          userLocation={userLocation}
          autoZoomEnabled={autoZoomEnabled}
          onAutoZoomToggle={setAutoZoomEnabled}
        />
        
        <CinemaSelector 
          cinemas={cinemas}
          cinemasLoading={cinemasLoading}
          showtimes={showtimes}
          cinemaQuery={cinemaQuery}
          setCinemaQuery={setCinemaQuery}
          selectedCinemas={selectedCinemas}
          setSelectedCinemas={handleCinemaSelectionFromList}
          filteredCinemas={filteredCinemas}
          userLocation={userLocation}
          onCinemaClick={handleCinemaClick}
        />
        
        <ShowtimesList 
          cinemas={filteredCinemas}
          showtimes={showtimesByCinema}
          selectedCinemas={selectedCinemas}
          dateTabs={dateTabs}
          selectedDateIdx={selectedDateIdx}
          setSelectedDateIdx={setSelectedDateIdx}
        />
      </div>
      </main>
    </div>
    </>
  );
}

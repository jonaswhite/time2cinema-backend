"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import API_URL from "@/lib/api/api";

// 導入拆分出的組件和類型
import { 
  Cinema, 
  TheaterShowtimes, 
  MovieInfo, 
  DEFAULT_MOVIE,
  FormattedShowtime,
  DateGroup
} from './types';
import { formatDateKey, createDateTabs, findCinemasWithShowtimes, getDateLabel, cleanTheaterName } from './utils';
import MapComponent from './MapComponent';
import CinemaSelector from './CinemaSelector';
import ShowtimesList from './ShowtimesList';

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
  const normalizeMovieName = (name: string): string => {
    if (!name) return '';
    
    // 移除所有空格、標點符號和特殊字元
    const normalized = name
      .replace(/\s+/g, '') // 移除空格
      .replace(/[\u3000\u00A0]/g, '') // 移除全形空格
      .replace(/[\-\[\]\(\)「」【】《》“”‘’]/g, '') // 移除括號
      .toLowerCase(); // 轉為小寫
      
    return normalized;
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
        console.warn("No decodedMovieId available for fetching movie info.");
        setMovie(DEFAULT_MOVIE); 
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        console.log(`[fetchMovieInfo] 開始查詢電影資訊 for: ${decodedMovieId}`);
        
        const searchResponse = await fetch(`${API_URL}/api/movies/search?query=${encodeURIComponent(decodedMovieId)}`);
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          console.log(`[fetchMovieInfo] 電影搜尋結果:`, searchData);
          
          if (Array.isArray(searchData) && searchData.length > 0) {
            const foundMovie = searchData[0]; // 假設第一個結果最相關
            console.log(`[fetchMovieInfo] 找到電影: ID=${foundMovie.id}, 名稱=${foundMovie.chinese_title || foundMovie.english_title}`);
            
            setMovie({
              id: foundMovie.id.toString(),
              display_title: foundMovie.chinese_title || foundMovie.english_title || decodedMovieId,
              full_title: foundMovie.english_title || foundMovie.chinese_title || decodedMovieId,
              chinese_title: foundMovie.chinese_title || null,
              english_title: foundMovie.english_title || null,
              release: foundMovie.release_date || 'N/A', // 提供合理的預設值
              poster: foundMovie.poster_url || "https://placehold.co/500x750/222/white?text=No+Poster"
            });
          } else {
            // API 成功返回，但未找到電影
            console.warn(`[fetchMovieInfo] 電影搜尋 API 未找到電影: ${decodedMovieId}`);
            setMovie({
              id: decodedMovieId, // 若未找到，ID 可能仍為電影名稱
              display_title: decodedMovieId,
              full_title: decodedMovieId,
              chinese_title: null,
              english_title: null,
              release: 'N/A',
              poster: "https://placehold.co/500x750/222/white?text=Movie+Not+Found"
            });
          }
        } else {
          // API 請求本身失敗
          console.error(`[fetchMovieInfo] 電影搜尋 API 請求失敗: ${searchResponse.status} ${searchResponse.statusText}`);
          setMovie({
            id: decodedMovieId,
            display_title: decodedMovieId,
            full_title: decodedMovieId,
            chinese_title: null,
            english_title: null,
            release: 'N/A',
            poster: "https://placehold.co/500x750/222/white?text=Error+Fetching+Movie"
          });
        }
      } catch (error) {
        console.error('[fetchMovieInfo] 獲取電影資訊時發生錯誤:', error);
        setMovie({
          id: decodedMovieId,
          display_title: decodedMovieId,
          full_title: decodedMovieId,
          chinese_title: null,
          english_title: null,
          release: 'N/A',
          poster: "https://placehold.co/500x750/222/white?text=Error"
        });
      } finally {
        setLoading(false);
        console.log(`[fetchMovieInfo] 電影資訊查詢結束 for: ${decodedMovieId}`);
      }
    };
    
    fetchMovieInfo();
  }, [decodedMovieId]);
  
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
        console.log(`成功獲取 ${data.length} 間電影院資料`);
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
      // 確保電影資訊已載入且有有效的電影 ID
      if (loading || !movie || movie.id === DEFAULT_MOVIE.id || movie.id === decodedMovieId) {
        console.log('[fetchShowtimes] 電影資訊尚未完全載入或 ID 無效，跳過場次查詢。Movie ID:', movie?.id);
        setShowtimes([]); // 清空舊場次
        setShowtimesLoading(false); // 確保 loading 狀態被重置
        return;
      }

      // 確保 dateTabs 和 selectedDateIdx 有效
      if (!dateTabs || dateTabs.length === 0 || selectedDateIdx < 0 || selectedDateIdx >= dateTabs.length) {
        console.warn('[fetchShowtimes] 日期標籤或選擇的日期索引無效。');
        setShowtimes([]);
        setShowtimesLoading(false);
        return;
      }

      const selectedDate = dateTabs[selectedDateIdx].date;
      const formattedDate = formatDateKey(selectedDate); // formatDateKey 應處理 Date 物件

      if (!formattedDate) {
        console.error('[fetchShowtimes] 無法格式化選擇的日期。');
        setShowtimes([]);
        setShowtimesLoading(false);
        return;
      }

      console.log(`[fetchShowtimes] 開始查詢電影 ${movie.display_title} (ID: ${movie.id}) 在日期 ${formattedDate} 的場次`);
      setShowtimesLoading(true);

      try {
        const url = `${API_URL}/api/showtimes/movie/${movie.id}?date=${formattedDate}`;
        console.log(`[fetchShowtimes] API URL: ${url}`);
        const response = await fetch(url); // Define response here

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[fetchShowtimes] 場次 API 請求失敗: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`場次 API 請求失敗: ${response.status} - ${errorText}`);
        }

        const data: TheaterShowtimes[] = await response.json();
        console.log(`[fetchShowtimes] 成功獲取 ${data.length} 個電影院的場次資料 for date ${formattedDate}:`, data);
        
        setShowtimes(data);

      } catch (error) {
        console.error(`[fetchShowtimes] 獲取電影 ${movie.display_title} (ID: ${movie.id}) 在日期 ${formattedDate} 的場次資料時發生錯誤:`, error);
        setShowtimes([]); // 出錯時清空場次
      } finally {
        setShowtimesLoading(false);
        console.log(`[fetchShowtimes] 場次資料查詢結束 for movie ID ${movie.id} and date ${formattedDate}`);
      }
    };

    fetchShowtimes();
  }, [movie, loading, selectedDateIdx, dateTabs, decodedMovieId]); // 保持 decodedMovieId 以處理 movie.id 可能還是名稱的情況
  
  // 有場次的電影院列表
  const filteredCinemas = React.useMemo(() => {
    console.log('[filteredCinemas] 計算開始...', { cinemasLoading, showtimesLoading, cinemaQuery });
    if (cinemasLoading || showtimesLoading || !Array.isArray(cinemas) || !Array.isArray(showtimes)) {
      console.log('[filteredCinemas] cinemas 或 showtimes 載入中或非陣列，返回空陣列。');
      return [];
    }

    if (showtimes.length === 0) {
      console.log('[filteredCinemas] showtimes 為空，返回空陣列。');
      return [];
    }
    
    const cleanedQuery = cinemaQuery ? cleanTheaterName(cinemaQuery) : '';
    console.log('[filteredCinemas] Cleaned query:', cleanedQuery);

    const resultCinemas: Cinema[] = [];
    const foundCinemaIds = new Set<string>();

    showtimes.forEach(theaterShowtimes => {
      const theaterId = String(theaterShowtimes.theater_id || theaterShowtimes.theaterId);
      const theaterName = theaterShowtimes.theater_name || theaterShowtimes.theaterName || '';
      const cleanedTheaterName = cleanTheaterName(theaterName);

      let hasActualShowtimes = false;
      if (Array.isArray(theaterShowtimes.showtimes_by_date)) {
        for (const dateGroup of theaterShowtimes.showtimes_by_date) {
          if (dateGroup && Array.isArray(dateGroup.showtimes) && dateGroup.showtimes.length > 0) {
            hasActualShowtimes = true;
            break;
          }
        }
      }
      
      if (!hasActualShowtimes) {
        return; 
      }

      if (cleanedQuery && !cleanedTheaterName.includes(cleanedQuery)) {
        return; 
      }

      const cinemaDetail = cinemas.find(c => String(c.id) === theaterId);
      if (cinemaDetail) {
        if (!foundCinemaIds.has(theaterId)) {
          resultCinemas.push(cinemaDetail);
          foundCinemaIds.add(theaterId);
        }
      } else {
        if (!foundCinemaIds.has(theaterId) && theaterName) {
           console.warn(`[filteredCinemas] 在 cinemas 陣列中未找到 ID 為 ${theaterId} 的電影院，但場次資料中存在。將使用場次資料中的名稱創建。`);
           resultCinemas.push({
             id: theaterId,
             name: theaterName,
             address: 'N/A',
             latitude: 25.0330,
             longitude: 121.5654,
           } as Cinema); // Cast to Cinema type
           foundCinemaIds.add(theaterId);
        }
      }
    });
    
    console.log(`[filteredCinemas] 計算完成，找到 ${resultCinemas.length} 個電影院。`, resultCinemas.map(c => c.name));
    return resultCinemas;
  }, [cinemas, cinemasLoading, cinemaQuery, showtimes, showtimesLoading]);
  
  // 所有有場次的電影院數據 (用於地圖顯示)
  const allShowtimesByCinema = React.useMemo<Record<string, FormattedShowtime[]>>(() => {
    console.log('[allShowtimesByCinema] 計算開始...', { showtimesLoading, movie });
    const groups: Record<string, FormattedShowtime[]> = {};

    if (showtimesLoading || !Array.isArray(showtimes) || showtimes.length === 0) {
      console.log('[allShowtimesByCinema] showtimes 載入中或為空，返回空物件。');
      return groups;
    }

    const selectedDateTab = dateTabs[selectedDateIdx];
    if (!selectedDateTab || !selectedDateTab.date) { // selectedDateTab.date is a Date object
      console.log('[allShowtimesByCinema] 未選擇有效日期分頁，返回空物件。');
      return groups;
    }
    // formatDateKey expects Date or parsable string, dateTabs[selectedDateIdx].date is Date
    const formattedSelectedDate = formatDateKey(selectedDateTab.date); 
    console.log(`[allShowtimesByCinema] 處理場次資料，選擇的日期: ${formattedSelectedDate}`);

    showtimes.forEach(theaterShowtimes => {
      if (!theaterShowtimes || (!theaterShowtimes.theater_id && !theaterShowtimes.theaterId)) {
        console.warn('[allShowtimesByCinema] theaterShowtimes 或 theater_id 未定義:', theaterShowtimes);
      } else {
        const theaterId = String(theaterShowtimes.theater_id || theaterShowtimes.theaterId);
        
        if (!Array.isArray(theaterShowtimes.showtimes_by_date)) {
          return;
        }

        theaterShowtimes.showtimes_by_date.forEach(dateGroup => {
          if (!dateGroup || !dateGroup.date || !Array.isArray(dateGroup.showtimes)) {
            return;
          }
          
          // dateGroup.date is already "YYYY-MM-DD" string from backend
          const showtimeDateStr = dateGroup.date; 

          if (showtimeDateStr === formattedSelectedDate) {
            if (!groups[theaterId]) {
              groups[theaterId] = [];
            }
            dateGroup.showtimes.forEach((st, index) => { // st is Showtime from types.ts
              const uniqueShowtimeId = `${theaterId}-${st.movie_id}-${showtimeDateStr}-${st.time}-${index}`;
              
              let showtimeType = st.type || '數位'; // Default type
              if (Array.isArray(st.attributes) && st.attributes.length > 0) {
                showtimeType = st.attributes.join(' / '); // Combine attributes like "IMAX / ATMOS"
              }

              const formattedShowtime: FormattedShowtime = {
                id: uniqueShowtimeId,
                movie_id: String(st.movie_id || movie?.id || 'unknown_movie_id'),
                movie_display_title: st.movie_display_title || st.movie_name || movie?.display_title || '未知電影',
                theater_id: theaterId,
                theater_name: theaterShowtimes.theater_name || theaterShowtimes.theaterName || '未知影院',
                date: showtimeDateStr,
                time: st.time,
                type: showtimeType,
                link: st.booking_link || st.link || '#', // Prioritize booking_link
                movie_poster_url: st.movie_poster_url || movie?.poster,
                movie_release_date: st.movie_release_date || movie?.release,
                ticket_price: st.ticket_price,
                attributes: st.attributes,
                lang: st.lang || '國語',
                booking_link: st.booking_link,

                // Derived fields
                formattedTime: st.time, // Placeholder, can be improved with toLocaleTimeString later if needed
                isAvailable: true, // Placeholder: Assume available. Actual logic might depend on backend data.
                formattedPrice: st.ticket_price ? `NT$ ${st.ticket_price}` : '洽詢影城',
              };
              groups[theaterId].push(formattedShowtime);
            });
          }
        });
      }
    });

    console.log(`[allShowtimesByCinema] 計算完成，為 ${Object.keys(groups).length} 個電影院分組了場次。`);
    return groups;
  }, [showtimes, showtimesLoading, dateTabs, selectedDateIdx, movie, formatDateKey]); // Added formatDateKey


  // 僅選中電影院的場次 group by 電影院，依照選擇的日期
  const showtimesByCinema = React.useMemo<Record<string, FormattedShowtime[]>>(() => {
    try {
      const groups: Record<string, FormattedShowtime[]> = {};
      
      // 如果沒有選擇電影院或資料載入中，返回空結果
      if (!Array.isArray(selectedCinemas) || selectedCinemas.length === 0 ||
          !allShowtimesByCinema || Object.keys(allShowtimesByCinema).length === 0) {
        console.log('沒有選擇電影院或沒有場次資料');
        return groups;
      }
      
      console.log('所有場次資料:', allShowtimesByCinema);
      console.log('選擇的電影院 ID:', selectedCinemas);
      
      // 從 allShowtimesByCinema 中篩選出選中的電影院場次
      selectedCinemas.forEach(cinemaId => {
        const cinemaShowtimes = allShowtimesByCinema[cinemaId];
        console.log(`處理電影院 ${cinemaId} 的場次:`, cinemaShowtimes);
        
        if (cinemaShowtimes && Array.isArray(cinemaShowtimes) && cinemaShowtimes.length > 0) {
          // 確保每個場次都有必要的欄位
          const validShowtimes = cinemaShowtimes.filter(showtime => 
            showtime && showtime.time && showtime.theater_id
          );
          
          if (validShowtimes.length > 0) {
            groups[cinemaId] = validShowtimes;
            console.log(`電影院 ${cinemaId} 有 ${validShowtimes.length} 個有效場次`);
          } else {
            console.log(`電影院 ${cinemaId} 沒有有效場次`);
          }
        } else {
          console.log(`電影院 ${cinemaId} 沒有場次資料`);
        }
      });
      
      console.log('最終的場次分組:', groups);
      return groups;
    } catch (error) {
      console.error('處理場次資料時出錯:', error);
      return {};
    }
  }, [allShowtimesByCinema, selectedCinemas]);

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-black text-white">
      <div className="w-full max-w-lg flex items-center mb-8">
        <Button variant="outline" onClick={() => router.push('/')} className="mr-4">
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{movie.display_title}</h1>
        </div>
        <div className="w-20 h-30 overflow-hidden rounded-md shadow-lg">
          <img 
            src={movie.poster || 'https://image.tmdb.org/t/p/w500/pWJW4c8jHRw0X0FMiRfvOUXKGgf.jpg'} 
            alt={movie.display_title} 
            className="w-full h-full object-cover" 
            onError={(e) => {
              // 如果圖片載入失敗，使用預設圖片
              e.currentTarget.src = 'https://image.tmdb.org/t/p/w500/pWJW4c8jHRw0X0FMiRfvOUXKGgf.jpg';
            }}
          />
        </div>
      </div>
      
      {/* 地圖組件 - 傳遞場次資訊，只顯示有場次的電影院 */}
      <MapComponent 
        cinemas={filteredCinemas} 
        selectedCinemas={selectedCinemas} 
        setSelectedCinemas={setSelectedCinemas} 
        showtimesByCinema={allShowtimesByCinema}
        userLocation={userLocation}
      />
      
      {/* 電影院選擇器 */}
      <CinemaSelector 
        cinemas={cinemas}
        cinemasLoading={cinemasLoading}
        showtimes={showtimes}
        cinemaQuery={cinemaQuery}
        setCinemaQuery={setCinemaQuery}
        selectedCinemas={selectedCinemas}
        setSelectedCinemas={setSelectedCinemas}
        filteredCinemas={filteredCinemas}
        userLocation={userLocation}
      />
      
      {/* 場次列表 */}
      <ShowtimesList 
        cinemas={cinemas}
        showtimes={showtimesByCinema}
        selectedCinemas={selectedCinemas}
        dateTabs={dateTabs}
        selectedDateIdx={selectedDateIdx}
        setSelectedDateIdx={setSelectedDateIdx}
      />
    </main>
  );
}

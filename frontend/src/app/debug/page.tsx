"use client";

import React, { useEffect, useState } from 'react';
import API_URL from '@/lib/api/api';

// 定義電影資料的介面
interface BoxOfficeMovie {
  id: number;
  full_title: string;
  chinese_title: string | null;
  english_title: string | null;
  release_date: string;
  total_gross: number;
  poster_path: string | null;
  [key: string]: any; // 允許其他屬性
}

// 清理電影名稱的函數
function cleanMovieName(name: string) {
  return name
    .replace(/\s+/g, '') // 移除所有空格
    .replace(/[^\w\u4e00-\u9fff]/g, '') // 移除非字母數字和中文字符
    .toLowerCase();
}

// 檢查兩個電影名稱是否相似
function areNamesMatching(name1: string, name2: string) {
  const clean1 = cleanMovieName(name1);
  const clean2 = cleanMovieName(name2);
  
  // 完全匹配
  if (clean1 === clean2) return { match: true, score: 100, reason: '完全匹配' };
  
  // 包含關係
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    const longerName = clean1.length > clean2.length ? clean1 : clean2;
    const shorterName = clean1.length <= clean2.length ? clean1 : clean2;
    const score = Math.round((shorterName.length / longerName.length) * 80);
    return { 
      match: score >= 50, 
      score, 
      reason: `包含關係 (${shorterName} 包含於 ${longerName})` 
    };
  }
  
  // 檢查數字表示法差異 (例如 "會計師 2" vs "會計師2")
  const digitRegex1 = clean1.match(/(\D+)(\d+)/);
  const digitRegex2 = clean2.match(/(\D+)(\d+)/);
  
  if (digitRegex1 && digitRegex2 && 
      digitRegex1[1] === digitRegex2[1] && 
      digitRegex1[2] === digitRegex2[2]) {
    return { match: true, score: 90, reason: '數字表示法差異' };
  }
  
  return { match: false, score: 0, reason: '不匹配' };
}

export default function DebugPage() {
  const [boxOfficeMovies, setBoxOfficeMovies] = useState<BoxOfficeMovie[]>([]);
  const [showtimeMovies, setShowtimeMovies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [unmatchedMovies, setUnmatchedMovies] = useState<string[]>([]);
  
  // 用於存儲原始 API 響應的狀態
  const [rawBoxOfficeData, setRawBoxOfficeData] = useState<any>(null);
  const [rawShowtimesData, setRawShowtimesData] = useState<any>(null);
  const [apiUrls, setApiUrls] = useState<{boxOffice: string, showtimes: string}>({boxOffice: '', showtimes: ''});
  
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        console.log('API_URL:', API_URL);
        
        // 獲取票房榜電影
        const boxOfficeUrl = `${API_URL}/api/tmdb/boxoffice-with-posters`;
        console.log('票房榜 API URL:', boxOfficeUrl);
        setApiUrls(prev => ({...prev, boxOffice: boxOfficeUrl}));
        
        const boxOfficeResponse = await fetch(boxOfficeUrl);
        console.log('票房榜 API 響應狀態:', boxOfficeResponse.status);
        
        if (!boxOfficeResponse.ok) {
          throw new Error(`票房榜 API 請求失敗: ${boxOfficeResponse.status}`);
        }
        
        const boxOfficeData = await boxOfficeResponse.json();
        console.log('票房榜電影數量:', boxOfficeData.length);
        console.log('票房榜電影樣本:', boxOfficeData.slice(0, 3));
        setRawBoxOfficeData(boxOfficeData);
        
        // 獲取今天的場次資料
        const today = new Date();
        const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        console.log('格式化日期:', formattedDate);
        
        // 嘗試多個 API 路徑
        let showtimesData: any[] = [];
        let showtimesUrl = '';
        
        // 嘗試 /api/showtimes/date/{date} 路徑
        showtimesUrl = `${API_URL}/api/showtimes/date/${formattedDate}`;
        console.log('嘗試場次 API URL (1):', showtimesUrl);
        
        try {
          const response = await fetch(showtimesUrl);
          console.log('場次 API 響應狀態 (1):', response.status);
          
          if (response.ok) {
            showtimesData = await response.json();
            console.log('場次資料獲取成功 (1), 長度:', showtimesData.length);
            setApiUrls(prev => ({...prev, showtimes: showtimesUrl}));
          } else {
            console.log('場次 API (1) 請求失敗，嘗試備用路徑');
            
            // 嘗試 /api/showtimes 路徑
            showtimesUrl = `${API_URL}/api/showtimes`;
            console.log('嘗試場次 API URL (2):', showtimesUrl);
            
            const response2 = await fetch(showtimesUrl);
            console.log('場次 API 響應狀態 (2):', response2.status);
            
            if (response2.ok) {
              showtimesData = await response2.json();
              console.log('場次資料獲取成功 (2), 長度:', showtimesData.length);
              setApiUrls(prev => ({...prev, showtimes: showtimesUrl}));
            } else {
              // 最後嘗試 /api/showtimes/movie/{movieId} 路徑
              // 使用第一部票房電影作為測試
              if (boxOfficeData.length > 0) {
                const testMovieId = encodeURIComponent(boxOfficeData[0].full_title || '');
                showtimesUrl = `${API_URL}/api/showtimes/movie/${testMovieId}?date=${formattedDate}`;
                console.log('嘗試場次 API URL (3):', showtimesUrl);
                
                const response3 = await fetch(showtimesUrl);
                console.log('場次 API 響應狀態 (3):', response3.status);
                
                if (response3.ok) {
                  showtimesData = await response3.json();
                  console.log('場次資料獲取成功 (3), 長度:', showtimesData.length);
                  setApiUrls(prev => ({...prev, showtimes: showtimesUrl}));
                } else {
                  throw new Error(`所有場次 API 請求都失敗`);
                }
              }
            }
          }
        } catch (error) {
          console.error('獲取場次資料時出錯:', error);
          throw new Error(`場次 API 請求失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
        }
        
        setRawShowtimesData(showtimesData);
        
        // 檢查場次資料結構
        console.log('場次資料結構樣本:', showtimesData.length > 0 ? showtimesData[0] : '無場次資料');
        
        // 從場次資料中提取電影名稱
        const showtimeMoviesSet = new Set<string>();
        let movieNamesFound = 0;
        
        showtimesData.forEach((theater: any) => {
          console.log('處理電影院:', theater.theater_name || '未知電影院');
          
          if (theater.showtimes_by_date && Array.isArray(theater.showtimes_by_date)) {
            console.log(`電影院 ${theater.theater_name} 有 ${theater.showtimes_by_date.length} 個日期的場次`);
            
            theater.showtimes_by_date.forEach((dateData: any) => {
              console.log(`日期: ${dateData.date}, 場次數: ${dateData.showtimes?.length || 0}`);
              
              if (dateData.showtimes && Array.isArray(dateData.showtimes)) {
                dateData.showtimes.forEach((showtime: any) => {
                  if (showtime.movie_name) {
                    showtimeMoviesSet.add(showtime.movie_name);
                    movieNamesFound++;
                  }
                });
              }
            });
          } else {
            console.log(`電影院 ${theater.theater_name} 沒有場次資料或格式不正確`);
          }
        });
        
        console.log(`總共找到 ${movieNamesFound} 個場次，去重後有 ${showtimeMoviesSet.size} 部電影`);
        
        const showtimeMoviesList = Array.from(showtimeMoviesSet);
        console.log('場次電影列表樣本:', showtimeMoviesList.slice(0, 5));
        
        // 設置狀態
        setBoxOfficeMovies(boxOfficeData);
        setShowtimeMovies(showtimeMoviesList);
        
        // 計算匹配結果
        const results = boxOfficeData.map((boxOfficeMovie: BoxOfficeMovie) => {
          const movieName = boxOfficeMovie.full_title || (boxOfficeMovie.chinese_title || '');
          let bestMatch = null;
          let bestScore = 0;
          
          // 尋找最佳匹配
          for (const showtimeMovie of showtimeMoviesList) {
            const matchResult = areNamesMatching(movieName, showtimeMovie);
            if (matchResult.match && matchResult.score > bestScore) {
              bestMatch = {
                name: showtimeMovie,
                score: matchResult.score,
                reason: matchResult.reason
              };
              bestScore = matchResult.score;
            }
          }
          
          return {
            boxOfficeMovie: movieName,
            match: bestMatch,
            posterUrl: boxOfficeMovie.posterUrl || ''
          };
        });
        
        setMatchResults(results);
        
        // 找出有場次但不在票房榜上的電影
        const boxOfficeMovieNames = boxOfficeData.map((m: BoxOfficeMovie) => m.full_title || (m.chinese_title || ''));
        
        const unmatchedShowtimeMovies = showtimeMoviesList.filter(showtimeMovie => {
          return !boxOfficeMovieNames.some((boxOfficeMovie: string) => 
            areNamesMatching(boxOfficeMovie, showtimeMovie).match
          );
        });
        
        setUnmatchedMovies(unmatchedShowtimeMovies);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知錯誤');
        console.error('獲取資料時出錯:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <h1 className="text-2xl font-bold mb-4">電影名稱對應關係檢查</h1>
        <p>正在載入資料...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <h1 className="text-2xl font-bold mb-4">電影名稱對應關係檢查</h1>
        <p className="text-red-500">錯誤: {error}</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl font-bold mb-4">電影名稱對應關係檢查</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">統計資訊</h2>
        <p>票房榜電影數量: {boxOfficeMovies.length}</p>
        <p>有場次的電影數量: {showtimeMovies.length}</p>
        <p>有匹配場次的票房榜電影: {matchResults.filter(r => r.match).length}</p>
        <p>無匹配場次的票房榜電影: {matchResults.filter(r => !r.match).length}</p>
        <p>有場次但不在票房榜上的電影: {unmatchedMovies.length}</p>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">API 資訊</h2>
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <p>票房榜 API: <code className="bg-gray-700 px-2 py-1 rounded">{apiUrls.boxOffice}</code></p>
          <p>場次 API: <code className="bg-gray-700 px-2 py-1 rounded">{apiUrls.showtimes}</code></p>
        </div>
      </div>
      
      {/* 原始數據顯示 */}
      <div className="mb-8">
        <details className="bg-gray-800 p-4 rounded-lg">
          <summary className="text-xl font-semibold cursor-pointer">原始數據顯示</summary>
          
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">票房榜原始數據</h3>
            <div className="bg-gray-900 p-4 rounded-lg overflow-auto max-h-60">
              <pre className="text-xs">{JSON.stringify(rawBoxOfficeData, null, 2)}</pre>
            </div>
          </div>
          
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">場次原始數據</h3>
            <div className="bg-gray-900 p-4 rounded-lg overflow-auto max-h-60">
              <pre className="text-xs">{JSON.stringify(rawShowtimesData, null, 2)}</pre>
            </div>
          </div>
        </details>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">票房榜電影與場次對應關係</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matchResults.map((result, index) => (
            <div key={index} className="border border-gray-700 rounded-lg p-4">
              <div className="flex items-start mb-2">
                <div className="w-16 h-24 mr-2 overflow-hidden rounded">
                  {result.posterUrl ? (
                    <img 
                      src={result.posterUrl} 
                      alt={result.boxOfficeMovie} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/160x240/222/white?text=No+Poster';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs text-center">
                      無海報
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{result.boxOfficeMovie}</h3>
                  {result.match ? (
                    <div className="text-green-400">
                      <p>✓ 匹配到: {result.match.display_title}</p>
                      <p className="text-xs">分數: {result.match.score}, {result.match.reason}</p>
                    </div>
                  ) : (
                    <p className="text-red-400">✗ 無匹配場次</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {showtimeMovies.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">所有有場次的電影</h2>
          <div className="bg-gray-800 p-4 rounded-lg overflow-auto max-h-60">
            <ul className="list-disc pl-5">
              {showtimeMovies.map((movie, index) => (
                <li key={index}>{movie}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {unmatchedMovies.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">有場次但不在票房榜上的電影</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unmatchedMovies.map((movie, index) => (
              <div key={index} className="border border-gray-700 rounded-lg p-4">
                <p>{movie}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

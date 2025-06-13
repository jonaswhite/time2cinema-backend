import { useState, useCallback, useEffect } from 'react';
import { NowShowingMovie, DisplayMovie } from '@/lib/types/movie';
import { formatDate } from '@/lib/utils/format';
import API_URL from '@/lib/api/api';

interface UseNowShowingDataProps { // 新增 Props 接口
  isBackendReady: boolean;
}

import { fetchTmdbPoster } from '@/lib/tmdb';

export const useNowShowingData = ({ isBackendReady }: UseNowShowingDataProps) => { // 接收 isBackendReady
  const [nowShowing, setNowShowing] = useState<DisplayMovie[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // 初始設為 true
  const [error, setError] = useState<string | null>(null);

  const fetchNowShowing = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Fetching now showing movies from:', `${API_URL}/api/movies/now-showing`);
      const response = await fetch(`${API_URL}/api/movies/now-showing`);
      console.log('API Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error response:', errorText);
        throw new Error(`獲取上映中數據失敗: ${response.status} ${response.statusText}`);
      }
      
      const data: NowShowingMovie[] = await response.json();
      console.log('API Response data:', data);
      
      const formattedData: DisplayMovie[] = data.map((movie: NowShowingMovie) => {
        const display_title = movie.chinese_title || movie.full_title || '未知電影';
        const formattedMovie = {
          id: movie.id?.toString() || '',
          display_title: display_title,
          full_title: movie.full_title,
          chinese_title: movie.chinese_title,
          english_title: movie.english_title,
          releaseDate: formatDate(movie.release_date) || '未定',
          poster: movie.poster_url,
          runtime: movie.runtime,
          tmdb_id: movie.tmdb_id,
          genres: movie.genres || []
        };
        console.log('Formatted movie:', formattedMovie);
        return formattedMovie;
      });
      
      console.log('Setting now showing movies:', formattedData);
      setNowShowing(formattedData);
      setError(null);
      return formattedData;
    } catch (err) {
      console.error('Error fetching now showing movies:', err);
      const errorMessage = err instanceof Error ? err.message : '獲取上映中數據失敗，請稍後再試';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isBackendReady) { // 只有當後端準備好時才獲取數據
      fetchNowShowing().catch(console.error);
    } else {
      // 如果後端未準備好，保持 loading 狀態
      // setLoading(true); // 確保在 isBackendReady 變為 true 之前，loading 狀態為 true
    }
  }, [fetchNowShowing, isBackendReady]); // 加入 isBackendReady 到依賴項

  // Effect to fetch TMDB posters if missing
  useEffect(() => {
    const updatePosters = async () => {
      if (nowShowing.length === 0) return;

      let moviesUpdated = false;
      const updatedMovies = await Promise.all(
        nowShowing.map(async (movie) => {
          if (!movie.poster) {
            const posterUrl = await fetchTmdbPoster(
              {
                chinese_title: movie.chinese_title,
                english_title: movie.english_title,
                full_title: movie.full_title
              },
              movie.tmdb_id
            );
            if (posterUrl) {
              moviesUpdated = true;
              return { ...movie, poster: posterUrl };
            }
          }
          return movie;
        })
      );

      if (moviesUpdated) {
        setNowShowing(updatedMovies);
      }
    };

    if (isBackendReady) { // Only run if backend is ready and initial fetch might have completed
        updatePosters().catch(console.error);
    }
  }, [nowShowing, isBackendReady]); // Rerun if nowShowing list itself changes or backend readiness changes

  const refetch = async () => {
    if (!isBackendReady) { // 如果後端未準備好，refetch 不執行
      console.warn("Backend is not ready, refetch is ignored.");
      return;
    }
    try {
      return await fetchNowShowing();
    } catch (err) {
      console.error('Error refetching now showing movies:', err);
      throw err;
    }
  };

  return { nowShowing, loading, error, refetch };
};

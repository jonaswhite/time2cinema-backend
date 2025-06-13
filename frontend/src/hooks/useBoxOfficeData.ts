import { useState, useEffect, useCallback } from 'react';
import { BoxOfficeMovie, DisplayMovie } from '@/lib/types/movie';
import { formatTickets } from '@/lib/utils/format';
import API_URL from '@/lib/api/api';
import { fetchTmdbPoster } from '@/lib/tmdb';

interface UseBoxOfficeDataProps {
  isBackendReady: boolean; // 新增參數
}

export const useBoxOfficeData = ({ isBackendReady }: UseBoxOfficeDataProps) => {
  const [boxOffice, setBoxOffice] = useState<DisplayMovie[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoxOffice = useCallback(async () => {
    console.log('[BoxOffice Debug] fetchBoxOffice called');
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/boxoffice`);
      if (!response.ok) {
        throw new Error('獲取票房數據失敗');
      }
      const data: BoxOfficeMovie[] = await response.json();
      console.log('[BoxOffice Debug] API response received, data length:', data.length);
      if (data.length > 0) {
        console.log('[BoxOffice Debug] First movie from API:', JSON.stringify(data[0]));
        const robotDreamsRaw = data.find(m => (m.chinese_title || m.full_title)?.includes('再見機器人') || m.english_title?.includes('Robot Dreams'));
        if (robotDreamsRaw) {
          console.log('[BoxOffice Debug] Raw data for 再見機器人 from API:', JSON.stringify(robotDreamsRaw));
        }
      }
      // 轉換數據格式
      const formattedData: DisplayMovie[] = data.map((movie: BoxOfficeMovie) => {
        const display_title = movie.chinese_title || movie.full_title || '未知電影';
        return {
          id: movie.id?.toString() || '',
          display_title: display_title,
          full_title: movie.full_title,
          chinese_title: movie.chinese_title,
          english_title: movie.english_title,
          rank: movie.rank,
          weeklySales: formatTickets(movie.tickets),
          releaseDate: movie.release_date || '未定',
          poster: movie.poster_url,
          runtime: movie.runtime,
          tmdb_id: movie.tmdb_id
        };
      });
      console.log('[BoxOffice Debug] formattedData created, length:', formattedData.length);
      if (formattedData.length > 0) {
        console.log('[BoxOffice Debug] First movie from formattedData:', JSON.stringify(formattedData[0]));
        const robotDreamsFormatted = formattedData.find(m => (m.chinese_title || m.full_title)?.includes('再見機器人') || m.english_title?.includes('Robot Dreams'));
        if (robotDreamsFormatted) {
          console.log('[BoxOffice Debug] Formatted data for 再見機器人:', JSON.stringify(robotDreamsFormatted));
        }
      }
      // Now, process these formatted movies for poster fallbacks
      const moviesWithFallbacks = await Promise.all(
        formattedData.map(async (movie) => {
          // Log for every movie before fallback check
          if ((movie.chinese_title || movie.full_title)?.includes('再見機器人') || movie.english_title?.includes('Robot Dreams')) {
            console.log(`[BoxOffice Debug] Checking movie (in map): ${movie.chinese_title || movie.full_title}, Poster: '${movie.poster}', Type: ${typeof movie.poster}`);
          }
          if (!movie.poster) {
            const primaryTitle = movie.chinese_title || movie.full_title;
            const secondaryTitle = movie.english_title;
            if ((movie.chinese_title || movie.full_title)?.includes('再見機器人') || movie.english_title?.includes('Robot Dreams')) {
              console.log(`[BoxOffice Debug] Attempting to fetch TMDB poster for: ${primaryTitle} (chinese/full) / ${secondaryTitle} (english)`);
              console.log(`[BoxOffice Debug] Movie ID: ${movie.id}, Current movie.poster: '${movie.poster}' (Type: ${typeof movie.poster})`);
            }
            const posterUrl = await fetchTmdbPoster(
              { 
                chinese_title: movie.chinese_title, 
                english_title: movie.english_title,
                full_title: movie.full_title 
              },
              movie.tmdb_id
            );
            if ((movie.chinese_title || movie.full_title)?.includes('再見機器人') || movie.english_title?.includes('Robot Dreams')) {
              console.log(`[BoxOffice Debug] TMDB posterUrl for ${primaryTitle}: ${posterUrl}`);
            }
            if (posterUrl) {
              return { ...movie, poster: posterUrl };
            }
          }
          return movie;
        })
      );
      setBoxOffice(moviesWithFallbacks);
      setError(null);
    } catch (err) {
      console.error('Error fetching box office data:', err);
      const errorMessage = err instanceof Error ? err.message : '獲取票房數據失敗，請稍後再試';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      console.log('[BoxOffice Debug] useEffect for fetchInitialData triggered. isBackendReady:', isBackendReady);
      if (isBackendReady) { // 只有後端準備好才執行
        await fetchBoxOffice();
      } else {
        console.log('[BoxOffice Debug] Backend not ready, fetchBoxOffice not called.');
      }
    };
    fetchInitialData();
  }, [fetchBoxOffice, isBackendReady]); // 加入 isBackendReady 到依賴項

  // 提供手動刷新函數
  const refetch = async () => {
    try {
      return await fetchBoxOffice();
    } catch (err) {
      console.error('Error refetching box office data:', err);
      throw err;
    }
  };

  return { boxOffice, loading, error, refetch };
};

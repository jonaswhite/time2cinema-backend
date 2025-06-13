import React, { useEffect } from 'react';
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import MovieCard from "./MovieCard";
import { DisplayMovie } from '@/lib/types/movie';
import { useNowShowingData } from '@/hooks/useNowShowingData';
import { cn } from '@/lib/utils';

interface NowShowingSectionProps {
  searchTerm: string;
  isBackendReady: boolean; // 新增 prop
}

const NowShowingSection: React.FC<NowShowingSectionProps> = ({ searchTerm = '', isBackendReady }) => { // 接收 isBackendReady
  // 將 isBackendReady 傳遞給 Hook
  const { nowShowing, loading, error, refetch } = useNowShowingData({ isBackendReady });

  // Log 原始數據順序
  useEffect(() => {
    if (nowShowing.length > 0) {
      console.log('[NowShowingSection] Original nowShowing data from hook:', JSON.parse(JSON.stringify(nowShowing.map(m => ({ display_title: m.display_title, releaseDate: m.releaseDate })))));
    }
  }, [nowShowing]);

  // 過濾電影
  const filteredMovies = nowShowing.filter(movie => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      movie.display_title?.toLowerCase().includes(searchTermLower) ||
      movie.full_title?.toLowerCase().includes(searchTermLower) ||
      (movie.english_title && movie.english_title.toLowerCase().includes(searchTermLower)) ||
      (movie.chinese_title && movie.chinese_title.toLowerCase().includes(searchTermLower))
    );
  });

  // Log 過濾後數據順序
  useEffect(() => {
    if (filteredMovies.length > 0) {
      console.log('[NowShowingSection] Filtered movies data:', JSON.parse(JSON.stringify(filteredMovies.map(m => ({ display_title: m.display_title, releaseDate: m.releaseDate })))));
    }
  }, [filteredMovies]);

  // 處理重新整理
  const handleRefresh = () => {
    if (isBackendReady) { // 只有後端準備好才執行 refetch
        refetch();
    } else {
        console.warn("Backend not ready, refresh is ignored.");
    }
  };

  // 如果後端未就緒且沒有在冷啟動等待畫面，則顯示一個通用的加載提示
  if (!isBackendReady && loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-card/80 rounded-md overflow-hidden shadow-sm flex flex-row h-[120px] w-full border border-border/20">
            <div className="relative w-[80px] flex-shrink-0">
              <Skeleton className="h-full w-full" />
            </div>
            <div className="py-3 px-4 flex flex-col justify-between flex-1">
              <div>
                <Skeleton className="h-5 w-3/4 mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div>
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // 錯誤處理 - 這個部分可以保留，因為錯誤可能在 isBackendReady 為 true 後發生
  if (error && isBackendReady) { // 只在後端準備好後才顯示 API 錯誤
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center mx-auto"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          重新載入
        </button>
      </div>
    );
  }

  // 載入中的骨架屏
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array(6).fill(0).map((_, index) => (
          <Skeleton key={index} className="w-full h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  // 錯誤處理
  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center mx-auto"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 載入中狀態 - 這個 loading 是指 hook 內部 fetch 的 loading */}
      {loading && isBackendReady ? ( // 只在後端準備好且仍在加載時顯示
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card/80 rounded-md overflow-hidden shadow-sm flex flex-row h-[120px] w-full border border-border/20">
              <div className="relative w-[80px] flex-shrink-0">
                <Skeleton className="h-full w-full" />
              </div>
              <div className="py-3 px-4 flex flex-col justify-between flex-1">
                <div>
                  <Skeleton className="h-5 w-3/4 mb-1" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div>
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error && isBackendReady ? ( // 再次檢查錯誤，以防上面的條件未捕獲
        /* 錯誤狀態 */
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">載入失敗: {error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            重試
          </button>
        </div>
      ) : filteredMovies.length === 0 && isBackendReady ? ( // 只有後端準備好且無資料才顯示
        /* 無資料狀態 */
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? '沒有符合搜尋條件的電影' : '暫無上映中'}
        </div>
      ) : isBackendReady ? ( // 只有後端準備好才顯示電影列表
        <div className="space-y-2">
          {filteredMovies.map((movie: DisplayMovie, index: number) => (
            <MovieCard key={`${movie.id || 'unknown'}-${index}`} movie={movie} />
          ))}
        </div>
      ) : null } {/* 如果 isBackendReady 為 false 且不符合上面的 loading 條件，則不渲染任何東西（因為 page.tsx 會顯示等待畫面）*/}
    </div>
  );
};

export default NowShowingSection;

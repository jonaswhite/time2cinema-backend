import React from 'react';
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import MovieCard from "./MovieCard";
import { DisplayMovie } from '@/lib/types/movie';
import { useBoxOfficeData } from '@/hooks/useBoxOfficeData';
import { cn } from '@/lib/utils';

interface BoxOfficeSectionProps {
  searchTerm: string;
  isBackendReady: boolean; // 新增 prop
}

const BoxOfficeSection: React.FC<BoxOfficeSectionProps> = ({ searchTerm = '', isBackendReady }) => { // 接收 isBackendReady
  // 將 isBackendReady 傳遞給 Hook
  const { boxOffice, loading, error, refetch } = useBoxOfficeData({ isBackendReady }); 

  // 過濾電影
  const filteredMovies = boxOffice.filter(movie => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      movie.display_title?.toLowerCase().includes(searchTermLower) ||
      movie.full_title?.toLowerCase().includes(searchTermLower) ||
      (movie.english_title && movie.english_title.toLowerCase().includes(searchTermLower)) ||
      (movie.chinese_title && movie.chinese_title.toLowerCase().includes(searchTermLower))
    );
  });

  // 處理重新整理
  const handleRefresh = () => {
    if (isBackendReady) { // 只有後端準備好才執行 refetch
        refetch();
    } else {
        console.warn("Backend not ready, refresh is ignored.");
    }
  };

  // 如果後端未就緒且沒有在冷啟動等待畫面，則顯示一個通用的加載提示
  // 這避免了在 isBackendReady 為 false 時，即使 loading 為 false (因為 hook 尚未執行 fetch) 也顯示 "暫無票房資料"
  if (!isBackendReady && loading) { // loading 初始為 true，在 hook 第一次執行 fetch 前保持
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

  return (
    <div className="space-y-3">
      {/* 載入中狀態 */}
      {loading ? (
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
      ) : error ? (
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
      ) : filteredMovies.length === 0 ? (
        /* 無資料狀態 */
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? '沒有符合搜尋條件的電影' : '暫無票房資料'}
        </div>
      ) : (
        /* 電影列表 */
        <div className="space-y-2">
          {filteredMovies.map((movie: DisplayMovie, index: number) => (
            <MovieCard key={`${movie.id || 'unknown'}-${index}`} movie={movie} showRank={true} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BoxOfficeSection;

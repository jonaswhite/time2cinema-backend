"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cinema } from '@/components/showtimes/types';
import { findCinemasWithShowtimes, sortCinemasByDistance } from './utils';
import { TheaterShowtimes } from '@/components/showtimes/types';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';

interface CinemaSelectorProps {
  cinemas: Cinema[];
  cinemasLoading: boolean;
  showtimes: TheaterShowtimes[];
  cinemaQuery: string;
  setCinemaQuery: React.Dispatch<React.SetStateAction<string>>;
  selectedCinemas: string[];
  setSelectedCinemas: React.Dispatch<React.SetStateAction<string[]>>;
  filteredCinemas: Cinema[];
  userLocation?: {lat: number, lng: number} | null;
  onCinemaClick?: (cinemaIds: string[]) => void; // 新增：當電影院被點擊時回調
}

const CinemaSelector: React.FC<CinemaSelectorProps> = ({
  cinemas,
  cinemasLoading,
  showtimes,
  cinemaQuery,
  setCinemaQuery,
  selectedCinemas,
  setSelectedCinemas,
  filteredCinemas,
  userLocation,
  onCinemaClick
}) => {
  const [showAllCinemas, setShowAllCinemas] = useState(false);
  
  // 根據用戶位置對電影院進行排序
  const sortedCinemas = React.useMemo(() => {
    if (!userLocation || !filteredCinemas.length) return filteredCinemas;
    return sortCinemasByDistance(filteredCinemas, userLocation.lat, userLocation.lng);
  }, [filteredCinemas, userLocation]);
  
  // 決定顯示哪些電影院
  const displayedCinemas = React.useMemo(() => {
    if (cinemaQuery.trim() || showAllCinemas || sortedCinemas.length <= 9) {
      return sortedCinemas;
    }
    return sortedCinemas.slice(0, 9);
  }, [sortedCinemas, cinemaQuery, showAllCinemas]);
  return (
    <div className="w-full">
      <div className="mb-3">
        <h2 className="text-lg font-medium mb-2">選擇電影院</h2>
        <Input
          placeholder="搜尋電影院..."
          value={cinemaQuery}
          onChange={e => setCinemaQuery(e.target.value)}
          className="mb-2 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
        />
        {/* 電影院搜尋提示文字 */}
        {!cinemasLoading && filteredCinemas.length > 0 && (
          <div className="w-full text-center py-2 mb-2 text-neutral-400 text-xs sm:text-sm">
            共有 {filteredCinemas.length} 家電影院放映此電影
            <br className="sm:hidden" />
            <br className="hidden sm:inline" />
            請搜尋地區或電影院名稱，或點擊地圖上的電影院地標
          </div>
        )}
      </div>
      
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {cinemasLoading ? (
          <div className="w-full text-center py-3 text-neutral-400">載入電影院資料中...</div>
        ) : filteredCinemas.length === 0 ? (
          <div className="w-full text-center py-3 text-neutral-400">找不到符合條件的電影院</div>
        ) : (
          <>
            {/* 移除此處的提示，已經移動到搜尋框下方 */}
            
            {/* 電影院選項按鈕 */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full">
              {displayedCinemas.map(c => (
                <Button
                  key={c.id}
                  variant={selectedCinemas.includes(c.id) ? "default" : "outline"}
                  className="text-xs sm:text-sm py-1 px-2 sm:px-3 h-auto"
                  onClick={(e) => {
                    e.preventDefault();
                    // 使用函數式更新來確保獲取最新的狀態
                    setSelectedCinemas(prev => {
                      const newSelection = prev.includes(c.id)
                        ? prev.filter(id => id !== c.id)
                        : [...prev, c.id];
                      // 觸發地圖縮放到所有選中的電影院
                      onCinemaClick?.(newSelection);
                      return newSelection;
                    });
                  }}
                >
                  {c.name}
                </Button>
              ))}
            </div>
            
            {/* 顯示更多/收起按鈕 */}
            {!cinemaQuery.trim() && sortedCinemas.length > 9 && (
              <Button 
                variant="ghost" 
                className="text-xs sm:text-sm flex items-center gap-1 text-neutral-400 hover:text-white mt-1 mx-auto"
                onClick={() => setShowAllCinemas(!showAllCinemas)}
              >
                {showAllCinemas ? (
                  <>
                    <MdExpandLess size={16} />
                    收起
                  </>
                ) : (
                  <>
                    <MdExpandMore size={16} />
                    顯示更多 ({sortedCinemas.length - 9} 家)
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CinemaSelector;

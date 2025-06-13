"use client";

import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cinema, FormattedShowtime } from '@/components/showtimes/types';
import { formatDateKey } from './utils';

interface ShowtimesListProps {
  cinemas: Cinema[];
  showtimes: Record<string, FormattedShowtime[]>;
  selectedCinemas: string[];
  dateTabs: { label: string; date: Date }[];
  selectedDateIdx: number;
  setSelectedDateIdx: React.Dispatch<React.SetStateAction<number>>;
}

const ShowtimesList: React.FC<ShowtimesListProps> = ({
  cinemas,
  showtimes,
  selectedCinemas,
  dateTabs,
  selectedDateIdx,
  setSelectedDateIdx
}) => {
  // 添加調試日誌
  console.log('ShowtimesList 收到的場次資料:', showtimes);
  console.log('選擇的電影院 ID:', selectedCinemas);
  console.log('所有電影院:', cinemas);

  // 檢查每個選擇的電影院是否有對應的場次
  selectedCinemas.forEach(cinemaId => {
    console.log(`電影院 ${cinemaId} 的場次:`, showtimes[cinemaId]);
  });

  return (
    <div className="w-full">
      <div className="mb-3">
        <h2 className="text-lg font-medium mb-2">場次時間</h2>
        {/* 日期 tabs */}
        <div className="w-full flex flex-row gap-1 sm:gap-2 mb-4">
          {dateTabs.map((tab, idx) => (
            <Button
              key={tab.label}
              variant={selectedDateIdx === idx ? "default" : "outline"}
              className="flex-1 text-xs sm:text-sm py-1 px-1 sm:px-2 h-auto"
              onClick={() => setSelectedDateIdx(idx)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      
      {/* 場次內容 */}
      {selectedCinemas.length === 0 ? (
        <div className="text-neutral-500 text-center py-6 bg-neutral-900/30 rounded-lg border border-neutral-800">
          <div className="text-sm">請先選擇電影院</div>
          <div className="text-xs text-neutral-400 mt-1">點擊地圖上的標記或使用上方的搜尋欄位</div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 顯示每個選擇的電影院的場次 */}
          {selectedCinemas.map(cinemaId => {
            const cinemaShowtimes = showtimes[cinemaId] || [];
            const cinema = cinemas.find(c => c.id === cinemaId);
            
            console.log(`渲染電影院 ${cinemaId} 的場次:`, cinemaShowtimes);
            
            if (!cinemaShowtimes || cinemaShowtimes.length === 0) {
              return (
                <div key={cinemaId} className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800 shadow-sm">
                  <div className="text-white text-sm font-semibold mb-2 pb-1 border-b border-neutral-800/50 flex items-center">
                    {cinema?.name || `電影院 ${cinemaId}`}
                  </div>
                  <div className="text-neutral-500 text-xs mt-1">暫無場次資訊</div>
                </div>
              );
            }

            return (
              <div key={cinemaId} className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800 shadow-sm">
                <div className="text-white text-sm font-semibold mb-2 pb-1 border-b border-neutral-800/50 flex items-center">
                  {cinema?.name || `電影院 ${cinemaId}`}
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {cinemaShowtimes.map((showtime, idx) => {
                    if (!showtime) return null;
                    
                    // 處理時間格式，移除秒數和多餘的冒號
                    let timeDisplay = showtime.time;
                    if (timeDisplay && typeof timeDisplay === 'string') {
                      // 先移除秒數，然後移除可能存在的結尾冒號
                      timeDisplay = timeDisplay.replace(/:\d{2}$/, '');
                    }
                    
                    return (
                      <button 
                        key={`${cinemaId}-${idx}`}
                        className="bg-neutral-800 border border-neutral-700 rounded text-xs sm:text-sm text-white px-2 py-1 hover:bg-neutral-700 transition-colors cursor-pointer"
                        title={`${showtime.time}${showtime.lang ? ` (${showtime.lang})` : ''}`}
                      >
                        {timeDisplay}
                        {showtime.lang && (
                          <span className="text-neutral-400 text-xs ml-1">
                            {showtime.lang}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShowtimesList;

"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, ForwardedRef } from 'react';
import { createPortal } from 'react-dom';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from './utils';
import { Cinema, FormattedShowtime } from '@/components/showtimes/types';
// 引入 React Icons 中的電影院圖標
import { MdLocalMovies, MdMovie } from 'react-icons/md';

export interface MapComponentRef {
  flyToCinema: (cinemaId: string | string[]) => void;
}

interface MapComponentProps {
  cinemas: Cinema[];
  selectedCinemas: string[];
  setSelectedCinemas: React.Dispatch<React.SetStateAction<string[]>>;
  showtimesByCinema: Record<string, FormattedShowtime[]>;
  userLocation: { lat: number; lng: number } | null;
  autoZoomEnabled?: boolean;
  onAutoZoomToggle?: (enabled: boolean) => void;
}

const MapComponent = forwardRef<MapComponentRef, MapComponentProps>(({
  cinemas,
  selectedCinemas,
  setSelectedCinemas,
  showtimesByCinema,
  userLocation,
  autoZoomEnabled = true,
  onAutoZoomToggle,
}, ref) => {
  const [hoverCinemaId, setHoverCinemaId] = useState<string | null>(null);
  const [hoverCinemaLngLat, setHoverCinemaLngLat] = useState<[number, number] | null>(null);
  const mapRef = useRef<any>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  // 過濾出有有效座標和場次的電影院
  const cinemasWithShowtimes = useMemo(() => {
    if (!cinemas || !Array.isArray(cinemas) || cinemas.length === 0) {
      console.log('cinemas 為空或未定義');
      return [];
    }
    
    console.log(`總共有 ${cinemas.length} 間電影院`);
    console.log('showtimesByCinema 中的前幾個鍵:', Object.keys(showtimesByCinema || {}).slice(0, 5));
    
    // 除錯：顯示前幾個電影院的 ID 和類型
    console.log('前幾個電影院 ID 和類型:', 
      cinemas.slice(0, 5).map(c => ({
        id: c.id, 
        type: typeof c.id,
        name: c.name,
        lat: c.lat ?? c.latitude,
        lng: c.lng ?? c.longitude
      }))
    );
    
    // 除錯：顯示 showtimesByCinema 中的鍵和類型
    const showtimeKeys = Object.keys(showtimesByCinema || {});
    console.log('showtimesByCinema 中的鍵和類型:', 
      showtimeKeys.slice(0, 5).map(key => ({
        key,
        type: typeof key,
        value: showtimesByCinema?.[key]?.length
      }))
    );
    
    // 只顯示有場次的電影院
    const filtered = cinemas.filter(cinema => {
      // 檢查該電影院是否有有效座標
      const lat = cinema.lat ?? cinema.latitude;
      const lng = cinema.lng ?? cinema.longitude;
      const hasValidCoords = lat !== undefined && lng !== undefined;
      
      if (!hasValidCoords) {
        console.log(`電影院 ${cinema.name} (ID:${cinema.id}) 沒有有效座標`);
        return false;
      }
      
      // 檢查是否有場次（同時檢查數字和字串類型的 ID）
      const cinemaId = cinema.id;
      const cinemaIdStr = String(cinemaId);
      const cinemaShowtimes = showtimesByCinema?.[cinemaId] ?? showtimesByCinema?.[cinemaIdStr];
      const hasShowtimes = Array.isArray(cinemaShowtimes) && cinemaShowtimes.length > 0;
      
      if (!hasShowtimes) {
        console.log(`電影院 ${cinema.name} (ID:${cinemaId}, 類型:${typeof cinemaId}) 沒有場次`);
        return false;
      }
      
      console.log(`電影院 ${cinema.name} (ID:${cinemaId}, 類型:${typeof cinemaId}) 將被顯示`);
      return true;
    });
    
    console.log(`過濾後顯示 ${filtered.length} 間有場次的電影院`);
    return filtered;
  }, [cinemas, showtimesByCinema]);

  // 計算所有選中電影院的邊界框，包含用戶位置
  const calculateBounds = useCallback((selectedIds: (string | number)[]) => {
    console.log('計算邊界框，選中的電影院 ID:', selectedIds);
    
    if (!mapRef.current || selectedIds.length === 0) {
      console.log('mapRef 為空或沒有選中的電影院');
      return null;
    }

    // 將所有選中的 ID 轉換為字串以便比較
    const selectedIdsSet = new Set(selectedIds.map(id => String(id)));
    
    // 過濾出選中的電影院，考慮 ID 類型的差異
    const selectedCinemas = cinemasWithShowtimes.filter(cinema => {
      const cinemaId = cinema.id;
      const cinemaIdStr = String(cinemaId);
      return selectedIdsSet.has(cinemaIdStr) || selectedIdsSet.has(String(cinemaId));
    });
    
    console.log('找到的電影院:', selectedCinemas.map(c => ({
      id: c.id,
      name: c.name,
      type: typeof c.id
    })));

    if (selectedCinemas.length === 0) {
      console.log('沒有找到對應的電影院數據');
      return null;
    }

    // 收集所有有效座標（電影院）
    const coordinates = selectedCinemas.map(cinema => {
      const latValue = cinema.lat ?? cinema.latitude;
      const lngValue = cinema.lng ?? cinema.longitude;
      
      const lat = typeof latValue === 'string' ? parseFloat(latValue) : latValue;
      const lng = typeof lngValue === 'string' ? parseFloat(lngValue) : lngValue;
      
      return [lng, lat] as [number, number];
    }).filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));

    // 如果沒有有效座標，返回 null
    if (coordinates.length === 0) {
      console.log('沒有有效的座標數據');
      return null;
    }

    // 如果有用戶位置，也加入座標點集合
    if (userLocation) {
      console.log('加入用戶位置:', userLocation);
      coordinates.push([userLocation.lng, userLocation.lat]);
    }

    // 計算邊界框
    const lngs = coordinates.map(coord => coord[0]);
    const lats = coordinates.map(coord => coord[1]);
    
    // 計算邊界框
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)], // 西南角
      [Math.max(...lngs), Math.max(...lats)]  // 東北角
    ];

    console.log('計算出的原始邊界框:', bounds);

    // 如果是單個點（電影院），增加緩衝區
    if (selectedCinemas.length === 1) {
      const buffer = 0.002; // 約 200 米，比之前小很多
      bounds[0][0] -= buffer;
      bounds[0][1] -= buffer;
      bounds[1][0] += buffer;
      bounds[1][1] += buffer;
      console.log('單個電影院，調整後的邊界框:', bounds);
    }
    
    return bounds;
  }, [cinemasWithShowtimes, userLocation]);

  // 使用 useImperativeHandle 暴露 flyToCinema 方法給父組件
  useImperativeHandle(ref, () => ({
    flyToCinema: (selectedIds: string | string[] | number[]) => {
      console.log('[MapComponent] flyToCinema 被調用，selectedIds:', selectedIds);
      
      if (!mapRef.current) {
        console.error('[MapComponent] 錯誤: mapRef.current 為空');
        return;
      }
      
      // 確保 selectedIds 是陣列
      const ids = Array.isArray(selectedIds) ? selectedIds : [selectedIds];
      console.log('[MapComponent] 處理的 ID 列表 (轉換前):', ids);
      
      // 計算邊界框
      const bounds = calculateBounds(ids);
      
      if (!bounds) {
        console.error('[MapComponent] 無法計算有效的邊界框');
        return;
      }
      
      console.log('[MapComponent] 計算出的邊界框:', bounds);
      
      // 根據選中數量調整 padding 和 zoom 級別
      const padding = {
        top: 30,
        bottom: 30,
        left: 30,
        right: 30
      };
      
      const options = {
        padding,
        duration: 1000,
        essential: true,
        maxZoom: ids.length === 1 ? 18 : 15 // 單個電影院時允許更大的縮放級別
      };
      
      console.log('[MapComponent] 執行 fitBounds 參數:', options);
      
      try {
        mapRef.current.fitBounds(bounds, options);
        console.log('[MapComponent] fitBounds 執行成功');
      } catch (error) {
        console.error('[MapComponent] fitBounds 執行出錯:', error);
      }
      
      // 啟用自動縮放（如果被禁用的話）
      if (onAutoZoomToggle && !autoZoomEnabled) {
        console.log('[MapComponent] 啟用自動縮放');
        onAutoZoomToggle(true);
      }
    }
  }), [cinemasWithShowtimes, autoZoomEnabled, onAutoZoomToggle]);

  // 計算電影院的中心點作為地圖初始位置
  const center = useMemo(() => {
    // 如果有用戶位置，優先使用用戶位置作為中心點
    if (userLocation) {
      return { lat: userLocation.lat, lng: userLocation.lng };
    }
    
    if (!cinemasWithShowtimes || cinemasWithShowtimes.length === 0) {
      return { lat: 25.0330, lng: 121.5654 }; // 台北市中心
    }
    
    console.log(`計算 ${cinemasWithShowtimes.length} 間電影院的中心點`);
    
    // 使用 lat/lng 或 latitude/longitude
    const validCinemas = cinemasWithShowtimes.filter(cinema => {
      const lat = cinema.lat ?? cinema.latitude;
      const lng = cinema.lng ?? cinema.longitude;
      return typeof lat === 'number' && typeof lng === 'number';
    });
    
    if (validCinemas.length === 0) {
      console.log('過濾後沒有有效的電影院座標，使用台北市中心作為預設位置');
      return { lat: 25.0330, lng: 121.5654 }; // 台北市中心
    }
    
    console.log(`使用 ${validCinemas.length} 間電影院計算中心點`);
    
    let sumLat = 0;
    let sumLng = 0;
    
    validCinemas.forEach(cinema => {
      const lat = cinema.lat ?? cinema.latitude ?? 0;
      const lng = cinema.lng ?? cinema.longitude ?? 0;
      sumLat += lat;
      sumLng += lng;
      console.log(`電影院 ${cinema.name} 座標: (${lat}, ${lng})`);
    });
    
    const centerPoint = {
      lat: sumLat / validCinemas.length,
      lng: sumLng / validCinemas.length
    };
    
    console.log(`計算出的中心點: (${centerPoint.lat}, ${centerPoint.lng})`);
    return centerPoint;
  }, [cinemasWithShowtimes, userLocation]);

  // 當用戶位置變化時，重新定位地圖
  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 13,
        duration: 2000
      });
    }
  }, [userLocation]);

  // 監聽 selectedCinemas 的變化，並根據選擇的電影院和用戶位置調整地圖視圖
  useEffect(() => {
    // 如果自動縮放被禁用，則不執行縮放邏輯
    if (!autoZoomEnabled) return;
    
    if (mapInitialized && mapRef.current) {
      // 如果沒有選擇任何電影院，則返回
      if (selectedCinemas.length === 0) return;
      
      // 獲取所有選中的電影院
      const selectedCinemaObjects = cinemasWithShowtimes.filter(cinema => 
        selectedCinemas.includes(cinema.id)
      );
      
      // 確保選中的電影院有座標
      const cinemasWithCoords = selectedCinemaObjects.filter(cinema => {
        const lat = cinema.lat ?? cinema.latitude;
        const lng = cinema.lng ?? cinema.longitude;
        return typeof lat === 'number' && typeof lng === 'number';
      });
      
      if (cinemasWithCoords.length === 0) return;
      
      // 獲取所有需要顯示的點（用戶位置 + 選中的電影院）
      const points: Array<[number, number]> = [];
      
      // 添加用戶位置（如果可用）
      if (userLocation) {
        points.push([userLocation.lng, userLocation.lat]);
      }
      
      // 添加選中的電影院位置
      cinemasWithCoords.forEach(cinema => {
        const lat = cinema.lat ?? cinema.latitude ?? 0;
        const lng = cinema.lng ?? cinema.longitude ?? 0;
        points.push([lng, lat]);
      });
      
      // 計算邊界
      const lngs = points.map(p => p[0]);
      const lats = points.map(p => p[1]);
      
      const bounds = {
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats)
      };
      
      // 添加一些邊距
      const padding = 0.01; // 約1公里
      
      // 調整地圖視圖
      mapRef.current.fitBounds(
        [
          [bounds.minLng - padding, bounds.minLat - padding],
          [bounds.maxLng + padding, bounds.maxLat + padding]
        ],
        {
          padding: { top: 10 , bottom: 10, left: 10, right: 10 },
          maxZoom: 15  , // 限制最大縮放級別，避免過度縮放
          duration: 1500 // 動畫持續時間
        }
      );
    }
  }, [selectedCinemas, mapInitialized, cinemasWithShowtimes, userLocation, autoZoomEnabled]);
  
  // 處理地圖上電影院 marker 的點擊事件
  const handleCinemaClick = (cinemaId: string, event: any) => {
    // 阻止事件冒泡
    event.stopPropagation();
    event.originalEvent.stopPropagation();
    
    // 通知父組件禁用自動縮放
    if (onAutoZoomToggle) {
      onAutoZoomToggle(false);
    }
    
    // 切換選擇狀態
    setSelectedCinemas(prev => {
      const newSelectedCinemas = prev.includes(cinemaId)
        ? prev.filter(id => id !== cinemaId)
        : [...prev, cinemaId];
      return newSelectedCinemas;
    });
  };

  // 地圖加載完成處理函數
  const handleMapLoad = (event: any) => {
    mapRef.current = event.target;
    setMapInitialized(true);
  };

  return (
    <div className="w-full h-[250px] sm:h-[300px] rounded-xl overflow-hidden border border-neutral-800">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: 11
        }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
      >
        {/* 顯示用戶位置 */}
        {userLocation && (
          <Marker
            longitude={userLocation.lng}
            latitude={userLocation.lat}
          >
            <div className="z-50">
              <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center shadow-lg">
                <div className="w-2 h-2 rounded-full bg-white"></div>
              </div>
            </div>
          </Marker>
        )}
        
        {/* 顯示電影院位置 */}
        {cinemasWithShowtimes.map(cinema => {
          const lng = cinema.lng ?? cinema.longitude ?? 0;
          const lat = cinema.lat ?? cinema.latitude ?? 0;
          
          // 檢查是否有場次（用於決定顯示顏色）
          const hasShowtimes = showtimesByCinema && 
                           showtimesByCinema[cinema.id] && 
                           showtimesByCinema[cinema.id].length > 0;
          
          return (
            <Marker
              key={cinema.id}
              longitude={lng}
              latitude={lat}
              onClick={(e: any) => {
                // 阻止事件冒泡，避免觸發地圖本身的點擊事件
                e.originalEvent.stopPropagation();
                console.log(`點擊電影院: ${cinema.name} (ID:${cinema.id})`);
                // 禁用自動縮放
                if (onAutoZoomToggle) {
                  onAutoZoomToggle(false);
                }
                setSelectedCinemas(prev =>
                  prev.includes(cinema.id)
                    ? prev.filter(id => id !== cinema.id)
                    : [...prev, cinema.id]
                );
              }}
              onMouseEnter={() => {
                if (lng !== undefined && lat !== undefined) {
                  setHoverCinemaId(cinema.id);
                  setHoverCinemaLngLat([lng, lat]);
                }
              }}
              onMouseLeave={() => {
                setHoverCinemaId(null);
                setHoverCinemaLngLat(null);
              }}
            >
            <div className="relative">
              {/* 電影院名稱小文字 */}
              <div 
                className={`absolute -bottom-5 left-1/2 transform -translate-x-1/2 text-white text-xs font-medium z-30 whitespace-nowrap transition-opacity ${hoverCinemaId === cinema.id ? 'opacity-100' : 'opacity-70'}`}
                style={{ textShadow: '0px 0px 3px #000, 0px 0px 3px #000, 0px 0px 3px #000' }}
              >
                {cinema.name}
              </div>
              
              {/* 電影院圖標 */}
              <div 
                className="cursor-pointer transition-all transform hover:scale-110 flex items-center justify-center bg-white rounded-full p-1"
              >
                {selectedCinemas.includes(cinema.id) ? (
                  <MdMovie className="text-yellow-500" size={20} />
                ) : (
                  <MdLocalMovies className="text-gray-400" size={20} />
                )}
              </div>
            </div>
          </Marker>
          );
        })}
      </Map>
      {/* 電影院懸停提示已移至每個標記內部 */}
    </div>
  );
});

MapComponent.displayName = 'MapComponent';

export default MapComponent;

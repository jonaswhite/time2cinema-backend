// 電影資料介面
export interface MovieInfo {
  id: string;
  display_title: string; // For UI display
  full_title: string;    // Full original title
  chinese_title: string | null;
  english_title: string | null;
  release: string;
  poster: string;
  tmdb_id?: number | null; // Add TMDB ID
  overview?: string;
  genres?: string[];
  director?: string;
  actors?: string[];
}

// 電影院資料介面
export interface Cinema {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  lat?: number; // 兼容舊代碼
  lng?: number; // 兼容舊代碼
  distance?: number;
  showtimes?: any[];
  city?: string;
  district?: string;
  type?: string;
  special?: string;
}

// 場次資料介面 (來自後端 API 的原始場次結構)
export interface Showtime {
  movie_id: string | number; // 電影 ID
  movie_name?: string;      // @deprecated - use movie_display_title or other specific title fields. 電影名稱 (可能無)
  movie_full_title?: string;
  movie_chinese_title?: string | null;
  movie_english_title?: string | null;
  movie_display_title?: string; // Preferred field for movie title in showtime context
  time: string;             // 場次時間 (HH:MM)
  type?: string;            // 版本 (e.g., "數位", "IMAX", "3D") - 主要來自 attributes
  link?: string;            // 相關連結 (例如到 EZ訂的資訊頁)
  movie_poster_url?: string;// 電影海報 URL
  movie_release_date?: string; // 電影上映日期
  booking_link?: string;    // 訂票連結 (優先使用)
  ticket_price?: number;    // 票價
  attributes?: string[];    // 特殊屬性 (e.g., ["IMAX", "ATMOS", "DBOX"])
  id?: string;              // 單場次的唯一ID (如果後端提供)
  lang?: string;            // 語言 (e.g., "國語", "英語")
  // availableSeats?: number; // 可用座位數 (如果後端提供)
  // totalSeats?: number;     // 總座位數 (如果後端提供)
}

// 前端用於顯示的格式化場次資料介面
export interface FormattedShowtime {
  id: string;                 // React key 的唯一 ID (通常是組合建構)
  movie_id: string;           // 電影 ID
  movie_display_title: string; // 電影顯示名稱
  theater_id: string;         // 電影院 ID
  theater_name: string;       // 電影院名稱
  date: string;               // 日期 (YYYY-MM-DD)
  time: string;               // 時間 (HH:MM)
  type: string;               // 版本 (e.g., "數位", "IMAX")
  link: string;               // 點擊連結 (優先 booking_link, 其次 st.link)
  movie_poster_url?: string;   // 電影海報
  movie_release_date?: string; // 電影上映日期
  ticket_price?: number;       // 原始票價
  attributes?: string[];       // 特殊屬性
  lang?: string;               // 語言
  booking_link?: string;       // 訂票連結 (與原始Showtime一致)

  // 衍生/格式化欄位
  formattedTime: string;      // 格式化時間 (e.g., "下午 02:30")
  isAvailable: boolean;       // 是否可訂票/有位 (需要邏輯判斷, e.g., based on attributes or a dedicated field from backend)
  formattedPrice: string;     // 格式化票價 (e.g., "$300" 或 "價格未定")
}

export interface DateGroup {
  date: string;
  showtimes: Showtime[];
}

export interface TheaterShowtimes {
  theaterId: string;
  theaterName: string;
  showtimes: Showtime[];
  showtimes_by_date?: DateGroup[];
  theater_id?: string | number; // 兼容後端 API 返回的欄位名稱
  theater_name?: string; // 兼容後端 API 返回的欄位名稱
}

// 保留舊的 ShowtimesByDate 類型以兼容舊代碼
export interface ShowtimesByDate {
  date: string;
  label: string;
  showtimes: Showtime[];
}

// 預設電影資料
export const DEFAULT_MOVIE: MovieInfo = {
  id: "default",
  display_title: "電影資訊載入中...",
  full_title: "電影資訊載入中...",
  chinese_title: null,
  english_title: null,
  release: "-",
  poster: "https://placehold.co/500x750/222/white?text=Loading",
  overview: undefined,
  genres: undefined,
  director: undefined,
  actors: undefined
};

// 日期標籤類型
export interface DateTab {
  label: string;
  date: Date;
}

// 票房資料介面 - 符合後端 API 回傳格式
export interface BoxOfficeMovie {
  id: number; // 電影 ID
  full_title: string; // 完整標題 (通常是原文或主要發行標題)
  chinese_title: string | null; // 中文標題
  english_title: string | null; // 英文標題
  rank: number; // 排名
  tickets: number; // 票數
  totalsales: number | null; // 累計票數
  release_date: string | null; // 上映日
  week_start_date: string; // 週開始日期
  poster_url: string | null; // 海報 URL (與後端 API 一致)
  runtime: number | null; // 片長（分鐘）
  tmdb_id: number | null; // TMDB ID
}

// 上映中介面 - 與票房資料介面統一
export interface NowShowingMovie {
  id: number; // 電影 ID
  full_title: string; // 完整標題
  chinese_title: string | null; // 中文標題
  english_title: string | null; // 英文標題
  release_date: string | null; // 上映日期
  poster_url: string | null; // 海報 URL (與後端 API 一致)
  runtime: number | null; // 片長（分鐘）
  tmdb_id: number | null; // TMDB ID
  genres?: string[]; // 電影類型
}

// 上映時間電影介面
export interface ShowtimeMovie {
  id: string; // atmovies ID
  full_title: string;
  chinese_title: string | null;
  english_title: string | null;
  display_title: string; // 電影顯示名稱 (優先中文)
  poster_url?: string;
  release_date?: string;
  duration_mins?: number;
  // Potentially other fields from atmovies API
}

// 前端顯示用的電影資料介面
export interface DisplayMovie {
  rank?: number; // 只有票房榜有排名
  display_title: string; // 用於 UI 顯示的標題 (優先 chinese_title，其次 full_title)
  full_title: string; // 完整標題
  chinese_title: string | null; // 中文標題
  english_title: string | null; // 英文標題
  weeklySales?: string; // 只有票房榜有週票數
  releaseDate: string;
  poster: string | null;
  runtime?: number | null; // 片長（分鐘）
  id?: string;
  isLoadingPoster?: boolean; // 是否正在加載海報
  tmdb_id?: number | null; // TMDB ID
  genres?: string[]; // 電影類型
}

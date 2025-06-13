// 電影資料介面
export interface MovieInfo {
  id: string;
  name: string;
  release: string;
  poster: string;
}

// 電影院資料介面
export interface Cinema {
  id: string;
  name: string;
  city: string;
  district: string;
  address: string;
  type: string;
  special: string;
  lat: number;
  lng: number;
}

// 場次資料介面
export interface Showtime {
  time: string;
  movie_name: string;
}

export interface ShowtimesByDate {
  date: string;
  label: string;
  showtimes: Showtime[];
}

export interface TheaterShowtimes {
  theater_id: string;
  theater_name: string;
  showtimes_by_date: ShowtimesByDate[];
}

// 前端使用的場次類型
export interface FormattedShowtime {
  time: string;
  lang?: string;
  cinemaName?: string;
  date?: string;
}

// 預設電影資料
export const DEFAULT_MOVIE: MovieInfo = {
  id: "default",
  name: "電影資訊載入中...",
  release: "-",
  poster: "https://placehold.co/500x750/222/white?text=Loading"
};

// 日期標籤類型
export interface DateTab {
  label: string;
  date: Date;
}

-- 修改欄位名稱
ALTER TABLE movies RENAME COLUMN title TO display_title;

-- 移除不需要的欄位
ALTER TABLE movies DROP COLUMN IF EXISTS backdrop_url;
ALTER TABLE movies DROP COLUMN IF EXISTS vote_average;
ALTER TABLE movies DROP COLUMN IF EXISTS genres;

-- 移除唯一約束
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_tmdb_id_key;

-- 暫時移除外鍵約束
ALTER TABLE boxoffice DROP CONSTRAINT IF EXISTS fk_boxoffice_movie;
ALTER TABLE showtimes DROP CONSTRAINT IF EXISTS fk_showtimes_movie;

-- 創建臨時表用於存儲爬取的 ATMovies 資料
CREATE TABLE IF NOT EXISTS temp_atmovies_movies (
    atmovies_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_title TEXT,
    release_date DATE,
    runtime INTEGER,
    processed BOOLEAN DEFAULT FALSE
);

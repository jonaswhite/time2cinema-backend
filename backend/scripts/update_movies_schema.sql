-- 1. 禁用外鍵約束檢查
SET session_replication_role = replica;

-- 2. 創建一個臨時表來保存現有數據
CREATE TABLE temp_movies AS SELECT * FROM movies LIMIT 0;

-- 3. 刪除索引
DROP INDEX IF EXISTS idx_movies_title;
DROP INDEX IF EXISTS idx_movies_tmdb_id;
DROP INDEX IF EXISTS movies_tmdb_id_key;

-- 4. 刪除舊的 movies 表
DROP TABLE IF EXISTS movies CASCADE;

-- 5. 創建新的 movies 表（與線上資料庫結構一致）
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    display_title TEXT NOT NULL,
    atmovies_id TEXT,
    release_date DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    poster_url TEXT,
    overview TEXT,
    runtime INTEGER,
    tmdb_id INTEGER,
    full_title TEXT,
    chinese_title TEXT,
    english_title TEXT
);

-- 6. 創建索引
CREATE INDEX idx_movies_atmovies_id ON movies(atmovies_id);
CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);

-- 7. 啟用外鍵約束檢查
SET session_replication_role = DEFAULT;

-- 8. 將臨時數據插入新表（如果需要的話）
-- 注意：由於結構變化較大，這裡不自動轉換數據，需要手動處理

-- 9. 刪除臨時表
DROP TABLE IF EXISTS temp_movies;

-- 10. 重新創建外鍵約束（如果需要）
-- ALTER TABLE boxoffice ADD CONSTRAINT fk_boxoffice_movie FOREIGN KEY (movie_id) REFERENCES movies(id);
-- ALTER TABLE showtimes ADD CONSTRAINT fk_showtimes_movie FOREIGN KEY (movie_id) REFERENCES movies(id);

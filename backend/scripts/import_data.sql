-- 設置客戶端編碼為 UTF-8
\encoding UTF8

-- 導入 showtimes 資料
\copy public.showtimes FROM '/tmp/showtimes.csv' WITH (FORMAT csv, HEADER true);

-- 導入 boxoffice 資料
\copy public.boxoffice FROM '/tmp/boxoffice.csv' WITH (FORMAT csv, HEADER true);

-- 導入 movies 資料
\copy public.movies FROM '/tmp/movies.csv' WITH (FORMAT csv, HEADER true);

-- 顯示各資料表的記錄數
SELECT 'showtimes' AS table_name, COUNT(*) AS row_count FROM public.showtimes
UNION ALL
SELECT 'boxoffice' AS table_name, COUNT(*) AS row_count FROM public.boxoffice
UNION ALL
SELECT 'movies' AS table_name, COUNT(*) AS row_count FROM public.movies;

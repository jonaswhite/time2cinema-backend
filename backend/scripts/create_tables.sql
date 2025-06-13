-- 創建 showtimes 表
DROP TABLE IF EXISTS public.showtimes CASCADE;
CREATE TABLE public.showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER,
    cinema_id INTEGER,
    date DATE,
    time TIME,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 創建 boxoffice 表
DROP TABLE IF EXISTS public.boxoffice CASCADE;
CREATE TABLE public.boxoffice (
    id SERIAL PRIMARY KEY,
    rank INTEGER,
    tickets INTEGER,
    week_start_date DATE,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    totalsales TEXT,
    release_date DATE,
    movie_id INTEGER,
    movie_alias TEXT
);

-- 創建 movies 表
DROP TABLE IF EXISTS public.movies CASCADE;
CREATE TABLE public.movies (
    id SERIAL PRIMARY KEY,
    chinese_title TEXT,
    english_title TEXT,
    release_date DATE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    atmovies_id TEXT,
    full_title TEXT,
    runtime INTEGER,
    poster_url TEXT,
    tmdb_id TEXT,
    last_tmdb_check_at TIMESTAMP WITH TIME ZONE
);

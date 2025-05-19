CREATE TABLE IF NOT EXISTS cinemas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    city TEXT,
    district TEXT,
    type TEXT,
    UNIQUE(source, external_id)
);

-- 為常用查詢創建索引
CREATE INDEX IF NOT EXISTS idx_cinemas_source_external_id ON cinemas(source, external_id);
CREATE INDEX IF NOT EXISTS idx_cinemas_city_district ON cinemas(city, district);

-- 創建 boxoffice 資料表
CREATE TABLE IF NOT EXISTS boxoffice (
    id SERIAL PRIMARY KEY,
    rank INTEGER NOT NULL,
    tickets INTEGER,
    week_start_date DATE NOT NULL,
    source VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    totalsales BIGINT,
    release_date DATE,
    movie_id INTEGER,
    movie_alias VARCHAR(255),
    
    -- 添加外鍵約束，關聯到 movies 表
    CONSTRAINT fk_movie
        FOREIGN KEY(movie_id) 
            REFERENCES movies(id)
            ON DELETE SET NULL,
            
    -- 添加唯一約束，確保同一周的同一部電影不會重複
    CONSTRAINT unique_movie_week UNIQUE (movie_id, week_start_date)
);

-- 添加索引以優化查詢性能
CREATE INDEX IF NOT EXISTS idx_boxoffice_movie_id ON boxoffice(movie_id);
CREATE INDEX IF NOT EXISTS idx_boxoffice_week_start_date ON boxoffice(week_start_date);
CREATE INDEX IF NOT EXISTS idx_boxoffice_rank ON boxoffice(rank);

-- 添加註釋
COMMENT ON TABLE boxoffice IS '存儲電影票房數據';
COMMENT ON COLUMN boxoffice.rank IS '票房排名';
COMMENT ON COLUMN boxoffice.tickets IS '銷售票數';
COMMENT ON COLUMN boxoffice.week_start_date IS '周起始日期（週一）';
COMMENT ON COLUMN boxoffice.source IS '數據來源';
COMMENT ON COLUMN boxoffice.totalsales IS '總票房';
COMMENT ON COLUMN boxoffice.release_date IS '電影上映日期';
COMMENT ON COLUMN boxoffice.movie_id IS '關聯的電影ID';
COMMENT ON COLUMN boxoffice.movie_alias IS '電影別名（用於匹配）';

-- 創建更新 updated_at 的觸發器函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 創建觸發器
CREATE TRIGGER update_boxoffice_updated_at
BEFORE UPDATE ON boxoffice
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

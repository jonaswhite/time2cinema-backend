-- 1. 首先新增 chinese_title 欄位
ALTER TABLE movies ADD COLUMN IF NOT EXISTS chinese_title VARCHAR(255);

-- 2. 將 display_title 重新命名為 original_title
ALTER TABLE movies RENAME COLUMN display_title TO original_title;

-- 3. 處理 original_title 到 english_title 的轉換
DO $$
BEGIN
    -- 檢查 english_title 欄位是否已存在
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'movies' AND column_name = 'english_title') THEN
        -- 如果 english_title 欄位不存在，直接重新命名
        EXECUTE 'ALTER TABLE movies RENAME COLUMN original_title TO english_title';
    ELSE
        -- 如果 english_title 已存在，需要先備份再更新
        EXECUTE 'ALTER TABLE movies RENAME COLUMN original_title TO temp_original_title';
        EXECUTE 'UPDATE movies SET english_title = temp_original_title WHERE english_title IS NULL';
        EXECUTE 'ALTER TABLE movies DROP COLUMN temp_original_title';
    END IF;
END
$$;

-- 4. 檢查變更是否成功
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'movies' 
AND column_name IN ('original_title', 'english_title', 'chinese_title');

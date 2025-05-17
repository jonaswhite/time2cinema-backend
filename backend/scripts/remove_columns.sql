-- 1. 刪除本地資料庫的 display_title 和 overview 欄位
ALTER TABLE movies DROP COLUMN IF EXISTS display_title;
ALTER TABLE movies DROP COLUMN IF EXISTS overview;

-- 2. 輸出確認訊息
\echo '已從本地資料庫刪除 display_title 和 overview 欄位'

-- 3. 為線上資料庫準備刪除欄位的 SQL
\echo '請在線上資料庫執行以下 SQL 來刪除 display_title 和 overview 欄位:'
\echo 'ALTER TABLE movies DROP COLUMN IF EXISTS display_title;'
\echo 'ALTER TABLE movies DROP COLUMN IF EXISTS overview;'

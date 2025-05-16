"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
// 線上資料庫配置
const onlineDbConfig = {
    connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
    ssl: { rejectUnauthorized: false }
};
// 創建線上資料庫連接池
const pool = new pg_1.Pool(onlineDbConfig);
// 批量更新 showtimes 表
async function bulkUpdateShowtimes() {
    try {
        console.log('開始批量更新 showtimes 表...');
        // 1. 檢查 showtimes 表是否已有 movie_id 欄位
        const checkColumnQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'showtimes' AND column_name = 'movie_id'
      );
    `;
        const columnExists = await pool.query(checkColumnQuery);
        if (!columnExists.rows[0].exists) {
            console.log('添加 movie_id 欄位到 showtimes 表...');
            await pool.query(`ALTER TABLE showtimes ADD COLUMN movie_id INTEGER;`);
        }
        // 2. 檢查 movies 表中的標題欄位名稱（title 或 name）
        const columnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movies' AND column_name IN ('title', 'name')
    `);
        const columnNames = columnsResult.rows.map(row => row.column_name);
        const titleColumn = columnNames.includes('title') ? 'title' : 'name';
        console.log(`使用 movies 表中的 ${titleColumn} 欄位作為標題...`);
        // 3. 批量更新 showtimes 表的 movie_id
        console.log('批量更新 showtimes 表的 movie_id...');
        // 使用 WITH 子句和 UPDATE 語句進行批量更新
        const bulkUpdateQuery = `
      WITH movie_mapping AS (
        SELECT id, ${titleColumn} FROM movies
      )
      UPDATE showtimes s
      SET movie_id = m.id
      FROM movie_mapping m
      WHERE s.movie_name = m.${titleColumn} AND s.movie_id IS NULL;
    `;
        const updateResult = await pool.query(bulkUpdateQuery);
        console.log(`已更新 ${updateResult.rowCount} 條 showtimes 記錄`);
        // 4. 檢查未匹配的記錄
        const unmatchedQuery = `
      SELECT DISTINCT movie_name
      FROM showtimes
      WHERE movie_id IS NULL;
    `;
        const unmatchedResult = await pool.query(unmatchedQuery);
        if (unmatchedResult.rows.length > 0) {
            console.log(`發現 ${unmatchedResult.rows.length} 個未匹配的電影名稱:`);
            unmatchedResult.rows.forEach(row => {
                console.log(`  - ${row.movie_name}`);
            });
        }
        else {
            console.log('所有 showtimes 記錄都已成功匹配到電影 ID');
        }
        console.log('批量更新完成');
    }
    catch (error) {
        console.error('批量更新 showtimes 表時發生錯誤:', error);
    }
    finally {
        await pool.end();
    }
}
// 執行批量更新
bulkUpdateShowtimes().catch(console.error);

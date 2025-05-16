"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateBoxofficeTable = migrateBoxofficeTable;
exports.migrateShowtimesTable = migrateShowtimesTable;
exports.runRelationsMigration = runRelationsMigration;
const pg_1 = require("pg");
// 線上資料庫配置
const onlineDbConfig = {
    connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
    ssl: { rejectUnauthorized: false }
};
// 創建線上資料庫連接池
const pool = new pg_1.Pool(onlineDbConfig);
// 修改 boxoffice 表，將 movie_id 從文本改為整數外鍵
async function migrateBoxofficeTable() {
    try {
        console.log('開始遷移 boxoffice 表...');
        // 1. 添加臨時欄位
        console.log('添加臨時欄位 movie_id_new...');
        await pool.query(`
      ALTER TABLE boxoffice ADD COLUMN movie_id_new INTEGER;
    `);
        // 2. 更新臨時欄位，將電影名稱映射到 movies 表的 id
        console.log('更新臨時欄位，將電影名稱映射到 movies 表的 id...');
        const boxofficeRows = await pool.query(`
      SELECT id, movie_id FROM boxoffice
    `);
        for (const row of boxofficeRows.rows) {
            // 在 movies 表中查找匹配的電影
            // 檢查 movies 表是否有 title 欄位，否則使用 name 欄位
            const columnsResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movies' AND column_name IN ('title', 'name')
      `);
            const columnNames = columnsResult.rows.map(row => row.column_name);
            const titleColumn = columnNames.includes('title') ? 'title' : 'name';
            const movieResult = await pool.query(`
        SELECT id FROM movies WHERE ${titleColumn} = $1
      `, [row.movie_id]);
            if (movieResult.rows.length > 0) {
                // 找到匹配的電影，更新 movie_id_new
                await pool.query(`
          UPDATE boxoffice SET movie_id_new = $1 WHERE id = $2
        `, [movieResult.rows[0].id, row.id]);
                console.log(`更新 boxoffice 記錄 ${row.id}: ${row.movie_id} -> ${movieResult.rows[0].id}`);
            }
            else {
                console.log(`警告: 找不到電影 "${row.movie_id}" 的對應記錄`);
            }
        }
        // 3. 刪除舊欄位，重命名新欄位
        console.log('刪除舊欄位，重命名新欄位...');
        await pool.query(`
      ALTER TABLE boxoffice DROP COLUMN movie_id;
      ALTER TABLE boxoffice RENAME COLUMN movie_id_new TO movie_id;
    `);
        // 4. 添加外鍵約束
        console.log('添加外鍵約束...');
        await pool.query(`
      ALTER TABLE boxoffice ADD CONSTRAINT fk_boxoffice_movie
      FOREIGN KEY (movie_id) REFERENCES movies(id);
    `);
        console.log('boxoffice 表遷移完成');
        return true;
    }
    catch (error) {
        console.error('遷移 boxoffice 表時出錯:', error);
        return false;
    }
}
// 修改 showtimes 表，將 movie_name 改為 movie_id 外鍵
async function migrateShowtimesTable() {
    try {
        console.log('開始遷移 showtimes 表...');
        // 1. 添加臨時欄位
        console.log('添加臨時欄位 movie_id...');
        await pool.query(`
      ALTER TABLE showtimes ADD COLUMN movie_id INTEGER;
    `);
        // 2. 更新臨時欄位，將電影名稱映射到 movies 表的 id
        console.log('更新臨時欄位，將電影名稱映射到 movies 表的 id...');
        const showtimesRows = await pool.query(`
      SELECT id, movie_name FROM showtimes
    `);
        for (const row of showtimesRows.rows) {
            // 在 movies 表中查找匹配的電影
            // 檢查 movies 表是否有 title 欄位，否則使用 name 欄位
            const columnsResult = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movies' AND column_name IN ('title', 'name')
      `);
            const columnNames = columnsResult.rows.map(row => row.column_name);
            const titleColumn = columnNames.includes('title') ? 'title' : 'name';
            const movieResult = await pool.query(`
        SELECT id FROM movies WHERE ${titleColumn} = $1
      `, [row.movie_name]);
            if (movieResult.rows.length > 0) {
                // 找到匹配的電影，更新 movie_id
                await pool.query(`
          UPDATE showtimes SET movie_id = $1 WHERE id = $2
        `, [movieResult.rows[0].id, row.id]);
                console.log(`更新 showtimes 記錄 ${row.id}: ${row.movie_name} -> ${movieResult.rows[0].id}`);
            }
            else {
                console.log(`警告: 找不到電影 "${row.movie_name}" 的對應記錄`);
            }
        }
        // 3. 刪除舊欄位
        console.log('刪除舊欄位...');
        await pool.query(`
      ALTER TABLE showtimes DROP COLUMN movie_name;
    `);
        // 4. 添加外鍵約束
        console.log('添加外鍵約束...');
        await pool.query(`
      ALTER TABLE showtimes ADD CONSTRAINT fk_showtimes_movie
      FOREIGN KEY (movie_id) REFERENCES movies(id);
    `);
        console.log('showtimes 表遷移完成');
        return true;
    }
    catch (error) {
        console.error('遷移 showtimes 表時出錯:', error);
        return false;
    }
}
// 執行所有遷移
async function runRelationsMigration() {
    try {
        console.log('開始表關係遷移...');
        // 遷移 boxoffice 表
        await migrateBoxofficeTable();
        // 遷移 showtimes 表
        await migrateShowtimesTable();
        console.log('表關係遷移完成');
    }
    catch (error) {
        console.error('表關係遷移失敗:', error);
    }
}
// 如果直接執行此檔案，則運行遷移
if (require.main === module) {
    runRelationsMigration().catch(console.error);
}

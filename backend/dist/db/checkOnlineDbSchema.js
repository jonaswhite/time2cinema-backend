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
// 檢查資料表結構
async function checkTableSchema(tableName) {
    try {
        console.log(`檢查資料表 ${tableName} 的結構...`);
        // 獲取資料表欄位信息
        const query = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `;
        const result = await pool.query(query, [tableName]);
        if (result.rows.length === 0) {
            console.log(`資料表 ${tableName} 不存在或沒有欄位`);
            return;
        }
        console.log(`資料表 ${tableName} 的欄位信息：`);
        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? '可為空' : '不可為空'})`);
        });
    }
    catch (error) {
        console.error(`檢查資料表 ${tableName} 結構時發生錯誤:`, error);
    }
}
// 主函數
async function main() {
    try {
        // 檢查 movies 表
        await checkTableSchema('movies');
        // 檢查 boxoffice 表
        await checkTableSchema('boxoffice');
        // 檢查 showtimes 表
        await checkTableSchema('showtimes');
    }
    catch (error) {
        console.error('檢查資料庫結構時發生錯誤:', error);
    }
    finally {
        // 關閉資料庫連接
        await pool.end();
    }
}
// 執行主函數
main().catch(console.error);

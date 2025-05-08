"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
// 建立資料庫連接池
const pool = new pg_1.Pool({
    user: 'jonaswhite',
    host: 'localhost',
    database: 'jonaswhite',
    password: '',
    port: 5432,
});
// 設定時區
pool.query('SET timezone = "Asia/Taipei"');
exports.default = pool;

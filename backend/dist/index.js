"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const boxofficeRoutes_1 = require("./api/boxofficeRoutes");
const tmdbRoutes_1 = require("./api/tmdbRoutes");
const cinemaRoutes_1 = require("./api/cinemaRoutes");
const showtimesRoutes_1 = require("./api/showtimesRoutes");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// 添加基本中間件
app.use(express_1.default.json());
// 添加 CORS 支援
app.use((req, res, next) => {
    // 允許特定來源，包括 Vercel 和本地開發環境
    const allowedOrigins = [
        'https://time2cinema-frontend.vercel.app',
        'http://localhost:3000',
        'http://localhost:4000'
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // 處理 OPTIONS 請求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
    }
    else {
        next();
    }
});
// 首頁
app.get('/', (req, res) => {
    res.send('Time2Cinema Backend API');
});
// 使用 boxoffice 路由
app.use('/api/boxoffice', boxofficeRoutes_1.boxofficeRouter);
// 使用 TMDB 路由
app.use('/api/tmdb', tmdbRoutes_1.tmdbRouter);
// 使用電影院路由
app.use('/api/cinemas', cinemaRoutes_1.cinemaRouter);
// 使用場次路由
app.use('/api/showtimes', showtimesRoutes_1.showtimesRouter);
app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
    console.log(`票房 API 網址: http://localhost:${PORT}/api/boxoffice`);
    console.log(`TMDB API 網址: http://localhost:${PORT}/api/tmdb`);
    console.log(`電影院 API 網址: http://localhost:${PORT}/api/cinemas`);
    console.log(`場次 API 網址: http://localhost:${PORT}/api/showtimes`);
});

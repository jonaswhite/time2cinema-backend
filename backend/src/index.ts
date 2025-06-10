import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { boxofficeRouter } from './api/boxofficeRoutes';
import { tmdbRouter } from './api/tmdbRoutes';
import { cinemaRouter } from './api/cinemaRoutes';
import { showtimesRouter } from './api/showtimesRoutes';
import { nowShowingMoviesRouter } from './api/nowShowingMoviesRoutes';
import { moviesRouter } from './api/moviesRoutes';
import sitemapRouter from './api/sitemapRoutes';

const app = express();
const PORT = process.env.PORT || 4002;

// 定義允許的來源
const allowedOrigins = [
  'https://www.time2cinema.com', // 正式環境
  'https://time2cinema-frontend.vercel.app', // Vercel 部署
  'http://localhost:3000', // 本地開發
  'http://localhost:4000'  // 本地開發
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // 允許沒有 origin 的請求 (例如 Postman 或 curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200 // for legacy browser support
};

// 添加基本中間件
app.use(express.json());

// 使用 CORS 中間件
app.use(cors(corsOptions));

// 首頁
app.get('/', (req: Request, res: Response) => {
  res.send('Time2Cinema Backend API');
});

// Ping endpoint
app.get('/api/ping', (req: Request, res: Response) => {
  res.status(200).json({ message: 'pong', timestamp: new Date().toISOString() });
});

// 使用 boxoffice 路由
app.use('/api/boxoffice', boxofficeRouter);
app.use('/api/tmdb', tmdbRouter);
app.use('/api/cinemas', cinemaRouter);
app.use('/api/showtimes', showtimesRouter);
app.use('/api/movies/now-showing', nowShowingMoviesRouter);
app.use('/api/movies', moviesRouter);
app.use(sitemapRouter);

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log(`票房 API 網址: http://localhost:${PORT}/api/boxoffice`);
  console.log(`TMDB API 網址: http://localhost:${PORT}/api/tmdb`);
  console.log(`電影院 API 網址: http://localhost:${PORT}/api/cinemas`);
  console.log(`場次 API 網址: http://localhost:${PORT}/api/showtimes`);
  console.log(`電影 API 網址: http://localhost:${PORT}/api/movies`);
  console.log(`上映中 API 網址: http://localhost:${PORT}/api/movies/now-showing`);
});

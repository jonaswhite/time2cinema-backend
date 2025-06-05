import express, { Request, Response, NextFunction } from 'express';
import { boxofficeRouter } from './api/boxofficeRoutes';
import { tmdbRouter } from './api/tmdbRoutes';
import { cinemaRouter } from './api/cinemaRoutes';
import { showtimesRouter } from './api/showtimesRoutes';
import { nowShowingMoviesRouter } from './api/nowShowingMoviesRoutes';
import { moviesRouter } from './api/moviesRoutes';
import sitemapRouter from './api/sitemapRoutes';

const app = express();
const PORT = process.env.PORT || 4002;

// 添加基本中間件
app.use(express.json());

// 添加 CORS 支援
app.use((req: Request, res: Response, next: NextFunction): void => {
  // 允許特定來源，包括 Vercel 和本地開發環境
  const allowedOrigins = [
    'https://time2cinema-frontend.vercel.app',
    'http://localhost:3000',
    'http://localhost:4000'
  ];
  
  const origin = req.headers.origin as string | undefined;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 處理 OPTIONS 請求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
  } else {
    next();
  }
});

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

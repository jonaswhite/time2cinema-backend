import express, { Request, Response } from 'express';
import { boxofficeRouter } from './api/boxofficeRoutes';
import { tmdbRouter } from './api/tmdbRoutes';
import { cinemaRouter } from './api/cinemaRoutes';
import { showtimesRouter } from './api/showtimesRoutes';

const app = express();
const PORT = process.env.PORT || 4000;

// 添加基本中間件
app.use(express.json());

// 添加 CORS 支援
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 首頁
app.get('/', (req: Request, res: Response) => {
  res.send('Time2Cinema Backend API');
});

// 使用 boxoffice 路由
app.use('/api/boxoffice', boxofficeRouter);

// 使用 TMDB 路由
app.use('/api/tmdb', tmdbRouter);

// 使用電影院路由
app.use('/api/cinemas', cinemaRouter);

// 使用場次路由
app.use('/api/showtimes', showtimesRouter);

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log(`票房 API 網址: http://localhost:${PORT}/api/boxoffice`);
  console.log(`TMDB API 網址: http://localhost:${PORT}/api/tmdb`);
  console.log(`電影院 API 網址: http://localhost:${PORT}/api/cinemas`);
  console.log(`場次 API 網址: http://localhost:${PORT}/api/showtimes`);
});

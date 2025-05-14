import express, { Request, Response } from 'express';
import { 
  getAllShowtimes, 
  getShowtimesByTheater, 
  getShowtimesByMovie,
  getShowtimesByDate
} from './showtimes';

const router = express.Router();

// 獲取所有場次
router.get('/', (req: Request, res: Response) => {
  getAllShowtimes(req, res);
});

// 獲取特定電影院的場次
router.get('/theater/:theaterId', (req: Request, res: Response) => {
  getShowtimesByTheater(req, res);
});

// 獲取特定電影的場次
router.get('/movie/:movieName', (req: Request, res: Response) => {
  getShowtimesByMovie(req, res);
});

// 獲取特定電影ID的場次
router.get('/movie-id/:id', (req: Request, res: Response) => {
  // 將 movieName 參數設置為 ID
  req.params.movieName = req.params.id;
  getShowtimesByMovie(req, res);
});

// 獲取特定日期的場次
router.get('/date/:date', (req: Request, res: Response) => {
  getShowtimesByDate(req, res);
});

export const showtimesRouter = router;

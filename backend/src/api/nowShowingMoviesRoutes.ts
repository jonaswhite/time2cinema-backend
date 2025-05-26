import express, { Request, Response, NextFunction } from 'express';
import { getNowShowingMovies } from './nowShowingMovies';

const router = express.Router();

// 獲取所有正在上映的電影
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  getNowShowingMovies(req, res, next);
});

export const nowShowingMoviesRouter = router;

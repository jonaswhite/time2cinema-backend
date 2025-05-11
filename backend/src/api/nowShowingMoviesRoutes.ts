import express, { Request, Response } from 'express';
import { getNowShowingMovies } from './nowShowingMovies';

const router = express.Router();

// 獲取所有正在上映的電影
router.get('/', (req: Request, res: Response) => {
  getNowShowingMovies(req, res);
});

export const nowShowingMoviesRouter = router;

import express, { Request, Response } from 'express';
import { getAllCinemas, getCinemasByCity, getCinemaById } from './cinemas';

const router = express.Router();

// 獲取所有電影院
router.get('/', (req: Request, res: Response) => {
  getAllCinemas(req, res);
});

// 獲取特定城市的電影院
router.get('/city/:city', (req: Request, res: Response) => {
  getCinemasByCity(req, res);
});

// 獲取特定電影院
router.get('/:id', (req: Request, res: Response) => {
  getCinemaById(req, res);
});

export const cinemaRouter = router;

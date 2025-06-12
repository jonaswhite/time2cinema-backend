import { Request, Response } from 'express';
import pool from '../db';

// 電影院數據介面
interface Cinema {
  id: number;
  name: string;
  address: string;
  city: string;
  district: string;
  lat: number; // 修正：資料庫欄位是 lat
  lng: number; // 修正：資料庫欄位是 lng
  source: string;
  external_id: string;
  created_at: Date;
  updated_at: Date;
}

// 獲取所有電影院
export const getAllCinemas = async (req: Request, res: Response) => {
  try {
    // 直接查詢所有欄位，包括 lat 和 lng
    const result = await pool.query('SELECT * FROM cinemas ORDER BY name');
    // 直接回傳查詢結果，不需額外映射
    res.json(result.rows);
  } catch (error) {
    console.error('獲取電影院數據失敗:', error);
    res.status(500).json({ error: '獲取電影院數據失敗' });
  }
};

// 獲取特定城市的電影院
export const getCinemasByCity = async (req: Request, res: Response) => {
  try {
    const { city } = req.params;

    if (!city) {
      return res.status(400).json({ error: '請提供城市參數' });
    }

    const result = await pool.query(
      'SELECT * FROM cinemas WHERE city = $1 ORDER BY name',
      [city]
    );

    // 直接回傳查詢結果，不需額外映射
    res.json(result.rows);
  } catch (error) {
    console.error('獲取電影院數據失敗:', error);
    res.status(500).json({ error: '獲取電影院數據失敗' });
  }
};

// 獲取特定電影院
export const getCinemaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: '請提供電影院ID' });
    }

    const result = await pool.query('SELECT * FROM cinemas WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '找不到指定的電影院' });
    }

    // 直接回傳查詢結果，不需額外映射
    res.json(result.rows[0]);
  } catch (error) {
    console.error('獲取電影院數據失敗:', error);
    res.status(500).json({ error: '獲取電影院數據失敗' });
  }
};

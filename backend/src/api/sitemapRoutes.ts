import { Router } from 'express';
import { SitemapStream, streamToPromise } from 'sitemap';
import { createGzip } from 'zlib';
import pool from '../db';

const router = Router();

// 獲取所有電影的 ID 和最後更新時間
async function getMovies() {
  const result = await pool.query(
    'SELECT id, updated_at FROM movies ORDER BY updated_at DESC'
  );
  return result.rows;
}

// 獲取所有影院的 ID 和最後更新時間
async function getTheaters() {
  const result = await pool.query(
    'SELECT id, updated_at FROM cinemas ORDER BY updated_at DESC'
  );
  return result.rows;
}

// 生成 sitemap
router.get('/api/sitemap.xml', async (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.header('Content-Encoding', 'gzip');

  try {
    const smStream = new SitemapStream({
      hostname: 'https://www.time2cinema.com',
    });

    const pipeline = smStream.pipe(createGzip());

    // 添加首頁
    smStream.write({
      url: '/',
      changefreq: 'daily',
      priority: 1.0,
      lastmod: new Date().toISOString()
    });

    // 添加電影列表頁
    smStream.write({
      url: '/movies',
      changefreq: 'daily',
      priority: 0.9,
      lastmod: new Date().toISOString()
    });

    // 添加票房頁
    smStream.write({
      url: '/boxoffice',
      changefreq: 'daily',
      priority: 0.8,
      lastmod: new Date().toISOString()
    });

    // 添加影院頁
    smStream.write({
      url: '/theaters',
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date().toISOString()
    });

    // 添加所有電影頁面
    const movies = await getMovies();
    movies.forEach(movie => {
      smStream.write({
        url: `/movie/${movie.id}`,
        changefreq: 'daily',
        priority: 0.8,
        lastmod: movie.updated_at ? new Date(movie.updated_at).toISOString() : new Date().toISOString()
      });
    });

    // 添加所有影院頁面
    const theaters = await getTheaters();
    theaters.forEach(theater => {
      smStream.write({
        url: `/theater/${theater.id}`,
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: theater.updated_at ? new Date(theater.updated_at).toISOString() : new Date().toISOString()
      });
    });

    // 結束流
    smStream.end();

    // 將 sitemap 流傳送到響應
    pipeline.pipe(res).on('error', (e) => {
      throw e;
    });

  } catch (error) {
    console.error('生成 sitemap 時出錯:', error);
    res.status(500).send('生成 sitemap 時出錯');
  }
});

export default router;

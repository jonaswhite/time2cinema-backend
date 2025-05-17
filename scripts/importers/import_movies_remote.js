const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');

// 連接到線上資料庫
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function importMovies(csvFilePath) {
  console.log(`開始從 ${csvFilePath} 匯入電影資料...`);
  
  const movies = [];
  
  // 讀取 CSV 文件
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        if (data.title && data.release_date) {
          movies.push(data);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`找到 ${movies.length} 部電影`);

  try {
    await pool.query('BEGIN');
    await pool.query('TRUNCATE TABLE movies RESTART IDENTITY CASCADE');
    
    for (const movie of movies) {
      await pool.query(
        `INSERT INTO movies (
          title, original_title, release_date, runtime, 
          poster_path, backdrop_path, overview, tagline, 
          status, original_language, imdb_id, tmdb_id, 
          atmovies_id, created_at, updated_at, release_year,
          director, cast, genres, 
          rating, vote_count, popularity, trailer_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          movie.title,
          movie.original_title || '',
          movie.release_date || null,
          movie.runtime ? parseInt(movie.runtime) : null,
          movie.poster_path || '',
          movie.backdrop_path || '',
          movie.overview || '',
          movie.tagline || '',
          movie.status || 'Released',
          movie.original_language || 'zh-TW',
          movie.imdb_id || null,
          movie.tmdb_id ? parseInt(movie.tmdb_id) : null,
          movie.atmovies_id || null,
          movie.release_year ? parseInt(movie.release_year) : null,
          movie.director || '',
          movie.cast || '[]',
          movie.genres || '[]',
          movie.rating ? parseFloat(movie.rating) : 0,
          movie.vote_count ? parseInt(movie.vote_count) : 0,
          movie.popularity ? parseFloat(movie.popularity) : 0,
          movie.trailer_url || ''
        ]
      );
    }
    
    await pool.query('COMMIT');
    console.log('電影資料匯入成功');
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('匯入電影資料時出錯:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    const csvFilePath = process.argv[2];
    if (!csvFilePath) {
      throw new Error('請提供 CSV 文件路徑');
    }
    await importMovies(csvFilePath);
  } catch (error) {
    console.error('執行出錯:', error);
    process.exit(1);
  }
}

main();

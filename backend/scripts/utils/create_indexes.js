const { Client } = require('pg');

const client = new Client({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'time2cinema',
  password: '',
  port: 5432,
});

async function createIndexes() {
  await client.connect();
  console.log('建立資料庫索引...');
  
  try {
    // 場次資料索引
    await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_cinema_id ON showtimes(cinema_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_movie_name ON showtimes(movie_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_showtimes_cinema_date ON showtimes(cinema_id, date)');
    
    // 票房資料索引
    await client.query('CREATE INDEX IF NOT EXISTS idx_boxoffice_rank ON boxoffice(rank)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_boxoffice_movie_id ON boxoffice(movie_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_boxoffice_week_start_date ON boxoffice(week_start_date)');
    
    console.log('索引建立完成！');
  } catch (err) {
    console.error('建立索引時出錯:', err.message);
  } finally {
    await client.end();
  }
}

createIndexes();

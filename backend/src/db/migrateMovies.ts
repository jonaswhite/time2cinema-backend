import { Pool } from 'pg';
import { ensureTMDBCacheTable, getMovieFromCache } from './tmdbCache';

// 線上資料庫配置
const onlineDbConfig = {
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
};

// 創建線上資料庫連接池
const pool = new Pool(onlineDbConfig);

// 電影標題映射表
const movieTitleMapping: Record<string, string> = {
  // 票房榜熱門電影
  "雷霆特攻隊": "The Thunderbolts",
  "會計師2": "The Accountant 2",
  "會計師 2": "The Accountant 2",
  "沙丘：第二部": "Dune: Part Two",
  "少年與狗": "The Boy and the Heron",
  "時空旅人": "The Time Traveler's Wife",
  "天才少女": "Gifted",
  "超能力家族": "The Incredibles",
  
  // 其他電影
  "夏之庭": "The Friends",
  "2046": "2046",
  "電影蘇筆小新：我們的恐龍日記": "Crayon Shin-chan: Our Dinosaur Diary",
  "電影版孤獨的美食家": "Solitary Gourmet: The Movie"
};

// 根據中文電影標題獲取英文標題的輔助函數
async function getEnglishTitleByChinese(chineseTitle: string): Promise<string | null> {
  // 從 movieTitleMapping 中查找
  if (chineseTitle in movieTitleMapping) {
    return movieTitleMapping[chineseTitle];
  }
  
  // 嘗試忽略空格匹配
  const normalizedTitle = chineseTitle.replace(/\s+/g, '');
  for (const [key, value] of Object.entries(movieTitleMapping)) {
    if (key.replace(/\s+/g, '') === normalizedTitle) {
      return value;
    }
  }
  
  return null;
}

// 確保 movies 表存在（先刪除舊表，再創建新表）
export async function ensureMoviesTable(): Promise<boolean> {
  try {
    // 檢查表是否存在
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'movies'
      );
    `;
    
    const tableExists = await pool.query(checkTableQuery);
    
    if (tableExists.rows[0].exists) {
      console.log('movies 表已存在，檢查欄位結構...');
      
      // 檢查欄位結構
      const checkColumnsQuery = `
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'movies'
      `;
      
      const columns = await pool.query(checkColumnsQuery);
      const columnNames = columns.rows.map(row => row.column_name);
      console.log('現有欄位:', columnNames.join(', '));
      
      // 檢查是否有 name 欄位，但沒有 title 欄位
      if (columnNames.includes('name') && !columnNames.includes('title')) {
        console.log('將 name 欄位重命名為 title...');
        await pool.query('ALTER TABLE movies RENAME COLUMN name TO title;');
      }
      
      // 檢查是否缺少必要的欄位
      const requiredColumns = [
        'original_title', 'poster_url', 'backdrop_url', 'overview', 'runtime', 'vote_average', 'genres'
      ];
      
      for (const column of requiredColumns) {
        if (!columnNames.includes(column)) {
          console.log(`添加缺少的欄位: ${column}...`);
          
          let dataType = 'TEXT';
          if (column === 'runtime') dataType = 'INTEGER';
          if (column === 'vote_average') dataType = 'NUMERIC(3,1)';
          if (column === 'genres') dataType = 'JSONB';
          
          await pool.query(`ALTER TABLE movies ADD COLUMN ${column} ${dataType};`);
        }
      }
      
      // 檢查 tmdb_id 欄位的數據類型
      if (columnNames.includes('tmdb_id')) {
        const tmdbIdTypeQuery = `
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'movies' AND column_name = 'tmdb_id'
        `;
        
        const tmdbIdType = await pool.query(tmdbIdTypeQuery);
        
        if (tmdbIdType.rows.length > 0 && tmdbIdType.rows[0].data_type === 'text') {
          console.log('將 tmdb_id 欄位從 TEXT 轉換為 INTEGER...');
          
          // 添加臨時欄位
          await pool.query('ALTER TABLE movies ADD COLUMN tmdb_id_new INTEGER;');
          
          // 嘗試轉換現有的 tmdb_id 值
          await pool.query(`
            UPDATE movies SET tmdb_id_new = NULLIF(tmdb_id, '')::INTEGER
            WHERE tmdb_id ~ '^[0-9]+$';
          `);
          
          // 刪除舊欄位，重命名新欄位
          await pool.query('ALTER TABLE movies DROP COLUMN tmdb_id;');
          await pool.query('ALTER TABLE movies RENAME COLUMN tmdb_id_new TO tmdb_id;');
          
          // 添加唯一約束
          await pool.query('ALTER TABLE movies ADD CONSTRAINT movies_tmdb_id_key UNIQUE (tmdb_id);');
        }
      }
      
      console.log('movies 表結構更新成功');
    } else {
      console.log('創建新的 movies 表...');
      
      // 創建新表
      const createTableQuery = `
        CREATE TABLE movies (
          id SERIAL PRIMARY KEY,
          tmdb_id INTEGER UNIQUE,
          title TEXT NOT NULL,
          original_title TEXT,
          poster_url TEXT,
          backdrop_url TEXT,
          overview TEXT,
          release_date DATE,
          runtime INTEGER,
          vote_average NUMERIC(3,1),
          genres JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await pool.query(createTableQuery);
      console.log('movies 表創建成功');
    }
    
    return true;
  } catch (error) {
    console.error('確保 movies 表存在時發生錯誤:', error);
    return false;
  }
}

// 從 TMDB 快取遷移電影資料到 movies 表
export async function migrateTMDBCacheToMovies(): Promise<boolean> {
  try {
    // 確保表存在
    await ensureMoviesTable();
    
    // 從 TMDB 快取表獲取所有電影
    const result = await pool.query(`
      SELECT * FROM tmdb_movie_cache
    `);
    
    console.log(`從 TMDB 快取中找到 ${result.rows.length} 部電影`);
    
    // 遍歷每部電影並插入到 movies 表
    for (const movie of result.rows) {
      try {
        // 檢查電影是否已存在於 movies 表
        const checkQuery = `
          SELECT id FROM movies WHERE tmdb_id = $1 OR title = $2
        `;
        const checkResult = await pool.query(checkQuery, [movie.tmdb_id, movie.title]);
        
        if (checkResult.rows.length > 0) {
          // 更新現有記錄
          const updateQuery = `
            UPDATE movies 
            SET 
              tmdb_id = $1,
              original_title = $2,
              poster_url = $3,
              backdrop_url = $4,
              overview = $5,
              release_date = $6,
              runtime = $7,
              vote_average = $8,
              genres = $9,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING id
          `;
          
          const updateResult = await pool.query(updateQuery, [
            movie.tmdb_id,
            movie.original_title,
            movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
            movie.overview,
            movie.release_date,
            movie.runtime,
            movie.vote_average,
            movie.genres,
            checkResult.rows[0].id
          ]);
          
          console.log(`更新電影: ${movie.title} (ID: ${updateResult.rows[0].id})`);
        } else {
          // 插入新記錄
          const insertQuery = `
            INSERT INTO movies (
              tmdb_id, title, original_title, poster_url, backdrop_url, 
              overview, release_date, runtime, vote_average, genres
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `;
          
          const insertResult = await pool.query(insertQuery, [
            movie.tmdb_id,
            movie.title,
            movie.original_title,
            movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
            movie.overview,
            movie.release_date,
            movie.runtime,
            movie.vote_average,
            movie.genres
          ]);
          
          console.log(`新增電影: ${movie.title} (ID: ${insertResult.rows[0].id})`);
        }
      } catch (movieError) {
        console.error(`處理電影 ${movie.title} 時出錯:`, movieError);
      }
    }
    
    // 從 boxoffice 表獲取所有電影名稱，確保它們都在 movies 表中
    await migrateBoxofficeMovies();
    
    // 從 showtimes 表獲取所有電影名稱，確保它們都在 movies 表中
    await migrateShowtimesMovies();
    
    console.log('電影資料遷移完成');
    return true;
  } catch (error) {
    console.error('遷移電影資料時出錯:', error);
    return false;
  }
}

// 從 boxoffice 表遷移電影資料
async function migrateBoxofficeMovies(): Promise<void> {
  try {
    // 獲取 boxoffice 表中所有唯一的電影名稱
    const result = await pool.query(`
      SELECT DISTINCT movie_id FROM boxoffice
    `);
    
    console.log(`從 boxoffice 表中找到 ${result.rows.length} 部唯一電影`);
    
    // 遍歷每個電影名稱，確保它在 movies 表中
    for (const row of result.rows) {
      const movieName = row.movie_id;
      
      // 檢查電影是否已存在於 movies 表
      const checkQuery = `
        SELECT id FROM movies WHERE title = $1
      `;
      const checkResult = await pool.query(checkQuery, [movieName]);
      
      if (checkResult.rows.length === 0) {
        // 電影不存在，嘗試從 TMDB 快取獲取資訊
        const tmdbMovie = await getMovieFromCache(movieName);
        
        if (tmdbMovie) {
          // 插入到 movies 表
          const insertQuery = `
            INSERT INTO movies (
              tmdb_id, title, original_title, poster_url, backdrop_url, 
              overview, release_date, runtime, vote_average, genres
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `;
          
          const insertResult = await pool.query(insertQuery, [
            tmdbMovie.id,
            movieName,
            tmdbMovie.original_title,
            tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null,
            tmdbMovie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}` : null,
            tmdbMovie.overview,
            tmdbMovie.release_date,
            tmdbMovie.runtime,
            tmdbMovie.vote_average,
            JSON.stringify(tmdbMovie.genres || [])
          ]);
          
          console.log(`從 boxoffice 新增電影: ${movieName} (ID: ${insertResult.rows[0].id})`);
        } else {
          // 無法從 TMDB 獲取資訊，僅插入基本資訊
          const insertQuery = `
            INSERT INTO movies (title) VALUES ($1)
            RETURNING id
          `;
          
          const insertResult = await pool.query(insertQuery, [movieName]);
          console.log(`從 boxoffice 新增基本電影: ${movieName} (ID: ${insertResult.rows[0].id})`);
        }
      }
    }
  } catch (error) {
    console.error('遷移 boxoffice 電影資料時出錯:', error);
  }
}

// 從 showtimes 表遷移電影資料
async function migrateShowtimesMovies(): Promise<void> {
  try {
    // 獲取 showtimes 表中所有唯一的電影名稱
    const result = await pool.query(`
      SELECT DISTINCT movie_name FROM showtimes
    `);
    
    console.log(`從 showtimes 表中找到 ${result.rows.length} 部唯一電影`);
    
    // 遍歷每個電影名稱，確保它在 movies 表中
    for (const row of result.rows) {
      const movieName = row.movie_name;
      
      // 檢查電影是否已存在於 movies 表
      const checkQuery = `
        SELECT id FROM movies WHERE title = $1
      `;
      const checkResult = await pool.query(checkQuery, [movieName]);
      
      if (checkResult.rows.length === 0) {
        // 電影不存在，嘗試從 TMDB 快取獲取資訊
        const tmdbMovie = await getMovieFromCache(movieName);
        
        if (tmdbMovie) {
          // 插入到 movies 表
          const insertQuery = `
            INSERT INTO movies (
              tmdb_id, title, original_title, poster_url, backdrop_url, 
              overview, release_date, runtime, vote_average, genres
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `;
          
          const insertResult = await pool.query(insertQuery, [
            tmdbMovie.id,
            movieName,
            tmdbMovie.original_title,
            tmdbMovie.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}` : null,
            tmdbMovie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}` : null,
            tmdbMovie.overview,
            tmdbMovie.release_date,
            tmdbMovie.runtime,
            tmdbMovie.vote_average,
            JSON.stringify(tmdbMovie.genres || [])
          ]);
          
          console.log(`從 showtimes 新增電影: ${movieName} (ID: ${insertResult.rows[0].id})`);
        } else {
          // 無法從 TMDB 獲取資訊，僅插入基本資訊
          const insertQuery = `
            INSERT INTO movies (title) VALUES ($1)
            RETURNING id
          `;
          
          const insertResult = await pool.query(insertQuery, [movieName]);
          console.log(`從 showtimes 新增基本電影: ${movieName} (ID: ${insertResult.rows[0].id})`);
        }
      }
    }
  } catch (error) {
    console.error('遷移 showtimes 電影資料時出錯:', error);
  }
}

// 執行遷移
export async function runMoviesMigration(): Promise<void> {
  try {
    console.log('開始電影資料遷移...');
    
    // 確保 TMDB 快取表存在
    await ensureTMDBCacheTable();
    
    // 遷移電影資料
    await migrateTMDBCacheToMovies();
    
    console.log('電影資料遷移完成');
  } catch (error) {
    console.error('電影資料遷移失敗:', error);
  }
}

// 如果直接執行此檔案，則運行遷移
if (require.main === module) {
  runMoviesMigration().catch(console.error);
}

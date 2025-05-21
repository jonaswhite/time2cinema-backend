const fs = require('fs').promises;
const { Pool } = require('pg');
const path = require('path');
const { Command } = require('commander');

// 資料庫連線設定
const DB_CONFIGS = {
  local: {
    user: 'jonaswhite',
    host: 'localhost',
    database: 'jonaswhite',
    port: 5432,
    ssl: false
  },
  remote: {
    connectionString: process.env.DATABASE_URL || 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
    ssl: {
      rejectUnauthorized: false
    }
  }
};

// 命令行參數解析
const program = new Command();
program
  .option('--local', '使用本地資料庫')
  .option('--remote', '使用遠端資料庫')
  .option('--connection <string>', '自定義資料庫連接字串')
  .option('--file <path>', '指定票房資料檔案路徑')
  .parse(process.argv);

const options = program.opts();

// 確定使用哪個資料庫配置
let dbConfig;
if (options.connection) {
  dbConfig = {
    connectionString: options.connection,
    ssl: options.connection.includes('render.com') ? { rejectUnauthorized: false } : false
  };
} else if (options.remote) {
  dbConfig = DB_CONFIGS.remote;
} else {
  dbConfig = DB_CONFIGS.local;
}

// 創建資料庫連接池
const pool = new Pool(dbConfig);

// 初始化資料庫連接
async function initDb() {
  const client = await pool.connect();
  try {
    // 測試連接
    await client.query('SELECT 1');
    console.log('✅ 成功連接到資料庫');
    return true;
  } catch (error) {
    console.error('❌ 無法連接到資料庫:', error.message);
    return false;
  } finally {
    client.release();
  }
}

// 找出最新的 boxoffice 檔案
async function findLatestBoxofficeFile() {
  try {
    // 取得當前目錄下的所有檔案
    const files = await fs.readdir('.');
    
    // 過濾出 boxoffice 開頭的 JSON 檔案
    const boxofficeFiles = files.filter(file => 
      file.startsWith('boxoffice') && file.endsWith('.json')
    );
    
    if (boxofficeFiles.length === 0) {
      throw new Error('找不到任何 boxoffice 開頭的 JSON 檔案');
    }
    
    // 按修改時間排序，取得最新的檔案
    const stats = await Promise.all(
      boxofficeFiles.map(file => fs.stat(file).then(stat => ({ file, mtime: stat.mtime })))
    );
    
    stats.sort((a, b) => b.mtime - a.mtime);
    const latestFile = stats[0].file;
    
    console.log(`找到最新的票房檔案: ${latestFile}`);
    return latestFile;
  } catch (error) {
    console.error('❌ 尋找票房檔案時發生錯誤:', error.message);
    throw error;
  }
}

// 計算週一日期（台灣時區）
// @param {string} dateStr - 日期字串 (YYYY-MM-DD)
// @returns {string} 該週週一的日期 (YYYY-MM-DD)
function getWeekStartDate(dateStr) {
  const date = new Date(dateStr);
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1); // 調整為週一是一週的開始
  
  const monday = new Date(date);
  monday.setUTCDate(diff);
  
  // 格式化為 YYYY-MM-DD
  return monday.toISOString().split('T')[0];
}

// 將中文欄位名稱映射到英文欄位名稱
function mapChineseToEnglishFields(item) {
  return {
    rank: parseInt(item['序號']) || 0,
    tickets: parseInt((item['票數'] || '0').replace(/,/g, '')) || 0,
    week_start_date: getWeekStartDate(item['上映日'] || new Date().toISOString().split('T')[0]),
    source: item['片名'] || '未知電影',
    release_date: item['上映日'] || null,
    totalsales: 0
  };
}

async function importBoxoffice() {
  try {
    // 初始化資料庫連接
    const dbConnected = await initDb();
    if (!dbConnected) {
      throw new Error('無法連接到資料庫，請檢查連線設定');
    }

    // 找出票房檔案
    const boxofficeFile = options.file || await findLatestBoxofficeFile();
    
    // 讀取票房資料
    const fileContent = await fs.readFile(boxofficeFile, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    // 檢查是否有 data 屬性，如果沒有則使用整個 JSON 對象
    const boxofficeData = jsonData.data ? jsonData.data.map(mapChineseToEnglishFields) : [];
    
    if (!boxofficeData || boxofficeData.length === 0) {
      throw new Error('票房資料為空或格式不正確');
    }
    
    console.log(`找到 ${boxofficeData.length} 筆票房資料`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // 處理每筆票房資料
    for (const [index, item] of boxofficeData.entries()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        console.log('處理中的項目:', JSON.stringify(item, null, 2));
        
        // 從 item 中提取需要的欄位
        const rank = item.rank || 0;
        const title = item.source || '未知電影'; // 使用 source 欄位作為電影名稱
        const weekend = item.tickets || 0; // 使用 tickets 作為週末票數
        const gross = 0; // 暫時設為 0，因為原始數據中沒有這個欄位
        const weeks = 1; // 預設為 1 週
        const distributor = ''; // 發行商
        const theaters = 0; // 上映戲院數
        const avg = 0; // 平均每廳票房
        const total_gross = 0; // 總票房
        const poster_url = ''; // 海報網址
        const tmdb_id = null; // TMDB ID
        
        console.log(`正在處理: ${item.source} (排名: ${item.rank}, 票數: ${item.tickets})`);
        
        // 1. 首先嘗試精確匹配
        const findMovieQuery = `
          SELECT id, chinese_title, english_title, release_date
          FROM movies 
          WHERE 
            chinese_title = $1 OR 
            english_title = $1
          LIMIT 1
        `;
        
        let movieResult;
        try {
          console.log(`嘗試查詢電影: "${title}"`);
          movieResult = await client.query(findMovieQuery, [title]);
          console.log(`查詢結果: 找到 ${movieResult.rows.length} 筆資料`);
          
          // 如果找不到完全匹配，嘗試模糊搜尋
          if (movieResult.rows.length === 0) {
            const searchTerm = `%${title}%`;
            console.log(`嘗試模糊搜尋: "${searchTerm}"`);
            
            const fuzzyQuery = `
              SELECT id, chinese_title, english_title, release_date
              FROM movies 
              WHERE 
                chinese_title ILIKE $1 OR 
                english_title ILIKE $1
              LIMIT 1
            `;
            
            movieResult = await client.query(fuzzyQuery, [searchTerm]);
            console.log(`模糊搜尋結果: 找到 ${movieResult.rows.length} 筆資料`);
          }
        } catch (error) {
          console.error(`❌ 查詢電影時發生錯誤: ${error.message}`);
          console.error('錯誤堆疊:', error.stack);
          errorCount++;
          errors.push(`查詢電影時發生錯誤: ${error.message}`);
          await client.query('ROLLBACK');
          continue;
        }
        
        if (movieResult.rows.length === 0) {
          console.log(`❌ 找不到匹配的電影: ${title}, 跳過此筆記錄`);
          errorCount++;
          errors.push(`找不到匹配的電影: ${title}`);
          await client.query('ROLLBACK');
          continue;
        }
        
        const movie = movieResult.rows[0];
        const movieId = movie.id;
        const movieTitle = movie.chinese_title || movie.english_title || title;
        
        // 如果電影已存在但沒有 release_date，則更新
        if (item.release_date && !movie.release_date) {
          try {
            console.log(`更新電影 ${movieId} 的上映日期為: ${item.release_date}`);
            await client.query(
              'UPDATE movies SET release_date = $1, updated_at = NOW() WHERE id = $2',
              [item.release_date, movieId]
            );
          } catch (error) {
            console.error(`❌ 更新電影上映日期時發生錯誤: ${error.message}`);
            // 不中斷流程，繼續處理
          }
        }
        
        // 3. 檢查票房記錄是否已存在
        const checkQuery = `
          SELECT id FROM boxoffice 
          WHERE movie_id = $1 AND week_start_date = $2
          LIMIT 1
        `;
        
        const checkValues = [movieId, item.week_start_date];
        const checkResult = await client.query(checkQuery, checkValues);
        
        let query, values;
        
        if (checkResult.rows.length > 0) {
          // 更新現有記錄
          query = `
            UPDATE boxoffice SET
              rank = $1,
              tickets = $2,
              totalsales = $3,
              release_date = COALESCE($4, release_date),
              updated_at = NOW()
            WHERE movie_id = $5 AND week_start_date = $6
            RETURNING id
          `;
          values = [
            item.rank,
            item.tickets,
            item.totalsales,
            item.release_date,
            movieId,
            item.week_start_date
          ];
        } else {
          // 插入新記錄
          query = `
            INSERT INTO boxoffice (
              rank, tickets, week_start_date, source, totalsales, release_date, movie_id, movie_alias
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `;
          values = [
            item.rank,
            item.tickets,
            item.week_start_date,
            item.source,
            item.totalsales,
            item.release_date,
            movieId,
            item.source // 使用原始名稱作為別名
          ];
        }
        
        const result = await client.query(query, values);
        
        await client.query('COMMIT');
        successCount++;
        console.log(`✅ 成功處理: ${movieTitle} (ID: ${movieId})`);
      } catch (error) {
        await client.query('ROLLBACK');
        errorCount++;
        const errorMsg = `處理第 ${index + 1} 筆資料時發生錯誤: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      } finally {
        client.release();
      }
    }
    
    console.log('\n✅ 匯入完成！');
    console.log(`✅ 成功: ${successCount} 筆`);
    console.log(`❌ 失敗: ${errorCount} 筆`);
    
    if (errors.length > 0) {
      console.log('\n錯誤詳情:');
      errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    return {
      total: boxofficeData.length,
      success: successCount,
      error: errorCount,
      errors
    };
  } catch (error) {
    console.error('❌ 發生錯誤:', error.message);
    throw error;
  } finally {
    if (pool) {
      await pool.end();
      console.log('已關閉資料庫連接');
    }
  }
}

// 執行主函數
if (require.main === module) {
  importBoxoffice().catch(err => {
    console.error('❌ 執行匯入程序時發生錯誤:', err);
    process.exit(1);
  });
}

module.exports = {
  importBoxoffice,
  mapChineseToEnglishFields,
  getWeekStartDate
};

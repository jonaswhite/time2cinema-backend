const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { Command } = require('commander');

// 設定專案根目錄與輸出目錄
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'temp');
const MODIFIED_FILE = path.join(OUTPUT_DIR, 'modified_showtimes.json');

// 確保輸出目錄存在
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

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
    connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
    ssl: {
      rejectUnauthorized: false
    }
  }
};

// 命令行參數解析
const program = new Command();
program
  .option('--export', '只執行匯出')
  .option('--import', '只執行匯入')
  .parse(process.argv);

const options = program.opts();

// 日期轉換函數
function modifyDate(dateStr) {
  if (!dateStr) return null;
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  
  // 將日期轉換為目標日期
  const day = date.getDate();
  const month = date.getMonth() + 1;
  
  // 5/28 -> 5/30, 5/29 -> 5/31, 5/30 -> 6/01
  if (month === 5 && day === 28) {
    date.setDate(30);
  } else if (month === 5 && day === 29) {
    date.setDate(31);
  } else if (month === 5 && day === 30) {
    date.setMonth(5); // 6月 (0-based)
    date.setDate(1);
  }
  
  // 格式化為 YYYY-MM-DD
  const year = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${newMonth}-${newDay}`;
}

// 從遠端資料庫匯出場次資料
async function exportShowtimes() {
  console.log('🚀 開始從遠端資料庫匯出場次資料...');
  const remotePool = new Pool(DB_CONFIGS.remote);
  
  try {
    // 獲取所有場次資料
    const result = await remotePool.query(`
      SELECT s.*, 
             m.chinese_title AS movie_title,
             c.name AS cinema_name
      FROM showtimes s
      LEFT JOIN movies m ON s.movie_id = m.id
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.date >= '2025-05-28' AND s.date <= '2025-05-30'
      ORDER BY s.date, s.time, c.name, m.chinese_title
    `);
    
    console.log('SQL 查詢執行完畢，結果數量:', result.rows.length);
    
    console.log(`✅ 成功從遠端資料庫匯出 ${result.rows.length} 筆場次資料`);
    return result.rows;
  } catch (error) {
    console.error('❌ 從遠端資料庫匯出場次資料時出錯:', error);
    throw error;
  } finally {
    await remotePool.end();
  }
}

// 修改場次日期
function modifyShowtimes(showtimes) {
  console.log('🔄 開始修改場次日期...');
  
  const modifiedShowtimes = showtimes.map(showtime => {
    const newDate = modifyDate(showtime.date);
    if (!newDate) {
      console.warn(`⚠️ 無法處理日期: ${showtime.date} (ID: ${showtime.id})`);
      return null;
    }
    
    return {
      ...showtime,
      original_date: showtime.date, // 保留原始日期以供參考
      date: newDate,
      time: showtime.time,
      movie_title: showtime.movie_title,
      cinema_name: showtime.cinema_name
    };
  }).filter(Boolean); // 過濾掉無效的場次
  
  console.log(`✅ 成功修改 ${modifiedShowtimes.length} 筆場次日期`);
  return modifiedShowtimes;
}

// 儲存修改後的場次資料
async function saveModifiedShowtimes(showtimes) {
  await ensureOutputDir();
  await fs.writeFile(MODIFIED_FILE, JSON.stringify(showtimes, null, 2), 'utf8');
  console.log(`💾 已將修改後的場次資料保存至 ${MODIFIED_FILE}`);
  return MODIFIED_FILE;
}

// 載入修改後的場次資料
async function loadModifiedShowtimes() {
  try {
    const data = await fs.readFile(MODIFIED_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ 載入修改後的場次資料時出錯:', error);
    throw error;
  }
}

// 匯入場次資料到本地資料庫
async function importShowtimes(showtimes) {
  console.log('🚀 開始將場次資料匯入本地資料庫...');
  const localPool = new Pool(DB_CONFIGS.local);
  const client = await localPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 先刪除現有的場次資料（可選，根據需求決定是否要清除）
    // await client.query(`DELETE FROM showtimes WHERE date >= '2025-05-30'`);
    
    let successCount = 0;
    let skipCount = 0;
    
    for (const showtime of showtimes) {
      try {
        // 檢查場次是否已存在
        const checkRes = await client.query(
          `SELECT id FROM showtimes 
           WHERE cinema_id = $1 AND movie_id = $2 AND date = $3 AND time = $4
           LIMIT 1`,
          [showtime.cinema_id, showtime.movie_id, showtime.date, showtime.time]
        );
        
        if (checkRes.rows.length === 0) {
          // 場次不存在，插入新場次
          await client.query(
            `INSERT INTO showtimes 
             (cinema_id, movie_id, date, time, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [
              showtime.cinema_id,
              showtime.movie_id,
              showtime.date,
              showtime.time
            ]
          );
          successCount++;
        } else {
          console.log(`⏭️ 場次已存在: ${showtime.date} ${showtime.time} - ${showtime.movie_title} (${showtime.cinema_name})`);
          skipCount++;
        }
      } catch (error) {
        console.error(`❌ 插入場次失敗 (${showtime.movie_title} - ${showtime.date} ${showtime.time}):`, error.message);
        // 繼續處理下一個場次
      }
    }
    
    await client.query('COMMIT');
    console.log(`✅ 成功匯入 ${successCount} 筆場次資料，跳過 ${skipCount} 筆已存在的場次`);
    return { successCount, skipCount };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 匯入場次資料時出錯:', error);
    throw error;
  } finally {
    client.release();
    await localPool.end();
  }
}

// 主函數
async function main() {
  try {
    let modifiedShowtimes;
    
    // 如果沒有指定 --import 選項，則執行匯出和修改
    if (!options.import) {
      const showtimes = await exportShowtimes();
      modifiedShowtimes = modifyShowtimes(showtimes);
      await saveModifiedShowtimes(modifiedShowtimes);
      
      if (options.export) {
        console.log('✅ 已成功匯出並修改場次資料');
        return;
      }
    }
    
    // 載入修改後的場次資料
    if (!modifiedShowtimes) {
      modifiedShowtimes = await loadModifiedShowtimes();
    }
    
    // 如果沒有指定 --export 選項，則執行匯入
    if (!options.export) {
      await importShowtimes(modifiedShowtimes);
    }
    
    console.log('🎉 所有操作已完成！');
  } catch (error) {
    console.error('❌ 執行過程中出錯:', error);
    process.exit(1);
  }
}

// 執行主函數
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 未捕獲的錯誤:', err);
    process.exit(1);
  });
}

module.exports = {
  modifyDate,
  exportShowtimes,
  modifyShowtimes,
  importShowtimes
};

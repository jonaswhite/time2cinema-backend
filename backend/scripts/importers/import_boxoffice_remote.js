const fs = require('fs');
const { Client } = require('pg');
const path = require('path');

// 線上 PostgreSQL 連線設定
const client = new Client({
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db',
  ssl: { rejectUnauthorized: false }
});

// 找出最新的 boxoffice 檔案
function findLatestBoxofficeFile() {
  // 先檢查命令行參數，如果有指定檔案路徑，則直接使用
  const args = process.argv.slice(2);
  if (args.length > 0 && fs.existsSync(args[0])) {
    console.log(`使用命令行指定的檔案路徑: ${args[0]}`);
    return args[0];
  }
  
  // 如果沒有指定檔案路徑，則尋找最新的檔案
  console.log('沒有指定檔案路徑，尋找最新的 boxoffice 檔案...');
  
  // 先檢查 scripts/cache 目錄
  const scriptsCacheDir = path.join(__dirname, '..', 'cache');
  let allFiles = [];
  
  if (fs.existsSync(scriptsCacheDir)) {
    const scriptsCacheFiles = fs.readdirSync(scriptsCacheDir)
      .filter(file => file.startsWith('boxoffice-') && file.endsWith('.json') && !file.includes('with-posters'))
      .map(file => ({ path: path.join(scriptsCacheDir, file), date: file.replace('boxoffice-', '').replace('.json', '') }));
    allFiles = allFiles.concat(scriptsCacheFiles);
  }
  
  // 再檢查專案根目錄的 cache 目錄
  const rootCacheDir = path.join(__dirname, '..', '..', 'cache');
  if (fs.existsSync(rootCacheDir)) {
    const rootCacheFiles = fs.readdirSync(rootCacheDir)
      .filter(file => file.startsWith('boxoffice-') && file.endsWith('.json') && !file.includes('with-posters'))
      .map(file => ({ path: path.join(rootCacheDir, file), date: file.replace('boxoffice-', '').replace('.json', '') }));
    allFiles = allFiles.concat(rootCacheFiles);
  }
  
  // 根據日期排序
  allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (allFiles.length === 0) {
    throw new Error('找不到 boxoffice 檔案');
  }
  
  console.log(`找到最新的檔案: ${allFiles[0].path}`);
  return allFiles[0].path;
}

// 計算週一日期（台灣時區）
function getWeekStartDate(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay() || 7; // 如果是週日 (0)，改為 7
  const diff = date.getDate() - day + 1; // 調整為週一
  const weekStart = new Date(date);
  weekStart.setDate(diff);
  
  // 格式化為 YYYY-MM-DD
  return weekStart.toISOString().split('T')[0];
}

async function importBoxoffice() {
  try {
    // 找出最新的 boxoffice 檔案
    const latestFile = findLatestBoxofficeFile();
    console.log(`使用檔案: ${latestFile}`);
    
    // 讀取 JSON 檔案
    const fileContent = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    
    // 新格式的票房資料有 headers 和 data 兩個屬性
    if (!fileContent.data || !Array.isArray(fileContent.data)) {
      throw new Error('票房資料格式不正確，缺少 data 屬性或不是數組');
    }
    
    const boxofficeData = fileContent.data;
    
    // 取得檔案名稱中的日期
    const fileDate = path.basename(latestFile).replace('boxoffice-', '').replace('.json', '');
    console.log(`資料日期: ${fileDate}`);
    
    // 計算週一日期
    const weekStartDate = getWeekStartDate(fileDate);
    console.log(`週一日期: ${weekStartDate}`);
    
    await client.connect();
    console.log('連線到線上資料庫成功，開始匯入票房資料...');
    
    // 設定資料庫時區為台灣時區
    await client.query("SET timezone = 'Asia/Taipei'");
    console.log('已設定資料庫時區為台灣時區');
    
    // 刪除與當前週一日期相同的資料，而不是清空所有資料
    await client.query('DELETE FROM boxoffice WHERE week_start_date = $1', [weekStartDate]);
    console.log(`已刪除週一日期為 ${weekStartDate} 的舊票房資料`);
    
    // 開始匯入
    let importedCount = 0;
    
    for (const movie of boxofficeData) {
      // 新格式的票房資料中，電影名稱在 "片名" 欄位，票數在 "票數" 欄位
      const movieName = movie["片名"];
      const rank = parseInt(movie["序號"]) || 0;
      
      // 處理票數，去除逗號和空格
      let tickets = 0;
      if (movie["票數"]) {
        // 先移除逗號和空格，再轉換為整數
        const ticketsStr = movie["票數"].toString().replace(/,/g, '').trim();
        tickets = parseInt(ticketsStr) || 0;
        console.log(`電影: ${movieName}, 原始票數: ${movie["票數"]}, 處理後: ${tickets}`);
      }
      
      // 處理總票數，去除逗號和空格
      let totalsales = 0;
      if (movie["總票數"]) {
        // 先移除逗號和空格，再轉換為整數
        const totalsalesStr = movie["總票數"].toString().replace(/,/g, '').trim();
        totalsales = parseInt(totalsalesStr) || 0;
        console.log(`電影: ${movieName}, 原始總票數: ${movie["總票數"]}, 處理後: ${totalsales}`);
      }
      
      // 處理上映日期，格式可能是 YYYY/MM/DD 或 YYYY-MM-DD
      let releaseDate = null;
      // 先檢查「上映日期」欄位，如果沒有則檢查「上映日」欄位
      const releaseDateField = movie["上映日期"] ? "上映日期" : (movie["上映日"] ? "上映日" : null);
      
      if (releaseDateField && movie[releaseDateField]) {
        try {
          // 移除可能的空格
          const releaseDateStr = movie[releaseDateField].toString().trim();
          // 將 YYYY/MM/DD 轉換為 YYYY-MM-DD
          releaseDate = releaseDateStr.replace(/\//g, '-');
          console.log(`電影: ${movieName}, 上映日期 (${releaseDateField}): ${releaseDate}`);
        } catch (err) {
          console.error(`處理上映日期錯誤 (${movieName}):`, err.message);
        }
      }
      
      const query = `
        INSERT INTO boxoffice (movie_id, rank, tickets, totalsales, week_start_date, source, release_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      // 由於我們不使用 movies 資料表，這裡用電影名稱作為 movie_id
      const values = [
        movieName,
        rank,
        tickets,
        totalsales,
        weekStartDate,
        'tfai',
        releaseDate
      ];
      
      try {
        await client.query(query, values);
        importedCount++;
      } catch (err) {
        console.error(`匯入票房錯誤 (${movieName}):`, err.message);
      }
    }
    
    console.log(`匯入完成！共匯入 ${importedCount} 筆票房資料到線上資料庫`);
    
  } catch (err) {
    console.error('匯入過程發生錯誤:', err);
  } finally {
    await client.end();
  }
}

importBoxoffice();

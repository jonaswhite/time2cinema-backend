const fs = require('fs');
const fsPromises = fs.promises;
const { Pool } = require('pg');

const path = require('path');
const { Command } = require('commander');
const { parse } = require('json2csv');
const MovieMatcher = require('../utils/movieMatcher');

// Create a new Pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// 命令行參數解析
const program = new Command();
program
  .option('--file <path>', '指定票房資料檔案路徑')
  .parse(process.argv);

const options = program.opts();

// 初始化資料庫連接
async function initDb() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ 成功連接到資料庫');
    return true;
  } catch (error) {
    console.error('❌ 無法連接到資料庫:', error.message);
    return false;
  }
}

// 找出最新的 boxoffice 檔案
async function findLatestBoxofficeFile() {
  try {
    // 配置常數
    const BOXOFFICE_DIR = path.join(__dirname, '../scrapers/output'); // 票房資料目錄
    const LOG_FILE = path.join(__dirname, '../../logs/import_boxoffice.log'); // 日誌文件路徑
    const ERROR_LOG_FILE = path.join(__dirname, '../../logs/import_boxoffice_errors.log'); // 錯誤日誌文件路徑

    // 使用 scripts/scrapers/output 資料夾
    const outputDir = BOXOFFICE_DIR;
    console.log(`檢查票房資料目錄: ${outputDir}`);
    
    if (!fs.existsSync(outputDir)) {
      throw new Error(`票房資料目錄不存在: ${outputDir}`);
    }
    
    const files = await fsPromises.readdir(outputDir);
    
    // 過濾出 boxoffice 開頭的 JSON 檔案
    const boxofficeFiles = files.filter(file => 
      file.startsWith('boxoffice-') && file.endsWith('.json')
    );
    
    console.log(`找到 ${boxofficeFiles.length} 個票房檔案`);
    
    if (boxofficeFiles.length === 0) {
      throw new Error('找不到任何 boxoffice 檔案');
    }
    
    // 按修改時間排序，獲取最新的檔案
    const filesWithStats = await Promise.all(
      boxofficeFiles.map(async (file) => {
        const stats = await fsPromises.stat(path.join(outputDir, file));
        return {
          name: file,
          time: stats.mtime.getTime()
        };
      })
    );
    
    const latestFile = filesWithStats
      .sort((a, b) => b.time - a.time)[0].name;
    
    return path.join(outputDir, latestFile);
  } catch (error) {
    console.error('尋找 boxoffice 檔案時發生錯誤:', error);
    return null;
  }
}

// 計算週一日期（台灣時區）
function getWeekStartDate(dateStr) {
  if (!dateStr) return null;
  
  try {
    // 嘗試解析不同格式的日期
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // 如果解析失敗，嘗試其他格式
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
    }
    
    if (isNaN(date.getTime())) return null;
    
    // 轉換為台灣時區 (UTC+8)
    const twDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    const day = twDate.getUTCDay();
    const diff = twDate.getUTCDate() - day + (day === 0 ? -6 : 1); // 調整到週一
    const monday = new Date(twDate.setUTCDate(diff));
    
    // 格式化為 YYYY-MM-DD
    return monday.toISOString().split('T')[0];
  } catch (error) {
    console.error('解析日期時發生錯誤:', error);
    return null;
  }
}

// 將中文欄位名稱映射到英文欄位名稱
function mapChineseToEnglishFields(item) {
  const fieldMap = {
    '排名': 'rank',
    '序號': 'rank',           // 添加「序號」映射到 rank
    '片名': 'movie_name',
    '週票房': 'weekly_gross',
    '金額': 'weekly_gross',   // 添加「金額」映射到 weekly_gross
    '週票數': 'tickets',
    '票數': 'tickets',        // 添加「票數」映射到 tickets
    '週數': 'weeks',
    '總日數': 'weeks',        // 添加「總日數」映射到 weeks
    '總票房': 'totalsales',
    '總金額': 'totalsales',   // 添加「總金額」映射到 totalsales
    '總票數': 'total_tickets',
    '上映日期': 'release_date',
    '上映日': 'release_date',
    '國別': 'country',
    '發行公司': 'distributor',
    '出品': 'distributor'     // 添加「出品」映射到 distributor
  };

  const result = {};
  
  for (const [chineseField, value] of Object.entries(item)) {
    const englishField = fieldMap[chineseField] || chineseField;
    result[englishField] = value;
  }
  
  // 輸出映射結果，方便調試
  if (result.rank) console.log(`映射後 rank: ${result.rank}`);
  if (result.tickets) console.log(`映射後 tickets: ${result.tickets}`);
  if (result.totalsales) console.log(`映射後 totalsales: ${result.totalsales}`);
  
  return result;
}

// 檢查並獲取電影 ID
async function getOrCreateMovieId(client, movieName, releaseDate) {
  if (!movieName) return null;
  
  // 使用 MovieMatcher 進行更智能的匹配
  const movieMatcher = new MovieMatcher(client);
  const match = await movieMatcher.findBestMatch(movieName);
  
  if (!match) {
    console.log(`❌ 找不到對應的電影: ${movieName}`);
    return null;
  }
  
  console.log(`✅ 匹配成功: "${movieName}" -> "${match.title}" (相似度: ${(match.score * 100).toFixed(1)}%)`);
  
  // 如果有提供上映日期，檢查是否需要更新
  if (releaseDate) {
    try {
      await client.query(
        'UPDATE movies SET release_date = $1 WHERE id = $2 AND (release_date IS NULL OR release_date > $1)',
        [releaseDate, match.id]
      );
    } catch (error) {
      console.error(`更新電影上映日期時出錯:`, error);
    }
  }
  
  return match.id;
}

// 匯入票房資料
async function importBoxoffice() {
  const latestFile = options.file || await findLatestBoxofficeFile();
  if (!latestFile) {
    console.error('找不到最新的票房檔案，匯入中止。');
    return;
  }

  console.log(`正在處理檔案: ${path.basename(latestFile)}`);

  const fileContent = await fsPromises.readFile(latestFile, 'utf8');
  const jsonData = JSON.parse(fileContent);

  // 檢查是否有 data 屬性，如果沒有則使用整個 JSON 對象
  const data = Array.isArray(jsonData) ? jsonData : 
              (jsonData.data && Array.isArray(jsonData.data) ? jsonData.data : 
              Object.values(jsonData).find(Array.isArray));

  if (!data || data.length === 0) {
    console.log('票房資料為空或格式不正確，無需匯入。');
    return;
  }

  const dateMatch = path.basename(latestFile).match(/(\d{4}-\d{2}-\d{2})/);
  const weekend_date = dateMatch ? dateMatch[1] : null;
  const weekStartDate = getWeekStartDate(weekend_date);
  if (!weekStartDate) {
    console.error('無法從資料中解析週開始日期，匯入中止。');
    return;
  }

  const client = await pool.connect();

  try {
    // 開始事務
    await client.query('BEGIN');

    // 在插入新資料前，刪除該週的所有舊資料
    console.log(`正在刪除 ${weekStartDate} 的舊票房資料...`);
    const deleteResult = await client.query('DELETE FROM boxoffice WHERE week_start_date = $1', [weekStartDate]);
    console.log(`✅ 成功刪除 ${deleteResult.rowCount} 筆舊資料。`);

    // 獲取 boxoffice 表的有效欄位
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'boxoffice'
    `);
    const validColumns = new Set(columnsResult.rows.map(row => row.column_name));

    let importedCount = 0;
    let skippedCount = 0;

    for (const item of data) {
      try {
        const mappedItem = mapChineseToEnglishFields(item);
        const releaseDate = mappedItem.release_date ? new Date(mappedItem.release_date).toISOString().split('T')[0] : null;
        const movieId = await getOrCreateMovieId(client, mappedItem.movie_name, releaseDate);

        if (!movieId) {
          console.log(`⏭️  跳過找不到對應電影的資料: ${mappedItem.movie_name}`);
          skippedCount++;
          continue;
        }

        // 準備要插入的資料
        const boxofficeData = {
          rank: parseInt(mappedItem.rank) || 0,
          tickets: parseInt(mappedItem.tickets) || 0,
          week_start_date: weekStartDate,
          totalsales: parseInt(mappedItem.totalsales) || 0,
          release_date: releaseDate,
          movie_id: movieId,
          movie_alias: mappedItem.movie_name,
          created_at: new Date(),
          updated_at: new Date()
        };

        // 過濾掉不存在的欄位
        const validData = {};
        for (const [key, value] of Object.entries(boxofficeData)) {
          if (validColumns.has(key)) {
            validData[key] = value;
          }
        }

        // 直接插入新記錄
        const insertFields = Object.keys(validData).join(', ');
        const insertValues = Object.keys(validData)
          .map((_, i) => `$${i + 1}`)
          .join(', ');

        const insertQuery = `
          INSERT INTO boxoffice (${insertFields})
          VALUES (${insertValues})
          RETURNING id
        `;

        await client.query(insertQuery, Object.values(validData));
        // console.log(`✅ 新增票房記錄: ${mappedItem.movie_name} (${weekStartDate})`);

        importedCount++;
      } catch (error) {
        console.error(`處理票房記錄 '${item['電影名稱']}' 時出錯:`, error);
        skippedCount++;
      }
    }

    // 提交事務
    await client.query('COMMIT');

    console.log('\n匯入完成！');
    console.log(`✅ 成功匯入: ${importedCount} 筆`);
    console.log(`⏭️  跳過: ${skippedCount} 筆`);

    return {
      total: data.length,
      imported: importedCount,
      skipped: skippedCount
    };
  } catch (error) {
    // 回滾事務
    await client.query('ROLLBACK');
    console.error('❌ 匯入票房資料時發生錯誤:', error);
    throw error;
  } finally {
    // 釋放客戶端
    client.release();
  }
}

// 執行主函數
async function main() {
  try {
    // 初始化資料庫連接
    const dbConnected = await initDb();
    if (!dbConnected) {
      throw new Error('無法連接到資料庫');
    }
    
    // 執行匯入
    await importBoxoffice();
  } catch (error) {
    console.error('❌ 執行匯入程序時發生錯誤:', error);
    process.exit(1);
  } finally {
    // 不再關閉共享連接池
    // await pool.end();
    process.exit(0);
  }
}

// 如果直接執行此檔案，則運行主函數
if (require.main === module) {
  main();
}

module.exports = {
  importBoxoffice,
  mapChineseToEnglishFields,
  getWeekStartDate,
  getOrCreateMovieId
};

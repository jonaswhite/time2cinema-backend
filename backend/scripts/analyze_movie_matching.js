const { Pool } = require('pg');
const fs = require('fs').promises;
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
  .option('--boxoffice-file <path>', '指定票房資料檔案路徑')
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

// 從票房檔案中提取所有電影名稱
async function extractMovieNamesFromBoxoffice(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    // 處理不同格式的 JSON 資料
    const data = Array.isArray(jsonData) ? jsonData : 
                (jsonData.data && Array.isArray(jsonData.data) ? jsonData.data : 
                Object.entries(jsonData).filter(([key]) => key !== 'headers' && key !== 'data' && Array.isArray(jsonData[key])).flatMap(([_, value]) => value));
    
    if (!data || data.length === 0) {
      throw new Error('票房資料為空或格式不正確');
    }
    
    // 提取所有電影名稱並去重
    const movieNames = [...new Set(data.map(item => item.片名 || item.movie_name))];
    return movieNames;
  } catch (error) {
    console.error('讀取票房檔案時出錯:', error);
    return [];
  }
}

// 從資料庫獲取所有電影標題
async function getAllMovieTitles() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, full_title, chinese_title, english_title, release_date 
      FROM movies
      WHERE full_title IS NOT NULL OR chinese_title IS NOT NULL
    `);
    return result.rows;
  } catch (error) {
    console.error('查詢電影標題時出錯:', error);
    return [];
  } finally {
    client.release();
  }
}

// 標準化字串：統一處理標點符號、空格和特殊字符
function normalizeString(str) {
  if (!str) return '';
  
  return str
    // 1. 統一全形/半形標點符號
    .replace(/[：:]/g, '：')     // 統一冒號
    .replace(/[、,，]/g, '，')   // 統一逗號
    .replace(/[。.]/g, '。')     // 統一句號
    .replace(/[！!]/g, '！')     // 統一驚嘆號
    .replace(/[？?]/g, '？')     // 統一問號
    .replace(/[‧・·•．]/g, '・') // 統一間隔號
    .replace(/[（）()]/g, '')    // 移除括號
    .replace(/[「」『』"'“”‘’]/g, '') // 移除引號
    
    // 2. 處理數字與文字之間的空白
    .replace(/([0-9])\s+([^\s])/g, '$1$2') // 數字後的空格
    .replace(/([^\s])\s+([0-9])/g, '$1$2') // 數字前的空格
    
    // 3. 處理特殊模式（如「會計師2」和「會計師 2」）
    .replace(/([\u4e00-\u9fa5])([0-9])/g, '$1 $2') // 中文字後接數字
    .replace(/([0-9])([\u4e00-\u9fa5])/g, '$1 $2') // 數字後接中文字
    
    // 4. 處理英文與中文之間的空白（如「MINECRAFT 麥塊」）
    .replace(/([a-zA-Z])([\u4e00-\u9fa5])/g, '$1 $2') // 英文字後接中文字
    .replace(/([\u4e00-\u9fa5])([a-zA-Z])/g, '$1 $2') // 中文字後接英文字
    
    // 5. 移除所有非必要字符並標準化空白
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 只保留數字、字母、中文和空白
    .replace(/\s+/g, ' ')                   // 合併多個空白
    .trim()                                // 去除前後空白
    .toLowerCase();                        // 轉為小寫
}

// 判斷兩個標準化後的字串是否匹配
function isMatch(normalizedSearch, normalizedTarget) {
  if (!normalizedSearch || !normalizedTarget) return false;
  
  // 完全匹配
  if (normalizedSearch === normalizedTarget) return true;
  
  // 包含關係
  if (normalizedSearch.includes(normalizedTarget) || 
      normalizedTarget.includes(normalizedSearch)) {
    return true;
  }
  
  // 分割成單詞進行比對
  const searchWords = normalizedSearch.split(' ');
  const targetWords = normalizedTarget.split(' ');
  
  // 計算共同單詞數量
  const commonWords = searchWords.filter(word => 
    word.length > 1 && targetWords.includes(word)
  );
  
  // 如果有超過一個共同單詞，或任一單詞長度大於3且匹配，則認為匹配
  if (commonWords.length >= 1 && 
      (commonWords.length > 1 || commonWords.some(w => w.length > 3))) {
    return true;
  }
  
  return false;
}

// 模糊比對電影名稱
function fuzzyMatch(movieName, dbMovies) {
  if (!movieName) return [];
  
  // 標準化搜尋詞
  const normalizedSearch = normalizeString(movieName);
  if (!normalizedSearch) return [];
  
  const matches = [];
  
  for (const movie of dbMovies) {
    // 檢查 full_title, chinese_title, english_title 是否匹配
    const fieldsToCheck = [
      { name: 'full_title', value: movie.full_title },
      { name: 'chinese_title', value: movie.chinese_title },
      { name: 'english_title', value: movie.english_title },
      { name: 'movie_alias', value: movie.movie_alias } // 如果有別名也檢查
    ];
    
    for (const field of fieldsToCheck) {
      if (!field.value) continue;
      
      const normalizedField = normalizeString(field.value);
      if (isMatch(normalizedSearch, normalizedField)) {
        // 確保不重複添加相同的電影
        if (!matches.some(m => m.id === movie.id)) {
          matches.push({
            id: movie.id,
            matched_field: field.name,
            full_title: movie.full_title,
            chinese_title: movie.chinese_title,
            english_title: movie.english_title,
            release_date: movie.release_date
          });
        }
        break; // 找到一個匹配就跳出循環
      }
    }
  }
  
  return matches;
}

// 主函數
async function main() {
  try {
    // 1. 讀取票房檔案中的電影名稱
    const boxofficeFile = options.boxofficeFile || 'backend/output/boxoffice-2025-05-23.json';
    console.log(`讀取票房檔案: ${boxofficeFile}`);
    
    const movieNames = await extractMovieNamesFromBoxoffice(boxofficeFile);
    console.log(`找到 ${movieNames.length} 部電影`);
    
    // 2. 從資料庫獲取所有電影標題
    console.log('從資料庫獲取電影標題...');
    const dbMovies = await getAllMovieTitles();
    console.log(`資料庫中共有 ${dbMovies.length} 部電影`);
    
    // 3. 比對並找出可能的匹配
    console.log(`\n=== 比對結果 ===`);
    const noMatch = [];
    const hasMatch = [];
    
    // 建立未匹配電影的陣列
    const unmatchedMovies = [];
    
    for (const movieName of movieNames) {
      const matches = fuzzyMatch(movieName, dbMovies);
      
      if (matches.length > 0) {
        hasMatch.push({
          boxoffice_name: movieName,
          matches: matches
        });
      } else {
        noMatch.push(movieName);
        unmatchedMovies.push(movieName);
      }
    }
    
    // 輸出未匹配的電影
    console.log('\n未匹配的電影:');
    noMatch.forEach(name => {
      console.log(`- ${name}`);
    });
    
    // 輸出未匹配的電影名稱到檔案
    if (noMatch.length > 0) {
      const outputDir = path.join(process.cwd(), 'output');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, 'unmatched_movies.json');
      await fs.writeFile(outputPath, JSON.stringify(unmatchedMovies, null, 2), 'utf8');
      console.log(`\n未匹配的電影清單已儲存至: ${outputPath}`);
    }
    
    // 輸出可能的匹配
    console.log('\n=== 可能的匹配 ===');
    console.log(JSON.stringify(hasMatch, null, 2));
    
    // 匯出結果到檔案
    const outputDir = path.join(__dirname, '../../output');
    await fs.mkdir(outputDir, { recursive: true });
    
    await fs.writeFile(
      path.join(outputDir, 'unmatched_movies.txt'), 
      noMatch.join('\n'),
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(outputDir, 'movie_matching_analysis.json'),
      JSON.stringify({
        unmatched: noMatch,
        matched: hasMatch,
        total_movies: movieNames.length,
        unmatched_count: noMatch.length,
        matched_count: hasMatch.length
      }, null, 2),
      'utf-8'
    );
    
    console.log(`\n分析完成！`);
    console.log(`- 總共比對: ${movieNames.length} 部電影`);
    console.log(`- 已匹配: ${hasMatch.length} 部`);
    console.log(`- 未匹配: ${noMatch.length} 部`);
    console.log(`- 結果已儲存至: ${outputDir}/movie_matching_analysis.json`);
    
  } catch (error) {
    console.error('執行分析時出錯:', error);
  } finally {
    await pool.end();
  }
}

// 執行主函數
if (require.main === module) {
  main();
}

module.exports = {
  extractMovieNamesFromBoxoffice,
  getAllMovieTitles,
  fuzzyMatch
};

/**
 * 整合爬蟲與資料庫匯入的自動化腳本
 * 功能：
 * 1. 執行 atmovies 爬蟲取得最新場次資料
 * 2. 執行 boxoffice 爬蟲取得最新票房資料
 * 3. 將資料匯入 PostgreSQL 資料庫
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

// 設定檔案路徑
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.join(SCRIPT_DIR, '..', '..');

// 統一輸出目錄結構
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const SCRAPERS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'scrapers');
const IMPORTERS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'importers');
const UTILS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'utils');
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');

// 確保目錄存在
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SCRAPERS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(IMPORTERS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(UTILS_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const LOG_FILE = path.join(UTILS_OUTPUT_DIR, 'update_log.txt');

// 記錄日誌
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 執行命令並記錄結果
async function runCommand(command, description) {
  log(`開始${description}...`);
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      log(`${description}警告: ${stderr}`);
    }
    log(`${description}成功: ${stdout.substring(0, 200)}${stdout.length > 200 ? '...' : ''}`);
    return true;
  } catch (error) {
    log(`${description}失敗: ${error.message}`);
    return false;
  }
}

// 檢查檔案是否存在且非空
function isFileReadyForImport(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    const stats = fs.statSync(filePath);
    // 檢查檔案大小是否大於 100 位元組（確保檔案不是空的或損壞的）
    return stats.size > 100;
  } catch (error) {
    log(`檢查檔案時出錯: ${error.message}`);
    return false;
  }
}

// 等待檔案準備就緒
async function waitForFile(filePath, timeoutSeconds = 600) { // 預設等待 10 分鐘
  log(`等待檔案準備就緒: ${filePath}`);
  
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  
  while (Date.now() - startTime < timeoutMs) {
    if (isFileReadyForImport(filePath)) {
      log(`檔案已準備就緒: ${filePath}`);
      return true;
    }
    
    // 等待 5 秒再檢查
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  log(`等待檔案逾時: ${filePath}`);
  return false;
}

// 主要執行流程
async function updateDatabase() {
  log('開始資料庫更新流程');
  
  // 檔案路徑
  const showtimesJsonPath = path.join(SCRAPERS_OUTPUT_DIR, 'atmovies_showtimes.json');
  
  // 動態生成票房檔案路徑，使用當前日期
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  const boxofficeJsonPath = path.join(CACHE_DIR, `boxoffice-${formattedDate}.json`);
  
  // 同時檢查舊路徑（兼容性）
  const alternativeBoxofficePath = path.join(PROJECT_ROOT, 'cache', `boxoffice-${formattedDate}.json`);
  
  log(`場次檔案路徑: ${showtimesJsonPath}`);
  log(`票房檔案路徑: ${boxofficeJsonPath}`);
  log(`替代票房檔案路徑: ${alternativeBoxofficePath}`);
  
  // 步驟 1: 執行 atmovies 爬蟲
  const atmoviesSuccess = await runCommand(
    `python ${path.join(PROJECT_ROOT, 'scripts', 'scrapers', 'atmovies_scraper_v3.py')}`,
    'ATMovies 場次爬蟲'
  );
  
  // 步驟 2: 執行 boxoffice 爬蟲
  const boxofficeSuccess = await runCommand(
    `node ${path.join(PROJECT_ROOT, 'scripts', 'scrapers', 'boxoffice_scraper.js')} "${path.join(PROJECT_ROOT, 'cache')}" 20 5000`,
    '票房排行榜爬蟲'
  );
  
  // 步驟 3: 等待場次檔案準備就緒並匯入
  if (atmoviesSuccess) {
    const showtimesReady = await waitForFile(showtimesJsonPath);
    if (showtimesReady) {
      await runCommand(
        `node ${path.join(PROJECT_ROOT, 'scripts', 'importers', 'import_showtimes.js')}`,
        '場次資料匯入資料庫'
      );
    } else {
      log('場次檔案未準備就緒，跳過匯入');
    }
  } else {
    log('由於爬蟲失敗，跳過場次資料匯入');
  }
  
  // 步驟 4: 檢查票房檔案並匯入
  // 即使爬蟲回傳失敗，也檢查檔案是否存在（因為爬蟲可能在正常結束時也回傳失敗）
  
  // 先檢查主要路徑
  let boxofficeReady = await waitForFile(boxofficeJsonPath);
  let fileToUse = boxofficeJsonPath;
  
  // 如果主要路徑沒有檔案，則檢查替代路徑
  if (!boxofficeReady) {
    log(`主要路徑沒有檔案，檢查替代路徑: ${alternativeBoxofficePath}`);
    boxofficeReady = await waitForFile(alternativeBoxofficePath);
    fileToUse = alternativeBoxofficePath;
  }
  
  // 檢查昨天的檔案（如果今天的沒有）
  if (!boxofficeReady) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayYear = yesterday.getFullYear();
    const yesterdayMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yesterdayDay = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayDate = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
    
    const yesterdayPath = path.join(CACHE_DIR, `boxoffice-${yesterdayDate}.json`);
    log(`今天的檔案不存在，檢查昨天的檔案: ${yesterdayPath}`);
    boxofficeReady = await waitForFile(yesterdayPath, 10); // 只等待 10 秒，因為我們只是檢查已存在的檔案
    if (boxofficeReady) {
      fileToUse = yesterdayPath;
    }
  }
  
  // 如果找到檔案，則進行匯入
  if (boxofficeReady) {
    log(`使用票房檔案: ${fileToUse}`);
    await runCommand(
      `node ${path.join(PROJECT_ROOT, 'scripts', 'importers', 'import_boxoffice.js')} "${fileToUse}"`,
      '票房資料匯入資料庫'
    );
  } else {
    log('無法找到票房檔案，跳過匯入');
  }
  
  log('資料庫更新流程完成');
}

// 執行主流程
updateDatabase().catch(error => {
  log(`更新過程發生錯誤: ${error.message}`);
});

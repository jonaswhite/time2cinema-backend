const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載按票數排序的 JSON 數據
 * @param {string} outputDir - 輸出目錄 (預設為當前目錄)
 */
async function downloadBoxOfficeByTickets(outputDir = './') {
  let browser = null;
  
  try {
    console.log('開始使用 Puppeteer 下載台灣票房數據（按票數排序）...');
    
    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 啟動瀏覽器
    browser = await puppeteer.launch({
      headless: false, // 使用有頭模式，方便觀察
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // 創建新頁面
    const page = await browser.newPage();
    
    // 設置頁面視窗大小
    await page.setViewport({ width: 1280, height: 800 });
    
    // 訪問票房統計頁面
    console.log('正在訪問台灣票房網站...');
    await page.goto('https://boxofficetw.tfai.org.tw/statistic', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // 等待頁面加載完成
    await page.waitForSelector('table', { timeout: 30000 });
    console.log('頁面加載完成，尋找票數排序按鈕...');
    
    // 截圖保存（排序前）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-before-sort.png') });
    console.log('已保存排序前的頁面截圖');
    
    // 找到票數欄位的標頭並點擊
    const ticketHeaderSelector = 'th:has(span.text:contains("票數"):not(:contains("總票數")):not(:contains("票數變動")))';
    
    // 等待票數欄位標頭出現
    await page.waitForSelector(ticketHeaderSelector, { timeout: 10000 });
    console.log('找到票數欄位標頭，準備點擊...');
    
    // 點擊票數標頭進行排序
    await page.click(ticketHeaderSelector);
    console.log('已點擊票數標頭，等待排序完成...');
    
    // 等待排序完成
    await page.waitForTimeout(2000);
    
    // 檢查排序方向，如果不是降序（由高到低），再點擊一次
    const isSortedDesc = await page.evaluate((selector) => {
      const th = document.querySelector(selector);
      // 檢查是否有降序的標記（可能是類別或其他屬性）
      return th && (th.classList.contains('desc') || th.querySelector('.order-arrow.desc'));
    }, ticketHeaderSelector);
    
    if (!isSortedDesc) {
      console.log('排序方向不是由高到低，再次點擊排序按鈕...');
      await page.click(ticketHeaderSelector);
      await page.waitForTimeout(2000);
    }
    
    // 截圖保存（排序後）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-after-sort.png') });
    console.log('已保存排序後的頁面截圖');
    
    // 獲取表格數據
    console.log('開始提取排序後的表格數據...');
    const tableData = await page.evaluate(() => {
      // 獲取表頭
      const headers = Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim());
      
      // 獲取表格內容
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const data = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const rowData = {};
        
        // 將每個單元格的數據與表頭對應
        cells.forEach((cell, index) => {
          if (index < headers.length) {
            rowData[headers[index]] = cell.textContent.trim();
          }
        });
        
        return rowData;
      });
      
      return { headers, data };
    });
    
    if (!tableData || !tableData.data || tableData.data.length === 0) {
      throw new Error('無法提取表格數據');
    }
    
    console.log(`成功提取 ${tableData.data.length} 筆排序後的表格數據`);
    
    // 保存為 JSON 檔案
    const fileName = `boxoffice-sorted-by-tickets-${new Date().toISOString().split('T')[0]}.json`;
    const outputFile = path.join(outputDir, fileName);
    fs.writeFileSync(outputFile, JSON.stringify(tableData, null, 2), 'utf8');
    console.log(`成功將排序後的表格數據保存到: ${outputFile}`);
    
    // 點擊 JSON 下載按鈕（如果可用）
    try {
      const jsonButtonSelector = 'a:contains("JSON")';
      const hasJsonButton = await page.$(jsonButtonSelector);
      
      if (hasJsonButton) {
        console.log('找到 JSON 下載按鈕，準備點擊...');
        await page.click(jsonButtonSelector);
        console.log('已點擊 JSON 下載按鈕');
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.log('無法找到或點擊 JSON 下載按鈕:', err.message);
    }
    
    // 等待一段時間，讓用戶可以觀察頁面
    console.log('請觀察頁面，5 秒後將關閉瀏覽器...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return outputFile;
  } catch (error) {
    console.error('下載排序後的 JSON 數據失敗:', error.message);
    throw error;
  } finally {
    // 確保瀏覽器關閉
    if (browser) {
      await browser.close();
      console.log('瀏覽器已關閉');
    }
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  // 解析命令行參數
  const args = process.argv.slice(2);
  const outputDir = args[0] || './';
  
  // 執行下載
  downloadBoxOfficeByTickets(outputDir)
    .then(filePath => {
      console.log(`下載完成! 檔案保存在: ${filePath}`);
    })
    .catch(err => {
      console.error('下載過程中發生錯誤:', err.message);
      process.exit(1);
    });
} else {
  // 作為模組導出
  module.exports = { downloadBoxOfficeByTickets };
}

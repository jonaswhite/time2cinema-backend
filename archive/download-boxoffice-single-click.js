const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載按票數由高到低排序的 JSON 數據
 * 只點擊一次票數按鈕，嘗試實現降冪排序
 * @param {string} outputDir - 輸出目錄 (預設為當前目錄)
 */
async function downloadBoxOfficeByTicketsDesc(outputDir = './') {
  let browser = null;
  
  try {
    console.log('開始使用 Puppeteer 下載台灣票房數據（按票數由高到低排序）...');
    
    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 啟動瀏覽器
    browser = await puppeteer.launch({
      headless: false, // 使用有頭模式，方便觀察
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
      defaultViewport: null // 使用默認視窗大小
    });
    
    // 創建新頁面
    const page = await browser.newPage();
    
    // 訪問票房統計頁面
    console.log('正在訪問台灣票房網站...');
    await page.goto('https://boxofficetw.tfai.org.tw/statistic', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // 等待頁面加載完成
    await page.waitForSelector('table', { timeout: 30000 });
    console.log('頁面加載完成');
    
    // 截圖保存（排序前）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-before-sort.png'), fullPage: true });
    console.log('已保存排序前的頁面截圖');
    
    // 等待一下，確保頁面完全加載
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 獲取原始數據
    const originalData = await page.evaluate(() => {
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
    
    console.log(`獲取到 ${originalData.data.length} 筆原始數據`);
    
    // 只點擊一次票數欄位標頭
    console.log('點擊一次票數欄位標頭...');
    
    const clickResult = await page.evaluate(() => {
      // 方法 1: 直接點擊票數欄位
      const ticketHeaders = Array.from(document.querySelectorAll('table th')).filter(th => 
        th.textContent.trim() === '票數' || 
        (th.textContent.trim().includes('票數') && 
         !th.textContent.trim().includes('總票數') && 
         !th.textContent.trim().includes('票數變動'))
      );
      
      if (ticketHeaders.length > 0) {
        ticketHeaders[0].click();
        return { method: 1, success: true };
      }
      
      // 方法 2: 通過索引點擊（票數通常是第 9 個欄位）
      const headers = Array.from(document.querySelectorAll('table th'));
      if (headers.length >= 9) {
        headers[8].click();
        return { method: 2, success: true };
      }
      
      return { success: false };
    });
    
    console.log(`點擊結果: ${JSON.stringify(clickResult)}`);
    
    // 等待排序完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 截圖保存（排序後）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-after-sort.png'), fullPage: true });
    console.log('已保存排序後的頁面截圖');
    
    // 獲取排序後的表格數據
    console.log('獲取排序後的表格數據...');
    const sortedData = await page.evaluate(() => {
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
    
    console.log(`獲取到 ${sortedData.data.length} 筆排序後的數據`);
    
    // 檢查排序是否正確
    if (sortedData.data.length > 0) {
      const firstItem = sortedData.data[0];
      const lastItem = sortedData.data[sortedData.data.length - 1];
      
      console.log(`第一筆數據: 片名="${firstItem['片名']}", 票數=${firstItem['票數']}`);
      console.log(`最後一筆數據: 片名="${lastItem['片名']}", 票數=${lastItem['票數']}`);
      
      // 檢查第一筆數據的票數是否大於最後一筆
      const firstTickets = parseInt(firstItem['票數'].replace(/,/g, '')) || 0;
      const lastTickets = parseInt(lastItem['票數'].replace(/,/g, '')) || 0;
      
      // 只有在排序不正確時才進行本地排序
      if (firstTickets < lastTickets && sortedData.data.length > 1) {
        console.log('警告: 排序不是由高到低，嘗試在本地進行排序...');
        
        // 在本地按票數由高到低排序
        sortedData.data.sort((a, b) => {
          const ticketsA = parseInt(a['票數'].replace(/,/g, '')) || 0;
          const ticketsB = parseInt(b['票數'].replace(/,/g, '')) || 0;
          return ticketsB - ticketsA; // 由高到低排序
        });
        
        console.log('已在本地按票數由高到低排序');
        
        // 檢查排序後的結果
        if (sortedData.data.length > 0) {
          const firstItemAfterSort = sortedData.data[0];
          const lastItemAfterSort = sortedData.data[sortedData.data.length - 1];
          
          console.log(`排序後第一筆數據: 片名="${firstItemAfterSort['片名']}", 票數=${firstItemAfterSort['票數']}`);
          console.log(`排序後最後一筆數據: 片名="${lastItemAfterSort['片名']}", 票數=${lastItemAfterSort['票數']}`);
        }
      } else {
        console.log('排序已經是由高到低，無需本地排序');
      }
    }
    
    // 保存為 JSON 檔案
    const fileName = `boxoffice-tickets-desc-${new Date().toISOString().split('T')[0]}.json`;
    const outputFile = path.join(outputDir, fileName);
    fs.writeFileSync(outputFile, JSON.stringify(sortedData, null, 2), 'utf8');
    console.log(`成功將排序後的表格數據保存到: ${outputFile}`);
    
    // 等待一段時間，讓用戶可以觀察頁面
    console.log('請觀察頁面，10 秒後將關閉瀏覽器...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
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
  downloadBoxOfficeByTicketsDesc(outputDir)
    .then(filePath => {
      console.log(`下載完成! 檔案保存在: ${filePath}`);
    })
    .catch(err => {
      console.error('下載過程中發生錯誤:', err.message);
      process.exit(1);
    });
} else {
  // 作為模組導出
  module.exports = { downloadBoxOfficeByTicketsDesc };
}

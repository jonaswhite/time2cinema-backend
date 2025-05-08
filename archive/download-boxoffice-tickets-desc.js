const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載按票數由高到低排序的 JSON 數據
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
    
    // 尋找票數欄位標頭
    console.log('尋找票數欄位標頭...');
    const ticketHeader = await page.evaluate(() => {
      // 找到所有表頭
      const headers = Array.from(document.querySelectorAll('table th'));
      
      // 找到票數欄位的表頭
      for (let i = 0; i < headers.length; i++) {
        const text = headers[i].textContent.trim();
        if (text === '票數' || (text.includes('票數') && !text.includes('總票數') && !text.includes('票數變動'))) {
          console.log(`找到票數欄位標頭，索引: ${i}`);
          return { index: i, text: text };
        }
      }
      return null;
    });
    
    if (!ticketHeader) {
      throw new Error('找不到票數欄位標頭');
    }
    
    console.log(`找到票數欄位標頭: "${ticketHeader.text}", 索引: ${ticketHeader.index}`);
    
    // 點擊票數欄位標頭
    await page.evaluate((index) => {
      const headers = Array.from(document.querySelectorAll('table th'));
      if (headers[index]) {
        headers[index].click();
      }
    }, ticketHeader.index);
    
    console.log('已點擊票數欄位標頭進行排序');
    
    // 等待排序完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 檢查排序方向
    const sortDirection = await page.evaluate((index) => {
      const headers = Array.from(document.querySelectorAll('table th'));
      const header = headers[index];
      
      if (header) {
        // 檢查是否有排序指示器
        const arrow = header.querySelector('.order-arrow');
        if (arrow) {
          // 檢查排序方向
          const computedStyle = window.getComputedStyle(arrow);
          const transform = computedStyle.getPropertyValue('transform');
          
          // 如果 transform 包含 rotate(180deg) 或類似值，可能是降序
          const isDesc = transform.includes('180') || 
                         arrow.classList.contains('desc') || 
                         header.classList.contains('desc');
          
          return isDesc ? 'desc' : 'asc';
        }
      }
      return 'unknown';
    }, ticketHeader.index);
    
    console.log(`當前排序方向: ${sortDirection}`);
    
    // 如果不是降序（由高到低），再點擊一次
    if (sortDirection !== 'desc') {
      console.log('排序方向不是由高到低，再次點擊...');
      
      await page.evaluate((index) => {
        const headers = Array.from(document.querySelectorAll('table th'));
        if (headers[index]) {
          headers[index].click();
        }
      }, ticketHeader.index);
      
      console.log('已再次點擊票數欄位標頭，切換排序方向');
      
      // 等待排序完成
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // 截圖保存（排序後）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-after-sort.png'), fullPage: true });
    console.log('已保存排序後的頁面截圖');
    
    // 檢查第一筆數據的票數，確認是否為由高到低排序
    const firstRowData = await page.evaluate(() => {
      const firstRow = document.querySelector('table tbody tr');
      if (firstRow) {
        const cells = Array.from(firstRow.querySelectorAll('td'));
        const data = {};
        
        // 獲取表頭
        const headers = Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim());
        
        // 將每個單元格的數據與表頭對應
        cells.forEach((cell, index) => {
          if (index < headers.length) {
            data[headers[index]] = cell.textContent.trim();
          }
        });
        
        return data;
      }
      return null;
    });
    
    if (firstRowData) {
      console.log(`第一筆數據: 片名="${firstRowData['片名']}", 票數=${firstRowData['票數']}`);
    }
    
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
    const fileName = `boxoffice-tickets-desc-${new Date().toISOString().split('T')[0]}.json`;
    const outputFile = path.join(outputDir, fileName);
    fs.writeFileSync(outputFile, JSON.stringify(tableData, null, 2), 'utf8');
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

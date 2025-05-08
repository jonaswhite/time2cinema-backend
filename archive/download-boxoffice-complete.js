const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載完整的票房數據，按票數由高到低排序
 * @param {string} outputDir - 輸出目錄 (預設為當前目錄)
 */
async function downloadCompleteBoxOffice(outputDir = './') {
  let browser = null;
  
  try {
    console.log('開始使用 Puppeteer 下載完整的台灣票房數據（按票數由高到低排序）...');
    
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
    console.log('頁面加載完成');
    
    // 截圖保存（初始狀態）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-initial.png') });
    console.log('已保存初始頁面截圖');
    
    // 獲取所有頁面的數據
    let allData = [];
    let currentPage = 1;
    let hasNextPage = true;
    
    while (hasNextPage) {
      console.log(`正在處理第 ${currentPage} 頁...`);
      
      // 獲取當前頁面的表格數據
      const pageData = await page.evaluate(() => {
        // 獲取表頭
        const headers = Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim());
        
        // 獲取表格內容
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
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
      });
      
      if (pageData && pageData.length > 0) {
        console.log(`第 ${currentPage} 頁獲取到 ${pageData.length} 筆數據`);
        allData = allData.concat(pageData);
        
        // 檢查是否有下一頁
        const nextPageButton = await page.$('button.next-page-button:not(.disabled)');
        if (nextPageButton) {
          console.log('找到下一頁按鈕，點擊進入下一頁...');
          await nextPageButton.click();
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待頁面加載
          currentPage++;
        } else {
          console.log('沒有下一頁按鈕，已到達最後一頁');
          hasNextPage = false;
        }
      } else {
        console.log('當前頁面沒有數據，結束獲取');
        hasNextPage = false;
      }
    }
    
    console.log(`總共獲取到 ${allData.length} 筆數據`);
    
    // 按票數由高到低排序
    allData.sort((a, b) => {
      const ticketsA = parseInt(a['票數'].replace(/,/g, '')) || 0;
      const ticketsB = parseInt(b['票數'].replace(/,/g, '')) || 0;
      return ticketsB - ticketsA; // 由高到低排序
    });
    
    console.log('已按票數由高到低排序');
    
    // 構建完整的數據結構
    const tableData = {
      headers: [
        "序號", "國別", "片名", "上映日", "出品", "院數", 
        "金額", "金額變動", "票數", "票數變動", "市占率", 
        "總日數", "總金額", "總票數"
      ],
      data: allData
    };
    
    // 保存為 JSON 檔案
    const fileName = `boxoffice-complete-by-tickets-${new Date().toISOString().split('T')[0]}.json`;
    const outputFile = path.join(outputDir, fileName);
    fs.writeFileSync(outputFile, JSON.stringify(tableData, null, 2), 'utf8');
    console.log(`成功將完整排序後的表格數據保存到: ${outputFile}`);
    
    // 嘗試點擊票數欄位進行排序（網站內排序）
    try {
      // 找到票數欄位的表頭
      const ticketHeader = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('table th'));
        const ticketHeader = headers.find(th => {
          const text = th.textContent.trim();
          return text === '票數' || (text.includes('票數') && !text.includes('總票數') && !text.includes('票數變動'));
        });
        
        if (ticketHeader) {
          ticketHeader.click();
          return true;
        }
        return false;
      });
      
      if (ticketHeader) {
        console.log('已點擊票數表頭進行排序');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 再點擊一次確保是降序排序
        await page.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('table th'));
          const ticketHeader = headers.find(th => {
            const text = th.textContent.trim();
            return text === '票數' || (text.includes('票數') && !text.includes('總票數') && !text.includes('票數變動'));
          });
          
          if (ticketHeader) {
            ticketHeader.click();
            return true;
          }
          return false;
        });
        
        console.log('再次點擊票數表頭，確保降序排序');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.log('點擊票數排序按鈕時出錯:', err.message);
    }
    
    // 截圖保存（最終狀態）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-final.png') });
    console.log('已保存最終頁面截圖');
    
    // 等待一段時間，讓用戶可以觀察頁面
    console.log('請觀察頁面，10 秒後將關閉瀏覽器...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    return outputFile;
  } catch (error) {
    console.error('下載完整票房數據失敗:', error.message);
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
  downloadCompleteBoxOffice(outputDir)
    .then(filePath => {
      console.log(`下載完成! 檔案保存在: ${filePath}`);
    })
    .catch(err => {
      console.error('下載過程中發生錯誤:', err.message);
      process.exit(1);
    });
} else {
  // 作為模組導出
  module.exports = { downloadCompleteBoxOffice };
}

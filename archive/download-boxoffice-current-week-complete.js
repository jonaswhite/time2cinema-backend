const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載本週所有頁面的票房數據（按票數由高到低排序）
 * 增加等待時間，確保頁面完全加載
 * @param {string} outputDir - 輸出目錄 (預設為當前目錄)
 * @param {number} maxPages - 最大抓取頁數 (預設為 20)
 * @param {number} waitTimeMs - 頁面加載等待時間（毫秒）(預設為 5000)
 */
async function downloadCurrentWeekBoxOffice(outputDir = './', maxPages = 20, waitTimeMs = 5000) {
  let browser = null;
  
  try {
    console.log(`開始使用 Puppeteer 下載台灣票房數據（按票數由高到低排序）...`);
    console.log(`頁面加載等待時間: ${waitTimeMs}ms, 最大頁數: ${maxPages}`);
    
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
    const baseUrl = 'https://boxofficetw.tfai.org.tw/statistic';
    await page.goto(baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000 // 增加超時時間
    });
    
    // 等待頁面加載完成
    console.log(`等待頁面加載 (${waitTimeMs}ms)...`);
    await page.waitForSelector('table', { timeout: 60000 }); // 增加超時時間
    await new Promise(resolve => setTimeout(resolve, waitTimeMs)); // 額外等待時間
    console.log('頁面加載完成');
    
    // 截圖保存（初始頁面）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-initial.png'), fullPage: true });
    
    // 點擊票數欄位進行排序（只點擊一次，實現降冪排序）
    console.log('點擊票數欄位進行降冪排序...');
    await page.evaluate(() => {
      const ticketHeaders = Array.from(document.querySelectorAll('table th')).filter(th => 
        th.textContent.trim() === '票數' || 
        (th.textContent.trim().includes('票數') && 
         !th.textContent.trim().includes('總票數') && 
         !th.textContent.trim().includes('票數變動'))
      );
      
      if (ticketHeaders.length > 0) {
        ticketHeaders[0].click();
      } else {
        // 備用方法：通過索引點擊（票數通常是第 9 個欄位）
        const headers = Array.from(document.querySelectorAll('table th'));
        if (headers.length >= 9) {
          headers[8].click();
        }
      }
    });
    
    // 等待排序完成
    console.log(`等待排序完成 (${waitTimeMs}ms)...`);
    await new Promise(resolve => setTimeout(resolve, waitTimeMs)); // 增加等待時間
    
    // 截圖保存（排序後）
    await page.screenshot({ path: path.join(outputDir, 'boxoffice-sorted.png'), fullPage: true });
    console.log('已完成降冪排序');
    
    // 獲取當前 URL，用於構建分頁 URL
    const currentUrl = await page.url();
    console.log(`當前頁面 URL: ${currentUrl}`);
    
    // 解析當前 URL 以獲取基本參數
    let urlPattern = '';
    if (currentUrl.includes('/Week/')) {
      // 從當前 URL 中提取參數，構建 URL 模式
      const urlParts = currentUrl.split('/');
      // 假設格式是 .../statistic/Week/10/0/all/False/Tickets/2025-05-02
      const weekIndex = urlParts.indexOf('Week');
      if (weekIndex !== -1 && urlParts.length >= weekIndex + 7) {
        const week = urlParts[weekIndex + 1];
        const all = urlParts[weekIndex + 3];
        const falseParam = urlParts[weekIndex + 4];
        const tickets = urlParts[weekIndex + 5];
        const date = urlParts[weekIndex + 6];
        
        urlPattern = `https://boxofficetw.tfai.org.tw/statistic/Week/${week}/PAGE_INDEX/${all}/${falseParam}/${tickets}/${date}`;
        console.log(`構建的 URL 模式: ${urlPattern}`);
      }
    }
    
    // 準備存儲所有頁面的數據
    let allData = [];
    let currentPage = 1;
    let hasNextPage = true;
    
    // 獲取第一頁數據
    console.log(`正在獲取第 ${currentPage} 頁數據...`);
    const firstPageData = await getPageData(page);
    allData = allData.concat(firstPageData);
    console.log(`第 ${currentPage} 頁獲取到 ${firstPageData.length} 筆數據`);
    
    // 截圖保存（第一頁）
    await page.screenshot({ path: path.join(outputDir, `boxoffice-page-${currentPage}.png`), fullPage: true });
    
    // 循環獲取後續頁面數據
    while (hasNextPage && currentPage < maxPages) {
      // 準備獲取下一頁
      currentPage++;
      console.log(`嘗試獲取第 ${currentPage} 頁數據...`);
      
      // 直接修改 URL 進行翻頁
      if (urlPattern) {
        const nextPageUrl = urlPattern.replace('PAGE_INDEX', (currentPage - 1).toString());
        console.log(`訪問下一頁 URL: ${nextPageUrl}`);
        
        await page.goto(nextPageUrl, { 
          waitUntil: 'networkidle2', 
          timeout: 60000 // 增加超時時間
        });
        
        // 等待頁面加載
        console.log(`等待頁面加載 (${waitTimeMs}ms)...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs)); // 增加等待時間
        
        // 檢查是否有表格數據
        const hasTable = await page.evaluate(() => {
          return document.querySelector('table tbody tr') !== null;
        });
        
        if (hasTable) {
          // 截圖保存
          await page.screenshot({ path: path.join(outputDir, `boxoffice-page-${currentPage}.png`), fullPage: true });
          
          // 獲取當前頁面數據
          const pageData = await getPageData(page);
          
          if (pageData.length > 0) {
            allData = allData.concat(pageData);
            console.log(`第 ${currentPage} 頁獲取到 ${pageData.length} 筆數據`);
          } else {
            console.log(`第 ${currentPage} 頁沒有數據，嘗試再等待一段時間...`);
            
            // 再等待一段時間，然後重試
            await new Promise(resolve => setTimeout(resolve, waitTimeMs * 2));
            
            // 重試獲取數據
            const retryData = await getPageData(page);
            
            if (retryData.length > 0) {
              allData = allData.concat(retryData);
              console.log(`重試後第 ${currentPage} 頁獲取到 ${retryData.length} 筆數據`);
            } else {
              console.log(`重試後第 ${currentPage} 頁仍然沒有數據，停止獲取更多頁面`);
              hasNextPage = false;
            }
          }
        } else {
          console.log(`第 ${currentPage} 頁沒有表格數據，嘗試再等待一段時間...`);
          
          // 再等待一段時間，然後重試
          await new Promise(resolve => setTimeout(resolve, waitTimeMs * 2));
          
          // 重新檢查是否有表格數據
          const hasTableAfterWait = await page.evaluate(() => {
            return document.querySelector('table tbody tr') !== null;
          });
          
          if (hasTableAfterWait) {
            console.log(`等待後發現第 ${currentPage} 頁有表格數據，繼續獲取`);
            
            // 截圖保存
            await page.screenshot({ path: path.join(outputDir, `boxoffice-page-${currentPage}-after-wait.png`), fullPage: true });
            
            // 獲取當前頁面數據
            const pageDataAfterWait = await getPageData(page);
            
            if (pageDataAfterWait.length > 0) {
              allData = allData.concat(pageDataAfterWait);
              console.log(`等待後第 ${currentPage} 頁獲取到 ${pageDataAfterWait.length} 筆數據`);
            } else {
              console.log(`等待後第 ${currentPage} 頁仍然沒有數據，停止獲取更多頁面`);
              hasNextPage = false;
            }
          } else {
            console.log(`等待後第 ${currentPage} 頁仍然沒有表格數據，停止獲取更多頁面`);
            hasNextPage = false;
          }
        }
      } else {
        console.log('無法構建 URL 模式，停止獲取更多頁面');
        hasNextPage = false;
      }
    }
    
    // 確保數據按票數由高到低排序
    console.log('確保所有數據按票數由高到低排序...');
    allData.sort((a, b) => {
      const ticketsA = parseInt(a['票數'].replace(/,/g, '')) || 0;
      const ticketsB = parseInt(b['票數'].replace(/,/g, '')) || 0;
      return ticketsB - ticketsA; // 由高到低排序
    });
    
    // 輸出排序後的前 5 筆和後 5 筆數據
    if (allData.length > 0) {
      console.log('排序後的數據示例:');
      const previewCount = Math.min(5, allData.length);
      
      console.log('前 5 筆數據:');
      for (let i = 0; i < previewCount; i++) {
        console.log(`${i+1}. 片名: ${allData[i]['片名']}, 票數: ${allData[i]['票數']}`);
      }
      
      if (allData.length > previewCount * 2) {
        console.log('...');
        console.log('後 5 筆數據:');
        for (let i = allData.length - previewCount; i < allData.length; i++) {
          console.log(`${i+1}. 片名: ${allData[i]['片名']}, 票數: ${allData[i]['票數']}`);
        }
      }
    }
    
    // 保存為 JSON 檔案
    const fileName = `boxoffice-current-week-complete-${new Date().toISOString().split('T')[0]}.json`;
    const outputFile = path.join(outputDir, fileName);
    
    // 構建完整的 JSON 結構
    const result = {
      headers: ['排名', '國別', '片名', '上映日期', '發行公司', '週票房', '週票房變動', '週票數', '週票數變動', '週數', '總票房', '總票數'],
      data: allData,
      totalPages: currentPage,
      totalRecords: allData.length,
      downloadDate: new Date().toISOString()
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(`成功將所有頁面數據保存到: ${outputFile}`);
    console.log(`共獲取 ${currentPage} 頁，總計 ${allData.length} 筆數據`);
    
    return outputFile;
  } catch (error) {
    console.error('下載票房數據失敗:', error.message);
    throw error;
  } finally {
    // 確保瀏覽器關閉
    if (browser) {
      await browser.close();
      console.log('瀏覽器已關閉');
    }
  }
}

/**
 * 獲取當前頁面的表格數據
 * @param {Page} page - Puppeteer 頁面對象
 * @returns {Array} 表格數據數組
 */
async function getPageData(page) {
  return await page.evaluate(() => {
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
}

// 如果直接執行此腳本
if (require.main === module) {
  // 解析命令行參數
  const args = process.argv.slice(2);
  const outputDir = args[0] || './';
  const maxPages = parseInt(args[1] || '20', 10);
  const waitTimeMs = parseInt(args[2] || '5000', 10);
  
  // 執行下載
  downloadCurrentWeekBoxOffice(outputDir, maxPages, waitTimeMs)
    .then(filePath => {
      console.log(`下載完成! 檔案保存在: ${filePath}`);
    })
    .catch(err => {
      console.error('下載過程中發生錯誤:', err.message);
      process.exit(1);
    });
} else {
  // 作為模組導出
  module.exports = { downloadCurrentWeekBoxOffice };
}

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 使用 Puppeteer 從台灣票房網站下載多個週次的票房數據（按票數由高到低排序）
 * @param {string} outputDir - 輸出目錄 (預設為當前目錄)
 * @param {number} startWeek - 起始週次 (預設為 1)
 * @param {number} endWeek - 結束週次 (預設為 10)
 * @param {number} maxPagesPerWeek - 每個週次最大抓取頁數 (預設為 5)
 */
async function downloadAllWeeksBoxOffice(outputDir = './', startWeek = 1, endWeek = 10, maxPagesPerWeek = 5) {
  let browser = null;
  
  try {
    console.log(`開始使用 Puppeteer 下載台灣票房數據（週次 ${startWeek} 到 ${endWeek}，按票數由高到低排序）...`);
    
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
    
    // 準備存儲所有週次的數據
    let allWeeksData = [];
    
    // 獲取當前日期，用於構建 URL
    const today = new Date().toISOString().split('T')[0]; // 格式: YYYY-MM-DD
    
    // 循環獲取每個週次的數據
    for (let week = startWeek; week <= endWeek; week++) {
      console.log(`\n===== 開始處理第 ${week} 週數據 =====`);
      
      // 構建基礎 URL
      const baseUrl = `https://boxofficetw.tfai.org.tw/statistic/Week/${week}/0/all/False/Tickets/${today}`;
      
      // 訪問票房統計頁面
      console.log(`正在訪問第 ${week} 週票房頁面: ${baseUrl}`);
      await page.goto(baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // 等待頁面加載完成
      try {
        await page.waitForSelector('table', { timeout: 15000 });
        console.log('頁面加載完成');
      } catch (error) {
        console.log(`第 ${week} 週沒有數據，跳過`);
        continue; // 跳過這一週
      }
      
      // 截圖保存（初始頁面）
      const weekScreenshotPath = path.join(outputDir, `boxoffice-week-${week}-initial.png`);
      await page.screenshot({ path: weekScreenshotPath, fullPage: true });
      
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 截圖保存（排序後）
      const weekSortedScreenshotPath = path.join(outputDir, `boxoffice-week-${week}-sorted.png`);
      await page.screenshot({ path: weekSortedScreenshotPath, fullPage: true });
      console.log('已完成降冪排序');
      
      // 構建 URL 模式，用於翻頁
      const urlPattern = `https://boxofficetw.tfai.org.tw/statistic/Week/${week}/PAGE_INDEX/all/False/Tickets/${today}`;
      
      // 準備存儲當前週次的所有頁面數據
      let weekData = [];
      let currentPage = 1;
      let hasNextPage = true;
      
      // 獲取第一頁數據
      console.log(`正在獲取第 ${week} 週第 ${currentPage} 頁數據...`);
      const firstPageData = await getPageData(page, week);
      
      if (firstPageData.length > 0) {
        weekData = weekData.concat(firstPageData);
        console.log(`第 ${week} 週第 ${currentPage} 頁獲取到 ${firstPageData.length} 筆數據`);
        
        // 截圖保存（第一頁）
        const pageScreenshotPath = path.join(outputDir, `boxoffice-week-${week}-page-${currentPage}.png`);
        await page.screenshot({ path: pageScreenshotPath, fullPage: true });
        
        // 循環獲取後續頁面數據
        while (hasNextPage && currentPage < maxPagesPerWeek) {
          // 準備獲取下一頁
          currentPage++;
          console.log(`嘗試獲取第 ${week} 週第 ${currentPage} 頁數據...`);
          
          // 直接修改 URL 進行翻頁
          const nextPageUrl = urlPattern.replace('PAGE_INDEX', (currentPage - 1).toString());
          console.log(`訪問下一頁 URL: ${nextPageUrl}`);
          await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // 檢查是否有表格數據
          const hasTable = await page.evaluate(() => {
            return document.querySelector('table tbody tr') !== null;
          });
          
          if (hasTable) {
            // 等待頁面加載
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 截圖保存
            const nextPageScreenshotPath = path.join(outputDir, `boxoffice-week-${week}-page-${currentPage}.png`);
            await page.screenshot({ path: nextPageScreenshotPath, fullPage: true });
            
            // 獲取當前頁面數據
            const pageData = await getPageData(page, week);
            
            if (pageData.length > 0) {
              weekData = weekData.concat(pageData);
              console.log(`第 ${week} 週第 ${currentPage} 頁獲取到 ${pageData.length} 筆數據`);
            } else {
              console.log(`第 ${week} 週第 ${currentPage} 頁沒有數據，停止獲取更多頁面`);
              hasNextPage = false;
            }
          } else {
            console.log(`第 ${week} 週第 ${currentPage} 頁沒有表格數據，停止獲取更多頁面`);
            hasNextPage = false;
          }
        }
        
        // 確保數據按票數由高到低排序
        console.log(`確保第 ${week} 週所有數據按票數由高到低排序...`);
        weekData.sort((a, b) => {
          const ticketsA = parseInt(a['票數'].replace(/,/g, '')) || 0;
          const ticketsB = parseInt(b['票數'].replace(/,/g, '')) || 0;
          return ticketsB - ticketsA; // 由高到低排序
        });
        
        // 將週次信息添加到每筆數據中
        weekData = weekData.map(item => ({
          ...item,
          '資料週次': week
        }));
        
        // 將當前週次的數據添加到總數據中
        allWeeksData = allWeeksData.concat(weekData);
        
        // 保存當前週次的數據
        const weekFileName = `boxoffice-week-${week}-${today}.json`;
        const weekOutputFile = path.join(outputDir, weekFileName);
        
        // 構建完整的 JSON 結構
        const weekResult = {
          week: week,
          headers: ['排名', '國別', '片名', '上映日期', '發行公司', '週票房', '週票房變動', '週票數', '週票數變動', '週數', '總票房', '總票數', '資料週次'],
          data: weekData,
          totalPages: currentPage,
          totalRecords: weekData.length,
          downloadDate: today
        };
        
        fs.writeFileSync(weekOutputFile, JSON.stringify(weekResult, null, 2), 'utf8');
        console.log(`成功將第 ${week} 週數據保存到: ${weekFileName}`);
        console.log(`第 ${week} 週共獲取 ${currentPage} 頁，總計 ${weekData.length} 筆數據`);
      } else {
        console.log(`第 ${week} 週沒有數據`);
      }
    }
    
    // 確保所有週次的數據按票數由高到低排序
    console.log('\n===== 處理所有週次的合併數據 =====');
    console.log('確保所有週次的合併數據按票數由高到低排序...');
    allWeeksData.sort((a, b) => {
      const ticketsA = parseInt(a['票數'].replace(/,/g, '')) || 0;
      const ticketsB = parseInt(b['票數'].replace(/,/g, '')) || 0;
      return ticketsB - ticketsA; // 由高到低排序
    });
    
    // 輸出排序後的前 5 筆和後 5 筆數據
    if (allWeeksData.length > 0) {
      console.log('排序後的合併數據示例:');
      const previewCount = Math.min(5, allWeeksData.length);
      
      console.log('前 5 筆數據:');
      for (let i = 0; i < previewCount; i++) {
        console.log(`${i+1}. 片名: ${allWeeksData[i]['片名']}, 票數: ${allWeeksData[i]['票數']}, 週次: ${allWeeksData[i]['資料週次']}`);
      }
      
      if (allWeeksData.length > previewCount * 2) {
        console.log('...');
        console.log('後 5 筆數據:');
        for (let i = allWeeksData.length - previewCount; i < allWeeksData.length; i++) {
          console.log(`${i+1}. 片名: ${allWeeksData[i]['片名']}, 票數: ${allWeeksData[i]['票數']}, 週次: ${allWeeksData[i]['資料週次']}`);
        }
      }
    }
    
    // 保存所有週次的合併數據
    const allWeeksFileName = `boxoffice-all-weeks-${startWeek}-to-${endWeek}-${today}.json`;
    const allWeeksOutputFile = path.join(outputDir, allWeeksFileName);
    
    // 構建完整的 JSON 結構
    const allWeeksResult = {
      weeks: `${startWeek} to ${endWeek}`,
      headers: ['排名', '國別', '片名', '上映日期', '發行公司', '週票房', '週票房變動', '週票數', '週票數變動', '週數', '總票房', '總票數', '資料週次'],
      data: allWeeksData,
      totalWeeks: endWeek - startWeek + 1,
      totalRecords: allWeeksData.length,
      downloadDate: today
    };
    
    fs.writeFileSync(allWeeksOutputFile, JSON.stringify(allWeeksResult, null, 2), 'utf8');
    console.log(`成功將所有週次的合併數據保存到: ${allWeeksFileName}`);
    console.log(`共處理 ${endWeek - startWeek + 1} 個週次，總計 ${allWeeksData.length} 筆數據`);
    
    return allWeeksOutputFile;
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
 * @param {number} week - 當前處理的週次
 * @returns {Array} 表格數據數組
 */
async function getPageData(page, week) {
  return await page.evaluate((week) => {
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
  }, week);
}

// 如果直接執行此腳本
if (require.main === module) {
  // 解析命令行參數
  const args = process.argv.slice(2);
  const outputDir = args[0] || './';
  const startWeek = parseInt(args[1] || '1', 10);
  const endWeek = parseInt(args[2] || '10', 10);
  const maxPagesPerWeek = parseInt(args[3] || '5', 10);
  
  // 執行下載
  downloadAllWeeksBoxOffice(outputDir, startWeek, endWeek, maxPagesPerWeek)
    .then(filePath => {
      console.log(`下載完成! 所有週次的合併數據保存在: ${filePath}`);
    })
    .catch(err => {
      console.error('下載過程中發生錯誤:', err.message);
      process.exit(1);
    });
} else {
  // 作為模組導出
  module.exports = { downloadAllWeeksBoxOffice };
}

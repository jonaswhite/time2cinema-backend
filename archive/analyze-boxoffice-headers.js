const puppeteer = require('puppeteer');

async function analyzeTableHeaders() {
  let browser = null;
  
  try {
    console.log('開始分析台灣票房網站表格標頭...');
    
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
    console.log('頁面加載完成，分析表格標頭...');
    
    // 截圖保存
    await page.screenshot({ path: 'boxoffice-page.png' });
    console.log('已保存頁面截圖');
    
    // 分析表格標頭
    const headerInfo = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('table th'));
      return headers.map(th => {
        return {
          text: th.textContent.trim(),
          id: th.id,
          class: th.className,
          dataSort: th.getAttribute('data-sort'),
          onClick: th.getAttribute('onclick'),
          html: th.innerHTML
        };
      });
    });
    
    console.log('表格標頭分析結果:');
    console.log(JSON.stringify(headerInfo, null, 2));
    
    // 分析所有可能的排序按鈕
    const allButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], [onclick]'));
      return buttons.map(btn => {
        return {
          text: btn.textContent.trim(),
          id: btn.id,
          class: btn.className,
          onClick: btn.getAttribute('onclick'),
          href: btn.href || '',
          tagName: btn.tagName
        };
      });
    });
    
    console.log('所有可能的按鈕:');
    console.log(JSON.stringify(allButtons.filter(btn => 
      btn.text.includes('票') || 
      btn.text.includes('排序') || 
      (btn.onClick && btn.onClick.includes('sort'))
    ), null, 2));
    
    // 等待一段時間，讓用戶可以觀察頁面
    console.log('請觀察頁面，30 秒後將關閉瀏覽器...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    return { headerInfo, allButtons };
  } catch (error) {
    console.error('分析表格標頭失敗:', error.message);
    throw error;
  } finally {
    // 確保瀏覽器關閉
    if (browser) {
      await browser.close();
      console.log('瀏覽器已關閉');
    }
  }
}

// 執行分析
analyzeTableHeaders()
  .then(result => {
    console.log('分析完成!');
  })
  .catch(err => {
    console.error('分析過程中發生錯誤:', err.message);
    process.exit(1);
  });

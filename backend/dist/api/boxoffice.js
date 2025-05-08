"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.boxofficeRouter = void 0;
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const dayjs_1 = __importDefault(require("dayjs"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const puppeteer = __importStar(require("puppeteer"));
const router = express_1.default.Router();
const CACHE_DIR = path_1.default.resolve(__dirname, '../../cache');
fs_extra_1.default.ensureDirSync(CACHE_DIR);
// 取得週一日期
function getMonday(date) {
    const day = date.day();
    return date.subtract((day === 0 ? 7 : day) - 1, 'day');
}
/**
 * 從台灣票房網站抓取按票數由高到低排序的電影票房數據
 */
async function scrapeBoxOfficeByTicketsDesc(maxPages = 20, waitTimeMs = 5000) {
    let browser = null;
    try {
        console.log(`開始抓取台灣票房數據（按票數降序）...`);
        // 啟動瀏覽器
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: null
        });
        // 創建新頁面並訪問票房統計頁面
        const page = await browser.newPage();
        const baseUrl = 'https://boxofficetw.tfai.org.tw/statistic';
        await page.goto(baseUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        // 等待頁面加載並點擊票數欄位進行降冪排序
        await page.waitForSelector('table', { timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        await page.evaluate(() => {
            const ticketHeaders = Array.from(document.querySelectorAll('table th')).filter(th => {
                const text = th.textContent?.trim() || '';
                return text === '票數' ||
                    (text.includes('票數') &&
                        !text.includes('總票數') &&
                        !text.includes('票數變動'));
            });
            if (ticketHeaders.length > 0) {
                ticketHeaders[0].click();
            }
            else {
                const headers = Array.from(document.querySelectorAll('table th'));
                if (headers.length >= 9) {
                    headers[8].click();
                }
            }
        });
        // 等待排序完成
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        // 獲取當前 URL，用於構建分頁 URL
        const currentUrl = await page.url();
        // 解析當前 URL 以獲取基本參數
        let urlPattern = '';
        if (currentUrl.includes('/Week/')) {
            const urlParts = currentUrl.split('/');
            const weekIndex = urlParts.indexOf('Week');
            if (weekIndex !== -1 && urlParts.length >= weekIndex + 7) {
                const week = urlParts[weekIndex + 1];
                const all = urlParts[weekIndex + 3];
                const falseParam = urlParts[weekIndex + 4];
                const tickets = urlParts[weekIndex + 5];
                const date = urlParts[weekIndex + 6];
                urlPattern = `https://boxofficetw.tfai.org.tw/statistic/Week/${week}/PAGE_INDEX/${all}/${falseParam}/${tickets}/${date}`;
            }
        }
        if (!urlPattern) {
            throw new Error('無法從當前 URL 構建分頁 URL 模式');
        }
        // 獲取第一頁數據
        console.log('獲取第 1 頁數據...');
        let pageData = await getPageData(page);
        // 所有電影數據
        let allMovies = [];
        // 處理第一頁數據
        if (pageData && pageData.length > 0) {
            const movies = parseTableRows(pageData);
            allMovies = [...movies];
            console.log(`第 1 頁獲取了 ${movies.length} 筆數據`);
        }
        else {
            console.log('第 1 頁沒有數據');
        }
        // 用於去重的集合
        const uniqueKeys = new Set();
        allMovies.forEach(movie => {
            uniqueKeys.add(`${movie.title}-${movie.releaseDate}`);
        });
        // 連續無新數據的頁數計數
        let emptyPagesCount = 0;
        // 抓取剩餘頁面
        for (let pageIndex = 1; pageIndex < maxPages; pageIndex++) {
            // 如果連續 3 頁沒有新數據，則停止抓取
            if (emptyPagesCount >= 3) {
                console.log(`連續 ${emptyPagesCount} 頁沒有新數據，停止抓取`);
                break;
            }
            // 構建下一頁 URL
            const nextPageUrl = urlPattern.replace('PAGE_INDEX', pageIndex.toString());
            console.log(`獲取第 ${pageIndex + 1} 頁數據，URL: ${nextPageUrl}`);
            // 訪問下一頁
            await page.goto(nextPageUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            // 等待頁面加載
            await page.waitForSelector('table', { timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, waitTimeMs));
            // 獲取當前頁數據
            pageData = await getPageData(page);
            // 檢查是否有數據
            if (pageData && pageData.length > 0) {
                const movies = parseTableRows(pageData);
                // 檢查是否有新數據
                let hasNewData = false;
                for (const movie of movies) {
                    const key = `${movie.title}-${movie.releaseDate}`;
                    if (!uniqueKeys.has(key)) {
                        uniqueKeys.add(key);
                        allMovies.push(movie);
                        hasNewData = true;
                    }
                }
                if (hasNewData) {
                    console.log(`第 ${pageIndex + 1} 頁獲取了新數據`);
                    emptyPagesCount = 0;
                }
                else {
                    console.log(`第 ${pageIndex + 1} 頁沒有新數據`);
                    emptyPagesCount++;
                }
            }
            else {
                console.log(`第 ${pageIndex + 1} 頁沒有數據`);
                emptyPagesCount++;
            }
        }
        // 按票數降序排序
        allMovies.sort((a, b) => b.weeklySales - a.weeklySales);
        console.log(`總共獲取了 ${allMovies.length} 筆唯一電影數據`);
        return allMovies;
    }
    catch (error) {
        console.error('抓取票房數據失敗:', error instanceof Error ? error.message : String(error));
        throw error;
    }
    finally {
        // 關閉瀏覽器
        if (browser) {
            await browser.close();
            console.log('瀏覽器已關閉');
        }
    }
}
/**
 * 獲取當前頁面的表格數據
 */
async function getPageData(page) {
    try {
        return await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(cell => cell.textContent?.trim() || '');
            });
        });
    }
    catch (error) {
        console.error('獲取頁面數據失敗:', error instanceof Error ? error.message : String(error));
        return [];
    }
}
/**
 * 解析表格行數據為 BoxOfficeMovie 對象
 */
function parseTableRows(rows) {
    return rows.map((row, index) => {
        // 確保行有足夠的單元格
        if (!Array.isArray(row) || row.length < 9) {
            return {
                rank: index + 1,
                title: '未知',
                weeklySales: 0
            };
        }
        // 解析票數和票房數值
        const parseNumber = (str) => {
            if (!str)
                return undefined;
            return parseInt(str.replace(/,/g, ''), 10) || 0;
        };
        // 根據網頁截圖中的實際結構映射字段
        // 序號[0], 國別[1], 片名[2], 上映日[3], 出品[4], 院數[5], 
        // 金額[6], 金額變動[7], 票數[8], 票數變動[9], 市占率[10], 
        // 累計週數[11], 累計金額[12], 累計票數[13]
        // 在截圖中，我們看到「會計師 2」的數據是：
        // 週票房金額：10,770,084 元
        // 週票數：40,333 張
        // 累計票房金額：31,281,875 元
        // 累計票數：115,285 張
        return {
            rank: parseInt(row[0], 10) || index + 1,
            country: row[1] || undefined,
            title: row[2] || '未知',
            releaseDate: row[3] || undefined,
            distributor: row[4] || undefined,
            cinemaCount: parseNumber(row[5]),
            weeklyGross: parseNumber(row[6]),
            weeklyChange: row[7] || undefined,
            weeklySales: parseNumber(row[8]) || 0,
            weeklyTicketChange: row[9] || undefined,
            marketShare: row[10] || undefined,
            releaseWeeks: parseNumber(row[11]),
            totalGross: parseNumber(row[12]),
            totalSales: parseNumber(row[13])
        };
    }).filter(movie => movie.title !== '未知' && movie.weeklySales > 0);
}
// 票房 API 路由
router.get('/', async (req, res) => {
    try {
        const queryDate = req.query.date;
        const forceRefresh = req.query.refresh === 'true';
        const monday = getMonday(queryDate ? (0, dayjs_1.default)(queryDate) : (0, dayjs_1.default)());
        const dateStr = monday.format('YYYY-MM-DD');
        const cacheFile = path_1.default.join(CACHE_DIR, `boxoffice-${dateStr}.json`);
        // 檢查快取是否存在且是當天的
        const shouldUseCache = async () => {
            // 如果強制刷新，不使用快取
            if (forceRefresh)
                return false;
            // 檢查快取檔案是否存在
            if (!await fs_extra_1.default.pathExists(cacheFile))
                return false;
            try {
                // 檢查快取檔案的修改時間
                const stats = await fs_extra_1.default.stat(cacheFile);
                const fileDate = (0, dayjs_1.default)(stats.mtime);
                const today = (0, dayjs_1.default)();
                // 如果快取檔案是今天建立的，使用快取
                if (fileDate.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')) {
                    const cache = await fs_extra_1.default.readJSON(cacheFile);
                    if (cache && Array.isArray(cache) && cache.length > 0) {
                        return true;
                    }
                }
                return false;
            }
            catch (error) {
                console.error('檢查快取檔案時出錯:', error);
                return false;
            }
        };
        // 檢查是否應該使用快取
        if (await shouldUseCache()) {
            const cache = await fs_extra_1.default.readJSON(cacheFile);
            console.log(`從今日快取返回 ${cache.length} 筆票房資料`);
            res.json(cache);
            return;
        }
        console.log(forceRefresh ? '強制重新爬取票房資料' : '快取過期或無效，開始爬取今日票房資料');
        // 執行爬蟲
        const boxOfficeData = await scrapeBoxOfficeByTicketsDesc();
        if (boxOfficeData.length === 0) {
            throw new Error('爬取結果為空');
        }
        // 寫入快取
        await fs_extra_1.default.writeJSON(cacheFile, boxOfficeData, { spaces: 2 });
        console.log(`已將 ${boxOfficeData.length} 筆票房資料寫入今日快取`);
        res.json(boxOfficeData);
    }
    catch (err) {
        console.error('獲取票房資料失敗:', err instanceof Error ? err.message : String(err));
        res.status(500).json({
            error: 'Failed to fetch box office data',
            detail: err instanceof Error ? err.message : String(err)
        });
    }
});
// 下載原始 JSON 數據路由
router.get('/download-json', async (req, res) => {
    try {
        const currentWeek = req.query.week ? parseInt(req.query.week) : 10;
        const page = req.query.page ? parseInt(req.query.page) : 0;
        // 構建 JSON API URL
        const jsonUrl = `https://boxofficetw.tfai.org.tw/api/export/Week/${currentWeek}/${page}/all/False/Tickets/json`;
        const { data } = await axios_1.default.get(jsonUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        if (!data) {
            throw new Error('無法獲取 JSON 數據');
        }
        // 設置下載 headers
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=boxoffice-week-${currentWeek}-page-${page}.json`);
        res.json(data);
    }
    catch (err) {
        console.error('下載 JSON 數據失敗:', err instanceof Error ? err.message : String(err));
        res.status(500).json({
            error: 'Failed to download JSON data',
            detail: err instanceof Error ? err.message : String(err)
        });
    }
});
exports.boxofficeRouter = router;

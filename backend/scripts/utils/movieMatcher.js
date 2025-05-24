const { Pool } = require('pg');
const stringSimilarity = require('string-similarity');

class MovieMatcher {
  constructor(pool) {
    this.pool = pool;
    this.movieCache = new Map();
    this.commonAliases = {
      // 簡稱到全稱的映射
      '蠟筆小新': '我們的恐龍日記',
      '怪獸8號': '怪獸8號：Mission Recon',
      '超人力霸王': '超人力霸王雅克',
      '麥塊': 'MINECRAFT',
      '會計師2': '會計師 2',
      // 英文別名
      'ultraman': '超人力霸王',
      'shinchan': '小新'
    };
  }

  // 標準化字串
  normalizeString(str) {
    if (!str) return '';
    
    // 先轉換為字串，以防萬一
    let normalized = String(str);
    
    // 1. 移除所有特殊字符和空白，只保留中英文字母、數字和常見標點
    normalized = normalized
      .replace(/[\s\-:：·・!！?？,，.。;；"'‘’“”()（）【】\[\]{}<>《》「」『』]/g, '')
      .toLowerCase()
      .trim();
    
    // 2. 處理常見的別名
    Object.entries(this.commonAliases).forEach(([alias, original]) => {
      const aliasRegex = new RegExp(alias, 'gi');
      const originalNormalized = original.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      normalized = normalized.replace(aliasRegex, originalNormalized);
    });
    
    // 3. 移除常見的版本和格式後綴
    const versionPatterns = [
      // 數字修飾
      /\d+d$/i,  // 例如: 3D, 4DX
      /\d+k$/i,  // 例如: 4K
      /\d+bit$/i, // 例如: 8bit
      
      // 版本修飾
      /數位修復(?:版)?$/i,
      /修復(?:版)?$/i,
      /數位(?:版)?$/i,
      
      // 版本類型
      /導演[剪輯]*(?:版)?$/i,
      /(?:加長|終極|完整|未分級|未刪減|特別|終極剪輯)(?:版)?$/i,
      
      // 媒體類型
      /(?:藍光|bd|dvd|vcd|hd|hdtv|blu[\-\s]*ray)(?:版)?$/i,
      
      // 其他修飾
      /(?:電影|劇場|動畫|真人|重映|經典|收藏|紀念|週年|特別放映|影展)(?:版)?$/i,
      
      // 移除所有數字後面的「集」「話」「回」等集數標記
      /\d+[集話回]$/i,
      
      // 移除括號及其內容，例如 (2023), [HD], 【藍光】等
      /[\[\]()【】][^\[\]()【】]*[\[\]()【】]/g,
      
      // 移除年份，例如 2023, (2023), 【2023】等
      /(?:^|[^0-9])(19|20)\d{2}(?=$|[^0-9])/g,
      
      // 移除所有非中英文字符
      /[^a-z0-9\u4e00-\u9fa5]/g
    ];
    
    // 應用所有標準化模式
    versionPatterns.forEach(pattern => {
      normalized = normalized.replace(pattern, '');
    });
    
    return normalized;
  }

  // 從資料庫載入所有電影
  async loadMovies() {
    if (this.movieCache.size > 0) return;
    
    const query = 'SELECT id, full_title, chinese_title, english_title FROM movies';
    const { rows } = await this.pool.query(query);
    
    rows.forEach(movie => {
      const normalizedFull = this.normalizeString(movie.full_title);
      const normalizedChinese = this.normalizeString(movie.chinese_title);
      const normalizedEnglish = this.normalizeString(movie.english_title);
      
      this.movieCache.set(movie.id, {
        ...movie,
        normalizedFull,
        normalizedChinese,
        normalizedEnglish
      });
    });
  }

  // 尋找最佳匹配的電影
  async findBestMatch(inputTitle) {
    if (this.movieCache.size === 0) {
      await this.loadMovies();
    }
    
    if (!inputTitle || typeof inputTitle !== 'string') {
      console.log('無效的電影標題:', inputTitle);
      return null;
    }
    
    // 進行標準化處理
    const normalizedInput = this.normalizeString(inputTitle);
    
    // 如果標準化後為空，返回null
    if (!normalizedInput) {
      console.log('標準化後為空，跳過:', inputTitle);
      return null;
    }
    
    console.log(`\n🔍 正在匹配: "${inputTitle}"`);
    console.log(`  標準化後: "${normalizedInput}"`);
    
    let bestMatch = null;
    let bestScore = 0;
    const minSimilarity = 0.6; // 降低最小相似度閾值以捕獲更多匹配
    
    // 比對快取中的每部電影
    for (const [id, movie] of this.movieCache.entries()) {
      // 比對標準化後的全名、中文名和英文名
      const scores = [
        { score: stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedFull), field: 'full_title' },
        { score: stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedChinese), field: 'chinese_title' },
        { score: stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedEnglish), field: 'english_title' }
      ];
      
      // 找出最高分的匹配
      const bestFieldMatch = scores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      
      // 如果找到完全匹配，直接返回
      if (bestFieldMatch.score >= 0.95) {
        console.log(`✅ 找到完全匹配: "${movie.full_title}" (${bestFieldMatch.field}, 分數: ${(bestFieldMatch.score * 100).toFixed(1)}%)`);
        return {
          id,
          title: movie.full_title,
          score: bestFieldMatch.score,
          matchedField: bestFieldMatch.field
        };
      }
      
      // 更新最佳匹配
      if (bestFieldMatch.score > bestScore && bestFieldMatch.score >= minSimilarity) {
        bestScore = bestFieldMatch.score;
        bestMatch = {
          id,
          title: movie.full_title,
          score: bestFieldMatch.score,
          matchedField: bestFieldMatch.field
        };
      }
    }
    
    if (bestMatch) {
      console.log(`✅ 找到最佳匹配: "${bestMatch.title}" (${bestMatch.matchedField}, 分數: ${(bestMatch.score * 100).toFixed(1)}%)`);
    } else {
      console.log(`❌ 未找到匹配: "${inputTitle}"`);
      
      // 輸出前10個最相似的電影用於調試
      const allMatches = [];
      this.movieCache.forEach(movie => {
        const score = Math.max(
          stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedFull),
          stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedChinese),
          stringSimilarity.compareTwoStrings(normalizedInput, movie.normalizedEnglish)
        );
        if (score > 0.4) { // 只顯示相似度大於40%的結果
          allMatches.push({ title: movie.full_title, score });
        }
      });
      
      allMatches.sort((a, b) => b.score - a.score);
      
      if (allMatches.length > 0) {
        console.log('  最相似的電影:');
        allMatches.slice(0, 5).forEach((match, index) => {
          console.log(`    ${index + 1}. "${match.title}" (${(match.score * 100).toFixed(1)}%)`);
        });
      }
    }
    
    return bestMatch;
  }

  // 處理多個標題的批量匹配
  async batchMatchTitles(titles) {
    const results = [];
    
    for (const title of titles) {
      const match = await this.findBestMatch(title);
      results.push({
        original: title,
        match: match || { id: null, title: null, score: 0 },
        matched: !!match
      });
    }
    
    return results;
  }
}

module.exports = MovieMatcher;

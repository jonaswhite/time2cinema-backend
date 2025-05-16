// 電影標題到 TMDB ID 的映射表
// 用於手動指定難以通過 API 自動匹配的電影

import pool from '../db';

export const movieTmdbMapping: Record<string, number> = {
  // 票房榜前幾名的熱門電影
  "雷霆特攻隊": 1034587, // The Thunderbolts
  "會計師2": 870028,     // The Accountant 2
  
  // 其他可能難以匹配的電影
  "夏之庭 4K數位修復版": 11806,
  "2046 4K數位修復版": 1302,
  "電影蠟筆小新：我們的恐龍日記": 1029575,
  "電影版孤獨的美食家": 1174973
};

// 中英文電影標題映射表
// 用於手動指定中英文電影標題的對應關係
export const movieTitleMapping: Record<string, string> = {
  // 票房榜熱門電影
  "雷霆特攻隊": "The Thunderbolts",
  "會計師2": "The Accountant 2",
  "會計師 2": "The Accountant 2",
  "沙丘：第二部": "Dune: Part Two",
  "少年與狗": "The Boy and the Heron",
  "時空旅人": "The Time Traveler's Wife",
  "天才少女": "Gifted",
  "超能力家族": "The Incredibles",
  
  // 其他電影
  "夏之庭": "The Friends",
  "2046": "2046",
  "電影蠟筆小新：我們的恐龍日記": "Crayon Shin-chan: Our Dinosaur Diary",
  "電影版孤獨的美食家": "Solitary Gourmet: The Movie"
};

// 根據電影標題獲取 TMDB ID
export function getTmdbIdByTitle(title: string): number | null {
  // 嘗試直接匹配
  if (title in movieTmdbMapping) {
    return movieTmdbMapping[title];
  }
  
  // 嘗試忽略空格匹配
  const normalizedTitle = title.replace(/\s+/g, '');
  for (const [key, value] of Object.entries(movieTmdbMapping)) {
    if (key.replace(/\s+/g, '') === normalizedTitle) {
      return value;
    }
  }
  
  return null;
}

// 根據中文電影標題獲取英文標題
// 先從內存映射表查詢，如果沒有則從數據庫查詢
export async function getEnglishTitleByChinese(chineseTitle: string): Promise<string | null> {
  // 嘗試從內存映射表中直接匹配
  if (chineseTitle in movieTitleMapping) {
    return movieTitleMapping[chineseTitle];
  }
  
  // 嘗試忽略空格匹配
  const normalizedTitle = chineseTitle.replace(/\s+/g, '');
  for (const [key, value] of Object.entries(movieTitleMapping)) {
    if (key.replace(/\s+/g, '') === normalizedTitle) {
      return value;
    }
  }
  
  // 如果內存映射表中沒有，則從數據庫查詢
  try {
    const query = `
      SELECT english_title FROM movie_title_mapping WHERE chinese_title = $1
    `;
    const result = await pool.query(query, [chineseTitle]);
    
    if (result.rows.length > 0) {
      return result.rows[0].english_title;
    }
    
    return null;
  } catch (error) {
    console.error(`查詢電影標題映射時出錯:`, error);
    return null;
  }
}

// 將中英文電影標題映射保存到數據庫
export async function saveTitleMapping(chineseTitle: string, englishTitle: string): Promise<boolean> {
  try {
    // 確保表存在
    await ensureTitleMappingTable();
    
    // 嘗試插入或更新映射
    const query = `
      INSERT INTO movie_title_mapping (chinese_title, english_title)
      VALUES ($1, $2)
      ON CONFLICT (chinese_title) DO UPDATE 
      SET english_title = $2, updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `;
    
    const result = await pool.query(query, [chineseTitle, englishTitle]);
    
    if (result.rows.length > 0) {
      console.log(`已保存電影標題映射: ${chineseTitle} -> ${englishTitle}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`保存電影標題映射時出錯:`, error);
    return false;
  }
}

// 確保電影標題映射表存在
export async function ensureTitleMappingTable(): Promise<boolean> {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS movie_title_mapping (
        id SERIAL PRIMARY KEY,
        chinese_title TEXT NOT NULL,
        english_title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chinese_title)
      )
    `;
    
    await pool.query(query);
    return true;
  } catch (error) {
    console.error(`確保電影標題映射表存在時出錯:`, error);
    return false;
  }
}

// 將內存映射表同步到數據庫
export async function syncTitleMappingToDatabase(): Promise<boolean> {
  try {
    // 確保表存在
    await ensureTitleMappingTable();
    
    // 將內存映射表中的所有映射保存到數據庫
    for (const [chineseTitle, englishTitle] of Object.entries(movieTitleMapping)) {
      await saveTitleMapping(chineseTitle, englishTitle);
    }
    
    console.log(`已將內存映射表同步到數據庫`);
    return true;
  } catch (error) {
    console.error(`同步映射表到數據庫時出錯:`, error);
    return false;
  }
}

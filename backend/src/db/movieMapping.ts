// 電影標題到 TMDB ID 的映射表
// 用於手動指定難以通過 API 自動匹配的電影

export const movieTmdbMapping: Record<string, number> = {
  // 票房榜前幾名的熱門電影
  "雷霆特攻隊": 1034587, // The Thunderbolts
  "會計師2": 870028,     // The Accountant 2
  "會計師 2": 870028,    // 同上，不同空格格式
  
  // 其他可能難以匹配的電影
  "夏之庭 4K數位修復版": 11806,
  "2046 4K數位修復版": 1302,
  "電影蠟筆小新：我們的恐龍日記": 1029575,
  "電影版孤獨的美食家": 1174973
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

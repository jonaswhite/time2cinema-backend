import re
from typing import Tuple, List, Optional

def find_chinese_chars(text: str) -> List[str]:
    """找出所有中文字符"""
    return [c for c in text if '\u4e00' <= c <= '\u9fff']

def has_chinese(text: str) -> bool:
    """檢查是否包含中文字符"""
    return any('\u4e00' <= c <= '\u9fff' for c in text)

def has_english(text: str) -> bool:
    """檢查是否包含英文字母"""
    return any(c.isalpha() and c.isascii() for c in text)

def split_chinese_english(title: str) -> Tuple[str, str]:
    """
    將包含中英文的電影標題分割為中文和英文部分
    
    Args:
        title (str): 原始標題
        
    Returns:
        Tuple[str, str]: (chinese_part, english_part)
    """
    if not title:
        return "", ""
        
    title = title.strip()
    
    # 檢查是否為純英文標題（不包含中文字符）
    if not has_chinese(title):
        return "", title
    
    # 檢查是否為純中文標題（不包含英文字母）
    if not has_english(title):
        return title, ""
    
    # 處理「數字+中文 數字+英文」模式（如「366日 366 Days」）
    number_pattern = r'^(\d+[^\s\d]+)\s+(\d+\s+[A-Za-z].*)$'
    number_match = re.match(number_pattern, title)
    if number_match:
        chinese_part = number_match.group(1).strip()
        english_part = number_match.group(2).strip()
        if has_chinese(chinese_part):
            return chinese_part, english_part
    
    # 處理「中文 英文: 英文」模式（如「絕命終結站 血脈 Final Destination: Bloodlines」）
    if ':' in title and ' ' in title:
        special_case = re.search(r'^(.+?)\s+([A-Za-z].*?:\s*[A-Za-z].*)$', title)
        if special_case:
            chinese_part = special_case.group(1).strip()
            english_part = special_case.group(2).strip()
            if has_chinese(chinese_part):
                return chinese_part, english_part
    
    # 處理「獵金·遊戲 A Gilded Game」這種情況
    if '·' in title and ' ' in title:
        # 找到第一個空格的位置
        first_space = title.find(' ')
        # 找到最後一個中文字的位置
        last_chinese_pos = -1
        for i, c in enumerate(title):
            if '\u4e00' <= c <= '\u9fff':
                last_chinese_pos = i
        
        # 如果最後一個中文字在第一個空格之前，就以第一個空格為分界
        if last_chinese_pos < first_space:
            return title[:first_space].strip(), title[first_space+1:].strip()
        # 否則以最後一個中文字為分界
        else:
            return title[:last_chinese_pos+1].strip(), title[last_chinese_pos+1:].strip()
    
    # 處理一般的「中文 英文」模式
    chinese_chars = find_chinese_chars(title)
    if not chinese_chars:
        return "", title
    
    last_chinese_pos = title.rindex(chinese_chars[-1])
    
    # 找到英文部分的開始位置
    first_english_pos = -1
    for i, char in enumerate(title):
        if char.isalpha() and char.isascii():
            first_english_pos = i
            break
    
    if first_english_pos > 0 and first_english_pos > last_chinese_pos:
        # 確保中英文之間有空格或標點符號
        separator = title[last_chinese_pos:first_english_pos].strip()
        if not separator or any(sep in separator for sep in '·:,-') or '  ' in title[last_chinese_pos:first_english_pos]:
            chinese_part = title[:first_english_pos].strip(' ·:,- ')
            english_part = title[first_english_pos:].strip()
            return chinese_part, english_part
    
    # 處理包含冒號的標題（如「中文 英文: 英文」）
    if ':' in title:
        last_colon_pos = title.rfind(':')
        before_colon = title[:last_colon_pos].strip()
        after_colon = title[last_colon_pos+1:].strip()
        
        # 如果冒號前有空格，嘗試分割
        if ' ' in before_colon:
            last_space_pos = before_colon.rfind(' ')
            potential_chinese = before_colon[:last_space_pos].strip()
            potential_english = before_colon[last_space_pos+1:].strip()
            
            # 檢查冒號前是否有中文字符
            if has_chinese(potential_chinese) and potential_english and has_english(potential_english):
                return potential_chinese, f"{potential_english}: {after_colon}"
        
        # 如果冒號前沒有空格，直接分割
        if has_chinese(before_colon) and has_english(after_colon):
            return before_colon, after_colon
    
    # 處理一般的「中文 英文」模式（最後嘗試）
    words = title.split()
    if len(words) >= 2:
        # 找出中英文分界點
        split_point = 0
        for i, word in enumerate(words):
            # 處理「獵金·遊戲 A Gilded Game」這種情況
            if i > 0 and has_chinese(words[i-1]) and has_english(word):
                # 如果是「中文 英文」模式，且後面的單詞也是英文，則繼續往後找
                j = i + 1
                while j < len(words) and has_english(words[j]):
                    j += 1
                if j > i + 1:  # 如果後面有多個英文單詞
                    return ' '.join(words[:i]).strip(), ' '.join(words[i:]).strip()
                else:
                    split_point = i
                    break
        
        if split_point > 0:
            chinese_part = ' '.join(words[:split_point]).strip()
            english_part = ' '.join(words[split_point:]).strip()
            if has_chinese(chinese_part) and has_english(english_part):
                return chinese_part, english_part
    
    # 處理「怪獸8號：Mission Recon Kaiju No.8」這種情況
    if '：' in title:
        parts = title.split('：', 1)
        if len(parts) == 2 and has_chinese(parts[0]) and has_english(parts[1]):
            chinese_part = parts[0].strip()
            english_part = parts[1].strip()
            
            # 處理數字結尾的情況（如「怪獸8號」）
            if chinese_part and chinese_part[-1].isdigit():
                # 找到最後一個非數字的字符
                last_non_digit = len(chinese_part) - 1
                while last_non_digit >= 0 and chinese_part[last_non_digit].isdigit():
                    last_non_digit -= 1
                
                # 如果找到非數字字符
                if last_non_digit >= 0:
                    number_part = chinese_part[last_non_digit+1:]
                    chinese_part = chinese_part[:last_non_digit+1].strip()
                    english_part = f"{number_part}：{english_part}"
            
            return chinese_part, english_part
    
    # 處理「中文 英文」或「中文 數字 英文」模式
    # 找到最後一個中文字的位置
    chinese_chars = [c for c in title if '\u4e00' <= c <= '\u9fff']
    if chinese_chars:
        last_chinese_pos = title.rindex(chinese_chars[-1])
        
        # 從最後一個中文字開始向右查找英文部分
        remaining = title[last_chinese_pos+1:].strip()
        
        # 處理中間有「·」符號的情況（如「破·地獄 Po · Dei Juk」）
        if '·' in remaining:
            parts = [p.strip() for p in remaining.split('·') if p.strip()]
            if len(parts) > 1 and any(c.isalpha() for c in parts[0]):
                # 第一個部分包含英文字母，可能是英文部分
                chinese_part = title[:last_chinese_pos+1].strip()
                # 保留原有的空格和點
                english_part = ' · '.join(parts).strip()
                # 修正多餘的空格
                english_part = re.sub(r'\s*·\s*', ' · ', english_part)
                return chinese_part, english_part
        
        # 處理一般情況：中文 英文
        if remaining:
            # 找到第一個英文字母或數字
            english_start = 0
            while english_start < len(remaining) and not (remaining[english_start].isalpha() or remaining[english_start].isdigit()):
                english_start += 1
            
            if english_start < len(remaining):
                # 處理數字開頭的情況（如「海洋奇緣2 Moana 2」）
                if remaining[english_start].isdigit():
                    # 找到數字後面的英文字母
                    digit_end = english_start
                    while digit_end < len(remaining) and remaining[digit_end].isdigit():
                        digit_end += 1
                    
                    # 跳過空格
                    space_end = digit_end
                    while space_end < len(remaining) and remaining[space_end].isspace():
                        space_end += 1
                    
                    if space_end < len(remaining) and remaining[space_end].isalpha():
                        # 如果數字後面有英文字母，則將數字視為英文部分的一部分
                        english_start = space_end
                    else:
                        # 否則將數字視為中文部分的一部分
                        english_start = digit_end
                
                # 提取英文部分
                english_part = remaining[english_start:].strip()
                
                # 處理中文部分
                chinese_part = title[:last_chinese_pos+1].strip()
                
                # 處理中間的標點符號
                if remaining[:english_start].strip():
                    chinese_part = f"{chinese_part}{remaining[:english_start].strip()}"
                
                return chinese_part.strip(), english_part.strip()
    
    # 處理括號中的英文（如「夏之庭 The Friends(1994)」）
    bracket_match = re.search(r'^(.+?)\s*\(([^)]+[a-zA-Z][^)]*)\)$', title)
    if bracket_match:
        chinese_part = bracket_match.group(1).strip()
        english_part = bracket_match.group(2).strip()
        if any('\u4e00' <= c <= '\u9fff' for c in chinese_part):
            return chinese_part, english_part
    
    # 特殊處理「數字+中文 數字+英文」的情況（如「366日 366 Days」）
    special_number_pattern = r'^(\d+)([^\s\d]*[\u4e00-\u9fff])\s+\1\s*([a-zA-Z].*)'
    special_match = re.search(special_number_pattern, title)
    if special_match:
        number_part = special_match.group(1)
        chinese_part = f"{number_part}{special_match.group(2).strip()}"
        english_part = f"{number_part} {special_match.group(3).strip()}"
        return chinese_part, english_part
    
    # 處理「數字+中文 數字+英文」的其他情況
    number_pattern = r'^(\d+)([^\s\d]*[\u4e00-\u9fff][^\d]*)\s+\1\s*([a-zA-Z].*)'
    number_match = re.search(number_pattern, title)
    if number_match:
        number_part = number_match.group(1)
        chinese_part = f"{number_part}{number_match.group(2).strip()}"
        english_part = f"{number_part} {number_match.group(3).strip()}"
        return chinese_part, english_part
    
    # 處理「數字+中文 英文」的情況（如「366日 Days」）
    number_pattern = r'^(\d+[^\s\d]*[\u4e00-\u9fff][^\d]*)\s+([a-zA-Z].*)'
    number_match = re.search(number_pattern, title)
    if number_match:
        chinese_part = number_match.group(1).strip()
        english_part = number_match.group(2).strip()
        if any('\u4e00' <= c <= '\u9fff' for c in chinese_part):
            # 檢查是否需要將數字從中文部分移到英文部分
            chinese_chars = [c for c in chinese_part if '\u4e00' <= c <= '\u9fff']
            if chinese_chars:
                last_chinese_pos = chinese_part.rindex(chinese_chars[-1])
                if last_chinese_pos + 1 < len(chinese_part):
                    # 如果中文部分結尾有數字，將其移到英文部分
                    number_part = chinese_part[last_chinese_pos+1:].strip()
                    if number_part and number_part.isdigit():
                        return chinese_part[:last_chinese_pos+1].strip(), f"{number_part} {english_part}"
            return chinese_part, english_part
    
    # 如果以上都不匹配，但有中文字符，則整個作為中文
    return title, ""

def test_split_chinese_english():
    test_cases = [
        # 標準中英文標題
        ("絕命終結站 血脈 Final Destination: Bloodlines", "絕命終結站 血脈", "Final Destination: Bloodlines"),
        ("獵金·遊戲 A Gilded Game", "獵金·遊戲", "A Gilded Game"),
        ("老派 Analog", "老派", "Analog"),
        ("怒女 Wannabe", "怒女", "Wannabe"),
        ("此刻的我們 We Live in Time", "此刻的我們", "We Live in Time"),
        ("蝸牛少女回憶錄 Memoir of a Snail", "蝸牛少女回憶錄", "Memoir of a Snail"),
        ("第一夫人的逆襲 Bernadette", "第一夫人的逆襲", "Bernadette"),
        ("不可能的任務：最終清算 Mission: Impossible - The Final Reckoning", "不可能的任務：最終清算", "Mission: Impossible - The Final Reckoning"),
        ("對街的小星星 Solitude", "對街的小星星", "Solitude"),
        ("殭屍合唱團：夢想未完 Hung Up on a Dream", "殭屍合唱團：夢想未完", "Hung Up on a Dream"),
        ("雷霆特攻隊* Thunderbolts", "雷霆特攻隊*", "Thunderbolts"),
        ("聖夜：惡魔都市 Holy Night: Demon Hunters", "聖夜：惡魔都市", "Holy Night: Demon Hunters"),
        
        # 特殊符號和格式
        ("會計師2 The Accountant 2", "會計師2", "The Accountant 2"),
        ("MINECRAFT麥塊電影 A Minecraft Movie", "MINECRAFT麥塊電影", "A Minecraft Movie"),
        ("夏日最後的祕密 Summer Blue Hour", "夏日最後的祕密", "Summer Blue Hour"),
        ("花束般的戀愛 We Made a Beautiful Bouquet", "花束般的戀愛", "We Made a Beautiful Bouquet"),
        ("禁夜屍 Rosario", "禁夜屍", "Rosario"),
        ("有病才會喜歡你 Lovesick", "有病才會喜歡你", "Lovesick"),
        ("冥婚鬧泰大 The Red Envelope", "冥婚鬧泰大", "The Red Envelope"),
        ("囍宴 The Wedding Banquet", "囍宴", "The Wedding Banquet"),
        ("宮﨑駿的奇幻世界 Miyazaki, Spirit of Nature", "宮﨑駿的奇幻世界", "Miyazaki, Spirit of Nature"),
        
        # 數字和特殊格式
        ("怪獸8號：Mission Recon Kaiju No.8", "怪獸8號", "Mission Recon Kaiju No.8"),
        ("GIVEN被贈與的未來劇場版：去海邊 Given 3: To the Sea", "GIVEN被贈與的未來劇場版：去海邊", "Given 3: To the Sea"),
        ("366日 366 Days", "366日", "366 Days"),
        
        # 純中文和純英文
        ("海街日記", "海街日記", ""),
        ("Inception", "", "Inception"),
        
        # 邊緣情況
        ("", "", ""),
        ("   ", "", ""),
    ]
    
    print("測試標題分割函數：")
    print("-" * 80)
    
    failed = 0
    for i, (title, expected_chinese, expected_english) in enumerate(test_cases, 1):
        try:
            chinese, english = split_chinese_english(title)
            status = "✓" if chinese == expected_chinese and english == expected_english else "✗"
            if status == "✗":
                failed += 1
            print(f"{i:2d}. {status} 標題: {title}")
            print(f"    中文: {chinese}")
            print(f"    英文: {english}")
            if status == "✗":
                print(f"    預期中文: {expected_chinese}")
                print(f"    預期英文: {expected_english}")
            print()
        except Exception as e:
            failed += 1
            print(f"{i:2d}. ✗ 錯誤: {str(e)}")
            print(f"    標題: {title}")
            print()
    
    total = len(test_cases)
    print(f"測試完成！通過: {total - failed}/{total}, 失敗: {failed}/{total}")
    return failed == 0

if __name__ == "__main__":
    test_split_chinese_english()

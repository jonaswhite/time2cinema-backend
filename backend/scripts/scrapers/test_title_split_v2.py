import re

def split_chinese_english(title):
    """
    將包含中英文的標題分割成中文標題和英文標題
    
    Args:
        title (str): 原始標題字串
        
    Returns:
        tuple: (chinese_title, english_title)
    """
    # 定義正則表達式來匹配英文部分
    # 英文部分通常由大小寫字母、數字、空格、標點符號和特殊字符（如!?.,:;'"-）組成
    # 使用更精確的模式來匹配英文部分
    english_pattern = r'[A-Za-z][A-Za-z0-9\s!?.,:;\'"\-&+()\[\]{}]*$'
    
    # 處理特殊情況：數字在中文和英文之間（如"海洋奇緣2 Moana 2"）
    # 先檢查是否有這種模式：中文字+數字+空格+英文字母
    special_case = re.search(r'([\u4e00-\u9fff：]+[0-9]+)\s+([A-Za-z].*)', title)
    if special_case:
        chinese_part = special_case.group(1)
        english_part = special_case.group(2)
        return chinese_part.strip(), english_part.strip()
    
    # 處理包含中文標點符號的標題
    if '：' in title:
        parts = title.split('：', 1)
        if len(parts) == 2 and any('\u4e00' <= c <= '\u9fff' for c in parts[0]):
            # 檢查冒號後面的部分是否包含英文
            if any(c.isalpha() for c in parts[1] if c.isalnum()):
                # 如果冒號後面有英文，則檢查是否還有其他英文部分
                eng_parts = re.findall(r'[A-Za-z][A-Za-z0-9\s!?.,:;\'"\-&+()\[\]{}]*', parts[1])
                if eng_parts:
                    # 找到最後一個英文部分
                    last_eng = eng_parts[-1].strip()
                    # 找到最後一個英文部分的開始位置
                    last_eng_start = parts[1].rfind(last_eng)
                    # 分割中英文
                    chinese_part = parts[0] + '：' + parts[1][:last_eng_start].strip()
                    english_part = parts[1][last_eng_start:].strip()
                    return chinese_part, english_part
                return parts[0].strip(), parts[1].strip()
    
    # 嘗試找到英文部分
    match = re.search(english_pattern, title)
    
    if not match:
        # 如果沒有找到英文部分，整個標題都是中文
        return title.strip(), ""
    
    # 獲取英文部分的起始位置
    eng_start = match.start()
    
    # 獲取中文部分（英文部分之前的所有內容）
    chinese_part = title[:eng_start].strip()
    
    # 獲取英文部分
    english_part = match.group(0).strip()
    
    # 處理特殊情況：如果中文部分為空，但標題包含中文，則需要重新分割
    if not chinese_part and any('\u4e00' <= c <= '\u9fff' for c in title):
        # 找到第一個中文字符的位置
        first_chinese = next((i for i, c in enumerate(title) if '\u4e00' <= c <= '\u9fff'), -1)
        if first_chinese >= 0:
            # 找到最後一個中文字符的位置
            last_chinese = max(i for i, c in enumerate(title) if '\u4e00' <= c <= '\u9fff')
            # 找到最後一個中文字符後的第一個英文字母
            first_eng = next((i for i, c in enumerate(title[last_chinese+1:], last_chinese+1) 
                            if 'A' <= c <= 'Z' or 'a' <= c <= 'z'), len(title))
            
            chinese_part = title[:first_eng].strip()
            english_part = title[first_eng:].strip()
    
    # 處理數字後接英文字母的情況（如 2D）
    if chinese_part and chinese_part[-1].isdigit() and english_part and english_part[0].isalpha():
        # 檢查數字是否應該屬於英文部分（如"海洋奇緣2 Moana"中的2）
        if not any('\u4e00' <= c <= '\u9fff' for c in chinese_part[-3:]):
            # 將數字移到英文部分
            english_part = chinese_part[-1] + english_part
            chinese_part = chinese_part[:-1].strip()
    
    return chinese_part, english_part

def test_split_chinese_english():
    test_cases = [
        {
            "input": "絕命終結站 血脈 Final Destination: Bloodlines",
            "expected": ("絕命終結站 血脈", "Final Destination: Bloodlines")
        },
        {
            "input": "劇場版 世界計畫 Colorful Stage! The Movie: A Miku Who Can't Sing",
            "expected": ("劇場版 世界計畫", "Colorful Stage! The Movie: A Miku Who Can't Sing")
        },
        {
            "input": "銀魂劇場版2D 金魂篇 Gintama On Theatre 2D Kintama-hen",
            "expected": ("銀魂劇場版2D 金魂篇", "Gintama On Theatre 2D Kintama-hen")
        },
        {
            "input": "海洋奇緣2 Moana 2",
            "expected": ("海洋奇緣2", "Moana 2")
        },
        {
            "input": "變形金剛：萬獸崛起3 Transformers: Rise of the Beasts 3",
            "expected": ("變形金剛：萬獸崛起3", "Transformers: Rise of the Beasts 3")
        },
        {
            "input": "美國隊長：無畏新世界 Captain America: Brave New World",
            "expected": ("美國隊長：無畏新世界", "Captain America: Brave New World")
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        result = split_chinese_english(test_case["input"])
        expected = test_case["expected"]
        print(f"Test Case {i}:")
        print(f"  Input:    {test_case['input']}")
        print(f"  Expected: chinese='{expected[0]}', english='{expected[1]}'")
        print(f"  Actual:   chinese='{result[0]}', english='{result[1]}'")
        print(f"  {'PASS' if result == expected else 'FAIL'}")
        print()

if __name__ == "__main__":
    test_split_chinese_english()

import re

def test_split(title, expected_ch, expected_en):
    # 模擬 original_title 為 None 的情況
    ch, en = split_chinese_english(title)
    print(f'輸入: {title}')
    print(f'預期中: {expected_ch} | {expected_en}')
    print(f'實際: {ch} | {en}')
    print('-' * 50)

def split_chinese_english(text, original_title=None):
    # 如果已經有原始英文標題，直接使用
    if original_title and original_title.strip() and original_title.strip() != text.strip():
        chinese = text.replace(original_title, '').strip()
        return chinese, original_title
    
    # 使用正則表達式找到中英文分隔點
    import re
    
    # 0. 處理特殊情況：完全沒有中文字符
    if not any('\u4e00' <= char <= '\u9fff' for char in text):
        return '', text.strip()
    
    # 1. 處理「中文 英文」或「中文 英文 中文」的情況
    # 找到最後一個中文字後面的英文部分
    chinese_chars = re.findall(r'[一-鿿]', text)
    if chinese_chars:
        # 找到最後一個中文字的位置
        last_chinese_pos = text.rindex(chinese_chars[-1])
        
        # 從最後一個中文字開始向右查找英文部分
        english_start = last_chinese_pos + 1
        while english_start < len(text):
            # 如果找到英文單詞，則開始分割
            if re.search(r'\b[a-zA-Z]{2,}\b', text[english_start:]):
                # 往左找標點符號作為分割點
                for i in range(english_start, last_chinese_pos, -1):
                    if text[i] in '：: ':
                        chinese_part = text[:i].strip()
                        english_part = text[i+1:].strip()
                        if any('\u4e00' <= char <= '\u9fff' for char in chinese_part):
                            return chinese_part, english_part
                # 如果沒有找到合適的標點符號，則優先考慮完整的中文片名
                # 從右向左查找第一個中文字的位置
                first_chinese_pos = text.rfind(chinese_chars[0])
                
                # 檢查從第一個中文字開始到最後一個中文字之間是否有空格
                if ' ' in text[first_chinese_pos:last_chinese_pos]:
                    # 如果有空格，則在空格處分割
                    chinese_part = text[:text.rindex(' ', first_chinese_pos, last_chinese_pos)].strip()
                    english_part = text[text.rindex(' ', first_chinese_pos, last_chinese_pos):].strip()
                else:
                    # 如果沒有空格，則整個作為中文片名
                    chinese_part = text[:last_chinese_pos+1].strip()
                    english_part = text[last_chinese_pos+1:].strip()
                
                if any('\u4e00' <= char <= '\u9fff' for char in chinese_part):
                    return chinese_part, english_part
            english_start += 1
    
    # 2. 嘗試匹配「中文 數字+字母」模式（如「銀魂劇場版2D」）
    match = re.search(r'^(.+?)(\d+[a-zA-Z]\S*)$', text)
    if match:
        chinese_part = match.group(1).strip()
        english_part = match.group(2).strip()
        if any('\u4e00' <= char <= '\u9fff' for char in chinese_part):
            return chinese_part, english_part
    
    # 3. 嘗試匹配「中文 英文」模式，中間有標點
    match = re.search(r'^(.+?)[\s\-:：]+([a-zA-Z].*)$', text)
    if match:
        chinese_part = match.group(1).strip()
        english_part = match.group(2).strip()
        if any('\u4e00' <= char <= '\u9fff' for char in chinese_part):
            return chinese_part, english_part
    
    # 4. 如果以上都不匹配，但有中文字符，則整個作為中文
    return text.strip(), ''

# 測試案例
test_cases = [
    ("絕命終結站 血脈 Final Destination: Bloodlines", "絕命終結站 血脈", "Final Destination: Bloodlines"),
    ("劇場版 世界計畫 Colorful Stage! The Movie: A Miku Who Can't Sing", "劇場版 世界計畫", "Colorful Stage! The Movie: A Miku Who Can't Sing"),
    ("銀魂劇場版2D 金魂篇 Gintama On Theatre 2D Kintama-hen", "銀魂劇場版2D 金魂篇", "Gintama On Theatre 2D Kintama-hen"),
    ("與夢前行 宮﨑駿 Hayao Miyazaki and the Heron", "與夢前行 宮﨑駿", "Hayao Miyazaki and the Heron"),
    ("Final Destination: Bloodlines", "", "Final Destination: Bloodlines"),
    ("絕命終結站", "絕命終結站", ""),
]

for title, exp_ch, exp_en in test_cases:
    test_split(title, exp_ch, exp_en)

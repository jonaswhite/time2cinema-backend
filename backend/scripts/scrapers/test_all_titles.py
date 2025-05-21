import csv
import os
from test_title_split_v2 import split_chinese_english

def analyze_titles(csv_file_path, output_file=None):
    """分析 CSV 檔案中的所有標題，並輸出分割結果"""
    titles = []
    
    # 讀取 CSV 檔案
    with open(csv_file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            titles.append(row['full_title'])
    
    # 分析每個標題
    results = []
    for title in titles:
        chinese, english = split_chinese_english(title)
        results.append({
            'original': title,
            'chinese': chinese,
            'english': english,
            'has_chinese': any('\u4e00' <= c <= '\u9fff' for c in title),
            'has_english': any(('A' <= c <= 'Z' or 'a' <= c <= 'z') for c in title)
        })
    
    # 輸出結果
    print(f"總共處理了 {len(results)} 個標題")
    print("-" * 80)
    
    # 輸出有問題的標題
    problematic = [r for r in results if (r['has_chinese'] and r['has_english'] and (not r['chinese'] or not r['english']))]
    if problematic:
        print(f"找到 {len(problematic)} 個可能的分割問題：")
        for i, r in enumerate(problematic, 1):
            print(f"{i}. 原始: {r['original']}")
            print(f"   中文: {r['chinese']}")
            print(f"   英文: {r['english']}")
            print()
    else:
        print("所有標題都成功分割！")
    
    # 輸出一些隨機樣本
    import random
    print("\n隨機樣本：")
    for r in random.sample(results, min(10, len(results))):
        print(f"原始: {r['original']}")
        print(f"中文: {r['chinese']}")
        print(f"英文: {r['english']}")
        print()
    
    # 如果需要，將結果寫入檔案
    if output_file:
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['original', 'chinese', 'english'])
            writer.writeheader()
            for r in results:
                writer.writerow({
                    'original': r['original'],
                    'chinese': r['chinese'],
                    'english': r['english']
                })
        print(f"\n結果已保存到 {output_file}")

if __name__ == "__main__":
    # 使用最新的 CSV 檔案
    csv_dir = os.path.join(os.path.dirname(__file__), 'output')
    csv_files = [f for f in os.listdir(csv_dir) if f.startswith('atmovies_movies_') and f.endswith('.csv')]
    latest_csv = max(csv_files, key=lambda x: os.path.getmtime(os.path.join(csv_dir, x)))
    csv_path = os.path.join(csv_dir, latest_csv)
    
    print(f"正在分析檔案: {csv_path}")
    analyze_titles(csv_path, os.path.join(csv_dir, 'title_analysis_results.csv'))

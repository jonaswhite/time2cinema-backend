import os
import sys
import csv
import sys
from pathlib import Path
from typing import List, Dict, Tuple
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# 添加專案根目錄到 Python 路徑
project_root = Path(__file__).parent.parent.parent.parent
sys.path.append(str(project_root))

# 現在可以導入 title_utils
from backend.scripts.scrapers.title_utils import split_chinese_english

# 載入環境變數
load_dotenv()

def get_db_connection():
    """建立資料庫連線"""
    # 從環境變數或直接使用硬編碼的連接字串
    db_url = os.getenv('DATABASE_URL', 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db')
    return create_engine(db_url)

def fetch_all_movie_titles() -> List[Dict]:
    """從資料庫中獲取所有電影的 full_title"""
    engine = get_db_connection()
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, full_title, chinese_title, english_title, release_date 
            FROM movies 
            ORDER BY id
        """))
        return [dict(row) for row in result.mappings()]

def analyze_titles():
    """分析所有電影標題並輸出結果"""
    # 獲取所有電影標題
    movies = fetch_all_movie_titles()
    
    if not movies:
        print("沒有找到任何電影資料")
        return
    
    # 建立輸出目錄（如果不存在）
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    os.makedirs(output_dir, exist_ok=True)
    
    output_file = os.path.join(output_dir, 'movie_title_analysis.csv')
    
    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = [
            'id', 
            'full_title', 
            'chinese_title', 
            'english_title', 
            'release_date',
            'parsed_chinese', 
            'parsed_english',
            'notes'
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for movie in movies:
            full_title = movie['full_title'] or ''
            chinese, english = split_chinese_english(full_title)
            
            # 添加備註
            notes = []
            if not chinese and not english:
                notes.append("無法解析標題")
            elif not chinese and english:
                notes.append("可能是純英文標題")
            elif chinese and not english:
                notes.append("可能是純中文標題")
                
            # 檢查與現有欄位的差異
            if chinese and movie['chinese_title'] and chinese != movie['chinese_title']:
                notes.append(f"與 chinese_title 不同: {movie['chinese_title']}")
                
            if english and movie['english_title'] and english != movie['english_title']:
                notes.append(f"與 english_title 不同: {movie['english_title']}")
            
            writer.writerow({
                'id': movie['id'],
                'full_title': full_title,
                'chinese_title': movie['chinese_title'],
                'english_title': movie['english_title'],
                'release_date': movie['release_date'],
                'parsed_chinese': chinese,
                'parsed_english': english,
                'notes': ' | '.join(notes) if notes else ''
            })
    
    print(f"分析完成！結果已保存至: {output_file}")
    print(f"總共分析了 {len(movies)} 部電影的標題")

if __name__ == "__main__":
    analyze_titles()

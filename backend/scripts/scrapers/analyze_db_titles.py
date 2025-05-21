#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import sys
from test_title_split_v2 import split_chinese_english

# 設置默認編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# 資料庫連接參數
DB_PARAMS = {
    'dbname': 'time2cinema_db',
    'user': 'time2cinema_db_user',
    'password': 'wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX',
    'host': 'dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com',
    'port': '5432'
}

def get_all_movie_titles():
    """從資料庫中獲取所有電影的 full_title"""
    conn = None
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # 查詢所有電影的 full_title
        query = """
        SELECT id, atmovies_id, full_title, chinese_title, english_title, release_date
        FROM movies
        ORDER BY id
        """
        
        cursor.execute(query)
        movies = cursor.fetchall()
        return movies
        
    except Exception as e:
        print(f"查詢資料庫時出錯: {e}")
        return []
    finally:
        if conn:
            conn.close()

def update_movie_titles(movie_id, chinese_title, english_title):
    """更新電影的中英文標題"""
    conn = None
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cursor = conn.cursor()
        
        # 更新電影的中英文標題
        query = """
        UPDATE movies
        SET chinese_title = %s,
            english_title = %s,
            updated_at = NOW()
        WHERE id = %s
        """
        
        cursor.execute(query, (chinese_title, english_title, movie_id))
        conn.commit()
        print(f"已更新電影 ID {movie_id} 的標題")
        
    except Exception as e:
        print(f"更新電影 ID {movie_id} 時出錯: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

def main():
    # 獲取所有電影
    movies = get_all_movie_titles()
    
    if not movies:
        print("沒有找到任何電影")
        return
    
    print(f"總共找到 {len(movies)} 部電影")
    print("=" * 120)
    
    # 分析每部電影的標題
    for i, movie in enumerate(movies, 1):
        full_title = movie['full_title']
        
        # 使用新的分割函數
        chinese, english = split_chinese_english(full_title)
        
        print(f"{i}. ID: {movie['id']} (atmovies_id: {movie['atmovies_id']})")
        print(f"   完整標題: {full_title}")
        print(f"   解析結果: 中文='{chinese}', 英文='{english}'")
        print(f"   當前資料: 中文='{movie['chinese_title']}', 英文='{movie['english_title']}'")
        if movie['release_date']:
            print(f"   上映日期: {movie['release_date'].strftime('%Y-%m-%d')}")
        print("-" * 120)
        
        # 詢問是否更新
        update = input("是否更新此筆資料？(y/n, 預設 n): ").strip().lower()
        if update == 'y':
            update_movie_titles(movie['id'], chinese, english)
        print()

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from tabulate import tabulate
import datetime

# 設置默認編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 資料庫連接資訊
DB_URL = "postgresql://postgres.bnfplxbaqnmwpjvjwqzx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

def connect_to_db():
    """連接到資料庫"""
    try:
        # 建立資料庫連接，並設定編碼為 UTF-8
        conn = psycopg2.connect(
            DB_URL,
            sslmode='require',
            client_encoding='UTF8'  # 設定客戶端編碼為 UTF-8
        )
        conn.autocommit = False
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # 確保資料庫連接的編碼為 UTF-8
        cursor.execute("SET client_encoding TO 'UTF8'")
        conn.commit()
        
        print("成功連接到資料庫")
        return conn, cursor
    except Exception as e:
        print(f"連接資料庫時出錯: {e}")
        return None, None

def get_movies_data(cursor, limit=100):
    """獲取電影資料"""
    try:
        # 查詢電影資料，按照上映日期降序排序
        cursor.execute("""
            SELECT 
                id, 
                display_title, 
                original_title, 
                atmovies_id, 
                runtime, 
                release_date,
                source,
                created_at,
                updated_at
            FROM movies 
            WHERE source = 'atmovies'
            ORDER BY release_date DESC
            LIMIT %s
        """, (limit,))
        
        movies = cursor.fetchall()
        print(f"共找到 {len(movies)} 部電影")
        return movies
    except Exception as e:
        print(f"查詢電影資料時出錯: {e}")
        return []

def format_movie_data(movies):
    """格式化電影資料以便於閱讀"""
    # 準備表格數據
    table_data = []
    for movie in movies:
        # 格式化日期
        release_date = movie['release_date'].strftime('%Y-%m-%d') if movie['release_date'] else 'N/A'
        created_at = movie['created_at'].strftime('%Y-%m-%d %H:%M') if movie['created_at'] else 'N/A'
        updated_at = movie['updated_at'].strftime('%Y-%m-%d %H:%M') if movie['updated_at'] else 'N/A'
        
        # 添加到表格數據
        table_data.append([
            movie['id'],
            movie['display_title'],
            movie['original_title'] or 'N/A',
            movie['atmovies_id'],
            f"{movie['runtime']} 分鐘" if movie['runtime'] else 'N/A',
            release_date,
            movie['source'],
            created_at,
            updated_at
        ])
    
    # 表格標題
    headers = [
        "ID", "標題", "原始標題", "ATMovies ID", 
        "片長", "上映日期", "來源", "創建時間", "更新時間"
    ]
    
    # 生成表格
    return tabulate(table_data, headers=headers, tablefmt="grid")

def main():
    """主函數"""
    conn, cursor = connect_to_db()
    if not conn or not cursor:
        return
    
    try:
        # 獲取電影資料
        movies = get_movies_data(cursor)
        
        # 格式化並顯示電影資料
        if movies:
            formatted_data = format_movie_data(movies)
            print("\n電影資料:")
            print(formatted_data)
        else:
            print("沒有找到電影資料")
    finally:
        # 關閉資源
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            print("資料庫連接已關閉")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import csv
import requests
from bs4 import BeautifulSoup
import re

# 設定輸出路徑
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
OUTPUT_CSV = os.path.join(PROJECT_ROOT, 'backend', 'cache', 'cinemas.csv')
OUTPUT_JSON = os.path.join(PROJECT_ROOT, 'backend', 'cache', 'cinemas.json')

# 維基百科台灣電影院列表頁面URL
WIKI_URL = 'https://zh.wikipedia.org/zh-tw/台灣電影院列表'

def scrape_wiki_cinemas():
    """從維基百科爬取台灣電影院列表"""
    print("正在從維基百科爬取台灣電影院列表...")
    
    # 發送請求獲取頁面內容
    response = requests.get(WIKI_URL)
    response.encoding = 'utf-8'  # 確保正確編碼
    
    # 解析HTML
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 找到所有表格
    tables = soup.find_all('table', {'class': 'wikitable'})
    
    # 儲存所有電影院資訊
    cinemas = []
    cinema_id = 1
    
    # 遍歷每個表格
    for table in tables:
        # 找到表格所在的區域（通常是縣市）
        current_city = ""
        current_region = ""
        
        # 嘗試找到表格前的標題（通常是縣市名稱）
        prev_h4 = table.find_previous('h4')
        if prev_h4:
            current_city = prev_h4.get_text().replace("編輯", "").strip()
            print(f"處理區域: {current_city}")
        
        # 嘗試找到更大的區域（北部、中部等）
        prev_h3 = table.find_previous('h3')
        if prev_h3:
            current_region = prev_h3.get_text().replace("編輯", "").strip()
        
        # 獲取表格標題行
        headers = []
        header_row = table.find('tr')
        if header_row:
            for th in header_row.find_all('th'):
                headers.append(th.get_text().strip())
            
            print(f"表格欄位: {headers}")
        
        # 找出名稱、類型、地址等欄位的索引
        name_idx = -1
        type_idx = -1
        address_idx = -1
        group_idx = -1
        special_idx = -1
        
        for i, header in enumerate(headers):
            if "名稱" in header:
                name_idx = i
            elif "類型" in header:
                type_idx = i
            elif "地址" in header:
                address_idx = i
            elif "集團" in header:
                group_idx = i
            elif "特殊影廳" in header:
                special_idx = i
        
        # 處理表格內容行
        rows = table.find_all('tr')[1:]  # 跳過標題行
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) <= 1:  # 跳過空行或只有一個單元格的行
                continue
            
            try:
                # 獲取電影院資訊
                name = cells[name_idx].get_text().strip() if name_idx >= 0 and name_idx < len(cells) else ""
                cinema_type = cells[type_idx].get_text().strip() if type_idx >= 0 and type_idx < len(cells) else ""
                address = cells[address_idx].get_text().strip() if address_idx >= 0 and address_idx < len(cells) else ""
                group = cells[group_idx].get_text().strip() if group_idx >= 0 and group_idx < len(cells) else ""
                special = cells[special_idx].get_text().strip() if special_idx >= 0 and special_idx < len(cells) else ""
                
                # 解析地址中的行政區
                district = ""
                if address:
                    district_match = re.search(r'([^市縣]+區|[^市縣]+鎮|[^市縣]+鄉)', address)
                    if district_match:
                        district = district_match.group(1)
                
                # 建立電影院資料
                if name:  # 確保有名稱才加入列表
                    cinema = {
                        'id': f"cinema_{cinema_id}",
                        'name': name,
                        'type': cinema_type,
                        'address': address,
                        'city': current_city,
                        'district': district,
                        'special': special
                    }
                    
                    cinemas.append(cinema)
                    cinema_id += 1
                    print(f"找到電影院: {name}")
            except Exception as e:
                print(f"解析電影院資料時出錯: {e}")
    
    print(f"從維基百科爬取到 {len(cinemas)} 家電影院")
    return cinemas

def save_to_csv(cinemas, output_path):
    """將電影院資料保存為CSV檔案"""
    print(f"正在保存資料到 {output_path}...")
    
    # 確保目錄存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 寫入CSV檔案
    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        # 定義CSV欄位
        fieldnames = ['id', 'name', 'type', 'address', 'city', 'district', 'special']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        
        # 寫入標題行
        writer.writeheader()
        
        # 寫入資料
        for cinema in cinemas:
            writer.writerow(cinema)
    
    print(f"資料已保存到 {output_path}")

def save_to_json(cinemas, output_path):
    """將電影院資料保存為JSON檔案"""
    import json
    print(f"正在保存資料到 {output_path}...")
    
    # 確保目錄存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 寫入JSON檔案
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(cinemas, f, ensure_ascii=False, indent=2)
    
    print(f"資料已保存到 {output_path}")

def main():
    # 從維基百科爬取電影院資訊
    cinemas = scrape_wiki_cinemas()
    
    # 保存為CSV檔案
    save_to_csv(cinemas, OUTPUT_CSV)
    
    # 同時保存為JSON檔案（方便後續使用）
    save_to_json(cinemas, OUTPUT_JSON)

if __name__ == '__main__':
    main()

#!/bin/bash

# 設定環境變數
export PATH=/usr/local/bin:$PATH
export NODE_PATH=/usr/local/lib/node_modules

# 設定工作目錄
cd "$(dirname "$0")"

# 記錄執行時間
echo "===== 開始執行更新 $(date) =====" >> update_cron.log

# 執行更新腳本
node "$(dirname "$0")/update_database.js" >> update_cron.log 2>&1

# 顯示執行結果
echo "更新腳本執行完成，請查看 update_cron.log 檔案了解詳細結果"

# 記錄結束時間
echo "===== 更新完成 $(date) =====" >> update_cron.log
echo "" >> update_cron.log

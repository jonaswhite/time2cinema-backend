#!/bin/bash

# 設定專案路徑
PROJECT_PATH="/Users/jonaswhite/CascadeProjects/Time2Cinema"
UPDATE_SCRIPT="$PROJECT_PATH/backend/scripts/utils/update_cron.sh"

# 確保腳本有執行權限
chmod +x "$UPDATE_SCRIPT"

# 建立臨時 crontab 檔案
TEMP_CRONTAB=$(mktemp)

# 獲取目前的 crontab 設定
crontab -l > "$TEMP_CRONTAB" 2>/dev/null || echo "# 建立新的 crontab" > "$TEMP_CRONTAB"

# 檢查是否已經有相同的 cron job
if ! grep -q "$UPDATE_SCRIPT" "$TEMP_CRONTAB"; then
  # 新增每天凌晨 2 點執行更新的 cron job
  echo "# 每天凌晨 2 點執行票房資料更新" >> "$TEMP_CRONTAB"
  echo "0 2 * * * $UPDATE_SCRIPT >> $PROJECT_PATH/backend/scripts/utils/cron_execution.log 2>&1" >> "$TEMP_CRONTAB"
  
  # 安裝新的 crontab
  crontab "$TEMP_CRONTAB"
  echo "已設定每天凌晨 2 點自動執行票房資料更新"
else
  echo "票房資料更新的 cron job 已經存在"
fi

# 清理臨時檔案
rm "$TEMP_CRONTAB"

echo "crontab 設定完成！"

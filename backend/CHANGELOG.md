# 更新日誌

## 2025-05-09

### 新增功能
- 為 boxoffice 表添加了 release_date（上映日期）欄位
- 創建了四個測試腳本來檢查 boxoffice 相關功能：
  - check_boxoffice_scraper_data.js - 檢查爬蟲資料
  - check_boxoffice_importer_data.js - 檢查匯入資料
  - check_boxoffice_db.js - 檢查資料庫
  - check_boxoffice_api_data.js - 檢查 API 資料
- 修改了匯入腳本，使其能夠正確處理上映日期資料（包含「上映日期」和「上映日」欄位）
- 更新了 API 路由，使其返回上映日期資訊
- 創建了線上資料庫匯入腳本 import_boxoffice_remote.js
- 創建了線上資料庫和 API 檢查腳本

### 改進
- 票房資料現在包含上映日期資訊，覆蓋率達到 100%
- API 返回的資料更加完整，包含上映日期、總票房等資訊

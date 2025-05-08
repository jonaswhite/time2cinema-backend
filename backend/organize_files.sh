#!/bin/bash

# 建立目錄結構
mkdir -p archive/scripts archive/src/api
mkdir -p scripts/scrapers scripts/importers scripts/utils

# 將不再使用的檔案移動到 archive 目錄
mv src/api/boxoffice.ts archive/src/api/
mv scripts/atmovies_scraper_v2.py archive/scripts/

# 將爬蟲腳本移動到 scrapers 目錄
mv scripts/atmovies_scraper_v3.py scripts/scrapers/
mv scripts/boxoffice_scraper.js scripts/scrapers/
mv scripts/wiki_cinema_scraper.py scripts/scrapers/
mv scripts/add_cinema_geocodes.py scripts/scrapers/

# 將匯入腳本移動到 importers 目錄
mv scripts/import_boxoffice.js scripts/importers/
mv scripts/import_cinemas.js scripts/importers/
mv scripts/import_showtimes.js scripts/importers/

# 將工具腳本移動到 utils 目錄
mv scripts/create_indexes.js scripts/utils/
mv scripts/update_database.js scripts/utils/
mv scripts/update_cron.sh scripts/utils/

# 更新 update_database.js 中的路徑引用
sed -i '' 's|scripts/atmovies_scraper_v3.py|scripts/scrapers/atmovies_scraper_v3.py|g' scripts/utils/update_database.js
sed -i '' 's|scripts/boxoffice_scraper.js|scripts/scrapers/boxoffice_scraper.js|g' scripts/utils/update_database.js
sed -i '' 's|scripts/import_showtimes.js|scripts/importers/import_showtimes.js|g' scripts/utils/update_database.js
sed -i '' 's|scripts/import_boxoffice.js|scripts/importers/import_boxoffice.js|g' scripts/utils/update_database.js

# 更新 crontab_config.txt 中的路徑引用
sed -i '' 's|scripts/update_cron.sh|scripts/utils/update_cron.sh|g' scripts/crontab_config.txt
sed -i '' 's|scripts/import_boxoffice.js|scripts/importers/import_boxoffice.js|g' scripts/crontab_config.txt

echo "檔案整理完成！"

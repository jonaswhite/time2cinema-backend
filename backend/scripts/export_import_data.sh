#!/bin/bash

# 導出線上資料庫的 movies 表到 CSV 文件
PGPASSWORD=wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX psql -h dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com -U time2cinema_db_user -d time2cinema_db -c "\COPY (SELECT * FROM movies) TO '/tmp/online_movies.csv' WITH (FORMAT csv, HEADER true);"

# 清空本地資料庫的 movies 表
psql -h localhost -U postgres -d jonaswhite -c "TRUNCATE TABLE movies CASCADE;"

# 將 CSV 文件導入本地資料庫
psql -h localhost -U postgres -d jonaswhite -c "\COPY movies FROM '/tmp/online_movies.csv' WITH (FORMAT csv, HEADER true);"

# 確認數據已導入
psql -h localhost -U postgres -d jonaswhite -c "SELECT COUNT(*) FROM movies;"

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://time2cinema_db_user:wUsukaH2Kiy8fIejuOqsk5yjn4FBb0RX@dpg-d0e9e749c44c73co4lsg-a.singapore-postgres.render.com/time2cinema_db?ssl=true',
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkDuplicates() {
  const client = await pool.connect();
  try {
    // 檢查重複場次
    const res = await client.query(`
      SELECT cinema_id, movie_id, date, time, COUNT(*) as count
      FROM showtimes
      GROUP BY cinema_id, movie_id, date, time
      HAVING COUNT(*) > 1
      ORDER BY count DESC;
    `);

    console.log('重複場次統計:');
    console.log('========================================');
    console.log(`找到 ${res.rows.length} 組重複的場次`);
    
    if (res.rows.length > 0) {
      console.log('\n重複場次明細:');
      console.table(res.rows);

      // 計算總共多出的記錄數
      const totalDuplicates = res.rows.reduce((sum, row) => sum + (row.count - 1), 0);
      console.log(`\n總共需要刪除 ${totalDuplicates} 筆重複記錄`);

      // 詢問是否要刪除重複記錄
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question('\n是否要刪除重複的場次？(y/n) ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          console.log('\n正在刪除重複場次...');
          
          // 刪除重複的場次，只保留每個場次的一條記錄
          const deleteRes = await client.query(`
            DELETE FROM showtimes
            WHERE id NOT IN (
              SELECT MIN(id)
              FROM showtimes
              GROUP BY cinema_id, movie_id, date, time
            )
            RETURNING id;
          `);
          
          console.log(`✅ 已刪除 ${deleteRes.rowCount} 筆重複場次`);
        } else {
          console.log('\n已取消刪除操作');
        }
        
        readline.close();
        await client.release();
        await pool.end();
      });
    } else {
      console.log('沒有找到重複的場次');
      await client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('執行查詢時出錯:', error);
    await client.release();
    await pool.end();
  }
}

// 執行檢查
checkDuplicates();

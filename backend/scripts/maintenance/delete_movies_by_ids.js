require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const MOVIE_IDS_TO_DELETE = [3467, 3466, 3465]; // IDs from the user's screenshot

const RELATED_TABLES = [
  { tableName: 'showtimes', foreignKey: 'movie_id' },
  { tableName: 'boxoffice', foreignKey: 'movie_id' },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function deleteMoviesByIds(isExecuteMode) {
  const client = await pool.connect();
  let succeededCount = 0;
  let failedCount = 0;

  console.log(`Targeting movie IDs: ${MOVIE_IDS_TO_DELETE.join(', ')} for deletion.`);
  if (isExecuteMode) {
    console.warn('⚠️ Running in EXECUTE mode. Records will be permanently deleted!');
  } else {
    console.log('ℹ️ Running in DRY-RUN mode. No records will be deleted.');
  }

  for (const movieId of MOVIE_IDS_TO_DELETE) {
    try {
      const movieRes = await client.query('SELECT id, chinese_title, full_title FROM movies WHERE id = $1', [movieId]);
      if (movieRes.rows.length === 0) {
        console.log(`🤷 Movie with ID ${movieId} not found. Skipping.`);
        continue;
      }
      const movie = movieRes.rows[0];
      console.log(`
Processing movie: ID=${movie.id}, Title='${movie.full_title || movie.chinese_title}'`);

      if (!isExecuteMode) {
        for (const tbl of RELATED_TABLES) {
          const countRes = await client.query(`SELECT COUNT(*) FROM ${tbl.tableName} WHERE ${tbl.foreignKey} = $1`, [movie.id]);
          console.log(`  DRY-RUN: Would delete ${countRes.rows[0].count} records from ${tbl.tableName}`);
        }
        console.log(`  DRY-RUN: Would delete movie record with ID ${movie.id}`);
        succeededCount++; // In dry-run, count as success if processed
        continue;
      }

      // Execute mode: Perform deletions within a transaction
      await client.query('BEGIN');
      console.log('  BEGIN transaction');

      for (const tbl of RELATED_TABLES) {
        const deleteRes = await client.query(`DELETE FROM ${tbl.tableName} WHERE ${tbl.foreignKey} = $1`, [movie.id]);
        console.log(`  DELETED ${deleteRes.rowCount} records from ${tbl.tableName}`);
      }

      const deleteMovieRes = await client.query('DELETE FROM movies WHERE id = $1', [movie.id]);
      if (deleteMovieRes.rowCount > 0) {
        console.log(`  DELETED movie record with ID ${movie.id}`);
      } else {
        console.warn(`  Movie with ID ${movie.id} was not found for deletion, though it was found earlier. This might indicate a concurrent modification.`);
      }
      
      await client.query('COMMIT');
      console.log('  COMMIT transaction');
      succeededCount++;

    } catch (error) {
      if (isExecuteMode) {
        await client.query('ROLLBACK');
        console.error('  ROLLBACK transaction due to error');
      }
      console.error(`❌ Error processing movie ID ${movieId}: ${error.message}`);
      console.error(error.stack);
      failedCount++;
    }
  }

  console.log(`
${isExecuteMode ? '✅ EXECUTION' : 'DRY-RUN'} COMPLETE.`);
  console.log(`Succeeded: ${succeededCount}, Failed: ${failedCount}`);
  client.release();
}

async function main() {
  const args = process.argv.slice(2);
  const isExecuteMode = args.includes('--execute');

  try {
    await deleteMoviesByIds(isExecuteMode);
  } catch (error) {
    console.error('🚨 An unexpected error occurred:', error);
  } finally {
    await pool.end();
  }
}

main();

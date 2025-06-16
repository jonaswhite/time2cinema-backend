require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { Client } = require('pg');
const path = require('path');

const RELATED_TABLES = [
  { tableName: 'showtimes', column: 'movie_id' },
  { tableName: 'boxoffice', column: 'movie_id' },
  // Add other tables here if they reference movies.id
];

const INVALID_ATMOVIES_ID_REGEX = '^[a-zA-Z]{4}[0-9]{8}$';

async function getInvalidMovies(client) {
  const query = {
    text: `
      SELECT id, atmovies_id, chinese_title, full_title, release_date
      FROM movies
      WHERE atmovies_id IS NULL OR atmovies_id !~ $1
      ORDER BY id;
    `,
    values: [INVALID_ATMOVIES_ID_REGEX],
  };
  try {
    const res = await client.query(query);
    return res.rows;
  } catch (err) {
    console.error('❌ Error fetching invalid movies:', err.message);
    throw err;
  }
}

async function deleteInvalidAtmoviesIdRecords(dryRun = true) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database.');

    const invalidMovies = await getInvalidMovies(client);

    if (invalidMovies.length === 0) {
      console.log('✅ No movies with invalid atmovies_id found.');
      return;
    }

    console.log(`ℹ️ Found ${invalidMovies.length} movies with invalid atmovies_id.`)

    if (dryRun) {
      console.log('\n🌵 DRY RUN MODE: Listing movies and related record counts. No actual deletions will be made.\n');
      for (const movie of invalidMovies) {
        console.log(`  Movie ID: ${movie.id}, Atmovies ID: '${movie.atmovies_id}', Title: '${movie.chinese_title || movie.full_title || 'N/A'}'`);
        for (const relatedTable of RELATED_TABLES) {
          const countQuery = {
            text: `SELECT COUNT(*) AS count FROM ${relatedTable.tableName} WHERE ${relatedTable.column} = $1`,
            values: [movie.id],
          };
          const countRes = await client.query(countQuery);
          console.log(`    - Found ${countRes.rows[0].count} records in ${relatedTable.tableName}`);
        }
      }
      console.log('\n🌵 DRY RUN COMPLETE. To delete these records, run with --execute flag.');
    } else {
      console.log('\n🔥 EXECUTE MODE: Proceeding with deletion of movies and related records!\n');
      let SucceededDeletions = 0;
      let FailedDeletions = 0;

      for (const movie of invalidMovies) {
        console.log(`  Processing Movie ID: ${movie.id}, Atmovies ID: '${movie.atmovies_id}', Title: '${movie.chinese_title || movie.full_title || 'N/A'}'`);
        try {
          await client.query('BEGIN');
          console.log('    TRANSACTION: BEGIN');

          for (const relatedTable of RELATED_TABLES) {
            const deleteRelatedQuery = {
              text: `DELETE FROM ${relatedTable.tableName} WHERE ${relatedTable.column} = $1`,
              values: [movie.id],
            };
            const deleteRelatedRes = await client.query(deleteRelatedQuery);
            console.log(`    - DELETED ${deleteRelatedRes.rowCount} records from ${relatedTable.tableName}`);
          }

          const deleteMovieQuery = {
            text: 'DELETE FROM movies WHERE id = $1',
            values: [movie.id],
          };
          const deleteMovieRes = await client.query(deleteMovieQuery);
          console.log(`    - DELETED ${deleteMovieRes.rowCount} record from movies table.`);

          await client.query('COMMIT');
          console.log('    TRANSACTION: COMMIT');
          SucceededDeletions++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`    ❌ Error processing movie ID ${movie.id}: ${err.message}`);
          console.log('    TRANSACTION: ROLLBACK');
          FailedDeletions++;
        }
      }
      console.log(`\n✅ EXECUTION COMPLETE. Succeeded: ${SucceededDeletions}, Failed: ${FailedDeletions}.`);
    }
  } catch (error) {
    console.error(`❌ An error occurred: ${error.message}`);
    console.error(error.stack);
  } finally {
    if (client && client._connected) {
      await client.end();
      console.log('🔚 Disconnected from database.');
    }
    console.log('🔚 Script finished.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const executeMode = args.includes('--execute');
  
  if (!executeMode) {
    console.log('ℹ️ Running in DRY RUN mode. No actual changes will be made.');
  } else {
    console.log('⚠️ Running in EXECUTE mode. Records will be permanently deleted!');
    // Add a small delay or a confirmation prompt in a real-world scenario for safety
  }

  await deleteInvalidAtmoviesIdRecords(!executeMode);
}

main().catch(err => {
  console.error('❌ Unhandled error in main execution:', err.message);
  console.error(err.stack);
  process.exit(1);
});

const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const CSV_FILE_PATH = '../../input/maintenance/duplication.csv';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MOVIE_CSV_PATH = path.resolve(__dirname, '../../input/maintenance/duplication.csv');

// Define which columns from the movies table should be considered for merging
// Prioritize non-null values, or values from a specific source if needed.
const MERGE_FIELDS_PRIORITY = [
  'atmovies_id',
  'chinese_title',
  'full_title',
  'original_title',
  'release_date',
  'runtime',
  'poster_url',
  'source' // Might want to be careful with this, or have specific logic
];

// Define tables and columns that reference movies.id
const RELATED_TABLES = [
  { tableName: 'showtimes', column: 'movie_id' },
  { tableName: 'boxoffice', column: 'movie_id' },
  // Add other tables here if they reference movies.id
];

async function readMarkedMovies() {
  const movies = [];
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(MOVIE_CSV_PATH)) {
      return reject(new Error(`CSV file not found at ${MOVIE_CSV_PATH}`));
    }
    fs.createReadStream(MOVIE_CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        // Convert id and master_id to numbers, handle empty master_id
        row.id = parseInt(row.id, 10);
        row.master_id = row.master_id ? parseInt(row.master_id, 10) : null;
        if (row.runtime === '' || row.runtime === null) {
            row.runtime = null;
        } else if (typeof row.runtime === 'string' && row.runtime.match(/^\d+$/)) {
            row.runtime = parseInt(row.runtime, 10);
        } else {
            // Potentially log a warning for unparseable runtimes
            row.runtime = null; 
        }
        movies.push(row);
      })
      .on('end', () => {
        console.log(`✅ Successfully read ${movies.length} records from ${MOVIE_CSV_PATH}`);
        resolve(movies);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

function groupMoviesByMasterId(allMoviesFromCsv) {
  const potentialGroups = {}; // Key: master_id, Value: { masterRecord: null, secondaryRecords: [] }

  // First pass: Collect all movies that are marked as secondaries (have a master_id)
  allMoviesFromCsv.forEach(movie => {
    if (movie.master_id) {
      if (!potentialGroups[movie.master_id]) {
        potentialGroups[movie.master_id] = { masterRecord: null, secondaryRecords: [] };
      }
      potentialGroups[movie.master_id].secondaryRecords.push(movie);
    }
  });

  const validGroups = {};
  // Second pass: For each potential group, find its master record from the full CSV list
  for (const masterIdStr in potentialGroups) {
    const masterId = parseInt(masterIdStr, 10);
    const groupCandidate = potentialGroups[masterIdStr];

    const masterRecord = allMoviesFromCsv.find(m => m.id === masterId);

    if (!masterRecord) {
      console.warn(`⚠️ Master record for ID ${masterId} (specified as master_id) not found in the CSV data. Skipping this group.`);
      continue;
    }

    // Ensure the found master record is not accidentally in its own list of secondaries
    const finalSecondaryRecords = groupCandidate.secondaryRecords.filter(sec => sec.id !== masterId);

    if (finalSecondaryRecords.length === 0) {
      // console.log(`ℹ️ Master ID ${masterId} has no distinct secondary records marked to be merged into it. Skipping.`);
      continue;
    }

    // A valid group for merging consists of the master record (first) and its distinct secondaries
    validGroups[masterIdStr] = [masterRecord, ...finalSecondaryRecords];
  }
  return validGroups;
}

async function mergeMovies(dryRun = true) {
  let client;
  try {
    const allMoviesFromCsv = await readMarkedMovies();
    const duplicateGroups = groupMoviesByMasterId(allMoviesFromCsv);

    if (Object.keys(duplicateGroups).length === 0) {
      console.log('ℹ️ No duplicate groups found to merge based on the CSV file.');
      return;
    }

    console.log(`Found ${Object.keys(duplicateGroups).length} groups to process for merging.`);

    client = await pool.connect();

    for (const masterIdStr in duplicateGroups) {
      const masterId = parseInt(masterIdStr, 10);
      const group = duplicateGroups[masterIdStr];
      const masterRecord = group.find(m => m.id === masterId);
      const secondaryRecords = group.filter(m => m.id !== masterId);

      console.log(`
--- Processing Group for Master ID: ${masterId} (${masterRecord.chinese_title || masterRecord.original_title || 'N/A'}) ---`);
      console.log(`  Master Record: ID ${masterRecord.id}`);
      secondaryRecords.forEach(sr => {
        console.log(`  Secondary Record: ID ${sr.id} (${sr.chinese_title || sr.original_title || 'N/A'})`);
      });

      try {
        if (!dryRun) {
          await client.query('BEGIN');
          console.log('  TRANSACTION: BEGIN');
        }

        // 1. Merge data into master record
        const mergedData = { ...masterRecord }; // Start with master's data
        let updateMasterSql = '';
        const updateMasterParams = [];
        let fieldUpdates = 0;

        for (const field of MERGE_FIELDS_PRIORITY) {
          if (mergedData[field] === null || mergedData[field] === undefined || mergedData[field] === '') {
            for (const secRecord of secondaryRecords) {
              if (secRecord[field] !== null && secRecord[field] !== undefined && secRecord[field] !== '') {
                let originalFieldValue = secRecord[field];
                let valueForSql = originalFieldValue;

                if (field === 'release_date') { // Apply special formatting for release_date
                  if (typeof originalFieldValue === 'string' && originalFieldValue.includes('GMT')) {
                    try {
                      const dateObj = new Date(originalFieldValue);
                      if (!isNaN(dateObj.getTime())) { // Check if date is valid
                        const year = dateObj.getFullYear();
                        const month = ('0' + (dateObj.getMonth() + 1)).slice(-2); // months are 0-indexed
                        const day = ('0' + dateObj.getDate()).slice(-2);
                        valueForSql = `${year}-${month}-${day}`;
                      } else {
                        console.warn(`  WARN: Could not parse date string '${originalFieldValue}' for release_date. Using original value.`);
                      }
                    } catch (e) {
                      console.warn(`  WARN: Error parsing date string '${originalFieldValue}' for release_date. Using original value. Error: ${e.message}`);
                    }
                  } else if (originalFieldValue instanceof Date) {
                    const year = originalFieldValue.getFullYear();
                    const month = ('0' + (originalFieldValue.getMonth() + 1)).slice(-2);
                    const day = ('0' + originalFieldValue.getDate()).slice(-2);
                    valueForSql = `${year}-${month}-${day}`;
                  }
                } else if (originalFieldValue instanceof Date) { // For other potential date/timestamp fields from MERGE_FIELDS_PRIORITY
                  valueForSql = originalFieldValue.toISOString();
                }
                
                console.log(`  MERGE_FIELD: Master ID ${masterId} field '${field}' is empty. Taking value ('${valueForSql}') from Secondary ID ${secRecord.id}.`);
                mergedData[field] = valueForSql; 
                if (updateMasterSql === '') {
                  updateMasterSql = 'UPDATE movies SET ';
                } else {
                  updateMasterSql += ', ';
                }
                fieldUpdates++;
                updateMasterSql += `${field} = $${fieldUpdates}`;
                updateMasterParams.push(valueForSql);
                break; 
              }
            }
          }
        }
        if (fieldUpdates > 0) {
          updateMasterSql += ` WHERE id = $${fieldUpdates + 1}`;
          updateMasterParams.push(masterId);
          console.log(`  SQL_MASTER_UPDATE: ${updateMasterSql}`, updateMasterParams);
          if (!dryRun) {
            await client.query(updateMasterSql, updateMasterParams);
            console.log(`  EXECUTED: Updated master record ${masterId}`);
          }
        } else {
          console.log('  INFO: Master record already has all prioritized fields or no data to merge from secondaries.');
        }

        // 2. Update foreign keys in related tables
        for (const secRecord of secondaryRecords) {
          for (const related of RELATED_TABLES) {
            if (related.tableName === 'showtimes') {
              // Pre-delete conflicting showtimes from the secondary record
              const findConflictingSecondaryShowtimesSql = `
                SELECT s2.id 
                FROM showtimes s2
                WHERE s2.movie_id = $1 AND EXISTS (
                    SELECT 1
                    FROM showtimes s1
                    WHERE s1.movie_id = $2
                    AND s1.cinema_id = s2.cinema_id
                    AND s1.date = s2.date
                    AND s1.time = s2.time
                )
              `;
              if (dryRun) {
                 console.log(`  DRY_RUN_SQL_FIND_CONFLICT_SHOWTIMES: (Would execute for secondary ${secRecord.id} against master ${masterId}) ${findConflictingSecondaryShowtimesSql.replace(/\s+/g, ' ').trim()}`, [secRecord.id, masterId]);
              } else {
                console.log(`  SQL_FIND_CONFLICT_SHOWTIMES: Finding conflicting showtimes for secondary ${secRecord.id} against master ${masterId}`);
                const conflictingShowtimesResult = await client.query(findConflictingSecondaryShowtimesSql, [secRecord.id, masterId]);

                if (conflictingShowtimesResult.rows.length > 0) {
                  const idsToDelete = conflictingShowtimesResult.rows.map(r => r.id);
                  const deleteSql = `DELETE FROM showtimes WHERE id = ANY($1::int[])`;
                  console.log(`  SQL_DELETE_CONFLICT_SHOWTIMES: ${deleteSql}`, [idsToDelete]);
                  const deleteResult = await client.query(deleteSql, [idsToDelete]);
                  console.log(`  EXECUTED: Deleted ${deleteResult.rowCount} conflicting showtimes from secondary movie ${secRecord.id} to prevent unique key violation.`);
                }
              }
            }

            // Now, update the foreign key for the current related table
            const updateFkSql = `UPDATE ${related.tableName} SET ${related.column} = $1 WHERE ${related.column} = $2`;
            console.log(`  SQL_FK_UPDATE: ${updateFkSql}`, [masterId, secRecord.id]);
            if (!dryRun) {
              const fkUpdateResult = await client.query(updateFkSql, [masterId, secRecord.id]);
              console.log(`  EXECUTED: Updated ${related.tableName} for secondary movie ${secRecord.id} (Rows affected: ${fkUpdateResult.rowCount})`);
            }
          }
        }

        if (!dryRun) {
          await client.query('COMMIT');
          console.log('  TRANSACTION: COMMIT');
        }

      } catch (groupError) {
        if (!dryRun && client) { // Ensure client is defined before rollback
          await client.query('ROLLBACK');
          console.error(`  TRANSACTION: ROLLBACK for group ${masterId} due to error:`, groupError.message);
        }
        // Re-throw the error to be caught by the outer catch block or to stop the script
        throw groupError; 
      }
    } // End of for...in loop for duplicateGroups

    if (dryRun) {
      console.log('\n🌵 DRY RUN COMPLETE. No actual changes were made to the database.');
      console.log('Run with --execute flag to apply changes.');
    } else {
      console.log('\n✅ EXECUTION COMPLETE. All groups processed successfully and changes have been committed.');
      // Note: Deletion of secondary records is a separate step after verification.
    }

  } catch (error) {
    // This outer catch will now primarily catch errors from readMarkedMovies, groupMoviesByMasterId,
    // or if a groupError was re-thrown and not handled further up.
    console.error('❌ An error occurred during the overall merge process:', error.message);
    // If an error occurs outside a specific group's transaction (e.g., during CSV read),
    // there's no specific transaction to rollback here, but the script will terminate.
  } finally {
    if (client) {
      await client.release();
    }
  }
}

async function deleteMergedRecords(dryRun) {
  console.log(dryRun ? '\n🌵 Starting delete process in DRY RUN mode. No actual deletions will be made.' : '\n🔥 Starting delete process in EXECUTE mode. Records will be permanently deleted!');
  
  const records = await readCsv(); // Call the corrected readCsv
  if (!records) {
    console.error('❌ Could not read CSV for deletion process.');
    return;
  }

  const secondaryMovieIds = records
    .filter(r => r.master_id && r.master_id.trim() !== '' && !isNaN(parseInt(r.master_id, 10)))
    .map(r => parseInt(r.id, 10))
    .filter(id => !isNaN(id));

  if (secondaryMovieIds.length === 0) {
    console.log('ℹ️ No secondary movie records (with a valid master_id) found in the CSV to delete.');
    console.log('🔚 Deletion script finished.');
    return;
  }

  console.log(`ℹ️ Found ${secondaryMovieIds.length} secondary movie records marked for potential deletion:`);
  if (dryRun || secondaryMovieIds.length <= 20) {
      console.log(secondaryMovieIds.join(', '));
  } else {
      console.log(`(Sample IDs: ${secondaryMovieIds.slice(0,10).join(', ')}... and ${secondaryMovieIds.length - 10} more)`);
  }

  if (dryRun) {
    console.log('🌵 DRY RUN COMPLETE for deletion. To delete these records, run with --delete-merged-records and --execute flags.');
    console.log('🔚 Deletion script finished.');
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('✅ Connected to database for deletion.');

    await client.query('BEGIN');
    console.log('  TRANSACTION: BEGIN (for deletion)');

    const deleteQuery = 'DELETE FROM movies WHERE id = ANY($1::int[])';
    console.log(`  SQL_DELETE_MOVIES: Attempting to delete ${secondaryMovieIds.length} movie records.`);
    const deleteResult = await client.query(deleteQuery, [secondaryMovieIds]);
    
    console.log(`  EXECUTED: Deleted ${deleteResult.rowCount} movie records.`);

    if (deleteResult.rowCount !== secondaryMovieIds.length) {
        console.warn(`  ⚠️ WARNING: Expected to delete ${secondaryMovieIds.length} records, but ${deleteResult.rowCount} were actually deleted. This might indicate some IDs were not found or already deleted.`);
    }

    await client.query('COMMIT');
    console.log('  TRANSACTION: COMMIT (for deletion)');
    console.log(`✅ EXECUTION COMPLETE for deletion. ${deleteResult.rowCount} movie records were deleted.`);

  } catch (error) {
    console.error(`❌ An error occurred during the deletion process: ${error.message}`);
    if (client && typeof client.query === 'function' && client._connected) { 
        try {
            await client.query('ROLLBACK');
            console.log('  TRANSACTION: ROLLBACK (for deletion) due to error.');
        } catch (rbError) {
            console.error(`  Failed to rollback transaction: ${rbError.message}`);
        }
    }
  } finally {
    if (client && typeof client.end === 'function' && client._connected) {
        await client.end();
        console.log('🔚 Disconnected from database.');
    }
    console.log('🔚 Deletion script finished.');
  }
}

async function readCsv() {
  const filePath = path.isAbsolute(CSV_FILE_PATH) ? CSV_FILE_PATH : path.join(__dirname, CSV_FILE_PATH);
  // console.log(`ℹ️ Reading CSV from: ${filePath}`); // Log moved to calling functions
  if (!fs.existsSync(filePath)) {
    console.error(`❌ CSV file not found at ${filePath}`);
    return null;
  }
  const records = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv()) // Assumes 'csv' is the imported 'csv-parser'
      .on('data', (data) => records.push(data))
      .on('end', () => {
        // console.log(`✅ Successfully read ${records.length} records from ${filePath}`); // Log moved
        resolve(records);
      })
      .on('error', (error) => {
        console.error(`❌ Error reading CSV: ${error.message}`);
        reject(error);
      });
  });
}

// Main execution logic
async function main() {
  const args = process.argv.slice(2);
  const executeMode = args.includes('--execute');
  const deleteMode = args.includes('--delete-merged-records');

  if (deleteMode) {
    // If --delete-merged-records is present, we are in delete mode.
    // dryRun for delete is true if --execute is NOT present.
    console.log(`ℹ️ Delete mode selected. Dry run: ${!executeMode}`);
    await deleteMergedRecords(!executeMode); 
    // deleteMergedRecords handles its own client.end(), pool is not used by it.
  } else {
    // Otherwise, we are in merge mode.
    // dryRun for merge is true if --execute is NOT present.
    console.log(`ℹ️ Merge mode selected. Dry run: ${!executeMode}`);
    if (!executeMode) {
        console.log('🌵 Starting merge process in DRY RUN mode...');
    } else {
        console.log('🔥 Starting merge process in EXECUTE mode. Changes will be made to the database!');
    }
    await processMovieGroups(!executeMode); // Ensure this is the correct merge function name
    
    // End the global pool only if merge mode was run (as it uses the pool)
    if (pool && typeof pool.end === 'function') {
        console.log('🔚 Ending database pool after merge process.');
        await pool.end();
        console.log('✅ Database pool ended.');
    } else {
        console.log('ℹ️ Database pool not ended (either not used or already handled).');
    }
  }
  console.log('🔚 Script finished.'); // General script finished message
}

main().catch(err => {
  console.error('❌ Unhandled error in main execution:', err.message);
  console.error(err.stack); // Log stack for more details
  // Attempt to end the pool if it exists and merge mode might have used it
  const args = process.argv.slice(2);
  const deleteMode = args.includes('--delete-merged-records');
  if (!deleteMode && pool && typeof pool.end === 'function') {
    console.error('Attempting to end database pool during error handling...');
    pool.end().catch(poolErr => console.error('❌ Error ending pool during main error handling:', poolErr));
  }
  process.exit(1);
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const fs = require('fs');
const { Pool } = require('pg');
const { parse } = require('csv-parse');
const path = require('path');

const CSV_FILE_PATH = '/Users/jonaswhite/CascadeProjects/Time2Cinema/backend/scripts/scrapers/cinema_data/atmovies_cinemas_20250609_124234.csv';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Enforce SSL in production
  },
});

async function initDb() {
  // This function is now a no-op for region and original_url as per user request.
  // It can be used for other schema initializations if needed in the future.
  console.log('initDb called. No schema changes for region/original_url will be made by this script.');
}

async function importCinemas() {
  console.log(`Starting import from: ${CSV_FILE_PATH}`);
  const client = await pool.connect();

  try {
    await initDb();
  } catch (err) {
    console.error('Failed to initialize database schema:', err);
    process.exit(1); // Exit if schema setup fails
  }

  try {
    const fileContent = fs.readFileSync(CSV_FILE_PATH, { encoding: 'utf8' });
    const parser = parse(fileContent, {
      columns: true, // Treat the first row as column headers
      skip_empty_lines: true,
    });

    let count = 0;
    for await (const record of parser) {
      const { cinema_id, name, address, url, region_code } = record;

      if (!cinema_id || !name) {
        console.warn('Skipping record due to missing cinema_id or name:', record);
        continue;
      }

      let currentQueryText;
      let currentQueryValues;

      const queryConfig = {
        text: `
          INSERT INTO cinemas (name, address, external_id, source, updated_at)
          VALUES ($1, $2, $3, 'atmovies', CURRENT_TIMESTAMP)
          ON CONFLICT (source, external_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            updated_at = CURRENT_TIMESTAMP;
        `,
        values: [name, address || null, cinema_id],
      };

      currentQueryText = queryConfig.text;
      currentQueryValues = queryConfig.values;

      try {
        await pool.query(currentQueryText, currentQueryValues);
        count++;
        if (count % 50 === 0) {
          console.log(`Imported ${count} cinemas...`);
        }
      } catch (err) {
        console.error(`Error importing cinema '${name}' (ID: ${cinema_id}): ${err.message}`);
        console.error('Attempted Query Text:', currentQueryText); // Log the text that was attempted
        console.error('Attempted Query Values:', currentQueryValues); // Log the values that were attempted
      }
    }
    console.log(`Successfully imported/updated ${count} cinemas from atmovies.`);
  } catch (error) {
    console.error('Failed to read or parse CSV file:', error);
  } finally {
    await client.release();
    await pool.end();
    console.log('Database connection closed.');
  }
}

async function main() {
  await importCinemas();
}

main().catch(err => {
  console.error('Unhandled error in main execution:', err);
  process.exit(1);
});

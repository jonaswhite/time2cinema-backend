const fs = require('fs');
const { Client } = require('pg');
const path = require('path');

// 設定專案根目錄與輸出目錄
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const IMPORTERS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'importers');

// 確保輸出目錄存在
fs.mkdirSync(IMPORTERS_OUTPUT_DIR, { recursive: true });

// 讀取 JSON 檔案
const cinemasFilePath = path.join(IMPORTERS_OUTPUT_DIR, 'cinemas_with_geocode.json');
const cinemas = JSON.parse(fs.readFileSync(cinemasFilePath, 'utf8'));
console.log(`讀取電影院資料：${cinemasFilePath}`);
console.log(`電影院數量：${cinemas.length}`);


const client = new Client({
  user: 'jonaswhite',
  host: 'localhost',
  database: 'jonaswhite',
  password: '',
  port: 5432, // 這裡設定為 5432
});

async function importCinemas() {
  await client.connect();
  for (const c of cinemas) {
    const query = `
      INSERT INTO cinemas (name, address, city, district, latitude, longitude, external_id, type, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    const values = [
      c.name,
      c.address,
      c.city,
      c.district,
      c.lat,
      c.lng,
      c.id,
      c.type,
      'wikipedia',
    ];
    try {
      await client.query(query, values);
    } catch (err) {
      console.error(`Error importing cinema ${c.name}:`, err.message);
    }
  }
  await client.end();
  console.log('Import complete!');
}

importCinemas();

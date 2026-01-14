#!/usr/bin/env node

/**
 * Destiny 2 Full Manifest Converter (Cross-Platform)
 * Replaces full-convert-and-optimize.bat
 * Designed for GitHub Actions (Linux)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const zlib = require('zlib');
const JSZip = require('jszip');

const INPUT_FILE = process.argv[2] || 'manifest.content';
const OUTPUT_DIR = process.cwd();
const MAX_FILE_SIZE_MB = 70;
const CHUNK_FILES = ['DestinyInventoryItemDefinition'];

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  fail(`Manifest file not found: ${INPUT_FILE}`);
}

function getFileSizeMB(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8') / 1024 / 1024;
}

function chunkTable(tableName, tableData) {
  const entries = Object.entries(tableData);
  const totalSize = getFileSizeMB(tableData);
  const chunks = Math.ceil(totalSize / MAX_FILE_SIZE_MB);
  const perChunk = Math.ceil(entries.length / chunks);

  const result = [];
  for (let i = 0; i < entries.length; i += perChunk) {
    result.push(Object.fromEntries(entries.slice(i, i + perChunk)));
  }
  return result;
}

async function extractDatabase(buffer) {
  // gzip
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = zlib.gunzipSync(buffer);
  }

  // zip
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buffer);
    for (const name of Object.keys(zip.files)) {
      if (!zip.files[name].dir) {
        return await zip.files[name].async('nodebuffer');
      }
    }
    fail('ZIP did not contain a database');
  }

  return buffer;
}

(async () => {
  console.log('📖 Reading manifest...');
  const raw = fs.readFileSync(INPUT_FILE);
  const dbBuffer = await extractDatabase(raw);

  const dbPath = path.join(OUTPUT_DIR, 'manifest.db');
  fs.writeFileSync(dbPath, dbBuffer);

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) fail(err.message);

    const allData = {};
    let index = 0;

    const next = () => {
      if (index >= tables.length) {
        const metadata = {
          extractedAt: new Date().toISOString(),
          source: 'github-actions',
          tablesExtracted: Object.keys(allData),
          totalTables: tables.length
        };

        fs.writeFileSync(
          path.join(OUTPUT_DIR, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );

        fs.unlinkSync(dbPath);
        console.log('✅ Conversion complete');
        process.exit(0);
      }

      const table = tables[index++].name;
      db.all(`SELECT * FROM ${table}`, (err, rows) => {
        if (err) return next();

        const tableData = {};
        for (const row of rows) {
          try {
            if (row.json) {
              const data = JSON.parse(row.json);
              let key = data.hash ?? row.id ?? row.key;
              if (typeof key === 'number' && key < 0) key = (key >>> 0).toString();
              tableData[key] = data;
            }
          } catch {}
        }

        if (Object.keys(tableData).length) {
          allData[table] = tableData;

          if (CHUNK_FILES.includes(table) && getFileSizeMB(tableData) > MAX_FILE_SIZE_MB) {
            chunkTable(table, tableData).forEach((chunk, i) => {
              fs.writeFileSync(
                `${table}_part${i + 1}.json`,
                JSON.stringify(chunk, null, 2)
              );
            });
          } else {
            fs.writeFileSync(
              `${table}.json`,
              JSON.stringify(tableData, null, 2)
            );
          }
        }

        next();
      });
    };

    next();
  });
})();

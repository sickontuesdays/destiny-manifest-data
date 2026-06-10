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
// Measured against COMPACT JSON (what we now write). 60MB keeps every file well under
// GitHub's hard 100MB push limit, with margin for future growth.
const MAX_FILE_SIZE_MB = 60;

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

// Remove any prior output for a table so we never leave stale single/part files behind
// when a table switches between single<->chunked or its part count changes.
function cleanupTableFiles(table) {
  const single = `${table}.json`;
  if (fs.existsSync(single)) fs.rmSync(single, { force: true });
  for (let i = 1; i <= 50; i++) {
    const part = `${table}_part${i}.json`;
    if (fs.existsSync(part)) fs.rmSync(part, { force: true });
  }
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

    const extractedTables = [];
    let index = 0;

    const next = () => {
      if (index >= tables.length) {
        const metadata = {
          extractedAt: new Date().toISOString(),
          source: 'github-actions',
          tablesExtracted: extractedTables,
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
          extractedTables.push(table);

          // Clear stale output for this table first.
          cleanupTableFiles(table);

          // Write COMPACT JSON (parses identically, ~half the size) and chunk ANY table
          // that exceeds the limit (not just InventoryItem) so no single file can cross
          // GitHub's 100MB push limit. The site's loader + API proxy already merge _part files.
          if (getFileSizeMB(tableData) > MAX_FILE_SIZE_MB) {
            chunkTable(table, tableData).forEach((chunk, i) => {
              fs.writeFileSync(`${table}_part${i + 1}.json`, JSON.stringify(chunk));
            });
          } else {
            fs.writeFileSync(`${table}.json`, JSON.stringify(tableData));
          }
        }

        next();
      });
    };

    next();
  });
})();

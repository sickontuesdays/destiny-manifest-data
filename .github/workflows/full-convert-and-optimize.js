#!/usr/bin/env node

/**
 * Destiny 2 Full Manifest Converter (Cross-Platform)
 * Replaces full-convert-and-optimize.bat
 * Designed for GitHub Actions (Linux)
 *
 * Uses sql.js (pure-JS / WASM SQLite) instead of the native `sqlite3` package, so the
 * GitHub Action never has to compile a native module. The native sqlite3 install path
 * (prebuild-install → node-gyp) broke when napi-build-utils@2 changed its layout; sql.js
 * has no native build step and is immune to that whole class of failure. It's also the
 * same SQLite engine the site itself uses client-side.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const JSZip = require('jszip');
const initSqlJs = require('sql.js');

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

  // Load the WASM SQLite engine. locateFile points emscripten at sql.js's own dist dir
  // so it finds sql-wasm.wasm regardless of cwd.
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file)
  });

  const db = new SQL.Database(new Uint8Array(dbBuffer));

  // List the definition tables.
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = tablesRes.length ? tablesRes[0].values.map((r) => r[0]) : [];

  const decoder = new TextDecoder('utf-8');
  const extractedTables = [];

  for (const table of tables) {
    let stmt;
    try {
      stmt = db.prepare(`SELECT * FROM "${table}"`);
    } catch {
      continue; // unreadable table — skip
    }

    // Stream rows one at a time (keeps memory flat on the huge tables).
    const tableData = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let jsonVal = row.json;
      if (jsonVal == null) continue;
      // mobile manifest stores json as TEXT, but handle BLOB (Uint8Array) too.
      if (jsonVal instanceof Uint8Array) jsonVal = decoder.decode(jsonVal);
      try {
        const data = JSON.parse(jsonVal);
        let key = data.hash ?? row.id ?? row.key;
        if (typeof key === 'number' && key < 0) key = (key >>> 0).toString();
        tableData[key] = data;
      } catch {}
    }
    stmt.free();

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
  }

  db.close();

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

  console.log('✅ Conversion complete');
  process.exit(0);
})().catch((e) => fail(e && (e.stack || e.message) ? (e.stack || e.message) : String(e)));

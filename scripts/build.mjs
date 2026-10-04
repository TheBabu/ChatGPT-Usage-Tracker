// Packs the extension into dist/simple-tracker-for-chatgpt-v<version>.zip, ready to upload to the
// Chrome Web Store or attach to a GitHub release. No dependencies: the zip is written by hand.
//
// Usage: node scripts/build.mjs

import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'background.js', 'content', 'shared', 'popup', 'icons'];

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

function fail(message) {
  console.error(`build: ${message}`);
  process.exit(1);
}

// Chrome accepts one to four dot-separated integers.
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail(`manifest version "${manifest.version}" is not valid for Chrome`);

// Catch a file the manifest points at but the package would leave out.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((script) => [...(script.js || []), ...(script.css || [])]),
].filter(Boolean);
for (const file of referenced) {
  if (!existsSync(join(ROOT, file))) fail(`manifest refers to missing file ${file}`);
}

function listFiles(path) {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).sort().flatMap((name) => listFiles(join(path, name)));
}

const files = INCLUDE.flatMap(listFiles).map((path) => path.split(sep).join('/'));

// ---------- Minimal zip writer (deflate, no zip64) ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// A fixed timestamp (2026-01-01 00:00) so the same sources always produce the same zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 names
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra length
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);    // extra, comment, disk, attributes stay zero
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

// ---------- Write ----------

const zip = buildZip(files.map((name) => ({ name, data: readFileSync(join(ROOT, name)) })));
const outDir = join(ROOT, 'dist');
const outFile = join(outDir, `simple-tracker-for-chatgpt-v${manifest.version}.zip`);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, zip);

console.log(`Built ${relative(ROOT, outFile)} (${files.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);

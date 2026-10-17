// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Builds the downloadable release files in release/ from dist/:
//   Tas-Time-Windows.zip, Tas-Time-macOS.zip and Tas-Time.html.
// The zip writer is minimal and dependency-free (Node 22+ for zlib.crc32). It records Unix
// permissions so the macOS launcher stays double-clickable after unzipping.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'release');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** entries: [{ name, data: Buffer, mode }] → zip Buffer. */
export function zip(entries, when = new Date()) {
  const { time, date } = dosDateTime(when);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, mode = 0o644 } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 names
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so permissions are honoured
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); // regular file + mode
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const startHere = (os) => [
  `Tas-Time ${version} — offline planning book`,
  '',
  'START HERE',
  '',
  os === 'windows'
    ? '1. Unzip this folder somewhere you can find it again, e.g. Documents\\Tas-Time.\n   (Right-click the zip -> Extract All. Do not run it from inside the zip.)'
    : '1. Unzip this folder (double-click the zip) and move it somewhere you can find\n   again, e.g. Documents/Tas-Time.',
  os === 'windows'
    ? '2. Double-click "Open Tas-Time.cmd". Tas-Time opens in its own Microsoft Edge window.\n   Or double-click "Tas-Time.html" to open it in your normal browser.'
    : '2. The first time only: right-click "Open Tas-Time.command" and choose Open, then Open\n   again. macOS asks because the file was downloaded. After that, double-click it.\n   It opens Tas-Time in its own Edge or Chrome window.\n   Or double-click "Tas-Time.html" to open it in your normal browser.',
  '3. New to planning? Click "Beginner\'s guide" at the bottom left of the app.',
  '4. Press Ctrl+S (Mac: Cmd+S) once to choose where your plan is saved.',
  '   After that, every change saves itself.',
  '',
  'Keep "Tas-Time.html" and the launcher together in the same folder.',
  'Your plan is a separate .json file. Back it up by copying it.',
  '',
  'Works best in Microsoft Edge or Google Chrome (2024 or newer).',
  'No installation, account, internet or admin rights needed.',
  '',
  'Copyright (c) 2026 Selami Pazarbasi. MIT License (see LICENSE.txt).',
  '',
].join(os === 'windows' ? '\r\n' : '\n');

const html = readFileSync(join(dist, 'Tas-Time.html'));
const license = readFileSync(join(root, 'LICENSE'), 'utf8');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

writeFileSync(join(out, 'Tas-Time-Windows.zip'), zip([
  { name: 'Tas-Time/Tas-Time.html', data: html },
  { name: 'Tas-Time/Open Tas-Time.cmd', data: readFileSync(join(dist, 'Open Tas-Time.cmd')) },
  { name: 'Tas-Time/START HERE.txt', data: Buffer.from(startHere('windows')) },
  { name: 'Tas-Time/LICENSE.txt', data: Buffer.from(license.replace(/\r?\n/g, '\r\n')) },
]));
writeFileSync(join(out, 'Tas-Time-macOS.zip'), zip([
  { name: 'Tas-Time/Tas-Time.html', data: html },
  { name: 'Tas-Time/Open Tas-Time.command', data: readFileSync(join(dist, 'Open Tas-Time.command')), mode: 0o755 },
  { name: 'Tas-Time/START HERE.txt', data: Buffer.from(startHere('mac')) },
  { name: 'Tas-Time/LICENSE.txt', data: Buffer.from(license) },
]));
copyFileSync(join(dist, 'Tas-Time.html'), join(out, 'Tas-Time.html'));
console.log(`Packaged Tas-Time ${version} into release/: Tas-Time-Windows.zip, Tas-Time-macOS.zip, Tas-Time.html`);

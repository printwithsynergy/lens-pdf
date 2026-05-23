#!/usr/bin/env node

import { readdir, rename } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(join(__dirname, '..', 'dist'));

function isWithinDist(p) {
  const resolved = resolve(p);
  return resolved === distDir || resolved.startsWith(distDir + sep);
}

async function renameJsxToJs(dir) {
  const safeDir = resolve(dir);
  if (!isWithinDist(safeDir)) return;

  const entries = await readdir(safeDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.includes('/') || entry.name.includes(sep) || entry.name === '..' || entry.name === '.') continue;

    const fullPath = resolve(join(safeDir, entry.name));
    if (!isWithinDist(fullPath)) continue;

    if (entry.isDirectory()) {
      await renameJsxToJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.jsx')) {
      const newName = entry.name.replace(/\.jsx$/, '.js');
      const newPath = resolve(join(safeDir, newName));
      if (!isWithinDist(newPath)) continue;
      await rename(fullPath, newPath);
      console.log(`Renamed: ${entry.name} -> ${newName}`);
    }
  }
}

renameJsxToJs(distDir).catch(console.error);

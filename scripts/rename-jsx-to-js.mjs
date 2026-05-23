#!/usr/bin/env node

import { readdir, rename } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(join(__dirname, '..', 'dist'));

async function renameJsxToJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = resolve(join(dir, entry.name));
    if (!fullPath.startsWith(distDir + sep) && fullPath !== distDir) continue;

    if (entry.isDirectory()) {
      await renameJsxToJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.jsx')) {
      const newPath = join(dir, entry.name.replace('.jsx', '.js'));
      await rename(fullPath, newPath);
      console.log(`Renamed: ${entry.name} -> ${entry.name.replace('.jsx', '.js')}`);
    }
  }
}

renameJsxToJs(distDir).catch(console.error);

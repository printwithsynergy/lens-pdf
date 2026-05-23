#!/usr/bin/env node

import { readdir, rename, realpath } from 'fs/promises';
import { join, resolve, sep, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = await realpath(resolve(join(__dirname, '..', 'dist')));

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255 && SAFE_NAME.test(name) && name !== '.' && name !== '..';
}

async function safeResolveWithin(base, name) {
  if (!isSafeName(name)) return null;
  const candidate = resolve(base, name);
  if (isAbsolute(name) || (candidate !== base && !candidate.startsWith(base + sep))) return null;
  return candidate;
}

async function renameJsxToJs(dir) {
  const realDir = await realpath(dir);
  if (realDir !== distDir && !realDir.startsWith(distDir + sep)) return;

  const entries = await readdir(realDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = await safeResolveWithin(realDir, entry.name);
    if (!fullPath) continue;

    if (entry.isDirectory()) {
      await renameJsxToJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.jsx')) {
      const newName = entry.name.slice(0, -4) + '.js';
      const newPath = await safeResolveWithin(realDir, newName);
      if (!newPath) continue;
      await rename(fullPath, newPath);
      console.log(`Renamed: ${entry.name} -> ${newName}`);
    }
  }
}

renameJsxToJs(distDir).catch(console.error);

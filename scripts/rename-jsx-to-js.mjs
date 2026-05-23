#!/usr/bin/env node

import { readdir, rename, realpath } from 'fs/promises';
import { resolve, sep, dirname } from 'path';
import { fileURLToPath } from 'url';

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = await realpath(resolve(SCRIPT_DIR, '..', 'dist'));
const DIST_PREFIX = DIST_DIR + sep;

function isSafeSegment(name) {
  return (
    typeof name === 'string'
    && name.length > 0
    && name.length <= 255
    && name !== '.'
    && name !== '..'
    && SAFE_SEGMENT.test(name)
  );
}

function isInsideDist(absolutePath) {
  return absolutePath === DIST_DIR || absolutePath.startsWith(DIST_PREFIX);
}

async function processDist() {
  const queue = [DIST_DIR];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!isInsideDist(currentDir)) continue;

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!isSafeSegment(entry.name)) continue;

      const childPath = currentDir + sep + entry.name;
      if (!isInsideDist(childPath)) continue;

      if (entry.isDirectory()) {
        queue.push(childPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsx')) {
        const newName = entry.name.slice(0, -4) + '.js';
        if (!isSafeSegment(newName)) continue;
        const newPath = currentDir + sep + newName;
        if (!isInsideDist(newPath)) continue;
        await rename(childPath, newPath);
        console.log(`Renamed: ${entry.name} -> ${newName}`);
      }
    }
  }
}

processDist().catch(console.error);

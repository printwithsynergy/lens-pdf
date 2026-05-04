#!/usr/bin/env node
// Rewrites relative import/export specifiers in dist/**/*.js so they are
// resolvable under Node ESM (which requires explicit extensions).
//
// `./Foo`   -> `./Foo.js`     when dist/.../Foo.js exists
// `./bar`   -> `./bar/index.js` when dist/.../bar/index.js exists
// Specifiers that already end in .js / .mjs / .cjs / .json are left alone.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, "..", "dist");

const SPECIFIER_RE =
  /(\bfrom\s*['"]|\bimport\s*\(\s*['"]|\bexport\s+\*\s+from\s*['"])(\.{1,2}\/[^'"\n]+?)(['"])/g;

const KNOWN_EXTS = /\.(?:m?js|cjs|json)$/i;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) yield full;
  }
}

async function rewriteFile(file) {
  const src = await readFile(file, "utf8");
  let changed = false;
  const fileDir = dirname(file);

  const out = await replaceAsync(src, SPECIFIER_RE, async (_m, pre, spec, post) => {
    if (KNOWN_EXTS.test(spec)) return `${pre}${spec}${post}`;
    const candidates = [`${spec}.js`, `${spec}/index.js`];
    for (const candidate of candidates) {
      const abs = resolve(fileDir, candidate);
      // Stay inside dist/.
      if (!abs.startsWith(distDir)) continue;
      if (await exists(abs)) {
        if (candidate !== spec) changed = true;
        return `${pre}${candidate}${post}`;
      }
    }
    return `${pre}${spec}${post}`;
  });

  if (changed) await writeFile(file, out);
  return changed;
}

async function replaceAsync(input, regex, replacer) {
  const promises = [];
  input.replace(regex, (match, ...args) => {
    promises.push(replacer(match, ...args));
    return match;
  });
  const replacements = await Promise.all(promises);
  let i = 0;
  return input.replace(regex, () => replacements[i++]);
}

let changedCount = 0;
let totalCount = 0;
for await (const file of walk(distDir)) {
  totalCount++;
  if (await rewriteFile(file)) changedCount++;
}
console.log(
  `[fix-import-extensions] rewrote ${changedCount}/${totalCount} files in ${distDir}`,
);

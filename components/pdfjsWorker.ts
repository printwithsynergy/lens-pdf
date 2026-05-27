/**
 * pdf.js worker URL — exposed as a standalone constant so hosts
 * can preload it via `<link rel="preload" as="script">` without
 * pulling `pdfjs-dist` (or any of its browser-API references like
 * `DOMMatrix`) into their SSR module graph.
 *
 * The previous implementation read `pdfjs.version` from a re-export
 * of `react-pdf`, which transitively imports `pdfjs-dist`. That
 * top-level import touches `DOMMatrix` at module evaluation time
 * and crashes Node ESM with `ReferenceError: DOMMatrix is not
 * defined` the moment any host imports this constant from an
 * Astro frontmatter / Next.js getServerSideProps / etc.
 *
 * The version below is hand-pinned to whatever `react-pdf@10.4.1`
 * bundles. Bump in lockstep when `react-pdf` updates.
 */

/**
 * pdfjs-dist version `react-pdf@10.4.1` bundles. Hand-pinned —
 * verify with
 *   cat node_modules/react-pdf/node_modules/pdfjs-dist/package.json
 * when bumping `react-pdf`.
 */
export const REACT_PDF_BUNDLED_PDFJS_VERSION = "5.4.296";

/**
 * Default pdf.js worker URL — unpkg CDN pinned to the exact
 * `pdfjs-dist` version `react-pdf` ships. Points at the **legacy**
 * build (`legacy/build/pdf.worker.min.mjs`) which avoids the
 * newest ES module + WebAssembly features that some browsers
 * (older Safari / specific iOS versions) can't spin a worker for.
 * The standard build assumes a very recent JS engine and fails
 * silently on older mobile Safari — the canvas paints blank and
 * the loading skeleton hangs forever.
 *
 * SSR-safe: no imports, no browser-API references — just a plain
 * string at the top of the module.
 *
 * Hosts can `<link rel="preload" as="script" href={defaultPdfjsWorkerSrc}>`
 * the worker alongside their HTML to start the ~500 KB download
 * in parallel with the JS bundle.
 */
export const defaultPdfjsWorkerSrc =
  `https://unpkg.com/pdfjs-dist@${REACT_PDF_BUNDLED_PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs`;

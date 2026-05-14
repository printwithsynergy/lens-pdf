import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // pdfjs-dist ships its worker as a separate bundle. Vite's optimizer
  // can't statically resolve the dynamic import inside lens-pdf's
  // fallback adapter; pre-bundling fixes that and saves a round-trip
  // on first sample.
  optimizeDeps: { include: ["pdfjs-dist"] },
});

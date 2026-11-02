import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite runs this file in Node; declared here so `tsc --noEmit` needs no @types/node.
declare const process: { env: Record<string, string | undefined> };
// es2022: src/api/index.ts lazy-loads the mock backend with top-level await so it never runs in http mode.
// VITE_BASE: deploy sub-path, e.g. '/taximate/' for GitHub Pages project sites. Defaults to '/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// E2E runs use their own throwaway local D1/R2 (.wrangler/e2e), wiped before each run.
const e2e = !!process.env.E2E;

export default defineConfig({
  plugins: [react(), cloudflare({ persistState: e2e ? { path: '.wrangler/e2e' } : true })],
  publicDir: 'web/public',
  server: e2e ? { hmr: false } : undefined,
});

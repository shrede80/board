import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { execSync } from 'node:child_process';

// E2E runs use their own throwaway local D1/R2 (.wrangler/e2e), wiped before each run.
const e2e = !!process.env.E2E;

/** Build version shown in «المزيد» and compared by open tabs (UPDATE-1 أ10): date + commit. */
function appVersion() {
  let sha = '';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const d = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return sha ? `${d}-${sha}` : d;
}

export default defineConfig({
  plugins: [react(), cloudflare({ persistState: e2e ? { path: '.wrangler/e2e' } : true })],
  publicDir: 'web/public',
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || appVersion()) },
  server: e2e ? { hmr: false } : undefined,
});

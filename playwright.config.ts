import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ar' },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `rm -rf .wrangler/e2e && npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e && E2E=1 npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/auth/status`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

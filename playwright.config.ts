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
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

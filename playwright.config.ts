import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // One shared local database: run test files one after another.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ar',
    // headless Chromium needs a UTF-8 locale to keep Arabic download file names
    launchOptions: {
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      // the challenge's voice memo is recorded from a fake microphone playing a test tone
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=e2e/fixtures/tone.wav'],
    },
    permissions: ['microphone'],
  },
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

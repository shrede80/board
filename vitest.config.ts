import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations('worker/migrations');
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, SESSION_SECRET: 'test-secret', SETUP_TOKEN: 'test-setup-token' },
        },
      };
    }),
  ],
  test: {
    include: ['worker/test/**/*.test.ts', 'shared/**/*.test.ts'],
    setupFiles: ['worker/test/setup.ts'],
  },
});

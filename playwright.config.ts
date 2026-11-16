import { defineConfig } from '@playwright/test'

/** End-to-end tests run against the production server and build (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  reporter: 'list',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'en-GB',
    viewport: { width: 390, height: 844 },
  },
})

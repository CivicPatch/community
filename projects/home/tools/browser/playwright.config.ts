// Browser integration tests for the site. Playwright builds the real app and serves
// the production bundle (so we test what ships, including the no-JS prerendering),
// then runs the specs in tests/ against it. Run with `npm run test:e2e` (needs
// browsers — `npx playwright install`, or use docker-compose.yml which has them).

import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// the app lives two levels up (projects/home); that's where build/preview run
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  // WebKit = the engine behind iOS Safari, where the mobile rendering bugs live.
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    cwd: appRoot,
    url: 'http://localhost:4173/',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})

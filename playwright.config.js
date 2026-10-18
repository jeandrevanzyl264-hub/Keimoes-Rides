import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
const systemChromium = '/usr/bin/chromium';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.js',
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (fs.existsSync(systemChromium) ? systemChromium : undefined), args: ['--no-sandbox'] }
  },
  webServer: { command: 'npm run dev', env: { VITE_USE_EMULATORS: 'true' }, url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 }
});

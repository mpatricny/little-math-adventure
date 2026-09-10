import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: '.', testMatch: 'underwater-*.spec.ts', workers: 1, timeout: 60_000,
    outputDir: '../../test-results/underwater',
    use: { baseURL: process.env.LMA_E2E_BASE_URL ?? 'http://127.0.0.1:8001',
        viewport: { width: 1280, height: 720 }, hasTouch: true,
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 8001',
        url: 'http://127.0.0.1:8001', reuseExistingServer: true },
});

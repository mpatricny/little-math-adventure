import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: ['arena-flow.spec.ts', 'battle-hud.spec.ts'],
    fullyParallel: false,
    workers: 1,
    timeout: 45_000,
    expect: {
        timeout: 8_000,
    },
    outputDir: '../../test-results/arena',
    use: {
        baseURL: process.env.LMA_E2E_BASE_URL ?? 'http://127.0.0.1:8001',
        viewport: { width: 1280, height: 720 },
        actionTimeout: 8_000,
        navigationTimeout: 30_000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 8001',
        url: 'http://127.0.0.1:8001',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});

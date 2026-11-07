import { defineConfig } from 'playwright/test';

const baseURL = process.env.LMA_E2E_BASE_URL ?? 'http://127.0.0.1:8007';

export default defineConfig({
    testDir: '.',
    testMatch: 'town-recovery.spec.ts',
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 10_000 },
    outputDir: '../../test-results/arena-town-recovery',
    use: {
        baseURL,
        viewport: { width: 1280, height: 720 },
        navigationTimeout: 45_000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: process.env.LMA_E2E_BASE_URL ? undefined : {
        command: 'npm run dev -- --host 127.0.0.1 --port 8007 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
    },
});

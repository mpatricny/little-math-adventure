import { defineConfig } from 'playwright/test';
export default defineConfig({
    testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1, timeout: 90000,
    expect: { timeout: 10000 }, outputDir: '../../test-results/profiles',
    use: { baseURL: process.env.LMA_E2E_BASE_URL ?? 'http://127.0.0.1:8133', viewport: { width: 1280, height: 720 }, hasTouch: true,
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] },
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: process.env.LMA_E2E_BASE_URL ? undefined : { command: 'npm run dev -- --host 127.0.0.1 --port 8133 --strictPort', url: 'http://127.0.0.1:8133', reuseExistingServer: false },
});

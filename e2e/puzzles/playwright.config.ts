import { defineConfig } from 'playwright/test';
export default defineConfig({
    testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 240_000,
    outputDir: '../../test-results/puzzles',
    use: { baseURL: 'http://127.0.0.1:8001', viewport: { width: 1280, height: 720 }, hasTouch: true,
        screenshot: 'only-on-failure', trace: 'retain-on-failure',
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
    webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 8001', url: 'http://127.0.0.1:8001', reuseExistingServer: true },
});

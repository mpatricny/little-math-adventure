import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: '.', testMatch: 'comparison.spec.ts', workers: 1, timeout: 120000,
    expect: { timeout: 10000 }, outputDir: '../../test-results/comparison',
    use: {
        baseURL: 'http://127.0.0.1:8017', viewport: { width: 1280, height: 800 },
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] },
        screenshot: 'only-on-failure', trace: 'retain-on-failure',
    },
    webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 8017 --strictPort', url: 'http://127.0.0.1:8017', reuseExistingServer: true },
});

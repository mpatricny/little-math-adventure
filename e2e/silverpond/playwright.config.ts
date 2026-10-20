import { defineConfig } from 'playwright/test';

const port = process.env.LMA_E2E_PORT ?? '8005';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: '.', testMatch: ['silverpond.spec.ts', 'loading.spec.ts'], workers: 1, timeout: 150_000,
    expect: { timeout: 20_000 }, outputDir: '../../test-results/silverpond',
    use: { baseURL, actionTimeout: 25_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: true },
    projects: [
        { name: 'desktop-webgl', use: { viewport: { width: 1280, height: 720 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
        { name: 'tablet-canvas', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    ],
});

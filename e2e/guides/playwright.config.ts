import { defineConfig } from 'playwright/test';
const port = process.env.LMA_GUIDE_PORT ?? '8036';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
    testDir: '.', testMatch: ['guides.spec.ts', 'portrait-centering.spec.ts'], workers: 1, timeout: 300_000,
    expect: { timeout: 60_000 }, outputDir: '../../test-results/guides',
    use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
    projects: [
        { name: 'desktop-webgl', use: { viewport: { width: 1280, height: 720 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
        { name: 'tablet-canvas', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    ],
});

import { defineConfig } from 'playwright/test';
export default defineConfig({
    testDir: '.', testMatch: 'audio.spec.ts', workers: 1, timeout: 90_000,
    outputDir: '../../test-results/audio', expect: { timeout: 15_000 },
    use: { baseURL: 'http://127.0.0.1:8003', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 8003', url: 'http://127.0.0.1:8003', reuseExistingServer: true },
    projects: [
        { name: 'desktop-webgl', use: { viewport: { width: 1280, height: 720 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
        { name: 'tablet-canvas', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    ],
});

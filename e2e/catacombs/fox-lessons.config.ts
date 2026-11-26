import { defineConfig } from 'playwright/test';
import path from 'node:path';
export default defineConfig({
    testDir: '.', testMatch: 'fox-lessons.spec.ts', workers: 1, timeout: 180000,
    expect: { timeout: 15000 }, outputDir: '../../test-results/fox-lessons', reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8029', viewport: { width: 1024, height: 600 }, hasTouch: true,
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio'] },
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { cwd: path.resolve(__dirname, '../..'),
        command: 'node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts --port 8029',
        url: 'http://127.0.0.1:8029', reuseExistingServer: true },
});

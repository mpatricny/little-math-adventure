import { defineConfig } from 'playwright/test';
import path from 'node:path';
export default defineConfig({
    testDir: '.', testMatch: 'fox-checkpoint.spec.ts', workers: 1, timeout: 90000,
    outputDir: '../../artifacts/fox-checkpoint', reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8032', viewport: { width: 1024, height: 768 }, hasTouch: true,
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
        screenshot: 'only-on-failure' },
    webServer: { cwd: path.resolve(__dirname, '../..'), command: 'node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts --port 8032 --strictPort',
        url: 'http://127.0.0.1:8032', reuseExistingServer: true },
});

import { defineConfig } from 'playwright/test';
import path from 'node:path';

export default defineConfig({
    testDir: '.', testMatch: 'choice.spec.ts', workers: 1, timeout: 90000,
    outputDir: '../../artifacts/practice-choice', reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8027', viewport: { width: 1280, height: 720 }, hasTouch: true,
        screenshot: 'only-on-failure',
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
    webServer: {
        cwd: path.resolve(__dirname, '../..'),
        command: 'node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts',
        url: 'http://127.0.0.1:8027', reuseExistingServer: true, timeout: 90000,
    },
});

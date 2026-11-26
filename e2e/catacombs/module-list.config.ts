import { defineConfig } from 'playwright/test';
import path from 'node:path';

export default defineConfig({
    testDir: '.', testMatch: 'module-list.spec.ts', workers: 1, timeout: 120_000,
    outputDir: '../../artifacts/catacomb-left-review/test-results', reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8200', hasTouch: true, screenshot: 'only-on-failure',
        launchOptions: {args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']},
    },
    webServer: {
        cwd: path.resolve(__dirname, '../..'),
        command: 'node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts --port 8200 --strictPort',
        url: 'http://127.0.0.1:8200', reuseExistingServer: false, timeout: 60_000,
    },
});

import { defineConfig } from 'playwright/test';
import path from 'node:path';

export default defineConfig({
    testDir: '.', testMatch: ['fox-companion.spec.ts', 'fox-asset.spec.ts'],
    workers: 1, timeout: 120000, expect: { timeout: 10000 },
    outputDir: '../../test-results/fox-companion',
    use: {
        baseURL: 'http://127.0.0.1:8028', viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
        screenshot: 'only-on-failure', trace: 'retain-on-failure',
    },
    webServer: {
        cwd: path.resolve(__dirname, '../..'),
        command: 'node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts --port 8028',
        url: 'http://127.0.0.1:8028', reuseExistingServer: true, timeout: 90000,
    },
});

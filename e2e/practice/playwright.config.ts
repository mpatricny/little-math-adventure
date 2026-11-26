import { defineConfig } from 'playwright/test';
import path from 'node:path';

export default defineConfig({
    testDir: '.',
    testMatch: 'runtime.spec.ts',
    workers: 1,
    outputDir: '../../artifacts/practice-runtime',
    reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8024', headless: true },
    webServer: {
        cwd: path.resolve(__dirname, '../..'),
        command: 'node_modules/.bin/vite --config e2e/practice/vite.config.ts',
        url: 'http://127.0.0.1:8024', reuseExistingServer: true,
    },
});

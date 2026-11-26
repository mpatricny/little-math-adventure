import { defineConfig } from 'playwright/test';
import path from 'node:path';
const port = Number(process.env.LMA_SPEED_E2E_PORT ?? 8029);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
    testDir: '.', testMatch: 'speed-levels.spec.ts', workers: 1, timeout: 180000,
    expect: { timeout: 15000 }, outputDir: '../../test-results/catacomb-speed',
    use: { baseURL, viewport: { width: 1280, height: 800 },
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] },
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { cwd: path.resolve(__dirname, '../..'), command: `node_modules/.bin/vite --config e2e/practice/choice-vite.config.ts --port ${port}`,
        url: baseURL, reuseExistingServer: true },
});

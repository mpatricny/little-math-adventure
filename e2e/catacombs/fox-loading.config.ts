import { defineConfig } from 'playwright/test';
import arenaConfig from '../arena/playwright.config';

export default defineConfig({
    ...arenaConfig,
    testDir: '.',
    testMatch: ['fox-loading.spec.ts', 'fox-asset.spec.ts'],
    timeout: 180_000,
    use: {
        ...arenaConfig.use,
        channel: 'chromium',
        actionTimeout: 30_000,
        trace: 'off',
        launchOptions: {
            args: process.platform === 'darwin'
                ? ['--use-angle=metal']
                : ['--enable-unsafe-swiftshader'],
        },
    },
    outputDir: '../../test-results/fox-loading',
});

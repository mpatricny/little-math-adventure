import { defineConfig } from 'playwright/test';
import arenaConfig from '../arena/playwright.config';
export default defineConfig({
    ...arenaConfig,
    testDir: '.',
    testMatch: ['guild-progress.spec.ts', 'guild-visual.spec.ts', 'difficulty.spec.ts'],
    timeout: 180_000,
    use: { ...arenaConfig.use, launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] } },
    outputDir: '../../test-results/coop',
});

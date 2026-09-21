import { defineConfig } from 'playwright/test';
import arenaConfig from '../arena/playwright.config';
export default defineConfig({
    ...arenaConfig, testDir: '.', testMatch: '*.spec.ts', timeout: 120_000,
    use: { ...arenaConfig.use, hasTouch: true, trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] } },
    outputDir: '../../test-results/learning',
});

import { defineConfig } from 'playwright/test';
import config from '../learning/comparison.config';

export default defineConfig({
    ...config,
    testDir: '.',
    testMatch: ['fox-progression.spec.ts', 'trial.spec.ts', 'impact-timing.spec.ts'],
    timeout: 180000,
    outputDir: '../../test-results/fox-progression',
});

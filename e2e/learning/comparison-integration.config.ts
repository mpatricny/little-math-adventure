import { defineConfig } from 'playwright/test';
import base from './comparison.config';
export default defineConfig(base, {
    testMatch: 'comparison-integration.spec.ts', timeout: 180000,
    outputDir: '../../test-results/comparison-integration',
});

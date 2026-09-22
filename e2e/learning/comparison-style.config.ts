import { defineConfig } from 'playwright/test';
import comparison from './comparison.config';
export default defineConfig({ ...comparison, testMatch: 'comparison-style.spec.ts', outputDir: '../../test-results/comparison-style' });

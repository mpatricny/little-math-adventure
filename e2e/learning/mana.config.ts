import { defineConfig } from 'playwright/test';
import comparison from './comparison.config';

export default defineConfig({ ...comparison, testMatch: 'mana.spec.ts', outputDir: '../../test-results/mana' });

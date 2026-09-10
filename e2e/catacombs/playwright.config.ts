import { defineConfig } from 'playwright/test';
import config from '../coop/playwright.config';
export default defineConfig({...config,testDir:'.',testMatch:'*.spec.ts',outputDir:'../../test-results/catacombs'});

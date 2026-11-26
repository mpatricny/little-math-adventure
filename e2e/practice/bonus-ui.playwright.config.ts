import { defineConfig } from 'playwright/test';
import choice from './choice.playwright.config';
export default defineConfig({
    ...choice,
    testDir: '.', testMatch: ['bonus-ui.spec.ts', 'victory.spec.ts', 'normal-victory.spec.ts'], workers: 1, timeout: 90000,
    outputDir: '../../artifacts/personal-bonuses', reporter: 'list',
});

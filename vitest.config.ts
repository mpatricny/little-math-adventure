import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Browser journeys have their own Playwright runner/configuration.
        exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
});

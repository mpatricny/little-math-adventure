import { defineConfig } from 'playwright/test';
import comparison from './comparison.config';

export default defineConfig({
    ...comparison,
    testMatch: 'comparison-coop.spec.ts',
    outputDir: '../../test-results/comparison-coop',
    webServer: [
        comparison.webServer!,
        { command: 'REMOTE_RELAY_PORT=8876 node ../../scripts/remote-relay.mjs', url: 'http://127.0.0.1:8876/health', reuseExistingServer: true },
    ],
});

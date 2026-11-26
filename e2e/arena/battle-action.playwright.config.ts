import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: '.', testMatch: ['battle-action.spec.ts', 'battle-hud.spec.ts'], workers: 1, timeout: 120_000,
    expect: { timeout: 12_000 },
    outputDir: '../../test-results/battle-action',
    use: {
        baseURL: process.env.LMA_E2E_BASE_URL ?? 'http://127.0.0.1:8023',
        viewport: { width: 1280, height: 720 },
        screenshot: 'only-on-failure', trace: 'retain-on-failure',
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] },
    },
    webServer: process.env.LMA_E2E_BASE_URL ? undefined : {
        command: 'npm run dev -- --host 127.0.0.1 --port 8023 --strictPort',
        url: 'http://127.0.0.1:8023', reuseExistingServer: true,
    },
});

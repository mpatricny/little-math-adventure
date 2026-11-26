import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { openSeededGame, waitForScene } from '../../../../e2e/arena/helpers/arena-harness';

// Capture an isolated test profile. openSeededGame intercepts dev-save and API
// traffic, so this does not read or write the children's server/browser saves.
// No database migration is needed: this read-only scene capture uses fixtures.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openSeededGame(page);
  await page.evaluate(`(async () => {
    const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
    GameStateManager.getInstance().loadSlot(0);
    const game = window.__LITTLE_MATH_GAME__;
    game.scene.getScenes(true).at(-1).scene.start('GuildScene');
  })()`);
  await waitForScene(page, 'GuildScene');
  await page.waitForTimeout(1800);
  await page.locator('#game-container canvas').screenshot({path:'docs/design-drafts/catacombs-access-v1/review/guild-current.png'});
  await writeFile('docs/design-drafts/catacombs-access-v1/review/capture.json',JSON.stringify({errors},null,2));
  console.log('Captured current GuildScene with an isolated fixture. Errors:', errors);
} finally { await browser.close(); }

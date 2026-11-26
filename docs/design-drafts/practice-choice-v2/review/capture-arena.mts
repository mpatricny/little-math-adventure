import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { openSeededGame, activateCoopSession, startDefaultArenaPreview } from '../../../../e2e/arena/helpers/arena-harness';

const out = 'docs/design-drafts/practice-choice-v2/review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const coop of [false, true]) {
    const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await openSeededGame(page, coop);
    if (coop) await activateCoopSession(page);
    await page.evaluate(`import('/src/systems/GameStateManager.ts').then(({ GameStateManager }) => {
      GameStateManager.getInstance().getPlayer().seenGuides = ['arena.free.v1'];
    })`);
    await startDefaultArenaPreview(page);
    await page.waitForFunction(() => {
      const arena = (window as any).__LITTLE_MATH_GAME__.scene.keys.ArenaScene;
      return arena.startBattleButton && arena.playerAStatusPod;
    });
    await page.evaluate(() => {
      const arena = (window as any).__LITTLE_MATH_GAME__.scene.keys.ArenaScene;
      // Only dismiss the instructional overlay in the isolated profile.
      arena.children.list.filter((o: any) => o.name?.includes('visual-guide')).forEach((o: any) => o.setVisible(false));
    });
    await page.waitForTimeout(1200);
    await page.locator('#game-container canvas').screenshot({ path: `${out}/arena-current-${coop ? 'coop' : 'solo'}.png` });
    const inventory = await page.evaluate(`(() => {
      const arena = window.__LITTLE_MATH_GAME__.scene.keys.ArenaScene;
      const describe = (o) => ({ name: o.name, type: o.type, x: o.x, y: o.y, text: o.text,
        texture: o.texture?.key, visible: o.visible, children: o.list?.map(describe) });
      return arena.children.list.map(describe);
    })()`);
    await writeFile(`${out}/arena-current-${coop ? 'coop' : 'solo'}.json`, JSON.stringify(inventory, null, 2));
    await context.close();
  }
  console.log('Captured production ArenaScene in isolated solo and co-op profiles.');
} finally { await browser.close(); }

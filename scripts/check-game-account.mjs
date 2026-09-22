import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8002';
const menu = JSON.parse(readFileSync(new URL('../public/assets/data/scenes.json', import.meta.url))).scenes.MenuScene;
const host = menu.ui.find(element => element.id === 'googleAccountHost');
const newGameHost = menu.ui.find(element => element.id === 'btnNewGameNoSave');
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport, query] of [
    ['desktop', { width: 1280, height: 800 }, ''],
    ['tablet-canvas', { width: 1024, height: 768 }, '?renderer=canvas'],
  ]) {
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage();
      const errors = [];
      let session = 401;
      let failSignOut = false;
      let signInBody;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/v1/me', route => route.fulfill({
        status: session, contentType: 'application/json',
        body: JSON.stringify(session === 200 ? { authenticated: true, accountId: 'test' } : {}),
      }));
      await page.route('**/api/auth/sign-in/social', async route => {
        signInBody = route.request().postDataJSON();
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      });
      await page.route('**/api/auth/sign-out', route => {
        assert.equal(route.request().headers()['content-type'], 'application/json');
        assert.deepEqual(route.request().postDataJSON(), {});
        if (!failSignOut) session = 401;
        return route.fulfill({
          status: failSignOut ? 503 : 200, contentType: 'application/json',
          body: JSON.stringify(failSignOut ? {} : { success: true }),
        });
      });
      await page.goto(`${baseUrl}/${query}`, { waitUntil: 'domcontentloaded' });
      const waitState = state => page.locator(`.game-account[data-auth-state="${state}"]`).waitFor();
      await waitState('anonymous');
      await page.evaluate(() => document.fonts.ready);
      const button = page.locator('[data-google-sign-in]');
      const initialSaves = await page.evaluate(() => JSON.stringify(localStorage));

      async function checkAlignment() {
        const canvas = await page.locator('canvas').boundingBox();
        const box = await button.boundingBox();
        const scale = canvas.width / 1280;
        assert.ok(Math.abs(box.x - (canvas.x + (host.x - host.width / 2) * scale)) < 1, 'Google must align with the scene host');
        assert.ok(Math.abs(box.y - (canvas.y + (host.y - host.height / 2) * scale)) < 1, 'DOM and canvas must share their origin');
        assert.ok(box.height >= 44, 'Touch target must be at least 44 CSS pixels');
        return box;
      }
      const normal = await checkAlignment();
      await page.screenshot({ path: `/tmp/cislokraj-game-account-${name}-normal.png` });
      await button.hover();
      assert.deepEqual(await button.boundingBox(), normal);
      await button.screenshot({ path: `/tmp/cislokraj-game-account-${name}-hover-button.png` });
      await page.mouse.down();
      await button.screenshot({ path: `/tmp/cislokraj-game-account-${name}-pressed-button.png` });
      await page.mouse.move(1, 1);
      await page.mouse.up();
      assert.equal(signInBody, undefined, 'Pointer-out must not start login');
      await button.screenshot({ path: `/tmp/cislokraj-game-account-${name}-pointer-out-button.png` });
      await button.click();
      await page.waitForFunction(() => document.querySelector('.game-account [role=status]').textContent === 'Zkusit znovu');
      assert.deepEqual(signInBody, { provider: 'google', callbackURL: '/hra/', errorCallbackURL: '/hra/?auth_error=google' });
      assert.ok(await button.isEnabled());

      session = 503;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitState('unavailable');
      assert.ok(await button.isVisible());
      assert.ok(await button.isDisabled());
      await page.screenshot({ path: `/tmp/cislokraj-game-account-${name}-unavailable.png` });
      session = 200;
      await page.getByRole('button', { name: 'Zkusit přihlášení znovu' }).click();
      await waitState('authenticated');
      await page.screenshot({ path: `/tmp/cislokraj-game-account-${name}-authenticated.png` });
      failSignOut = true;
      await button.click();
      await page.waitForFunction(() => document.querySelector('.game-account [role=status]').textContent === 'Zkusit znovu');
      await waitState('authenticated');
      failSignOut = false;
      await button.click();
      await waitState('anonymous');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitState('anonymous');
      assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), initialSaves);

      await page.setViewportSize({ width: 1200, height: 760 });
      await page.waitForTimeout(150);
      await checkAlignment();
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width * newGameHost.x / 1280, canvas.y + canvas.height * newGameHost.y / 720);
      await page.locator('.game-account').waitFor({ state: 'detached' });
      await page.locator('input').waitFor();
      assert.deepEqual(errors, []);
      console.log(`${name}: session, errors, sign-out, local saves, pointer states, resize and scene cleanup passed`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }

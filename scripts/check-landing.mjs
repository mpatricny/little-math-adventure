import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8012';
const browser = await chromium.launch({ headless: true });

async function checkViewport(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const scripts = [];
  const runtimeErrors = [];
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('**/v1/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'unauthorized' }),
  }));

  await page.goto(`${baseUrl}/landing.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-auth-root][data-auth-state="anonymous"]').waitFor();
  await page.locator('.gallery img').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    title: document.title,
    imageRatios: [...document.images].map(image => image.naturalWidth / image.naturalHeight),
    gameHref: document.querySelector('.hero .button')?.getAttribute('href'),
    authLabel: document.querySelector('[data-auth-label]')?.textContent,
    figures: document.querySelectorAll('.gallery figure').length,
  }));

  assert.equal(layout.title, 'Číslokraj — matematika jako dobrodružství');
  assert.equal(layout.contentWidth, layout.viewportWidth, `${name} has horizontal overflow`);
  assert.equal(layout.gameHref, '/hra/');
  assert.equal(layout.authLabel, 'Přihlásit se přes Google');
  assert.equal(layout.figures, 3);
  assert.ok(layout.imageRatios.every(ratio => Math.abs(ratio - (16 / 9)) < 0.01));
  // Landing entry, Vite preload helper, and the small shared authentication module.
  assert.ok(scripts.length <= 3, `Landing loads too many scripts: ${scripts.join(', ')}`);
  assert.ok(
    scripts.every(url => !url.includes('phaser') && !url.includes('/src/main.ts')),
    'Landing must not load Phaser or the game entry point',
  );
  assert.deepEqual(runtimeErrors, []);

  const screenshot = `/private/tmp/cislokraj-landing-${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });

  const button = page.locator('.hero .actions .button');
  await button.scrollIntoViewIfNeeded();
  const normal = `/private/tmp/cislokraj-landing-button-${name}-normal.png`;
  const hover = `/private/tmp/cislokraj-landing-button-${name}-hover.png`;
  const pressed = `/private/tmp/cislokraj-landing-button-${name}-pressed.png`;
  await button.screenshot({ path: normal });
  await button.hover();
  await button.screenshot({ path: hover });
  const box = await button.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await button.screenshot({ path: pressed });
  await page.mouse.move(0, 0);
  await page.mouse.up();

  const authButton = page.locator('[data-auth-sign-in]');
  const authNormal = `/private/tmp/cislokraj-google-${name}-normal.png`;
  const authHover = `/private/tmp/cislokraj-google-${name}-hover.png`;
  const authPressed = `/private/tmp/cislokraj-google-${name}-pressed.png`;
  const authDisabled = `/private/tmp/cislokraj-google-${name}-disabled.png`;
  await authButton.screenshot({ path: authNormal });
  await authButton.hover();
  await authButton.screenshot({ path: authHover });
  const authBox = await authButton.boundingBox();
  assert.ok(authBox);
  await page.mouse.move(authBox.x + authBox.width / 2, authBox.y + authBox.height / 2);
  await page.mouse.down();
  await authButton.screenshot({ path: authPressed });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await authButton.evaluate(element => { element.disabled = true; });
  await authButton.screenshot({ path: authDisabled });

  await page.close();
  return {
    name,
    screenshot,
    buttonStates: [normal, hover, pressed],
    authButtonStates: [authNormal, authHover, authPressed, authDisabled],
  };
}

async function checkAuthFlow() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  let signInBody = null;
  await page.route('**/v1/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'unauthorized' }),
  }));
  await page.route('**/api/auth/sign-in/social', async route => {
    signInBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        redirect: true,
        url: `${baseUrl}/landing.html?oauth_test=1`,
      }),
    });
  });

  await page.goto(`${baseUrl}/landing.html`);
  await page.locator('[data-auth-root][data-auth-state="anonymous"]').waitFor();
  await page.locator('[data-auth-sign-in]').click();
  await page.waitForURL('**/landing.html?oauth_test=1');

  assert.deepEqual(signInBody, {
    provider: 'google',
    callbackURL: '/',
    errorCallbackURL: '/?auth_error=google',
  });
  await page.close();
}

async function checkAuthenticatedState() {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  let session = 200;
  await page.route('**/v1/me', route => route.fulfill({
    status: session,
    contentType: 'application/json',
    body: JSON.stringify(session === 200 ? { authenticated: true, accountId: 'test-account' } : {}),
  }));
  await page.route('**/api/auth/sign-out', route => {
    assert.equal(route.request().headers()['content-type'], 'application/json');
    assert.deepEqual(route.request().postDataJSON(), {});
    session = 401;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto(`${baseUrl}/landing.html`);
  const root = page.locator('[data-auth-root][data-auth-state="authenticated"]');
  await root.waitFor();
  const screenshot = '/private/tmp/cislokraj-google-authenticated.png';
  await root.screenshot({ path: screenshot });
  await page.locator('[data-auth-sign-out]').click();
  await page.locator('[data-auth-root][data-auth-state="anonymous"]').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-auth-root][data-auth-state="anonymous"]').waitFor();
  await page.close();
  return screenshot;
}

async function checkUnavailableAuth() {
  const screenshots = [];
  for (const status of [404, 503, 'offline']) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.route('**/v1/me', route => status === 'offline'
      ? route.abort('failed')
      : route.fulfill({ status, contentType: 'application/json', body: '{}' }));
    await page.goto(`${baseUrl}/landing.html`);
    await page.waitForFunction(() => document.querySelector('[data-auth-root]')?.dataset.authState === 'unavailable');
    assert.equal(await page.locator('[data-auth-root]').isHidden(), true);
    assert.equal(await page.locator('[data-auth-sign-in]').isDisabled(), true);
    assert.equal(await page.locator('.hero .actions .button').isVisible(), true);
    const screenshot = `/private/tmp/cislokraj-auth-unavailable-${status}.png`;
    await page.screenshot({ path: screenshot });
    screenshots.push(screenshot);
    await page.close();
  }
  return screenshots;
}

try {
  const results = [];
  results.push(await checkViewport('desktop', { width: 1440, height: 1000 }));
  results.push(await checkViewport('tablet', { width: 1024, height: 768 }));
  await checkAuthFlow();
  const authenticatedState = await checkAuthenticatedState();
  const unavailableStates = await checkUnavailableAuth();
  console.log(JSON.stringify({ baseUrl, results, authenticatedState, unavailableStates }, null, 2));
} finally {
  await browser.close();
}

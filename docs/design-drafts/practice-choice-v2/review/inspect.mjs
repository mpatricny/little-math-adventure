import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('docs/design-drafts/practice-choice-v2/review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  const context = await browser.newContext();
  await context.route('**/__dev-saves/**', route => route.abort());
  await context.route('**/api/**', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:8001/docs/design-drafts/practice-choice-v2/index.html');
    await page.waitForFunction(() => window.practiceChoicePreview);
    for (const screen of ['guild', 'arena', 'board', 'coop']) {
      await page.locator(`[data-screen="${screen}"]`).click();
      await page.locator('#stage').screenshot({ path: `${output}/${screen}-${width}.png`, animations: 'disabled' });
      records.push(await page.evaluate(() => {
        const problems = [...document.querySelectorAll('#stage button')].flatMap(button => {
          const r = button.getBoundingClientRect();
          return r.width < 44 || r.height < 44 ? [{ label: button.getAttribute('aria-label'), width: r.width, height: r.height }] : [];
        });
        const missing = [...document.querySelectorAll('#stage img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.src);
        return { width: innerWidth, screen: window.practiceChoicePreview.state.screen, smallTargets: problems, missing };
      }));
    }
    // Different owners, two independent confirmations, then a committed mode.
    await page.locator('[data-player="A"][data-mode="progress"]').click();
    await page.locator('[data-player="B"][data-mode="practice"]').click();
    await page.locator('[data-ready="A"]').click();
    if (await page.evaluate(() => window.practiceChoicePreview.state.started)) throw new Error('Co-op started before B confirmed');
    await page.locator('[data-ready="B"]').click();
    if (!(await page.evaluate(() => window.practiceChoicePreview.state.started))) throw new Error('Co-op did not start');
    await page.locator('#stage').screenshot({ path: `${output}/confirmed-${width}.png`, animations: 'disabled' });
    await page.locator('[data-screen="guild"]').click();
    await page.locator('#mastered').click();
    if (!(await page.locator('[data-mode="practice"]').isDisabled())) throw new Error('Completed practice remains selectable');
    await page.locator('#stage').screenshot({ path: `${output}/mastered-${width}.png`, animations: 'disabled' });
    await page.locator('#mastered').click();
    await page.locator('[data-mode="practice"]').click();
    await page.locator('#words').click();
    await page.locator('#stage').screenshot({ path: `${output}/no-words-${width}.png`, animations: 'disabled' });
    await page.locator('#words').click();
    if (width === 1280) {
      const button = page.locator('[data-mode="progress"]');
      await button.hover();
      await page.locator('#stage').screenshot({ path: `${output}/hover.png`, animations: 'disabled' });
      await page.mouse.down();
      await page.locator('#stage').screenshot({ path: `${output}/pressed.png`, animations: 'disabled' });
      await page.mouse.up(); await page.mouse.move(5, 5);
      await page.locator('#stage').screenshot({ path: `${output}/pointer-out.png`, animations: 'disabled' });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/checks.json`, JSON.stringify({ records, errors }, null, 2));
  console.log(JSON.stringify({ captures: 24, smallTargets: records.filter(r => r.smallTargets.length), missing: records.filter(r => r.missing.length), errors }));
} finally { await browser.close(); }

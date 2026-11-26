import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

// Only HTML prototypes + in-memory fixtures. No database migrations or live saves involved.
const out = 'docs/design-drafts/catacombs-access-v1/review';
const browser = await chromium.launch({ headless: true });
const errors = [], blocked = [], sizes = [];
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1050 } });
    await context.route('**/api/**', r => { blocked.push(r.request().url()); return r.abort(); });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:8001/docs/design-drafts/catacombs-access-v1/index.html');
    await page.waitForFunction(() => window.catacombPreview);
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const shot = name => page.locator('#fit').screenshot({ path: `${out}/journey-${name}.png`, animations: 'disabled' });
    const targets = async label => {
        const rects = await page.locator('#stage button:visible:not(:disabled)').evaluateAll(bs => bs.filter(b => !b.closest('[inert]')).map(b => {
            const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.textContent.trim(), width: r.width, height: r.height };
        }));
        check(rects.every(r => r.width >= 44 && r.height >= 44), JSON.stringify({ label, rects }));
        sizes.push({ label, minimum: Math.min(...rects.flatMap(r => [r.width, r.height])) });
    };
    for (const width of [1280, 1024, 768]) {
        await page.setViewportSize({ width, height: 1080 });
        await page.locator('#reset').click();
        await page.evaluate(() => document.fonts.ready);
        await shot(`overview-${width}`); await targets(`overview-${width}`);
        await page.locator('[data-target="B2"]').click();
        check(await page.evaluate(() => window.catacombPreview.session.preference('A').targetId === 'B2'), 'Target not remembered');
        await page.locator('[data-gate="B2"]').click();
        await shot(`exam-${width}`); await targets(`exam-${width}`);
        check(await page.locator('#guideTitle').textContent() === 'Nejdřív zkouška', 'Exam cue missing');
        await page.locator('#guideBack').click();
    }
    await page.locator('#words').click();
    await shot('no-words-768');
    await page.locator('[data-gate="B2"]').click();
    await shot('exam-no-words-768');
    await page.locator('#guideBack').click();
    await page.locator('#words').click();
    await page.locator('[data-target="B1"]').hover(); await shot('hover-768');
    await page.mouse.down(); await shot('pressed-768'); await page.mouse.up();
    await page.mouse.move(2, 2); await shot('pointer-out-768');
    await page.locator('#reset').click();
    await page.locator('#demoWin').click();
    const child = page.frameLocator('#flow');
    await child.locator('#ui-journey').waitFor();
    await page.locator('#flowHost').screenshot({ path: `${out}/journey-victory-768.png`, animations: 'disabled' });
    const receipt = await page.evaluate(() => window.catacombPreview.session.battle('A'));
    check(receipt.reward.mana === 1 && receipt.after.speed.value === 6624, 'Wrong runtime reward or speed');
    await child.locator('#ui-journey').click();
    await page.locator('#fit').waitFor({ state: 'visible' });
    check(await page.evaluate(() => window.catacombPreview.owner === 'A' && window.catacombPreview.focus === 'B1'), 'Lost owner/target on return');
    await shot('ready-768');
    await page.locator('#confirm').click();
    await child.locator('#ui-journey').waitFor();
    check(await page.evaluate(() => window.catacombPreview.session.battle('A').id === 1), 'Return duplicated reward');
    await child.locator('#ui-journey').click();
    await page.locator('#demoTrial').click();
    await child.getByRole('button', { name: 'K Pythii', exact: true }).waitFor();
    await page.locator('#flowHost').screenshot({ path: `${out}/journey-rescue-768.png`, animations: 'disabled' });
    check(await page.evaluate(() => window.catacombPreview.session.snapshot().fox.status === 'at_pythia'), 'Rescue wrongly grants ownership');
    await child.getByRole('button', { name: 'K Pythii', exact: true }).click();
    await page.locator('#guide').waitFor({ state: 'visible' }); await shot('pythia-768');
    await page.locator('#guideBack').click();
    await page.locator('#demoWin').click();
    await child.locator('#ui-journey').waitFor();
    await child.locator('#ui-journey').click();
    await page.locator('#demoTrial').click();
    await child.locator('#ui-petStats').waitFor();
    check((await child.locator('#ui-petStats').innerText()).replace(/\s/g, '').includes('6→7'), 'Wrong actual attack upgrade');
    await page.locator('#flowHost').screenshot({ path: `${out}/journey-upgrade-768.png`, animations: 'disabled' });
    await page.locator('[data-view="overview"]').click();
    await page.locator('#demoBind').click();
    check(await page.evaluate(() => window.catacombPreview.session.snapshot().fox.status === 'owned'), 'Binding missing');
    await page.locator('#guideBack').click();
    await page.locator('[data-target="B1"]').click();
    await shot('mastered-768');
    await page.locator('#beforeBattle').click();
    await child.locator('#ui-practice0').waitFor();
    check(await child.locator('#ui-practice0').isEnabled(), 'Mastery disabled proposed training');
    await page.locator('#reset').click();
    await page.locator('[data-owner="B"]').click();
    await page.locator('#demoWin').click();
    await child.locator('#ui-journey').waitFor();
    check(await page.frame({ url: /training-flow-v5/ }).evaluate(() => window.flowPreview.state.owner === 'B'), 'Wrong child receipt owner');
    await child.locator('#ui-journey').click();
    check(await page.evaluate(() => window.catacombPreview.owner === 'B'), 'Wrong child owner on return');
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
    check(storage.local === 0 && storage.session === 0, 'Unexpected storage writes');
    check(errors.length === 0 && blocked.length === 0, JSON.stringify({ errors, blocked }));
    await writeFile(`${out}/journey-checks.json`, JSON.stringify({ errors, blocked, sizes, storage,
        unitTests: 4, migrations: 'Not required: prototype-only in-memory data.',
        visualReview: 'Pending inspection of the generated screenshots.',
        production: false }, null, 2));
    console.log(JSON.stringify({ errors, blocked, sizes, storage, integratedFlow: 'passed' }));
} finally { await browser.close(); }

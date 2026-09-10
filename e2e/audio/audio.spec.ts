import { test, expect, type Page } from 'playwright/test';

async function tap(page: Page, x: number, y: number) {
    const box = (await page.locator('canvas').boundingBox())!;
    const frame = () => page.evaluate(() => new Promise<void>(resolve => (window as any).__LITTLE_MATH_GAME__.events.once('poststep', () => resolve())));
    // Let Phaser process pointer movement and the down/up states in separate frames,
    // including when software WebGL is slower than the automation driver.
    await page.mouse.move(box.x + x * box.width / 1280, box.y + y * box.height / 720);
    await frame(); await page.mouse.down(); await frame(); await page.mouse.up(); await frame();
}
async function snapshot(page: Page) {
    return page.evaluate(async () => (await import('/src/audio/AudioDirector.ts')).gameAudio().snapshot());
}
async function boot(page: Page) {
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'), null, { timeout: 60_000 });
    await page.waitForTimeout(650);
}

test.beforeEach(async ({ page }, info) => {
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            if (/webgl/.test(kind)) return null;
            return (original as any).call(this, kind, ...args);
        } as typeof original;
    });
});

test('sound controls, ducking, cancellation, saved mute, pause and visual bounds', async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page);
    const prefix = `artifacts/audio/${info.project.name}`;
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(info.project.name.includes('canvas') ? 1 : 2);
    await page.screenshot({ path: `${prefix}-menu.png` });
    expect((await snapshot(page)).decks).toHaveLength(0); // No autoplay before a gesture.
    await tap(page, 115, 60);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    await page.waitForTimeout(2500);
    const initial = await snapshot(page);
    expect(initial.unlocked).toBe(true); expect(initial.decks).toHaveLength(1); expect(initial.music).toBe('m01_starfall');
    await page.mouse.move(5, 5); await page.screenshot({ path: `${prefix}-normal.png` });
    const bounds = await page.evaluate(() => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.AudioSettingsScene;
        const problems: string[] = [];
        const controls = scene.children.list.filter((o: any) => o.name?.startsWith('audio') && o.input);
        for (const o of controls) {
            const b = o.getBounds();
            if (b.left < 340 || b.right > 940 || b.top < 240 || b.bottom > 560) problems.push(`outside: ${o.name}`);
            for (const child of o.list ?? []) if (child.type === 'Text') {
                const t = child.getBounds();
                if (t.width > b.width - 12 || t.height > b.height - 8) problems.push(`text overflow: ${o.name}`);
                if (child.texture.source[0].resolution !== child.style.resolution) problems.push(`resolution: ${o.name}`);
            }
        }
        for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].getBounds(), b = controls[j].getBounds();
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) problems.push('overlap');
        }
        return problems;
    });
    expect(bounds).toEqual([]);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + 720 * box.width / 1280, box.y + 290 * box.height / 720);
    await page.screenshot({ path: `${prefix}-hover.png` });
    await page.mouse.down(); await page.screenshot({ path: `${prefix}-pressed.png` });
    await page.mouse.move(5, 5); await page.mouse.up();
    await page.screenshot({ path: `${prefix}-pointer-out.png` });
    expect((await snapshot(page)).settings.music).toBeCloseTo(.75);
    await tap(page, 500, 505);
    await expect.poll(async () => (await snapshot(page)).voiceCount).toBe(1);
    await page.waitForTimeout(750);
    const speaking = await snapshot(page);
    expect(speaking.decks[0].volume).toBeLessThan(initial.decks[0].volume * .5);
    // Next speech replaces the previous line; the two never talk over each other.
    await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts')).gameAudio();
        void a.speak('vo.pythia.welcome', (window as any).__LITTLE_MATH_GAME__.scene.keys.AudioSettingsScene);
    });
    await expect.poll(async () => (await snapshot(page)).events.at(-1)?.id).toBe('vo.pythia.welcome');
    expect((await snapshot(page)).voiceCount).toBe(1);
    await tap(page, 840, 365); // Voice off stops the line immediately.
    expect((await snapshot(page)).voiceCount).toBe(0);
    await tap(page, 840, 290); await tap(page, 840, 440);
    expect((await snapshot(page)).settings).toEqual({ music: 0, voice: 0, effects: 0 });
    expect((await snapshot(page)).decks[0].volume).toBe(0);
    await page.screenshot({ path: `${prefix}-muted.png` });
    await tap(page, 780, 505);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    await page.reload(); await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    expect((await snapshot(page)).settings).toEqual({ music: 0, voice: 0, effects: 0 });
    await tap(page, 115, 60);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    await tap(page, 840, 290); await tap(page, 840, 365); await tap(page, 840, 440); await tap(page, 780, 505);
    // Exercise the real in-game PauseMenu without changing the user's save (isolated browser).
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('TownScene'));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('TownScene'));
    await page.waitForTimeout(500);
    await tap(page, 58, 58); // Open the same menu through its real HUD button.
    await expect.poll(async () => (await snapshot(page)).decks.every(d => d.paused)).toBe(true);
    await page.screenshot({ path: `${prefix}-pause.png` });
    await tap(page, 640, 640);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    expect((await snapshot(page)).music).toBe('m02_mathoria');
    await tap(page, 780, 505); await page.waitForTimeout(250);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('TownScene'));
    expect((await snapshot(page)).decks.some(d => !d.paused)).toBe(true);
    expect(errors).toEqual([]);
});

test('music loop, scene mapping, pending voice cancellation and missing-file fallback', async ({ page }, info) => {
    test.skip(info.project.name.includes('canvas'), 'Mixer behavior is independent of the renderer.');
    await boot(page); await tap(page, 115, 60);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    const mappings = await page.evaluate(async () => {
        const { sceneMusic } = await import('/src/audio/SceneAudioPlugin.ts');
        return ['MenuScene', 'TownScene', 'PythiaWorkshopScene', 'ForestRoomScene', 'BattleScene', 'GuardianLairScene', 'ForestCampScene', 'SilverpondTownMockScene', 'UnderwaterRoomScene', 'ZyxRocketInterludeScene'].map(s => sceneMusic(s));
    });
    expect(mappings).toEqual(['m01_starfall', 'm02_mathoria', 'm03_crystal_workshop', 'm04_forest', 'm05_battle', 'm04_forest', 'm07_rest', 'm08_silverpond', 'm09_underwater', 'm10_zyx_hope']);
    await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts')).gameAudio();
        const { sceneMusic } = await import('/src/audio/SceneAudioPlugin.ts');
        a.setMusic(sceneMusic('BattleScene', true));
    });
    expect((await snapshot(page)).music).toBe('m06_guardian');
    await page.waitForTimeout(2800);
    const before = await snapshot(page);
    await page.evaluate(async () => (await import('/src/audio/AudioDirector.ts')).gameAudio().setMusic('m06_guardian'));
    expect((await snapshot(page)).decks[0].time).toBeGreaterThanOrEqual(before.decks[0].time);
    // Jump to the real MP3's final overlap; assert a fresh copy starts and the old one is removed.
    await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts')).gameAudio() as any;
        a.decks[0].audio.currentTime = a.decks[0].audio.duration - 1.9;
    });
    await expect.poll(async () => (await snapshot(page)).decks.length).toBe(2);
    await expect.poll(async () => (await snapshot(page)).decks.length).toBe(1);
    expect((await snapshot(page)).decks[0].time).toBeLessThan(5);
    await page.route('**/vo.rocket.3.wav', async route => { await new Promise(r => setTimeout(r, 250)); await route.continue(); });
    await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts')).gameAudio(), owner = {};
        const pending = a.speak('vo.rocket.3', owner); a.cancel(owner); await pending;
    });
    expect((await snapshot(page)).events.some(e => e.id === 'vo.rocket.3' && e.type === 'voice')).toBe(false);
    await page.route('**/vo.descent.intro.wav', route => route.abort());
    const resolved = await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts')).gameAudio();
        await a.speak('vo.descent.intro', {}); return true;
    });
    expect(resolved).toBe(true); expect((await snapshot(page)).voiceCount).toBe(0);
    expect((await snapshot(page)).events.some(e => e.id === 'vo.descent.intro' && e.type === 'unavailable')).toBe(true);
});

test('Zyx dialogue follows the actual pages and stops when leaving the scene', async ({ page }, info) => {
    test.skip(info.project.name.includes('canvas'), 'Dialogue sequencing is independent of the renderer.');
    await boot(page); await tap(page, 115, 60);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    await tap(page, 780, 505);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ZyxRocketInterludeScene', { testMode: true }));
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.rocket.1'), { timeout: 15_000 }).toBe(true);
    expect((await snapshot(page)).music).toBe('m10_zyx_hope');
    for (const id of ['vo.rocket.2', 'vo.rocket.3']) {
        const point = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.actionButton.root;
            return { x: b.x, y: b.y };
        });
        await tap(page, point.x, point.y);
        await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === id)).toBe(true);
        expect((await snapshot(page)).voiceCount).toBe(1);
        await page.waitForTimeout(400);
    }
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.scene.start('MenuScene'));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    expect((await snapshot(page)).voiceCount).toBe(0);
});

test('crystal machine spoken steps match the interactive state and visible instruction', async ({ page }, info) => {
    await boot(page); await tap(page, 115, 60);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('AudioSettingsScene'));
    await tap(page, 780, 505);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ZyxCrystalMachineScene', { testMode: true }));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('ZyxCrystalMachineScene'));
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.machine.numbers')).toBe(true);
    const points = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        const { values, target } = s.puzzleInstance.payload;
        for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) for (let k = j + 1; k < values.length; k++) {
            if (values[i] + values[j] + values[k] === target) return [i, j, k].map(index => ({ x: s.options[index].root.x, y: s.options[index].root.y }));
        }
        throw new Error('No valid machine solution');
    });
    for (const p of points) { await tap(page, p.x, p.y); await page.waitForTimeout(100); }
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.machine.crystal')).toBe(true);
    const touch = async (field: string) => {
        const p = await page.evaluate(field => {
            const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene[field];
            return { x: root.x, y: root.y };
        }, field);
        await tap(page, p.x, p.y);
    };
    await touch('crystalRoot');
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.machine.slot')).toBe(true);
    const title = await page.evaluate(() => {
        const t = (window as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.titleText, b = t.getBounds();
        return { text: t.text, width: b.width, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    expect(title.text).toBe('KLIKNI NA ZELENÉ MÍSTO'); expect(title.width).toBeLessThanOrEqual(380); expect(title.left).toBeGreaterThan(30); expect(title.right).toBeLessThan(1250);
    await page.screenshot({ path: `artifacts/audio/${info.project.name}-machine-slot.png` });
    await touch('questSlotZone');
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.machine.activate')).toBe(true);
    await touch('actionRoot');
    await expect.poll(async () => (await snapshot(page)).events.some(e => e.id === 'vo.machine.done')).toBe(true);
    await page.screenshot({ path: `artifacts/audio/${info.project.name}-machine-done.png` });
});

import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => (window as any).__LITTLE_MATH_GAME__.events.once('poststep', () => resolve())));
async function capture(page: Page, path: string): Promise<void> {
    const missing = await page.evaluate(() => {
        const found: string[] = [];
        const visit = (object: any) => {
            if (object.visible === false || object.alpha === 0) return;
            if (object.texture?.key === '__MISSING') found.push(object.name || object.type);
            object.list?.forEach(visit);
        };
        (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).forEach((scene: any) => scene.children.list.forEach(visit));
        return found;
    });
    expect(missing, 'Visible image controls must have their real textures').toEqual([]);
    await page.screenshot({ path });
}
async function clickNamed(page: Page, name: string): Promise<void> {
    const point = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const find = (objects: any[]): any => {
            for (const object of objects) {
                if (object.visible === false) continue;
                if (object.name === name) return object;
                const child = object.list && find(object.list); if (child) return child;
            }
        };
        const object = find(scene.children.list); if (!object) throw new Error(`Missing control ${name}`);
        const p = object.getWorldTransformMatrix().transformPoint(0, 0); return { x: p.x, y: p.y };
    }, name);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
    await frame(page);
    await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}
async function verifyButtonSurface(page: Page, renderer: string, name = 'hubDay'): Promise<void> {
    const state = () => page.evaluate(name => {
        const button = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.content.getByName(name);
        const point = button.getWorldTransformMatrix().transformPoint(0, 0);
        return { x: point.x, y: point.y, width: button.width, height: button.height, surfaceY: button.list[0].y };
    }, name);
    await page.mouse.move(10, 10); await frame(page);
    const normal = await state(); const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + normal.x * box.width / 1280, box.y + normal.y * box.height / 720); await frame(page);
    expect(await state()).toEqual({ ...normal, surfaceY: -2 });
    await capture(page, `artifacts/ui-refresh-v2/profiles/${name}-hover-${renderer}.png`);
    await page.mouse.down(); await frame(page);
    expect(await state()).toEqual({ ...normal, surfaceY: 2 });
    if (name === 'hubCoop') {
        const pressed = await state();
        expect(pressed.x + pressed.width / 2).toBeLessThanOrEqual(1115);
        expect(pressed.y + pressed.height / 2 + pressed.surfaceY).toBeLessThanOrEqual(592);
    }
    await capture(page, `artifacts/ui-refresh-v2/profiles/${name}-pressed-${renderer}.png`);
    await page.mouse.move(10, 10); await frame(page); await page.mouse.up(); await frame(page);
    expect(await state()).toEqual(normal);
    expect(await page.evaluate(() => !!(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.dailyProgressOverlay?.getIsVisible())).toBe(false);
}
async function seedLearning(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const { createLearningProfileSnapshot } = await import('/src/systems/LearningProfileView.ts');
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        for (const slot of [0, 1]) {
            const save = JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!);
            save.player.name = slot === 0 ? 'Anastázie-Dominika' : 'Borek';
            const data = createLearningProfileSnapshot(slot, save.player, save.mathStats).stats.masteryData;
            if (slot === 1) data.selectedStartBand = 'E';
            data.subAtoms[slot === 0 ? 'A1' : 'E1'].state = slot === 0 ? 'fluent' : 'training';
            const now = Date.now();
            data.problemRecords.learning = { problemKey: 'learning', subAtomId: slot === 0 ? 'A1' : 'E1', form: 'result_unknown',
                attempts: Array.from({ length: slot === 0 ? 3 : 1 }, (_, i) => ({ timestamp: now + i, correct: slot === 0 && i < 2,
                    responseTimeMs: 4000, context: 'battle', sequenceIndex: i + 1 })) };
            data.comparisonChapter!.attempts = slot === 0 ? [{ timestamp: now - 86400000, correct: true, responseTimeMs: 3200,
                diagnosticMode: false, stage: 'number_symbol', sequenceIndex: 5 }] as any : [];
            save.mathStats.masteryData = data; save.mathStats.totalAttempts = slot === 0 ? 4 : 1;
            const old = new Date(now); old.setDate(old.getDate() - 14);
            const oldKey = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
            save.player.dailyProgressLog = { [oldKey]: { coinsEarned: 1, manaEarned: 0, crystalsEarned: 0, milestones: [] } };
            localStorage.setItem(`littleMathAdventure_slot_${slot}`, JSON.stringify(save));
        }
        GameStateManager.getInstance().loadSlot(0);
    });
    await page.waitForTimeout(100);
}
async function day(page: Page) {
    return page.evaluate(() => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene;
        return { slot: scene.dailyProgressOverlay.getSelectedSlotIndex(), ...scene.dailyProgressOverlay.contentRoot.getData('day') };
    });
}

for (const renderer of ['webgl', 'canvas']) test(`players, personal day and true learning bands — ${renderer}`, async ({ page }) => {
    if (renderer === 'canvas') await page.setViewportSize({ width: 1024, height: 768 });
    await openSeededGame(page, true);
    if (renderer === 'canvas') {
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene');
    }
    await seedLearning(page);
    await clickNamed(page, 'btnContinueMedievalButton'); await waitForScene(page, 'MenuNewScene');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.profiles.length)).toBe(2);
    await capture(page, `artifacts/ui-refresh-v2/profiles/hub-${renderer}.png`);
    const before = await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        return { saves: [0, 1].map(slot => localStorage.getItem(`littleMathAdventure_slot_${slot}`)),
            active: GameStateManager.getInstance().getActiveSlotIndex() };
    });
    await verifyButtonSurface(page, renderer);
    await verifyButtonSurface(page, renderer, 'hubCoop');
    await clickNamed(page, 'hubDay');
    expect(await day(page)).toMatchObject({ slot: 0, attempts: 3, correct: 2, wrong: 1 });
    await capture(page, `artifacts/ui-refresh-v2/profiles/day-${renderer}.png`);
    await page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__; game.sound.mute = true;
        const hidden: any[] = [];
        const visit = (o: any) => { if (o.type === 'Text' && /\p{L}/u.test(o.text)) { hidden.push(o); o.setAlpha(0); } o.list?.forEach(visit); };
        visit(game.scene.keys.MenuNewScene.dailyProgressOverlay.container);
        (window as any).__profileHiddenText = hidden;
    });
    await capture(page, `artifacts/ui-refresh-v2/profiles/day-no-prose-${renderer}.png`);
    await page.evaluate(() => (window as any).__profileHiddenText.forEach((o: any) => o.setAlpha(1)));
    await clickNamed(page, 'learningProfileNext');
    expect(await day(page)).toMatchObject({ slot: 1, attempts: 1, correct: 0, wrong: 1 });
    await clickNamed(page, 'dailyWeekPrevious');
    await clickNamed(page, 'dailyHistory:0');
    expect(await day(page)).toMatchObject({ slot: 1, attempts: 0 });
    await capture(page, `artifacts/ui-refresh-v2/profiles/day-empty-${renderer}.png`);
    await clickNamed(page, 'learningClose');
    await clickNamed(page, 'hubMap');
    const bands = () => page.evaluate(() => {
        const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay;
        return o.scrollPanel.getContent().list.filter((node: any) => node.name.startsWith('learningBand:')).map((node: any) => node.name);
    });
    expect(await bands()).toEqual(['learningBand:E']);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel.scrollbarThumb.visible)).toBe(false);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-start-e-${renderer}.png`);
    await clickNamed(page, 'learningProfilePrevious');
    expect(await bands()).toEqual(['learningBand:A', 'learningBand:B', 'learningBand:C', 'learningBand:D', 'learningBand:E']);
    expect(await page.evaluate(() => {
        const overlay = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay;
        const panel = overlay.scrollPanel, viewport = panel.viewport;
        const bottom = panel.parentContainer.getWorldTransformMatrix().transformPoint(0, viewport.y + viewport.height).y;
        return panel.getContent().getByName('learningBand:C').list.filter((o: any) => o.input).every((card: any) => {
            const point = card.getWorldTransformMatrix().transformPoint(0, card.height / 2);
            return point.y <= bottom;
        });
    }), 'The third band must show complete cards and counts').toBe(true);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-${renderer}.png`);
    const scrollbarState = () => page.evaluate(() => {
        const panel = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel;
        const a = panel.scrollbarAppearance;
        const transform = panel.parentContainer.getWorldTransformMatrix();
        return { track: a.host, inset: a.inset, thumbY: panel.scrollbarThumb.y, thumbHeight: panel.scrollbarThumb.getData('height'),
            offset: panel.getScrollOffset(), visible: panel.scrollbarThumb.visible, inputWidth: panel.scrollbarInput.width,
            top: transform.transformPoint(a.host.x, a.host.y), bottom: transform.transformPoint(a.host.x, a.host.y + a.host.height) };
    });
    const top = await scrollbarState();
    expect(top.visible).toBe(true); expect(top.thumbY).toBe(top.track.y + top.inset);
    const scrollCanvas = (await page.locator('canvas').boundingBox())!;
    expect(top.inputWidth * scrollCanvas.width / 1280).toBeGreaterThanOrEqual(44);
    const moveScrollPointer = (x: number, y: number) => page.mouse.move(scrollCanvas.x + x * scrollCanvas.width / 1280, scrollCanvas.y + y * scrollCanvas.height / 720);
    // Drag the real thumb; no programmatic scroll assignment can satisfy this assertion.
    await moveScrollPointer(top.top.x, top.top.y + top.inset + top.thumbHeight / 2); await frame(page);
    await page.mouse.down(); await frame(page);
    await moveScrollPointer(top.bottom.x, top.bottom.y - top.inset); await frame(page);
    await page.mouse.up(); await frame(page);
    const draggedEnd = await scrollbarState();
    expect(draggedEnd.offset).toBeGreaterThan(200);
    expect(draggedEnd.thumbY + draggedEnd.thumbHeight).toBeCloseTo(top.track.y + top.track.height - top.inset, 5);
    expect(await page.evaluate(() => {
        const panel = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel;
        const transform = panel.parentContainer.getWorldTransformMatrix(), v = panel.viewport;
        const top = transform.transformPoint(0, v.y).y, bottom = transform.transformPoint(0, v.y + v.height).y;
        return ['C', 'D', 'E'].every(band => panel.getContent().getByName(`learningBand:${band}`).list
            .filter((o: any) => o.input).every((card: any) => {
                const t = card.getWorldTransformMatrix();
                return t.transformPoint(0, -card.height / 2).y >= top && t.transformPoint(0, card.height / 2).y <= bottom;
            }));
    }), 'The end of the map must also contain three complete bands').toBe(true);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-scroll-drag-end-${renderer}.png`);
    // A click on the unoccupied top of the track returns to the beginning.
    await moveScrollPointer(top.top.x, top.top.y + top.inset); await frame(page);
    await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
    expect((await scrollbarState()).offset).toBe(0);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-scroll-track-top-${renderer}.png`);
    // Wheel input works over the separate track as well as content touch below.
    await moveScrollPointer(top.top.x, 400);
    await page.mouse.wheel(0, 320); await frame(page); await frame(page);
    expect((await scrollbarState()).offset).toBeGreaterThan(0);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-scroll-middle-${renderer}.png`);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel.setScrollOffset(Number.MAX_SAFE_INTEGER));
    const end = await scrollbarState();
    expect(end.thumbY + end.thumbHeight).toBeCloseTo(end.track.y + end.track.height - end.inset, 5);
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-scroll-end-${renderer}.png`);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel.setScrollOffset(0));
    const cdp = await page.context().newCDPSession(page);
    const canvas = (await page.locator('canvas').boundingBox())!;
    const touch = (y: number) => ({ x: canvas.x + 950 * canvas.width / 1280, y: canvas.y + y * canvas.height / 720 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(520)] }); await frame(page);
    for (const y of [480, 420, 360, 300, 240]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(y)] }); await frame(page);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await frame(page);
    expect(await page.evaluate(() => {
        const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay;
        return { scrolled: o.scrollPanel.getScrollOffset() > 200, selected: [...o.expandedSubAtoms] };
    })).toEqual({ scrolled: true, selected: [] });
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.scrollPanel.setScrollOffset(0));
    await clickNamed(page, 'masteryMapNode:A2');
    await capture(page, `artifacts/ui-refresh-v2/profiles/map-subtraction-${renderer}.png`);
    const textState = await page.evaluate(() => {
        const overlay = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay;
        const texts: any[] = []; const walk = (o: any) => { if (o.type === 'Text') texts.push(o); o.list?.forEach(walk); }; walk(overlay.container);
        return { resolutions: texts.every(t => t.style.resolution === 2 && t.frame.source.resolution === 2),
            detail: texts.map(t => t.text).filter((t: string) => t.includes('−')) };
    });
    expect(textState.resolutions).toBe(true); expect(textState.detail.length).toBeGreaterThan(3);
    await clickNamed(page, 'learningClose');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.masteryMapOverlay.getIsVisible())).toBe(false);
    const hiddenOffset = (await scrollbarState()).offset;
    await moveScrollPointer(top.top.x, top.top.y + top.inset); await frame(page);
    await page.mouse.wheel(0, 320); await frame(page);
    await page.mouse.down(); await frame(page); await moveScrollPointer(top.bottom.x, top.bottom.y - top.inset); await frame(page);
    await page.mouse.up(); await frame(page);
    expect((await scrollbarState()).offset).toBe(hiddenOffset);
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene;
        (window as any).__previousScrollbarInput = s.masteryMapOverlay.scrollPanel.scrollbarInput;
        return s.input.hitTestPointer(s.input.activePointer).some((o: any) => o.name === 'learningScrollbarInput');
    })).toBe(false);
    const after = await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        return { saves: [0, 1].map(slot => localStorage.getItem(`littleMathAdventure_slot_${slot}`)),
            active: GameStateManager.getInstance().getActiveSlotIndex() };
    });
    expect(after).toEqual(before);
    await clickNamed(page, 'hubCoop'); await waitForScene(page, 'CoopSetupScene');
    expect(await page.evaluate(() => !(window as any).__previousScrollbarInput.scene)).toBe(true);
    await clickNamed(page, 'playerCard:0');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CoopSetupScene.player2Slot)).toBe(-1);
    await clickNamed(page, 'playerCard:1');
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CoopSetupScene;
        return { first: s.player1Slot, second: s.player2Slot, current: s.currentSlotIndex };
    })).toEqual({ first: 0, second: 1, current: 1 });
    await capture(page, `artifacts/ui-refresh-v2/profiles/coop-${renderer}.png`);
    await clickNamed(page, 'hubCoopStart'); await waitForScene(page, 'TownScene');
    expect(await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const c = CoopSessionManager.getInstance(); return [c.isCoopActive(), c.getPlayerASlotIndex(), c.getPlayerBSlotIndex()];
    })).toEqual([true, 0, 1]);
});

test('menu inspection preserves active co-op B and independent live chapter data', async ({ page }) => {
    await openSeededGame(page, true); await seedLearning(page);
    await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const c = CoopSessionManager.getInstance(); c.startSession(0, 1); c.activatePlayerB();
        c.getPlayerAMasteryData()!.subAtoms.A1.successfulSolves = 71;
        const g = (window as any).__LITTLE_MATH_GAME__; g.scene.keys.MenuScene.scene.restart();
    });
    await waitForScene(page, 'MenuScene');
    await clickNamed(page, 'btnContinueMedievalButton'); await waitForScene(page, 'MenuNewScene');
    await clickNamed(page, 'hubMap'); await clickNamed(page, 'learningProfileNext'); await clickNamed(page, 'learningClose');
    await clickNamed(page, 'hubDay'); await clickNamed(page, 'learningProfilePrevious'); await clickNamed(page, 'learningClose');
    expect(await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const c = CoopSessionManager.getInstance(); return { active: c.isCoopActive(), owner: c.getActivePlayer(),
            slot: GameStateManager.getInstance().getActiveSlotIndex(), solves: c.getPlayerAMasteryData()!.subAtoms.A1.successfulSolves };
    })).toEqual({ active: true, owner: 'B', slot: 1, solves: 71 });
});

test('empty hub creates a player, maximum accepted name fits, full hub disables creation, solo resumes chosen hero', async ({ page }) => {
    await openSeededGame(page);
    await page.evaluate(() => {
        for (let slot = 0; slot < 8; slot++) localStorage.removeItem(`littleMathAdventure_slot_${slot}`);
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('MenuNewScene');
    });
    await waitForScene(page, 'MenuNewScene');
    await capture(page, 'artifacts/ui-refresh-v2/profiles/hub-empty.png');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.profiles.length)).toBe(0);
    await clickNamed(page, 'hubNewPlayer'); await waitForScene(page, 'CharacterSelectNewScene');
    await page.locator('#characterNameInput').fill('Maxmilián123');
    expect(await page.locator('#characterNameInput').getAttribute('maxlength')).toBe('12');
    const confirm = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CharacterSelectNewScene;
        const h = s.sceneBuilder.get('Green_button'); return { x: h.x, y: h.y };
    });
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + confirm.x * box.width / 1280, box.y + confirm.y * box.height / 720, { delay: 70 });
    await waitForScene(page, 'BandSelectScene');
    await clickNamed(page, 'band-A'); await clickNamed(page, 'band-confirm');
    await waitForScene(page, 'ComicScene');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.name)).toBe('Maxmilián123');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ComicScene.scene.start('MenuNewScene'));
    await waitForScene(page, 'MenuNewScene');
    await capture(page, 'artifacts/ui-refresh-v2/profiles/hub-one.png');
    await clickNamed(page, 'hubCoop'); await waitForScene(page, 'CoopSetupScene');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CoopSetupScene.content.getByName('hubCoopStart').input.enabled)).toBe(false);
    await capture(page, 'artifacts/ui-refresh-v2/profiles/coop-one-disabled.png');
    await clickNamed(page, 'playersHubClose'); await waitForScene(page, 'MenuNewScene');
    await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!);
        for (let slot = 1; slot < 8; slot++) {
            const copy = structuredClone(saved); copy.player.name = slot === 7 ? 'Alexandřina1' : `Hrdina ${slot + 1}`;
            copy.player.gameplayProfileId = `ui-refresh-fixture-${slot}`;
            localStorage.setItem(`littleMathAdventure_slot_${slot}`, JSON.stringify(copy));
        }
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.scene.restart({ selectedSlotIndex: 7 });
    });
    await waitForScene(page, 'MenuNewScene');
    await capture(page, 'artifacts/ui-refresh-v2/profiles/hub-eight.png');
    const bounds = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene;
        const cards = s.content.list.filter((o: any) => o.name.startsWith('playerCard:'));
        const namesFit = cards.every((card: any) => {
            const t = card.list[0].list.find((o: any) => o.name?.startsWith('playerName:'));
            const r = t.getBounds(), transform = card.getWorldTransformMatrix();
            const topLeft = transform.transformPoint(-card.width / 2, -card.height / 2);
            const bottomRight = transform.transformPoint(card.width / 2, card.height / 2);
            return r.left >= topLeft.x && r.right <= bottomRight.x && r.top >= topLeft.y && r.bottom <= bottomRight.y;
        });
        return { namesFit, count: cards.length, createEnabled: s.content.getByName('hubNewPlayer').input.enabled };
    });
    expect(bounds).toEqual({ namesFit: true, count: 8, createEnabled: false });
    await clickNamed(page, 'hubDeletePlayer');
    await capture(page, 'artifacts/ui-refresh-v2/profiles/delete-decision.png');
    await clickNamed(page, 'hubDeleteCancel');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.profiles.length)).toBe(8);
    await clickNamed(page, 'hubSolo'); await waitForScene(page, 'TownScene');
    expect(await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        return { slot: GameStateManager.getInstance().getActiveSlotIndex(), coop: CoopSessionManager.getInstance().isCoopActive() };
    })).toEqual({ slot: 7, coop: false });
});

import type { Page } from 'playwright/test';
import {
    activateCoopSession, expect, openSeededGame, startArenaPreview,
    startBattleFromPreview, test, waitForScene,
} from './helpers/arena-harness';
import { getProductionWaveExpectation } from './helpers/production-encounters';

const artifacts = 'artifacts/battle-dock-v2';

async function waitPhase(page: Page, phase: string) {
    await page.waitForFunction(expected =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === expected,
    phase, { timeout: 30_000 });
}

async function point(page: Page) {
    const root = await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { x: battle.attackButton.x, y: battle.attackButton.y };
    });
    const canvas = await page.locator('#game-container canvas').boundingBox();
    if (!canvas) throw new Error('Missing game canvas');
    return { x: canvas.x + root.x * canvas.width / 1280, y: canvas.y + root.y * canvas.height / 720 };
}

async function snapshot(page: Page) {
    return page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const d = b.battleActionDock;
        const a = d.attack;
        const text = d.ownerMark.text;
        const bounds = (object: any) => {
            const { x, y, width, height } = object.getBounds();
            return { x, y, width, height };
        };
        const counts = (data: any) => Object.values(data?.problemRecords ?? {})
            .reduce((total: number, record: any) => total + record.attempts.length, 0);
        return {
            phase: b.battleState.phase,
            sameRoot: b.attackButton === (window as any).__BATTLE_ATTACK_ROOT__,
            kind: b.attackButton.getData('actorKind'),
            owner: b.attackButton.getData('owner'),
            ownerNumber: text.text,
            portrait: d.ownerPortrait.texture.key,
            icon: a.normalIcon.texture.key,
            petId: b.attackButton.getData('petId'),
            enabled: a.enabled,
            interactive: b.attackButton.input?.enabled === true,
            root: { x: a.root.x, y: a.root.y, scaleX: a.root.scaleX, scaleY: a.root.scaleY },
            surfaceY: a.surface.y,
            pairedSurface: a.frame.parentContainer === a.normalIcon.parentContainer,
            aspect: [a.normalIcon.scaleX, a.normalIcon.scaleY],
            textResolution: [text.style.resolution, text.frame.source.resolution],
            footer: d.layout.footer,
            touchSizes: [a.root.width, d.potion.root.width],
            pieces: [a.frame, d.potion.frame, d.potionBadge.plate, d.ownerFrame, d.ownerMark.plate,
                ...(d.powerBadge.root.visible ? [d.powerBadge.plate] : [])].map(bounds),
            groups: [d.ownerRoot, a.root, d.potion.root].map(bounds),
            attachedCounts: d.potionBadge.root.parentContainer === d.potion.surface
                && d.powerBadge.root.parentContainer === a.surface,
            potion: { count: d.potionBadge.text.text, enabled: d.potion.enabled,
                visible: d.potion.root.visible, surfaceY: d.potion.surface.y },
            power: { count: d.powerBadge.text.text, visible: d.powerBadge.root.visible },
            paintedFooter: Boolean(d.footerPlate),
            actionRoots: b.children.list.filter((child: any) => child.name === 'battleAttackAction').length,
            oldPetRoot: Boolean(b.petAttackButton || d.petRoot),
            mastery: b.isCoopMode
                ? [counts(b.coopMasteryA), counts(b.coopMasteryB)]
                : [counts(b.gameState.getMasteryData()), 0],
            problems: b.mathBoard.problems.length,
            sources: b.mathBoard.problems.map((p: any) => p.source ?? 'player'),
            powers: b.mathBoard.problems.map((p: any) => p.damageMultiplier ?? 1),
        };
    });
}

function expectFooterSpace(state: Awaited<ReturnType<typeof snapshot>>, viewportWidth: number) {
    const footer = state.footer;
    expect(footer.y - footer.height / 2).toBeGreaterThanOrEqual(592);
    expect(footer.y + footer.height / 2).toBeLessThanOrEqual(712);
    for (const size of state.touchSizes) expect(size * viewportWidth / 1280).toBeGreaterThanOrEqual(44);
    for (const piece of state.pieces) {
        expect(piece.x).toBeGreaterThanOrEqual(footer.x - footer.width / 2 + 6);
        expect(piece.x + piece.width).toBeLessThanOrEqual(footer.x + footer.width / 2 - 6);
        expect(piece.y).toBeGreaterThanOrEqual(footer.y - footer.height / 2 + 6);
        expect(piece.y + piece.height).toBeLessThanOrEqual(footer.y + footer.height / 2 - 6);
    }
    for (let index = 0; index < state.groups.length; index++) {
        const a = state.groups[index];
        for (const b of state.groups.slice(index + 1)) {
            const gapX = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
            const gapY = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
            expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(4);
        }
    }
}

async function answerBatch(page: Page, mathPhase: string) {
    for (let safety = 0; safety < 12; safety++) {
        const state = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            return { phase: b.battleState.phase, accepting: b.mathBoard.acceptingAnswer };
        });
        if (state.phase !== mathPhase) return;
        await page.waitForFunction(expected => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            return b.battleState.phase !== expected || b.mathBoard.acceptingAnswer;
        }, mathPhase);
        const submitted = await page.evaluate(expected => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (b.battleState.phase !== expected) return false;
            const board = b.mathBoard;
            const problem = board.problems[board.currentProblemIndex];
            const index = problem.choices.findIndex((choice: number) => choice === problem.answer);
            board.submitChoice(index);
            return true;
        }, mathPhase);
        if (!submitted) return;
        await page.waitForTimeout(550);
    }
    throw new Error(`Attack batch did not finish: ${mathPhase}`);
}

for (const renderer of ['webgl', 'canvas'] as const) {
    for (const coop of [false, true]) {
        test(`one attack control completes ${coop ? 'co-op' : 'solo'} hero and pet turns — ${renderer}`, async ({ page }) => {
            const label = `${renderer}-${coop ? 'coop' : 'solo'}`;
            await page.setViewportSize(renderer === 'canvas' ? { width: 1024, height: 768 } : { width: 1280, height: 720 });
            await openSeededGame(page, coop, {}, {}, {
                name: 'Alexandrinka', attack: 4, equippedWeapon: 'sword_reinforced',
                activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], potions: 1,
                unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 4,
                seenGuides: ['arena.free.v1'],
            }, {
                name: 'Bohuslav', characterType: 'girl_knight', attack: 2, equippedWeapon: 'sword_wooden',
                activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], potions: 0,
                unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 3,
                seenGuides: ['arena.free.v1'],
            });
            if (renderer === 'canvas') {
                await page.goto('/?renderer=canvas');
                await waitForScene(page, 'MenuScene');
            }
            if (coop) await activateCoopSession(page);
            const scenario = getProductionWaveExpectation(3, 1, coop ? 'coop' : 'solo');
            await startArenaPreview(page, scenario.target);
            await startBattleFromPreview(page);
            await page.evaluate(async () => {
                const game = (window as any).__LITTLE_MATH_GAME__;
                game.sound.mute = true;
                const { gameAudio } = await import('/src/audio/AudioDirector.ts');
                for (const channel of ['music', 'voice', 'effects'] as const) gameAudio().setVolume(channel, 0);
                (window as any).__BATTLE_ATTACK_ROOT__ = game.scene.keys.BattleScene.attackButton;
            });
            const first = await snapshot(page);
            expect(first).toMatchObject({
                sameRoot: true, kind: 'hero', owner: 'A', ownerNumber: '1',
                icon: 'prep-sword-normal-v2', portrait: 'town-hud-heroine-portrait',
                enabled: true, interactive: true, actionRoots: 1, oldPetRoot: false,
                pairedSurface: true, attachedCounts: true, paintedFooter: false, textResolution: [2, 2],
                potion: { count: '1', enabled: true },
            });
            expectFooterSpace(first, renderer === 'canvas' ? 1024 : 1280);
            const center = await point(page);
            await page.mouse.move(1100, 680);
            await page.screenshot({ path: `${artifacts}/${label}-hero-A-normal.png` });
            await page.mouse.move(center.x, center.y);
            await expect.poll(async () => (await snapshot(page)).surfaceY).toBe(-3);
            expectFooterSpace(await snapshot(page), renderer === 'canvas' ? 1024 : 1280);
            await page.screenshot({ path: `${artifacts}/${label}-hero-A-hover.png` });
            await page.mouse.down();
            await expect.poll(async () => (await snapshot(page)).surfaceY).toBe(2);
            expectFooterSpace(await snapshot(page), renderer === 'canvas' ? 1024 : 1280);
            await page.screenshot({ path: `${artifacts}/${label}-hero-A-pressed.png` });
            await page.mouse.move(1100, 680);
            await page.mouse.up();
            const out = await snapshot(page);
            expect(out.phase).toBe('player_turn');
            expect(out.surfaceY).toBe(0);
            expect(out.root).toEqual(first.root);
            await page.screenshot({ path: `${artifacts}/${label}-hero-A-out.png` });

            const turns = coop ? [
                ['player_turn', 'player_math', 'A', 'hero', 'prep-sword-normal-v2'],
                ['player_b_turn', 'player_b_math', 'B', 'hero', 'prep-sword-normal-v2'],
                ['pet_turn', 'pet_math', 'A', 'pet', 'companion-fox-01-idle-sheet-portrait'],
                ['pet_b_turn', 'pet_b_math', 'B', 'pet', 'companion-fox-01-idle-sheet-portrait'],
            ] : [
                ['player_turn', 'player_math', 'A', 'hero', 'prep-sword-normal-v2'],
                ['pet_turn', 'pet_math', 'A', 'pet', 'companion-fox-01-idle-sheet-portrait'],
            ];
            for (const [turn, mathPhase, owner, kind, icon] of turns) {
                await waitPhase(page, turn);
                const before = await snapshot(page);
                expect(before).toMatchObject({ sameRoot: true, owner, kind, icon, enabled: true, interactive: true });
                expect(before.aspect[0]).toBeCloseTo(before.aspect[1], 6);
                expect(before.ownerNumber).toBe(owner === 'A' ? '1' : '2');
                // Identical heroine portraits still have an unambiguous owner.
                expect(before.portrait).toBe('town-hud-heroine-portrait');
                expect(before.potion.count).toBe(owner === 'A' ? '1' : '0');
                expect(before.potion.enabled).toBe(owner === 'A' && kind === 'hero');
                if (kind === 'pet') expect(before.power).toEqual({ count: owner === 'A' ? '10' : '9', visible: true });
                expectFooterSpace(before, renderer === 'canvas' ? 1024 : 1280);
                await page.screenshot({ path: `${artifacts}/${label}-${kind}-${owner}.png` });
                await page.mouse.dblclick(center.x, center.y);
                await waitPhase(page, mathPhase);
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
                const during = await snapshot(page);
                expect(during).toMatchObject({ sameRoot: true, owner, kind, enabled: false, interactive: false });
                if (kind === 'pet') expect(during.problems).toBe(1);
                else expect(during.powers).toEqual(owner === 'A' ? [2, 1, 1, 3] : [1, 1, 1]);
                // Stale remote attack commands also use the same phase guard.
                await page.evaluate(() => {
                    const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                    const original = b.isRemoteSessionActive;
                    b.isRemoteSessionActive = () => true;
                    b.handleRemoteCommand({ type: 'attack' });
                    b.handleRemoteCommand({ type: 'attack' });
                    b.isRemoteSessionActive = original;
                });
                expect((await snapshot(page)).powers).toEqual(during.powers);
                await page.screenshot({ path: `${artifacts}/${label}-${kind}-${owner}-disabled.png` });
                await answerBatch(page, mathPhase);
                const after = await snapshot(page);
                const ownerIndex = owner === 'A' ? 0 : 1;
                expect(after.mastery[ownerIndex] - before.mastery[ownerIndex]).toBe(during.problems);
                if (coop) expect(after.mastery[1 - ownerIndex]).toBe(before.mastery[1 - ownerIndex]);
            }
            await waitPhase(page, 'player_turn');
            const reused = await snapshot(page);
            expect(reused).toMatchObject({ sameRoot: true, owner: 'A', kind: 'hero', enabled: true, surfaceY: 0 });
            // Hide all words and mute audio; the dock uses pictures and numbers.
            await page.evaluate(() => {
                const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                const hideWords = (object: any) => {
                    if (typeof object.text === 'string' && /[\p{L}]/u.test(object.text)) object.setVisible(false);
                    object.list?.forEach(hideWords);
                };
                b.children.list.forEach(hideWords);
            });
            await page.setViewportSize({ width: 768, height: 1024 });
            expectFooterSpace(await snapshot(page), 768);
            await page.screenshot({ path: `${artifacts}/${label}-no-reading.png` });
        });
    }
}

test('pause, stale presses, remote commands and scene reuse cannot duplicate an attack', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, {
        activePet: 'pet_slime', ownedPets: ['pet_slime'],
        seenGuides: ['arena.free.v1'],
        equippedWeapon: 'sword_wooden', potions: 1,
        preparation: { kind: 'sword', charges: 3 },
    });
    const scenario = getProductionWaveExpectation(3, 1, 'solo');
    await startArenaPreview(page, scenario.target);
    await startBattleFromPreview(page);
    const center = await point(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.pauseMenu.show();
        const original = b.isRemoteSessionActive;
        b.isRemoteSessionActive = () => true;
        b.handleRemoteCommand({ type: 'attack' });
        b.handleRemoteCommand({ type: 'usePotion' });
        b.isRemoteSessionActive = original;
        b.pauseMenu.hide();
    });
    await page.mouse.up();
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { phase: b.battleState.phase, potions: b.gameState.getPlayer().potions,
            pressed: b.battleActionDock.attack.pressed, y: b.battleActionDock.attack.surface.y };
    })).toEqual({ phase: 'player_turn', potions: 1, pressed: false, y: 0 });

    const issueRemoteAttack = () => page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const original = b.isRemoteSessionActive;
        b.isRemoteSessionActive = () => true;
        b.handleRemoteCommand({ type: 'attack' });
        const batch = b.mathBoard.problems;
        b.handleRemoteCommand({ type: 'attack' });
        b.isRemoteSessionActive = original;
        return { phase: b.battleState.phase, sameBatch: batch === b.mathBoard.problems };
    });
    expect(await issueRemoteAttack()).toEqual({ phase: 'player_math', sameBatch: true });
    await page.mouse.dblclick(center.x, center.y);
    await waitPhase(page, 'player_math');
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.mathBoard.hide();
        b.setPhase('pet_turn');
    });
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    expect(await issueRemoteAttack()).toEqual({ phase: 'pet_math', sameBatch: true });
    await page.mouse.up();
    await waitPhase(page, 'pet_math');
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { pressed: b.battleActionDock.attack.pressed, enabled: b.battleActionDock.attack.enabled,
            attempts: b.gameState.getMathStats().totalAttempts,
            preparation: b.gameState.getPlayer().preparation };
    })).toEqual({ pressed: false, enabled: false, attempts: 0, preparation: { kind: 'sword', charges: 3 } });

    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        (window as any).__OLD_ATTACK_ROOT__ = b.attackButton;
        b.scene.start('MenuScene');
    });
    await waitForScene(page, 'MenuScene');
    await startArenaPreview(page, scenario.target);
    await startBattleFromPreview(page);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { fresh: b.attackButton !== (window as any).__OLD_ATTACK_ROOT__,
            oldActive: (window as any).__OLD_ATTACK_ROOT__.active,
            kind: b.attackButton.getData('actorKind'), pressed: b.battleActionDock.attack.pressed,
            enabled: b.battleActionDock.attack.enabled };
    })).toEqual({ fresh: true, oldActive: false, kind: 'hero', pressed: false, enabled: true });
    await page.screenshot({ path: `${artifacts}/input-guards-after-reuse.png` });
});

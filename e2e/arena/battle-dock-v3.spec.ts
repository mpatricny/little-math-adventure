import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, activateCoopSession, waitForScene } from './helpers/arena-harness';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import { getRepresentativeCoopWaves } from './helpers/production-encounters';
import { legacyFoxJourney } from '../../src/systems/__tests__/legacyFoxJourney';

async function expectDockPlacement(page: Page, foxOwners: number) {
    const state = await page.evaluate(() => {
        const dock = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleActionDock;
        const footer = dock.backing.getBounds();
        const left = dock.ownerFrame.getBounds().left;
        const right = dock.abilityPanel.root.visible ? dock.abilityPanel.outline.getBounds().right
            : Math.max(dock.attack.frame.getBounds().right, dock.powerBadge.plate.getBounds().right);
        const canvas = dock.backing.texture.getSourceImage() as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const bottom = ctx.getImageData(0, canvas.height - 1, canvas.width, 1).data;
        const rightEdge = ctx.getImageData(canvas.width - 8, canvas.height / 2, 1, 1).data;
        let continuousGold = true;
        for (let pixel = 0; pixel < bottom.length; pixel += 4) {
            if (bottom[pixel] <= 200 || bottom[pixel + 1] <= 175 || bottom[pixel + 3] !== 255) {
                continuousGold = false;
                break;
            }
        }
        return {
            owners: dock.abilityPanel.count, marginDifference: (left - footer.left) - (footer.right - right),
            attackX: dock.attackRoot.x, authoredAttackX: dock.wide ? dock.layout.attack.wide.x : dock.layout.attack.x,
            foxOffset: dock.abilityPanel.root.x, rightEdgeAlpha: rightEdge[3], continuousGold,
        };
    });
    expect(state.owners).toBe(foxOwners);
    expect(state.continuousGold).toBe(true);
    if (foxOwners < 2) {
        expect(Math.abs(state.marginDifference)).toBeLessThanOrEqual(2);
        expect(state.rightEdgeAlpha).toBe(0);
    } else {
        expect(state.attackX).toBe(state.authoredAttackX);
        expect(state.foxOffset).toBe(0);
        expect(state.rightEdgeAlpha).toBe(255);
    }
}

for (const renderer of ['webgl', 'canvas']) test(`approved dock in production battle — ${renderer}`, async ({ page }) => {
    await openSeededGame(page, true, {}, {}, {
        name: 'Kitten', characterType: 'girl_knight', activePet: 'pet_catacomb_A',
        ownedPets: ['pet_catacomb_A'], unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 4,
        potions: 1, hp: 14, maxHp: 24,
    }, {
        name: 'Eli', characterType: 'girl_knight', activePet: 'pet_catacomb_A',
        ownedPets: ['pet_catacomb_A'], unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 3,
        potions: 0, hp: 18, maxHp: 25,
    });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await activateCoopSession(page);
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__; g.sound.mute = true;
        g.scene.keys.TownScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 6, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(size);
        await expectDockPlacement(page, 2);
        await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-${size.width}-first.png` });
    }
    const state = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const errors: string[] = [];
        const visit = (o: any) => {
            if (o.texture?.key === '__MISSING') errors.push('missing ' + o.name);
            if (o.type === 'Text' && o.name?.includes('Owner')) {
                const safe = o.getData('safeRegion');
                if (safe && (o.width > safe.width + 1 || o.height > safe.height + 1)) errors.push('overflow ' + o.text);
                if (o.style.resolution !== 2 || o.frame.source.resolution !== 2) errors.push('resolution ' + o.name);
            }
            o.list?.forEach(visit);
        };
        visit(b.battleActionDock.ownerRoot); visit(b.battleActionDock.abilityPanel.root);
        return { errors, owner: b.battleActionDock.abilityOwner, session: !!b.foxSession,
            players: [b.heroHpBar.root.getData('ownerName'), b.heroBHpBar.root.getData('ownerName')] };
    });
    expect(state).toEqual({ errors: [], owner: 'A', session: true, players: ['Kitten', 'Eli'] });
    const audit = isolatedDevProfileAudit(page); expect(audit.observed).toEqual(audit.intercepted);
});

async function clickObject(page: Page, name: string, input: 'mouse' | 'touch' = 'mouse') {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const p = await page.evaluate((name: string) => {
        const g = (window as any).__LITTLE_MATH_GAME__, b = g.scene.keys.BattleScene;
        const find = (o: any): any => o.name === name ? o : o.list?.map(find).find(Boolean);
        const o = b.children.list.map(find).find(Boolean);
        if (!o) throw new Error('Missing control ' + name);
        const m = o.getWorldTransformMatrix(), rect = g.canvas.getBoundingClientRect();
        return { x: rect.x + m.tx * rect.width / 1280, y: rect.y + m.ty * rect.height / 720 };
    }, name);
    if (input === 'touch') await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
}

async function openAbilityBattle(page: any, renderer: string, names = ['Kitten', 'Eli']) {
    await openSeededGame(page, true, {}, {}, {
        name: names[0], activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], maxHp: 24, potions: 1,
        catacombFoxJourney: legacyFoxJourney({ A1: 2, A2: 2, A3: 2 }),
    }, { name: names[1], activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], maxHp: 25,
        catacombFoxJourney: legacyFoxJourney({ A1: 1, A2: 1, A3: 1 }) });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await activateCoopSession(page);
    await page.evaluate(async () => {
        const g = (window as any).__LITTLE_MATH_GAME__, town = g.scene.keys.TownScene;
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts' as any);
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts' as any);
        const coop = CoopSessionManager.getInstance(), state = GameStateManager.getInstance();
        for (const owner of ['A', 'B']) {
            owner === 'A' ? coop.activatePlayerA() : coop.activatePlayerB();
            const p = state.getPlayer(); p.hp = owner === 'A' ? 14 : 18;
            state.save();
        }
        coop.activatePlayerA(); g.sound.mute = true;
        town.scene.start('BattleScene', { fromArena: true, arenaLevel: 6, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.context().storageState({ path: 'artifacts/battle-dock-v3/fixture-storage.json' });
}

async function readAbilityBattle(page: any) {
    return page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { phase: b.battleState.phase, hp: [b.battleState.playerHp, b.battleState.playerBHp],
            enemies: b.battleState.enemies.map((e: any) => e.hp), active: b.coopSession.getActivePlayer(),
            selected: b.battleActionDock.abilityOwner, busy: b.foxBusy, target: b.foxTargetOwner,
            board: b.mathBoard.exportCheckpoint(), session: b.foxSession.snapshot(),
            ownerA: b.foxSession.readOwner('A'), ownerB: b.foxSession.readOwner('B') };
    });
}

for (const renderer of ['webgl', 'canvas']) test(`actor identity, particle pause and shield lifecycle — ${renderer}`, async ({ page }) => {
    await openAbilityBattle(page, renderer);
    await page.setViewportSize({ width: 1024, height: 768 });
    const identity = () => page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return [b.heroHpBar, b.heroBHpBar].map((hud: any) => ({
            hp: hud.root.visible, name: hud.root.list.find((o: any) => o.name === 'battleActorIdentity').visible,
        }));
    });
    expect(await identity()).toEqual([{ hp: true, name: true }, { hp: true, name: false }]);
    const anchored = await page.evaluate(async () => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const { battleBodyBounds } = await import('/src/ui/BattleActorGeometry.ts' as any);
        return b.enemies.map((sprite: any, i: number) => ({
            gap: battleBodyBounds(sprite).top - b.enemyHpBars[i].root.y - b.enemyHpBars[i].frameHeight / 2,
            y: b.enemyHpBars[i].root.y,
        }));
    });
    expect(anchored.every((a: any) => a.gap >= 5 && a.gap <= 14)).toBe(true);
    const mirrored = await page.evaluate(async () => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const { battleBodyBounds } = await import('/src/ui/BattleActorGeometry.ts' as any);
        const sprite = b.petSprite, flipped = battleBodyBounds(sprite);
        sprite.setFlipX(false); const normal = battleBodyBounds(sprite); sprite.setFlipX(true);
        return { midpoint: (flipped.centerX + normal.centerX) / 2, anchor: sprite.getWorldTransformMatrix().tx,
            normalWidth: normal.width, flippedWidth: flipped.width };
    });
    expect(mirrored.midpoint).toBeCloseTo(mirrored.anchor, 4);
    expect(mirrored.flippedWidth).toBeCloseTo(mirrored.normalWidth, 4);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.enemyHpBars.map((h: any) => h.root.y)))
        .toEqual(anchored.map((a: any) => a.y));
    await clickObject(page, 'battleFoxOwnerB');
    expect(await identity()).toEqual([{ hp: true, name: true }, { hp: true, name: false }]);
    await clickObject(page, 'battleFoxheal');
    await page.waitForFunction(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return b.children.list.some((o: any) => o.name === 'foxEffectAmount');
    });
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.show());
    await page.waitForTimeout(100);
    const particleLife = () => page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return b.children.list.filter((o: any) => o.name === 'foxParticles').flatMap((e: any) => e.alive.map((p: any) => p.lifeCurrent));
    });
    const frozen = await particleLife(); expect(frozen.length).toBeGreaterThan(0);
    expect(frozen.every(Number.isFinite)).toBe(true);
    await page.waitForTimeout(400); expect(await particleLife()).toEqual(frozen);
    expect((await readAbilityBattle(page)).busy).toBe(true);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.hide());
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    expect(await particleLife()).toEqual([]);
    await clickObject(page, 'battleFoxOwnerA'); await clickObject(page, 'battleFoxshield');
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.children.getByName('foxAirShieldA').visible)).toBe(true);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('player_b_turn'));
    expect(await identity()).toEqual([{ hp: true, name: false }, { hp: true, name: true }]);
    await page.screenshot({ path: `artifacts/battle-status-vfx/${renderer}-active-b-tablet.png` });
    await clickObject(page, 'battleAttackAction');
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.heroContainer.visible);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.children.getByName('foxAirShieldA').visible)).toBe(false);
    await clickObject(page, 'battleFoxstrike'); await clickObject(page, 'foxTarget1');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        (window as any).__oldFoxEffects = b.foxEffects;
        b.scene.start('MenuScene');
    });
    await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => {
        const effects = (window as any).__oldFoxEffects;
        return [effects.runs.size, effects.emitters.size, effects.shields.size];
    })).toEqual([0, 0, 0]);
    const audit = isolatedDevProfileAudit(page); expect(audit.observed).toEqual(audit.intercepted);
});

test('reduced motion keeps the result readable until its feedback finishes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAbilityBattle(page, 'canvas');
    await clickObject(page, 'battleFoxheal');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.children.getByName('foxEffectAmount'));
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const label = b.children.getByName('foxEffectAmount');
        return { busy: b.foxBusy, label: label?.text, alpha: label?.alpha };
    })).toMatchObject({ busy: true, label: '+2', alpha: expect.any(Number) });
    await page.screenshot({ path: 'artifacts/battle-status-vfx/reduced-motion-result.png' });
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.children.getByName('foxEffectAmount'))).toBeNull();
});

for (const renderer of ['webgl', 'canvas']) test(`independent foxes, suspended math and durable effects — ${renderer}`, async ({ page }) => {
    await openAbilityBattle(page, renderer);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-available.png` });
    await clickObject(page, 'battleAttackAction');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.exportCheckpoint()?.stage === 'question');
    await page.waitForTimeout(250);
    const before = await readAbilityBattle(page);
    await clickObject(page, 'battleFoxOwnerB');
    expect((await readAbilityBattle(page)).selected).toBe('B');
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-math-other-owner.png` });
    await clickObject(page, 'battleFoxheal');
    const used = await readAbilityBattle(page);
    expect(used).toMatchObject({ hp: [14, 19], active: 'A', selected: 'B', phase: 'player_math', busy: true });
    expect(used.session.ledger.owners.B.used.heal).toBe(true);
    expect(used.session.ledger.owners.A.used.heal).toBe(false);
    await page.waitForTimeout(400);
    expect((await readAbilityBattle(page)).board.activeTimeMs).toBeCloseTo(used.board.activeTimeMs, 0);
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-heal-effect.png` });
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    expect((await readAbilityBattle(page)).board.problems).toEqual(before.board.problems);
    await clickObject(page, 'battleFoxstrike');
    const targeting = await readAbilityBattle(page);
    expect(targeting.target).toBe('B');
    expect(targeting.session.ledger.owners.B.used.strike).toBe(false);
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-targeting.png` });
    await clickObject(page, 'foxCancelTarget');
    expect((await readAbilityBattle(page)).board.problems).toEqual(before.board.problems);
    expect((await readAbilityBattle(page)).session.ledger.owners.B.used.strike).toBe(false);
    await clickObject(page, 'battleFoxstrike');
    await clickObject(page, 'foxTarget1');
    const hit = await readAbilityBattle(page);
    expect(hit.enemies).toEqual([before.enemies[0], before.enemies[1] - 1]);
    expect(hit.session.ledger.owners.B.used.strike).toBe(true);
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    await clickObject(page, 'battleFoxOwnerA');
    await clickObject(page, 'battleFoxshield');
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-used.png` });
    const question = (await readAbilityBattle(page)).board.problems[0];
    await clickObject(page, 'answer-' + question.choices.indexOf(question.answer));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.exportCheckpoint()?.results.length === 1);
    const persisted = await readAbilityBattle(page);
    await page.evaluate(() => { sessionStorage.setItem('lma-e2e-preserve-saves', 'true'); });
    await page.reload(); await waitForScene(page, 'MenuScene');
    await activateCoopSession(page);
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__; g.sound.mute = true;
        g.scene.keys.TownScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 6, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.exportCheckpoint());
    const restored = await readAbilityBattle(page);
    expect(restored.session.battleId).toBe(persisted.session.battleId);
    expect(restored.session.ledger).toEqual(persisted.session.ledger);
    expect(restored.hp).toEqual(persisted.hp);
    expect(restored.enemies).toEqual(persisted.enemies);
    expect(restored.board.problems).toEqual(persisted.board.problems);
    expect(restored.board.results).toEqual(persisted.board.results);
    expect(restored.board.activeTimeMs).toBeGreaterThanOrEqual(persisted.board.activeTimeMs);
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-restored.png` });
    // The first enemy's incoming damage resolves normal block → fox shield.
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.mathBoard.hide(); b.mathBoardContext = null; b.battleState.phase = 'enemy_turn';
        b.currentEnemyAttackTarget = 'A'; b.applyDamageToPlayer(3); b.renderBattleActionDock();
    });
    const defended = await readAbilityBattle(page);
    expect(defended.hp[0]).toBe(restored.hp[0] - 1);
    expect(defended.session.ledger.owners.A.shieldRemaining).toBe(0);
    expect(defended.ownerB.shield.disabledReason).toBe('defense');
    await page.screenshot({ path: `artifacts/battle-dock-v3/${renderer}-defense.png` });
    const audit = isolatedDevProfileAudit(page); expect(audit.observed).toEqual(audit.intercepted);
});

test('pause, failed write, retry, next enemy round and explicit co-op exit', async ({ page }) => {
    await openAbilityBattle(page, 'webgl');
    await clickObject(page, 'battleAttackAction');
    // Open targeting during the board entrance, while the old turn label still
    // exists. Neither that label nor an ordinary attack marker may cover it.
    await clickObject(page, 'battleFoxstrike');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { picker: !!b.foxTargetOwner, label: !!b.coopTurnLabel?.visible,
            sword: b.targetIndicator.visible, pet: !!b.petTargetIndicator?.visible,
            boardAlpha: b.mathBoard.getContainer().alpha };
    })).toEqual({ picker: true, label: false, sword: false, pet: false, boardAlpha: 0 });
    await page.screenshot({ path: 'artifacts/battle-dock-v3/early-target-picker.png' });
    await clickObject(page, 'foxCancelTarget');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.show());
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.isPaused());
    const paused = (await readAbilityBattle(page)).board.activeTimeMs;
    await page.waitForTimeout(700);
    expect((await readAbilityBattle(page)).board.activeTimeMs).toBeCloseTo(paused, 0);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.hide());
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.isPaused());
    // The pairing overlay pauses the entire scene, independently of PauseMenu.
    // It must not connect this isolated test to an actual family TV session.
    await page.evaluate(async () => {
        const { RemoteInputService } = await import('/src/remote/RemoteInputService.ts' as any);
        RemoteInputService.getInstance().startHostSession = async () => ({ kind: 'welcome', room: 'TEST', role: 'host' });
    });
    const beforePairing = (await readAbilityBattle(page)).board.problems;
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.openTvPairing());
    await waitForScene(page, 'TvPairingScene');
    const tvPaused = (await readAbilityBattle(page)).board.activeTimeMs;
    await page.waitForTimeout(500);
    expect((await readAbilityBattle(page)).board.activeTimeMs).toBeCloseTo(tvPaused, 0);
    await page.mouse.click(165, 52);
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.isPaused('BattleScene'));
    expect((await readAbilityBattle(page)).board.problems).toEqual(beforePairing);
    await clickObject(page, 'battleFoxstrike');
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.testWrite = b.foxSession.options.store.write; b.foxSession.options.store.write = () => false;
    });
    await clickObject(page, 'foxTarget1');
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { alpha: b.mathBoard.getContainer().alpha, suspended: b.mathBoard.isSuspended(), used: b.foxSession.readOwner('A').strike.used };
    })).toEqual({ alpha: 1, suspended: false, used: false });
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.mathBoard.hide(); b.mathBoardContext = null; b.battleState.phase = 'enemy_turn';
        b.currentEnemyAttackTarget = 'A'; b.testContinued = false;
        b.blockPhaseResumeCallback = () => { b.testContinued = true; };
        b.startBlockPhase(4);
    });
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { hp: b.battleState.playerHp, continued: b.testContinued, retry: !!b.foxSaveRetry };
    })).toEqual({ hp: 14, continued: false, retry: true });
    await page.screenshot({ path: 'artifacts/battle-dock-v3/save-retry.png' });
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.foxSession.options.store.write = b.testWrite;
    });
    await clickObject(page, 'foxRetrySave');
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { hp: b.battleState.playerHp, continued: b.testContinued, retry: !!b.foxSaveRetry };
    })).toEqual({ hp: 10, continued: true, retry: false });
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.foxEnemyHitCommitted = true; b.setPhase('enemy_turn');
        return b.foxSession.snapshot().combat.resumeData.enemyHitCommitted;
    })).toBe(false);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.pauseMenu.quitToMenu());
    await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.foxAbilityBattle.ledger.status)).toBe('closed');
});

const bossEncounter = { encounterId: 'forest-room-guardian-boss', mode: 'journey', returnScene: 'ForestRoomScene',
    returnData: { roomId: 'guardian_lair', defeatedObjectId: 'boss_guardian' } };
async function reloadEncounter(page: any, data: any) {
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene'); await activateCoopSession(page);
    await page.evaluate((data: any) => {
        const g = (window as any).__LITTLE_MATH_GAME__; g.sound.mute = true;
        g.scene.keys.TownScene.scene.start('BattleScene', data);
    }, data);
    await waitForScene(page, 'BattleScene');
}

test('boss transition reload preserves pending and applied phase without skipping or healing twice', async ({ page }) => {
    await openAbilityBattle(page, 'webgl');
    await page.evaluate(data => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('BattleScene', data), bossEncounter);
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    const pending = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.battleState.enemies[0].hp = 0; b.triggerBossPhaseTransition(); b.time.paused = true; b.checkpointFoxCombat();
        return b.foxSession.snapshot();
    });
    expect(pending.combat.resumeData.currentBossPhase).toBe(1);
    expect(pending.combat.resumeData.bossTransition.applied).toBe(false);
    await reloadEncounter(page, bossEncounter);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.events.on('postupdate', () => { if (b.foxBossTransition?.applied) b.time.paused = true; });
        return { phase: b.currentBossPhase, battle: b.battleState.phase, pending: !!b.foxBossTransition,
            ability: b.currentPhaseAbility, expectedAbility: b.bossPhases[1].ability ?? null };
    })).toMatchObject({ phase: 1, battle: 'player_turn', pending: true });
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBossTransition?.applied, { timeout: 15000 });
    const applied = await readAbilityBattle(page);
    expect(applied.enemies[0]).toBeGreaterThan(0);
    await page.screenshot({ path: 'artifacts/battle-dock-v3/boss-transition-applied.png' });
    await reloadEncounter(page, bossEncounter);
    const after = await readAbilityBattle(page);
    expect(after.session.battleId).toBe(applied.session.battleId);
    expect(after.enemies[0]).toBe(applied.enemies[0]);
    expect(after.hp).toEqual(applied.hp);
    const phase = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { index: b.currentBossPhase, pending: b.foxBossTransition, ability: b.currentPhaseAbility, expectedAbility: b.bossPhases[1].ability ?? null };
    });
    expect(phase).toMatchObject({ index: 1, pending: null });
    expect(phase.ability).toBe(phase.expectedAbility);
});

test('both co-op rewards are durable before the victory animation ends', async ({ page }) => {
    await openAbilityBattle(page, 'webgl');
    const completed = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.battleState.enemies.forEach((e: any) => { e.hp = 0; }); b.setPhase('victory');
        return [0,1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!));
    });
    expect(completed[0].player.foxAbilityBattle.ledger.status).toBe('closed');
    expect(completed.every((save: any) => save.player.arena.waveResults[0].completed)).toBe(true);
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => [0,1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!).player.coins))).toEqual(completed.map((s: any) => s.player.coins));
});

test('three enemy ability targets have separate tablet hit areas', async ({ page }) => {
    const scenario = getRepresentativeCoopWaves().find(candidate => candidate.baseRoster.length === 3);
    if (!scenario) throw new Error('No production three-enemy encounter found');
    await openAbilityBattle(page, 'webgl');
    await page.evaluate(target => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.scene.start('BattleScene', { fromArena: true, arenaLevel: target.arenaLevel, wave: target.wave, encounterId: target.encounterId });
    }, scenario.target);
    await page.waitForFunction(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return b.battleState.enemies.length === 3 && b.battleState.phase === 'player_turn';
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await clickObject(page, 'battleFoxstrike');
    const targets = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return b.foxTargetOverlay.list.filter((o: any) => /^foxTarget\d/.test(o.name))
            .map((o: any) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
    });
    expect(targets).toHaveLength(3);
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i], b = targets[j];
        expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2).toBe(true);
    }
    await page.screenshot({ path: 'artifacts/battle-dock-v3/three-enemy-targets.png' });
    await clickObject(page, 'foxCancelTarget');
    expect((await readAbilityBattle(page)).session.ledger.owners.A.used.strike).toBe(false);
});

test('owner turns, longest names and button surfaces fit tablet and desktop', async ({ page }) => {
    await openAbilityBattle(page, 'webgl', ['WWWWWWWWWWWW', 'Alexandrinka']);
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const phase of ['player_turn', 'player_b_turn', 'pet_turn', 'pet_b_turn']) {
        await page.evaluate(phase => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase(phase), phase);
        await page.waitForTimeout(100);
        const result = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene, errors: string[] = [];
            function visit(o: any) {
                if (o.type === 'Text' && o.name?.includes('Owner')) {
                    const safe = o.getData('safeRegion');
                    if (safe && (o.width > safe.width + 1 || o.height > safe.height + 1)) errors.push(o.name + ':' + o.text + ':' + o.width + 'x' + o.height);
                }
                if (o.texture?.key === '__MISSING') errors.push(o.name + ':missing');
                o.list?.forEach(visit);
            }
            [b.battleActionDock.ownerRoot, b.battleActionDock.abilityPanel.root, b.heroHpBar.root, b.heroBHpBar.root].forEach(visit);
            return { errors, turn: b.battleActionDock.attackRoot.getData('owner'), ability: b.battleActionDock.abilityOwner,
                icon: b.battleActionDock.attack.normalIcon.texture.key };
        });
        expect(result.errors).toEqual([]);
        expect(result.turn).toBe(phase.includes('_b_') ? 'B' : 'A');
        expect(result.ability).toBe(result.turn);
        if (phase.startsWith('pet')) expect(result.icon).toBe('companion-fox-01-idle-sheet-portrait');
        await page.screenshot({ path: `artifacts/battle-dock-v3/long-names-${phase}.png` });
    }
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('player_turn'));
    const point = await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__, r = g.canvas.getBoundingClientRect(), c = g.scene.keys.BattleScene.battleActionDock.attackRoot;
        return { x: r.x + c.x * r.width / 1280, y: r.y + c.y * r.height / 720, world: [c.x,c.y] };
    });
    await page.mouse.move(point.x, point.y); await page.waitForTimeout(150);
    await page.screenshot({ path: 'artifacts/battle-dock-v3/hover-tablet.png' });
    await page.mouse.down(); await page.waitForTimeout(150);
    await page.screenshot({ path: 'artifacts/battle-dock-v3/pressed-tablet.png' });
    await page.mouse.move(10,10); await page.mouse.up(); await page.waitForTimeout(150);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { phase: b.battleState.phase, world: [b.battleActionDock.attackRoot.x,b.battleActionDock.attackRoot.y],
            surface: b.battleActionDock.attack.surface.y, pressed: b.battleActionDock.attack.pressed };
    })).toEqual({ phase: 'player_turn', world: point.world, surface: 0, pressed: false });
    await page.screenshot({ path: 'artifacts/battle-dock-v3/pointer-out-tablet.png' });
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        const hide = (o: any) => { if (o.type === 'Text' && /[A-Za-zÀ-ž]/.test(o.text)) o.setVisible(false); o.list?.forEach(hide); };
        g.scene.keys.BattleScene.children.list.forEach(hide); g.sound.mute = true;
    });
    await page.screenshot({ path: 'artifacts/battle-dock-v3/no-words-tablet.png' });
});

for (const pet of [null, 'pet_catacomb_A', 'pet_silverpond_mill_turtle']) test(`solo dock and real equipped pet ${pet}`, async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { name: pet === 'pet_silverpond_mill_turtle' ? 'Alexandrinka' : 'Anička',
        activePet: pet, ownedPets: pet ? [pet] : [], hp: 12, maxHp: 20, potions: 1 });
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts' as any);
        GameStateManager.getInstance().loadSlot(0);
        const g = (window as any).__LITTLE_MATH_GAME__; g.sound.mute = true;
        g.scene.keys.MenuScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 6, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expectDockPlacement(page, pet === 'pet_catacomb_A' ? 1 : 0);
    await clickObject(page, 'battlePotionAction', 'touch');
    await expect.poll(() => page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return [b.battleState.playerHp, b.gameState.getPlayer().potions];
    })).toEqual([20, 0]);
    if (pet) await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('pet_turn'));
    const state = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { count: b.battleActionDock.abilityPanel.count, id: b.battleActionDock.attackRoot.getData('petId'), texture: b.battleActionDock.attack.normalIcon.texture.key };
    });
    expect(state.count).toBe(pet === 'pet_catacomb_A' ? 1 : 0);
    if (pet) expect(state.id).toBe(pet);
    expect(state.texture).not.toBe('__MISSING');
    await page.screenshot({ path: `artifacts/battle-dock-v3/solo-${pet ?? 'no-pet'}.png` });
    await clickObject(page, 'battleAttackAction');
    await expect.poll(() => page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase))
        .toBe(pet ? 'pet_math' : 'player_math');
});

test('a single fox in co-op stays centered and its shield follows the correct owner', async ({ page }) => {
    await openSeededGame(page, true, {}, {}, { name: 'Alexandrinka' },
        { name: 'Eli', activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], catacombFoxJourney: legacyFoxJourney({ A1: 1 }) });
    await page.goto('/?renderer=canvas');
    await waitForScene(page, 'MenuScene');
    await activateCoopSession(page);
    await page.evaluate(async () => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.sound.mute = true;
        game.scene.keys.TownScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.setViewportSize({ width: 768, height: 576 });
    await expectDockPlacement(page, 1);
    await clickObject(page, 'battleFoxshield', 'touch');
    await expect.poll(() => page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return [b.foxSession.readOwner('B').shield.used, b.battleState.phase];
    })).toEqual([true, 'player_turn']);
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.foxBusy);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('player_b_turn'));
    await expectDockPlacement(page, 1);
});

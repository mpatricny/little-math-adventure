import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';
import encounters from '../../public/assets/data/encounters.json';
import enemies from '../../public/assets/data/enemies.json';
import rooms from '../../public/assets/data/underwater-rooms.json';
import { createEncounterCatalog } from '../../src/systems/EncounterCatalog';
import { AUDIT_BUILDS } from '../../src/simulation/UnderwaterBalanceAudit';
import type { EnemyDefinition } from '../../src/types';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import { mkdir, writeFile } from 'node:fs/promises';

const catalog = createEncounterCatalog(encounters, { core: enemies as EnemyDefinition[] });
const newPrefixes = ['armored-seahorse', 'rune-nautilus'];
const roomIds = Object.entries(rooms.rooms).filter(([, room]) => room.encounter
    && catalog.resolveJourneyEncounter(room.encounter.id, 'solo').enemies.some(enemy => newPrefixes.includes(enemy.animPrefix)))
    .map(([id]) => id);
const profile = {
    hp: AUDIT_BUILDS.tide.maxHp, maxHp: AUDIT_BUILDS.tide.maxHp, attack: AUDIT_BUILDS.tide.attack, defense: 0,
    equippedWeapon: AUDIT_BUILDS.tide.weaponId, equippedShield: AUDIT_BUILDS.tide.shieldId,
    ownedPets: [AUDIT_BUILDS.tide.petId!], activePet: AUDIT_BUILDS.tide.petId, potions: 1,
    unlockedPets: ['silverpond_silverfin_scalefish'],
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_sunken_canal', entryId: 'garden',
        visitedRooms: [], defeatedEncounters: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
        restoredMechanisms: ['shrine-memory', 'chamber-routes', 'grotto-light'], litHubSeals: ['shell', 'current'] },
};

for (const scenario of [
    { canvas: false, coop: false }, { canvas: true, coop: false }, { canvas: true, coop: true },
]) test(`new species: real world idle, complete battle motion and earned victory, Canvas=${scenario.canvas}, coop=${scenario.coop}`, async ({ page, runtimeErrors }) => {
    test.setTimeout(240_000);
    expect(roomIds).toContain('sp_depth_gate');
    await page.setViewportSize(scenario.canvas ? { width: 1024, height: 768 } : { width: 1280, height: 720 });
    if (scenario.canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    const partner = scenario.coop ? { ...profile, hp: AUDIT_BUILDS.legacy.maxHp, maxHp: AUDIT_BUILDS.legacy.maxHp,
        attack: AUDIT_BUILDS.legacy.attack, equippedWeapon: AUDIT_BUILDS.legacy.weaponId,
        equippedShield: AUDIT_BUILDS.legacy.shieldId, ownedPets: [AUDIT_BUILDS.legacy.petId!], activePet: AUDIT_BUILDS.legacy.petId } : profile;
    await openSeededGame(page, scenario.coop, {}, {}, profile, partner);
    // Reusable artificial profile for the separate MCP visual review. The
    // context was cleared and isolated before boot; no real saves are exported.
    await mkdir('artifacts/underwater', { recursive: true });
    await writeFile(`artifacts/underwater/new-species-fixture-${scenario.coop}.json`, JSON.stringify(await page.evaluate(() =>
        [0, 1].map(index => localStorage.getItem(`littleMathAdventure_slot_${index}`)).filter(Boolean)), null, 2));
    if (scenario.coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    const suffix = `${scenario.canvas}-${scenario.coop}`;
    for (const roomId of roomIds) {
        await waitForScene(page, 'UnderwaterRoomScene');
        await page.evaluate(roomId => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId, entryId: 'gate' }), roomId);
        await page.waitForFunction(roomId => {
            const scene = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return scene.roomId === roomId && scene.party.length && !scene.revealing && !scene.transitioning;
        }, roomId);
        const room = (rooms.rooms as Record<string, any>)[roomId];
        const roster = catalog.resolveJourneyEncounter(room.encounter.id, scenario.coop ? 'coop' : 'solo').enemies;
        const targets = roster.map((enemy, index) => ({ id: enemy.id, prefix: enemy.animPrefix, index, elite: enemy.rank === 'elite' }))
            .filter(enemy => newPrefixes.includes(enemy.prefix));
        if (roomId === roomIds[0]) expect(await page.evaluate(() => {
            const textures = (globalThis as any).__LITTLE_MATH_GAME__.textures;
            return { currentIdle: textures.exists('silverpond-armored-seahorse-idle-sheet'),
                futureIdle: textures.exists('silverpond-rune-nautilus-idle-sheet'),
                combatMotion: textures.exists('silverpond-armored-seahorse-attack-sheet') };
        })).toEqual({ currentIdle: true, futureIdle: false, combatMotion: false });
        await page.evaluate(() => {
            const scene = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            scene.__newWorldFrames = {};
            for (const sprite of scene.children.list.filter((object: any) => object.getData?.('waterArtwork') && object.anims)) {
                const texture = sprite.texture.key;
                if (!/armored-seahorse|rune-nautilus/.test(texture)) continue;
                scene.__newWorldFrames[texture] = new Set([String(sprite.frame.name)]);
                sprite.on('animationupdate', (_animation: any, frame: any) => scene.__newWorldFrames[texture].add(String(frame.textureFrame)));
            }
        });
        // More than one complete 24-frame ping-pong idle at six FPS.
        await page.waitForTimeout(4300);
        const worldFrames = await page.evaluate(() => {
            const scene = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return Object.entries(scene.__newWorldFrames).map(([texture, frames]: any) => ({ texture, count: frames.size }));
        });
        expect(worldFrames).toHaveLength(targets.length);
        expect(worldFrames.every(frame => frame.count > 8)).toBe(true);
        await page.screenshot({ path: `artifacts/underwater/new-species-${roomId}-${suffix}-world.png` });
        const host = await page.evaluate(() => {
            const h = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('guardianHost');
            return { x: h.x, y: h.y };
        });
        await tap(page, host.x, host.y); await waitForScene(page, 'BattleScene');
        await page.waitForFunction(count => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.enemies.length === count, roster.length);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            return b.enemyDefs.map((enemy: any, i: number) => ({ id: enemy.id, hp: b.battleState.enemies[i].maxHp }));
        })).toEqual(roster.map(enemy => ({ id: enemy.id, hp: enemy.hp })));
        await page.screenshot({ path: `artifacts/underwater/new-species-${roomId}-${suffix}-battle.png` });
        for (const target of targets) for (const action of ['idle', 'attack-anim', 'hurt', 'death']) {
            const key = `${target.prefix}-${action}`;
            await page.evaluate(({ key, index }) => {
                const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene, sprite = b.enemies[index];
                b.__motionFrames = new Set(); b.__motionComplete = false;
                const collect = (_animation: any, frame: any) => b.__motionFrames.add(String(frame.textureFrame));
                sprite.on('animationupdate', collect);
                sprite.once(key.endsWith('-idle') ? 'animationrepeat' : `animationcomplete-${key}`, () => {
                    b.__motionComplete = true; sprite.off('animationupdate', collect);
                });
                sprite.play(key); b.__motionFrames.add(String(sprite.frame.name));
            }, { key, index: target.index });
            await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.__motionComplete);
            const motion = await page.evaluate(index => {
                const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene, sprite = b.enemies[index];
                return { width: sprite.width, height: sprite.height, uniform: sprite.scaleX === sprite.scaleY,
                    seen: b.__motionFrames.size, expected: new Set(sprite.anims.currentAnim.frames.map((frame: any) => String(frame.textureFrame))).size };
            }, target.index);
            expect(motion).toMatchObject({ width: 512, height: 512, uniform: true });
            expect(motion.seen).toBe(motion.expected); expect(motion.seen).toBeGreaterThan(5);
            await page.screenshot({ path: `artifacts/underwater/new-species-${target.prefix}-${suffix}-${action}.png` });
            await page.evaluate(index => {
                const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                b.enemies[index].play(`${b.enemyDefs[index].animPrefix}-idle`);
            }, target.index);
        }
        if (roomId !== 'sp_depth_gate') {
            await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('UnderwaterRoomScene'));
            continue;
        }
        // Play the actual two-species gate encounter, including its paused block
        // phase and attack follow-through. No damage, HP or victory is injected.
        await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            b.__finishedNewAttacks = [];
            b.enemies.forEach((sprite: any) => sprite.on('animationcomplete', (animation: any) => {
                if (animation.key.endsWith('-attack')) b.__finishedNewAttacks.push(animation.key);
            }));
        });
        let answers = 0;
        const until = Date.now() + 100_000;
        while (Date.now() < until) {
            expect(runtimeErrors).toEqual([]);
            const state = await page.evaluate(() => {
                const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                if (!b.scene.isActive()) return { done: true, answer: false };
                b.time.timeScale = 5; b.tweens.timeScale = 5;
                const board = b.mathBoard, problem = board.problems[board.currentProblemIndex];
                let answer = false;
                if (board.getContainer().visible && board.acceptingAnswer && problem) {
                    board.submitChoice(problem.choices.indexOf(problem.answer)); answer = true;
                }
                if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) {
                    const target = b.battleState.phase === 'player_b_turn' ? 1 : 0;
                    if (b.battleState.enemies[target]?.hp > 0) b.selectTarget(target);
                    b.onAttackClicked();
                }
                if (['pet_turn', 'pet_b_turn'].includes(b.battleState.phase)) {
                    const target = b.battleState.phase === 'pet_b_turn' ? 1 : 0;
                    if (b.battleState.enemies[target]?.hp > 0) b.selectPetTarget(target);
                    b.onPetAttackClicked();
                }
                return { done: false, answer };
            });
            if (state.done) break;
            if (state.answer) answers++;
            await page.waitForTimeout(120);
        }
        await waitForScene(page, 'VictoryScene'); expect(answers).toBeGreaterThan(8);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.__finishedNewAttacks))
            .toEqual(expect.arrayContaining(newPrefixes.map(prefix => `${prefix}-attack`)));
        console.log(`New gate ${suffix}: ${answers} real answers`);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.remoteContinueReady);
        await page.keyboard.press('Space'); await waitForScene(page, 'UnderwaterRoomScene');
        expect(await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.player().unlockedPets;
        })).toEqual(expect.arrayContaining(['silverpond_armored_seahorse', 'silverpond_rune_nautilus']));
    }
    const network = isolatedDevProfileAudit(page);
    expect(network.observed.filter(path => !network.intercepted.includes(path))).toEqual([]);
    expect(network.intercepted).toContain('POST /__dev-saves/api');
    console.log('Isolated fixture API paths:', network.intercepted.join(', '));
});

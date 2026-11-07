import type { Page } from 'playwright/test';
import { activateCoopSession, expect, openSeededGame, test, waitForScene } from './helpers/arena-harness';

const globalName = '__LITTLE_MATH_GAME__';
const evidenceDirectory = process.env.LMA_FOLLOWUP_ARTIFACTS ?? '/private/tmp/lma-tablet-followups-evidence';
const story = { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasDefeatedVerdantGuardian: true,
    hasCollectedForestCrystal: true, hasInstalledForestCrystal: true, hasSeenSilverpondQuest: true };

async function beginBattle(page: Page, town: string, coop: boolean, victory = false): Promise<void> {
    await openSeededGame(page, coop, { arenaLevel: town === 'TownScene' ? 1 : 4 }, undefined, {
        storyProgress: story, equippedWeapon: 'sword_iron', preparation: { kind: 'sword', charges: 3 },
        hasPotionSubscription: true, coins: { copper: 8, silver: 0, gold: 0, pouch: 0 }, mana: 8,
        crystals: { maxCapacity: 60, crystals: [
            { id: 'pet-crystal-1', tier: 'prism', value: 9, locked: false },
            { id: 'pet-crystal-2', tier: 'prism', value: 9, locked: false },
        ] },
    });
    if (coop) await activateCoopSession(page, 'SilverpondTownMockScene');
    await page.evaluate(async ({ globalName, town, victory }) => {
        const game = (window as any)[globalName];
        const { TownHud } = await import('/src/ui/TownHud.ts' as string);
        const original = TownHud.prototype.setPlayer;
        (window as any).__TOWN_HEALTH_VIEWS__ = [];
        TownHud.prototype.setPlayer = function(index: number, view: any) {
            (window as any).__TOWN_HEALTH_VIEWS__.push({ index, ratio: view.healthRatio });
            return original.call(this, index, view);
        };
        const source = game.scene.getScenes(true).at(-1);
        source.scene.start('BattleScene', victory ? {
            enemyDefs: source.cache.json.get('enemies').filter((enemy: any) =>
                ['silverpond_armored_seahorse_deep', 'silverpond_rune_nautilus_deep'].includes(enemy.id)),
            returnScene: 'SilverpondPythiaWorkshopMockScene',
        } : { fromArena: true, arenaLevel: town === 'TownScene' ? 1 : 4, wave: 0, arenaExitScene: town });
    }, { globalName, town, victory });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState?.phase === 'player_turn');
}

async function snapshot(page: Page) {
    return page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts' as string);
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts' as string);
        const gs = GameStateManager.getInstance(), coop = CoopSessionManager.getInstance();
        const slots = coop.isCoopActive() ? [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()] : [gs.getActiveSlotIndex()];
        return {
            active: gs.getActiveSlotIndex(),
            players: slots.map((slot: number) => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).player),
            views: (window as any).__TOWN_HEALTH_VIEWS__ ?? [],
        };
    });
}

for (const town of ['TownScene', 'SilverpondTownMockScene']) {
    for (const coop of [false, true]) {
        test(`${coop ? 'co-op' : 'solo'} arena defeat heals immediately in ${town} and survives reload`, async ({ page }) => {
            test.setTimeout(75_000);
            if (coop) await page.setViewportSize({ width: 1024, height: 768 });
            await beginBattle(page, town, coop);
            const before = await snapshot(page);
            await page.evaluate(() => {
                const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                battle.battleState.playerHp = 0;
                if (battle.isCoopMode) {
                    battle.battleState.playerBHp = 0;
                    battle.coopSession.playerABattleHp = battle.coopSession.playerBBattleHp = 0;
                    battle.coopSession.playerAFallen = battle.coopSession.playerBFallen = true;
                }
                battle.setPhase('defeat');
            });
            const defeated = await snapshot(page);
            for (const player of defeated.players) expect([player.hp, player.status]).toEqual([1, 'přizabitý']);
            await waitForScene(page, town);
            const recovered = await snapshot(page);
            for (let index = 0; index < recovered.players.length; index++) {
                const player = recovered.players[index];
                expect([player.hp, player.status]).toEqual([player.maxHp, 'healthy']);
                expect(player.preparation).toEqual(before.players[index].preparation);
                expect(player.arena).toEqual(before.players[index].arena);
                expect(player.potions).toBe(1);
            }
            expect(recovered.views.slice(-2).map((view: any) => view.ratio)).toEqual([1, 1]);
            expect(recovered.active).toBe(0);
            await page.screenshot({ path: `${evidenceDirectory}/${town}-${coop ? 'coop-tablet' : 'solo-desktop'}-recovered.png` });
            await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
            await page.reload();
            await waitForScene(page, 'MenuScene');
            const reloaded = await snapshot(page);
            for (let index = 0; index < reloaded.players.length; index++) {
                expect([reloaded.players[index].hp, reloaded.players[index].status]).toEqual([recovered.players[index].maxHp, 'healthy']);
            }
            // Co-op session is intentionally not resumed by a page reload; verify both stored slots.
            expect(await page.evaluate((count) => Array.from({ length: count }, (_, slot) => {
                const player = JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).player;
                return player.hp === player.maxHp && player.status === 'healthy';
            }), coop ? 2 : 1)).toEqual(coop ? [true, true] : [true]);
        });
    }
}

for (const coop of [false, true]) {
    test(`${coop ? 'co-op' : 'solo'} underwater victories make both new species bindable once per owner`, async ({ page }) => {
        test.setTimeout(90_000);
        await beginBattle(page, 'SilverpondTownMockScene', coop, true);
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.debugInstantWin());
        await waitForScene(page, 'VictoryScene');
        const freed = await snapshot(page);
        for (const player of freed.players) {
            expect(player.unlockedPets).toEqual(expect.arrayContaining(['silverpond_armored_seahorse', 'silverpond_rune_nautilus']));
            expect(player.ownedPets).toEqual([]);
        }
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.scene.start('SilverpondPythiaWorkshopMockScene'));
        await waitForScene(page, 'SilverpondPythiaWorkshopMockScene');
        for (const owner of coop ? ['A', 'B'] : ['A']) {
            for (const petId of ['pet_silverpond_armored_seahorse', 'pet_silverpond_rune_nautilus']) {
                const result = await page.evaluate(async ({ owner, petId }) => {
                    const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts' as string);
                    const coop = CoopSessionManager.getInstance();
                    if (owner === 'B') coop.activatePlayerB(); else coop.activatePlayerA();
                    const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondPythiaWorkshopMockScene;
                    const player = scene.gameState.getPlayer();
                    const pet = scene.cache.json.get('pets').find((candidate: any) => candidate.id === petId);
                    const available = scene.getSortedUnlockedPets(scene.cache.json.get('pets'), player).some((candidate: any) => candidate.id === petId);
                    scene.selectedPet = pet;
                    scene.selectedCrystal = null;
                    const withoutCrystal = scene.canPerformBinding();
                    scene.selectedCrystal = player.crystals.crystals.find((crystal: any) => crystal.tier === pet.requiredAmulet.tier && crystal.value === pet.requiredAmulet.value);
                    const before = { crystals: player.crystals.crystals.length, mana: player.mana,
                        coins: player.coins.copper + 5 * player.coins.silver + 10 * player.coins.gold + 100 * player.coins.pouch };
                    const valid = scene.canPerformBinding();
                    scene.performBinding();
                    const after = { crystals: player.crystals.crystals.length, mana: player.mana,
                        coins: player.coins.copper + 5 * player.coins.silver + 10 * player.coins.gold + 100 * player.coins.pouch };
                    scene.performBinding();
                    const duplicates = player.ownedPets.filter((id: string) => id === petId).length;
                    const sprite = scene.add.sprite(640, 360, pet.spriteKey).play(`${pet.animPrefix}-idle`);
                    const assetReady = sprite.texture.key !== '__MISSING' && scene.anims.exists(`${pet.animPrefix}-attack-anim`);
                    sprite.destroy();
                    return { available, withoutCrystal, valid, before, after, duplicates, assetReady };
                }, { owner, petId });
                expect(result).toMatchObject({ available: true, withoutCrystal: false, valid: true, duplicates: 1, assetReady: true });
                expect(result.after).toEqual({ crystals: result.before.crystals - 1, mana: result.before.mana - 2, coins: result.before.coins - 2 });
                await page.waitForTimeout(650);
                await waitForScene(page, 'SilverpondPythiaWorkshopMockScene');
            }
        }
        const bound = await snapshot(page);
        for (const player of bound.players) expect(player.ownedPets).toEqual(['pet_silverpond_armored_seahorse', 'pet_silverpond_rune_nautilus']);
        await page.screenshot({ path: `${evidenceDirectory}/underwater-pets-${coop ? 'coop' : 'solo'}-bound.png` });
    });
}

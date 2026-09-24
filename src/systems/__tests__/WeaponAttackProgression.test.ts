import { describe, expect, it, vi } from 'vitest';
import items from '../../../public/assets/data/items.json';
import { ProgressionSystem } from '../ProgressionSystem';
import { getPlayerAttackDamageMultipliers } from '../CombatAttackSystem';
import { SaveSystem } from '../SaveSystem';
import type { MathStats } from '../../types';

vi.mock('phaser', () => ({ default: {} }));

function legacyHero(weapon: string | null, earnedAttack = 2) {
    const player = ProgressionSystem.createInitialPlayer('boy_knight');
    delete player.attackPowerVersion;
    player.level = 2;
    player.hp = player.maxHp = 11;
    player.attack = earnedAttack + (items.find(item => item.id === weapon)?.attackBonus ?? 0);
    player.equippedWeapon = weapon;
    player.equippedShield = 'shield_wooden';
    player.preparation = { kind: 'sword', charges: 3 };
    return player;
}

describe('weapon-independent hero attack progression', () => {
    it('repairs the reported level-2 hero with the +3 sword without resetting progress', () => {
        const player = legacyHero('sword_reinforced');
        const before = structuredClone(player);
        expect(getPlayerAttackDamageMultipliers(player.attack)).toEqual([2, 2, 1]);

        ProgressionSystem.migratePlayerState(player);

        expect(getPlayerAttackDamageMultipliers(player.attack)).toEqual([1, 1]);
        expect(player).toMatchObject({ ...before, attack: 2, attackPowerVersion: 1 });
    });

    it.each(items.filter(item => item.type === 'weapon'))('removes only the legacy contribution of $id', item => {
        // Placement and medal rewards make earned attack independent of level.
        const player = legacyHero(item.id, 8);
        ProgressionSystem.migratePlayerState(player);
        expect(player.attack).toBe(8);
        expect(player.level).toBe(2);
        expect(player.equippedWeapon).toBe(item.id);
        expect(getPlayerAttackDamageMultipliers(player.attack)).toEqual([3, 3, 2]);
    });

    it('does not change unarmed legacy heroes or guess the contribution of unknown gear', () => {
        for (const weapon of [null, 'unknown_legacy_sword']) {
            const player = legacyHero(weapon, 6);
            ProgressionSystem.migratePlayerState(player);
            expect(player.attack).toBe(6);
        }
    });

    it('marks fresh heroes so equipped gear never gets subtracted from earned attack', () => {
        const player = ProgressionSystem.createInitialPlayer();
        expect(player.attackPowerVersion).toBe(1);
        player.attack = 2;
        player.equippedWeapon = 'sword_reinforced';
        ProgressionSystem.migratePlayerState(player);
        expect(player.attack).toBe(2);
    });

    it('preserves later stat rewards through repeated migrations and JSON round trips', () => {
        let player = legacyHero('sword_reinforced');
        ProgressionSystem.migratePlayerState(player);
        player.attack += 1; // A later silver/gold exam reward.
        for (let i = 0; i < 3; i++) {
            player = JSON.parse(JSON.stringify(player));
            ProgressionSystem.migratePlayerState(player);
            expect(player.attack).toBe(3);
        }
    });

    it('repairs an imported legacy save once and keeps the correction on the next save/load', () => {
        const data = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => data.set(key, value),
            removeItem: (key: string) => data.delete(key),
        });
        try {
            const mathStats = { totalAttempts: 30, correctAnswers: 27, recentResults: [true], problemStats: {} } as MathStats;
            const player = legacyHero('sword_reinforced');
            SaveSystem.save(0, player, mathStats);
            const exported = SaveSystem.exportBundle()!;
            data.clear();
            expect(SaveSystem.importBundle(exported).ok).toBe(true);
            const imported = SaveSystem.load(0)!;
            ProgressionSystem.migratePlayerState(imported.player);
            SaveSystem.save(0, imported.player, imported.mathStats);
            const reloaded = SaveSystem.load(0)!;
            ProgressionSystem.migratePlayerState(reloaded.player);
            expect(reloaded.player).toMatchObject({ attack: 2, level: 2, equippedWeapon: 'sword_reinforced',
                preparation: { kind: 'sword', charges: 3 } });
            expect(reloaded.mathStats).toEqual(mathStats);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

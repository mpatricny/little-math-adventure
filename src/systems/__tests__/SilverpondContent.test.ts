import { describe, expect, it, vi } from 'vitest';
import items from '../../../public/assets/data/items.json';
import pets from '../../../public/assets/data/pets.json';
import enemies from '../../../public/assets/data/enemies.json';
import textures from '../../../public/assets/data/textures.json';
import type { ItemDefinition, PetDefinition, PlayerState } from '../../types';
import { getShopEquipment } from '../ShopCatalog';
import { isPetUnlocked } from '../PetCatalog';
import { CrystalSystem } from '../CrystalSystem';

vi.mock('phaser', () => ({ default: {} }));

describe('Silverpond progression content', () => {
    const catalog = items as ItemDefinition[];
    const companions = pets as PetDefinition[];
    const player = (extra: object = {}) => ({ ownedPets: [], unlockedPets: [], defeatedBosses: [],
        arena: { completedArenaLevels: [] }, ...extra } as unknown as PlayerState);

    it('keeps Mathoria shelves and supplies three progressively stronger items of each kind in Silverpond', () => {
        for (const type of ['weapon', 'shield'] as const) {
            const original = getShopEquipment(catalog, 'mathoria', type);
            const local = getShopEquipment(catalog, 'silverpond', type);
            expect(original.map(item => item.tier)).toEqual([1, 2, 3]);
            expect(local).toHaveLength(3);
            let previousPower = type === 'weapon' ? original[2].damageMultiplier! : original[2].blockPower!;
            for (const item of local) {
                const power = type === 'weapon' ? item.damageMultiplier! : item.blockPower!;
                expect(power).toBeGreaterThan(previousPower);
                expect((textures.images as Record<string, string>)[item.spriteKey!]).toBeTruthy();
                previousPower = power;
            }
        }
    });

    it('offers each defeated Silverpond creature from existing stable defeat markers for tier 2 or 3 crystals', () => {
        for (const enemy of enemies.filter(enemy => enemy.id.startsWith('silverpond_'))) {
            const pet = companions.find(pet => pet.unlockedByEnemy === enemy.id)!;
            expect(pet, enemy.id).toBeDefined();
            expect(['fragment', 'prism']).toContain(pet.requiredAmulet.tier);
            expect(pet.requiredAmulet.value).toBeGreaterThan(0);
            expect(isPetUnlocked(pet, player())).toBe(false);
            expect(isPetUnlocked(pet, player({ unlockedPets: [enemy.id] }))).toBe(true);
            expect(pet.spriteKey).toBe(enemy.spriteKey);
        }
    });

    it('opens all forge operations at the Silverpond checkpoint, including older saves', () => {
        const before = player(), after = player({ storyProgress: { hasUnlockedSilverpond: true } });
        expect(CrystalSystem.hasPrismOperationsUnlocked(before)).toBe(false);
        const snapshot = structuredClone(after);
        expect(CrystalSystem.hasFragmentOperationsUnlocked(after)).toBe(true);
        expect(CrystalSystem.hasRefineUnlocked(after)).toBe(true);
        expect(CrystalSystem.hasPrismOperationsUnlocked(after)).toBe(true);
        expect(after).toEqual(snapshot);
        expect(CrystalSystem.hasPrismOperationsUnlocked(player({ defeatedBosses: ['crystal_serpent'] }))).toBe(true);
    });
});

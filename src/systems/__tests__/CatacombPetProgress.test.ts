import {describe,it,expect} from 'vitest';
import { awardCatacombFoxUpgrade, getPetAttackPower, migrateCatacombPets, getCatacombFoxBonus, CATACOMB_FOX_PET } from '../CatacombPetProgress';
import type { PlayerState } from '../../types';
import pets from '../../../public/assets/data/pets.json';
import enemies from '../../../public/assets/data/enemies.json';
import { CATACOMB_BANDS } from '../../data/catacombTrials';

describe('canonical fox and forest wolf',()=>{
 it('migrates duplicate unlocked, owned and active companions idempotently',()=>{
  const p={unlockedPets:['forest_wolf','catacomb_creature_B','catacomb_creature_E'],ownedPets:['pet_catacomb_B','pet_catacomb_E','pet_slime'],activePet:'pet_catacomb_E',pet:{id:'pet_catacomb_B',name:'Vlk'},catacombPetUpgrades:{B:2,E:4}} as unknown as PlayerState;
  migrateCatacombPets(p);
  expect(p.unlockedPets).toEqual(['forest_wolf','catacomb_creature_A']);
  expect(p.ownedPets).toEqual(['pet_catacomb_A','pet_slime']);
  expect(p.activePet).toBe('pet_catacomb_A');expect(p.pet).toEqual({id:'pet_catacomb_A',name:'Runová liška'});
  expect(getCatacombFoxBonus(p)).toBe(4);
  const saved=JSON.stringify(p);migrateCatacombPets(p);expect(JSON.stringify(p)).toBe(saved);
 });
 it('has exactly one wolf, released by a forest wolf defeat, and one fox shared by all bands',()=>{
  const wolves=pets.filter(p=>p.animPrefix==='wolf');expect(wolves).toHaveLength(1);
  expect(wolves[0]).toMatchObject({id:'pet_wolf',unlockedByEnemy:'forest_wolf'});
  expect(enemies.filter(e=>e.animPrefix==='wolf').map(e=>e.id)).toEqual(['forest_wolf']);
  for(const config of Object.values(CATACOMB_BANDS)){
   expect(enemies.find(e=>e.id===config.enemyId)?.animPrefix).toBe('rune-fox');
   expect(pets.find(p=>p.id===config.petId)?.animPrefix).toBe('rune-fox');
  }
 });
});

describe('persistent fox training', () => {
    const fox = pets.find(pet => pet.id === CATACOMB_FOX_PET)!;

    it('adds exactly one point for every win, including the first rescue and repeats beyond four', () => {
        const player: Pick<PlayerState, 'catacombFoxBonus'> = {};
        for (let win = 1; win <= 12; win++) {
            expect(awardCatacombFoxUpgrade(player)).toBe(win);
            expect(getPetAttackPower(fox, player)).toBe(fox.damageMultiplier! + win);
        }
    });

    it('keeps the earned effective bonus from legacy saves and continues above the old cap', () => {
        const player = { catacombPetUpgrades: { A: 2, B: 4, E: 3 } } as unknown as PlayerState;
        migrateCatacombPets(player);
        expect(player.catacombFoxBonus).toBe(4);
        awardCatacombFoxUpgrade(player);
        const reloaded = JSON.parse(JSON.stringify(player)) as PlayerState;
        migrateCatacombPets(reloaded);
        expect(getCatacombFoxBonus(reloaded)).toBe(5);
        expect(getPetAttackPower(fox, reloaded)).toBe(fox.damageMultiplier! + 5);
        expect(awardCatacombFoxUpgrade(reloaded)).toBe(6);
    });

    it('uses the canonical saved total without reapplying or capping the legacy bonus', () => {
        expect(getCatacombFoxBonus({ catacombFoxBonus: 7, catacombPetUpgrades: { E: 4 } })).toBe(7);
        expect(getCatacombFoxBonus({ catacombFoxBonus: 0, catacombPetUpgrades: { E: 4 } })).toBe(0);
    });

    it('keeps co-op owners and catalog data independent, and does not strengthen other pets', () => {
        const playerA = { catacombFoxBonus: 2 };
        const playerB = { catacombFoxBonus: 7 };
        const catalogBefore = JSON.stringify(pets);
        awardCatacombFoxUpgrade(playerA);
        expect(getPetAttackPower(fox, playerA)).toBe(fox.damageMultiplier! + 3);
        expect(getPetAttackPower(fox, playerB)).toBe(fox.damageMultiplier! + 7);
        for (const pet of pets.filter(pet => pet.id !== CATACOMB_FOX_PET)) {
            expect(getPetAttackPower(pet, playerA)).toBe(pet.damageMultiplier);
        }
        expect(JSON.stringify(pets)).toBe(catalogBefore);
    });
});

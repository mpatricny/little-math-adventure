import {describe,it,expect} from 'vitest';
import { migrateCatacombPets,getCatacombFoxBonus } from '../CatacombPetProgress';
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

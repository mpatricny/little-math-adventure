import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../BattleSimulator';
import { createInitialPlayerState, type AccuracyProfile, type EnemyStats } from '../types';

const perfectAccuracy: AccuracyProfile = {
  baseProblems: 1,
  bonusProblems: 1,
  blockProblems: 1,
  puzzles: 1,
  trialTiers: { bronze: 1, silver: 1, gold: 1 },
};

describe('BattleSimulator enemy defense', () => {
  it('uses the same once-per-attack defense formula as BattleScene', () => {
    const player = {
      ...createInitialPlayerState(),
      level: 3,
      hp: 20,
      maxHP: 20,
    };
    const enemy: EnemyStats = {
      id: 'armored-test',
      name: 'Armored Test',
      hp: 4,
      atk: 0,
      defense: 1,
      xp: 0,
      coinMin: 0,
      coinMax: 0,
      difficulty: 1,
    };

    const result = simulateBattle(player, enemy, perfectAccuracy);

    // Level 3 generates three correct problems: 3 raw - 1 defense = 2 damage.
    expect(result.won).toBe(true);
    expect(result.turns).toBe(2);
    expect(result.damageDealt).toBe(4);
  });
});

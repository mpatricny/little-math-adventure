import { describe, expect, it } from 'vitest';
import encountersJson from '../../../public/assets/data/encounters.json';
import forestJourneyJson from '../../../public/assets/data/forest-journey.json';
import { estimateJourneyRequirements, VERDANT_FOREST } from '../JourneySimulator';
import { resolveProductionJourneyEncounter } from '../ProductionEncounterAdapter';

describe('JourneySimulator production encounter adapter', () => {
  it('derives the legacy journey structure from forest-journey.json', () => {
    expect(VERDANT_FOREST.map(stage => stage.id)).toEqual(
      forestJourneyJson.journey.stages.map(stage => stage.id),
    );
    expect(VERDANT_FOREST.flatMap(stage => stage.encounters)
      .filter(encounter => encounter.type === 'battle' || encounter.type === 'boss')
      .map(encounter => encounter.encounterId))
      .toEqual([
        'forest-map-edge-wolf',
        'forest-map-edge-mushroom',
        'forest-map-deep-wolf-1',
        'forest-map-deep-wolf-2',
        'forest-map-grove-treant',
        'forest-map-guardian-boss',
      ]);
  });

  it('uses the production multi-phase boss HP in solo and co-op', () => {
    const solo = resolveProductionJourneyEncounter('forest-map-guardian-boss', 'solo');
    const coop = resolveProductionJourneyEncounter('forest-map-guardian-boss', 'coop');
    const document = encountersJson as Record<string, any>;
    const profile = document.bosses['verdant-guardian-v1'];
    const policy = document.multiplayerPolicies['forest-coop-v1'];

    expect(solo.boss?.phases.map(phase => phase.hp)).toEqual(
      profile.phases.map((phase: Record<string, any>) => phase.hp),
    );
    expect(coop.boss?.phases.map(phase => phase.hp)).toEqual(
      profile.phases.map((phase: Record<string, any>) => (
        Math.ceil(phase.hp * policy.bossHpScale)
      )),
    );
  });

  it('estimates the journey from every production enemy and boss phase', () => {
    const accuracy = {
      baseProblems: 1,
      bonusProblems: 1,
      blockProblems: 0,
      puzzles: 1,
      trialTiers: { bronze: 1, silver: 1, gold: 1 },
    };
    const requirements = estimateJourneyRequirements(VERDANT_FOREST, accuracy);
    const combatEncounters = VERDANT_FOREST
      .flatMap(stage => stage.encounters)
      .filter(encounter => encounter.type === 'battle' || encounter.type === 'boss');
    const combatants = combatEncounters.flatMap(encounter => {
      const resolved = resolveProductionJourneyEncounter(encounter.encounterId!, 'solo');
      return resolved.boss
        ? resolved.boss.phases.map(phase => ({ hp: phase.hp, atk: phase.attack }))
        : resolved.enemies;
    });
    const totalEnemyHP = combatants.reduce((total, enemy) => total + enemy.hp, 0);
    const totalEnemyDamage = combatants.reduce((total, enemy) => total + enemy.atk * 3, 0);
    const recommendedATK = Math.ceil(
      totalEnemyHP / (combatEncounters.length * 4 * accuracy.baseProblems),
    );

    expect(requirements).toEqual({
      recommendedLevel: Math.max(5, Math.ceil(recommendedATK / 1.5)),
      recommendedHP: totalEnemyDamage,
      recommendedATK,
      estimatedBattles: combatEncounters.length,
      estimatedDamage: totalEnemyDamage,
    });
  });
});

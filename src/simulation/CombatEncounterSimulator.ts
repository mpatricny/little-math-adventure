/**
 * Seeded combat audit for complete production rosters (unlike the legacy
 * one-enemy economy simulator). Presentation time and mastery progression are
 * deliberately outside this model; first-answer correctness/speed are inputs.
 */
import itemsJson from '../../public/assets/data/items.json';
import petsJson from '../../public/assets/data/pets.json';
import preparation from '../data/preparation.json';
import { getPlayerAttackDamageMultipliers } from '../systems/CombatAttackSystem';
import { damageBonusWouldHelp, resolveDamageAfterDefense } from '../systems/CombatDamageSystem';
import { applyProblemComplexityDamage } from '../systems/ProblemComplexity';
import { calculateShieldAnswerBlock } from '../systems/ShieldBlockSystem';
import { getPetAttackPower } from '../systems/CatacombPetProgress';
import { accumulateSpeedCharges } from '../systems/SpeedChargeSystem';
import { resolveTidalWave } from '../systems/UnderwaterTidalWave';
import type { MathProblem } from '../types';
import type { BossEncounterDefinition } from '../types/encounters';
import type { EnemyStats } from './types';

export interface CombatAuditPlayer {
    maxHp: number;
    hp?: number;
    attack: number;
    weaponId?: string;
    shieldId?: string;
    petId?: string;
    petTrainingBonus?: number;
    /** One full heal, usable at the start of this hero's turn without losing it. */
    potion?: boolean;
    potionThreshold?: number;
    preparation?: { kind: 'sword' | 'shield'; charges: number };
    blessing?: boolean;
}

export interface CombatAuditAnswers {
    attack: number;
    sword: number;
    pet: number;
    block: number;
    speed: 'slow' | 'swift' | 'lightning';
    /** Normal mastery-pool questions qualify; imported-save fallback questions may not. */
    chargeEligible?: boolean;
    /** First-answer assistance suppresses speed damage and quick shield doubling. */
    assistance?: number;
    /** Mix of genuine three-operand questions; uses the production 2x reward. */
    threeOperand?: number;
}

export interface CombatAuditEncounter { enemies: readonly EnemyStats[]; boss?: BossEncounterDefinition | null }
export interface CombatAuditResult {
    won: boolean;
    capped: boolean;
    rounds: number;
    playerHp: number[];
    damageTaken: number[];
    healing: number[];
    potionsUsed: number;
    potionRemaining: boolean[];
    preparationRemaining: number[];
    enemyAttacks: number;
    problems: number;
    phasesCompleted: number;
    tidalWaves: number;
    blessingsUsed: number;
}

/** Mulberry32: deterministic independent runs, without changing global Math.random. */
export function seededCombatRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * TurnManager order: A, B, pet A, pet B, every surviving enemy. A defeated boss
 * phase interrupts that order and the next phase attacks immediately. Enemy
 * rounds focus the same co-op defender, alternating A/B and skipping fallen.
 */
export function simulateCombatEncounter(
    encounter: CombatAuditEncounter,
    players: readonly CombatAuditPlayer[],
    answers: CombatAuditAnswers | readonly CombatAuditAnswers[],
    seed = 1,
    maxRounds = 120,
): CombatAuditResult {
    if (players.length < 1 || players.length > 2) throw new Error('Combat audit requires one or two heroes');
    if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new Error('Combat audit requires a positive round cap');
    if (encounter.boss?.phases.some(phase => phase.ability && phase.ability !== 'tidal_wave')) {
        throw new Error('Combat audit supports the underwater tidal boss mechanic; other boss abilities require a model');
    }
    const random = seededCombatRandom(seed);
    const probability = (chance: number) => random() < chance;
    const profiles = players.map((_, index) => Array.isArray(answers) ? answers[index] : answers) as CombatAuditAnswers[];
    const hp = players.map(p => Math.min(p.maxHp, p.hp ?? p.maxHp));
    const damageTaken = players.map(() => 0);
    const healing = players.map(() => 0);
    const charges = players.map(() => 0);
    const prepared = players.map(p => p.preparation?.charges ?? 0);
    const potions = players.map(p => Boolean(p.potion));
    const blessing = players.map(p => Boolean(p.blessing));
    let tidalAttacks = players.map(() => 0);
    const roster = encounter.enemies.map(e => ({ ...e }));
    const boss = encounter.boss;
    let phaseIndex = 0;
    let phasesCompleted = 0;
    let enemyTarget = 0;
    let rounds = 0;
    let enemyAttacks = 0;
    let problems = 0;
    let potionsUsed = 0;
    let tidalWaves = 0;
    let blessingsUsed = 0;
    const target = () => roster.find(e => e.hp > 0);
    const alive = () => hp.some(value => value > 0);
    const phase = () => boss?.phases[phaseIndex];
    const setBoss = () => {
        const current = phase();
        if (current) Object.assign(roster[0], { hp: current.hp, atk: current.attack, defense: current.defense });
    };
    setBoss();
    const heal = (index: number, amount: number) => {
        const gain = Math.min(amount, players[index].maxHp - hp[index]);
        hp[index] += gain; healing[index] += gain;
    };
    const answerDamage = (index: number, power: number, chance: number) => {
        problems++;
        if (!probability(chance)) return 0;
        const profile = profiles[index];
        const assisted = probability(profile.assistance ?? 0);
        const complex = probability(profile.threeOperand ?? 0);
        const problem = { damageMultiplier: power, ...(complex ? { operator2: '+', operand3: 1 } : {}) } as MathProblem;
        const damage = applyProblemComplexityDamage(problem).damageMultiplier!;
        let speedBonus = 0;
        if (!assisted && profile.chargeEligible !== false) {
            const added = profile.speed === 'lightning' ? 2 : profile.speed === 'swift' ? 1 : 0;
            const accumulated = accumulateSpeedCharges(charges[index], added);
            speedBonus = accumulated.bonusDamage;
            charges[index] = accumulated.newCharges;
        }
        return damage + speedBonus;
    };
    /** Returns true when a phase ends, interrupting remaining allied actions. */
    const hit = (raw: number, index: number, sword: boolean) => {
        const enemy = target();
        if (!enemy) return false;
        const bonus = preparation.effects.sword.damagePerCharge;
        if (sword && raw > 0 && players[index].preparation?.kind === 'sword' && prepared[index] > 0
            && damageBonusWouldHelp(raw, bonus, enemy.defense)) { raw += bonus; prepared[index]--; }
        enemy.hp = Math.max(0, enemy.hp - resolveDamageAfterDefense(raw, enemy.defense).damage);
        if (target() || !boss) return false;
        phasesCompleted++;
        if (phaseIndex === boss.phases.length - 1) return false;
        const percent = phase()?.healPercent ?? 0;
        players.forEach((player, i) => { if (hp[i] > 0) heal(i, Math.floor(player.maxHp * percent / 100)); });
        phaseIndex++;
        tidalAttacks = players.map(() => 0);
        setBoss();
        return true;
    };

    while (alive() && target() && rounds < maxRounds) {
        rounds++;
        let phaseInterrupted = false;
        for (let i = 0; i < players.length && target(); i++) {
            if (hp[i] <= 0) continue;
            const player = players[i];
            if (potions[i] && hp[i] <= player.maxHp * (player.potionThreshold ?? 0.45)) {
                heal(i, player.maxHp); potions[i] = false; potionsUsed++;
            }
            let raw = getPlayerAttackDamageMultipliers(player.attack)
                .reduce((sum, power) => sum + answerDamage(i, power, profiles[i].attack), 0);
            const weapon = itemsJson.find(item => item.id === player.weaponId && item.type === 'weapon');
            if (weapon) raw += answerDamage(i, weapon.damageMultiplier ?? 1, profiles[i].sword);
            if (hit(raw, i, true)) { phaseInterrupted = true; break; }
        }
        if (!phaseInterrupted) {
            for (let i = 0; i < players.length && target(); i++) {
                if (hp[i] <= 0) continue;
                const pet = petsJson.find(pet => pet.id === players[i].petId);
                if (pet && hit(answerDamage(i, getPetAttackPower(pet, { catacombFoxBonus: players[i].petTrainingBonus ?? 0 }), profiles[i].pet), i, false)) break;
            }
        }
        if (!target()) break;
        let defender = enemyTarget;
        enemyTarget = (enemyTarget + 1) % players.length;
        if (hp[defender] <= 0) defender = hp.findIndex(value => value > 0);
        for (const enemy of roster.filter(e => e.hp > 0)) {
            // BattleScene keeps the chosen target for the complete enemy round.
            enemyAttacks++;
            let incoming = enemy.atk;
            if (phase()?.ability === 'tidal_wave' && boss?.tidalWave) {
                const wave = resolveTidalWave(boss.tidalWave, ++tidalAttacks[defender], blessing[defender]);
                incoming += wave.bonusDamage;
                if (wave.wave) tidalWaves++;
                if (wave.blessingUsed) { blessing[defender] = false; blessingsUsed++; }
            }
            const shield = itemsJson.find(item => item.id === players[defender].shieldId && item.type === 'shield');
            let blocked = 0;
            if (shield && incoming > 0) {
                problems++;
                const profile = profiles[defender];
                const correct = probability(profile.block);
                blocked = calculateShieldAnswerBlock(shield.blockPower ?? 1, incoming, correct,
                    profile.speed !== 'slow', probability(profile.assistance ?? 0));
                if (incoming > blocked && players[defender].preparation?.kind === 'shield' && prepared[defender] > 0) {
                    blocked += Math.min(incoming - blocked, preparation.effects.shield.blockPerCharge); prepared[defender]--;
                }
            }
            const damage = Math.min(hp[defender], incoming - blocked);
            hp[defender] = Math.max(0, hp[defender] - damage);
            damageTaken[defender] += damage;
            if (!alive()) break;
        }
    }
    return { won: !target(), capped: Boolean(target()) && alive() && rounds >= maxRounds, rounds,
        playerHp: hp, damageTaken, healing, potionsUsed, potionRemaining: potions, preparationRemaining: prepared, enemyAttacks, problems,
        phasesCompleted, tidalWaves, blessingsUsed };
}

export function summarizeCombatAudit(results: readonly CombatAuditResult[]) {
    if (results.length === 0) throw new Error('Combat audit summary requires at least one result');
    const mean = (f: (result: CombatAuditResult) => number) => results.reduce((sum, result) => sum + f(result), 0) / results.length;
    return {
        winRate: mean(r => Number(r.won)),
        rounds: mean(r => r.rounds),
        hpLost: mean(r => r.damageTaken.reduce((sum, damage) => sum + damage, 0)),
        healing: mean(r => r.healing.reduce((sum, amount) => sum + amount, 0)),
        problems: mean(r => r.problems),
        potionsUsed: mean(r => r.potionsUsed),
        caps: results.filter(r => r.capped).length,
        damagePerPlayer: results[0].playerHp.map((_, index) => mean(r => r.damageTaken[index])),
        fallRatePerPlayer: results[0].playerHp.map((_, index) => mean(r => Number(r.playerHp[index] <= 0))),
        hpRemainingPerPlayer: results[0].playerHp.map((_, index) => mean(r => r.playerHp[index])),
    };
}

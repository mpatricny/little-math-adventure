import type { PlayerState } from '../types';
import { CoopSessionManager } from './CoopSessionManager';
import { GameStateManager } from './GameStateManager';
import { ProgressionSystem } from './ProgressionSystem';

/** Town recovery changes only health and the existing potion subscription. */
export function recoverPlayerInTown(player: PlayerState): boolean {
    const needsHealing = player.hp !== player.maxHp || player.status !== 'healthy';
    const needsPotion = player.hasPotionSubscription && player.potions === 0;
    if (needsHealing) ProgressionSystem.fullHeal(player);
    if (needsPotion) player.potions = 1;
    return needsHealing || Boolean(needsPotion);
}

/** Run before constructing a town HUD; co-op writes each recovered save slot. */
export function recoverTownPlayers(): void {
    const gameState = GameStateManager.getInstance();
    const coop = CoopSessionManager.getInstance();
    if (coop.isCoopActive()) {
        coop.forBothPlayers(() => recoverPlayerInTown(gameState.getPlayer()));
        coop.activatePlayerA();
    } else if (recoverPlayerInTown(gameState.getPlayer())) {
        gameState.save();
    }
}

import { PlayerState } from '../types';

export class ProgressionSystem {
    /**
     * Calculate XP needed for next level
     */
    static getXpForLevel(level: number): number {
        return 100 * level;
    }

    /**
     * Award XP to player and handle level-ups
     * Returns array of level-up events (empty if no level-up)
     */
    static awardXp(player: PlayerState, xpAmount: number): { leveledUp: boolean; newLevel: number; hpGain: number; attackGain: number } | null {
        player.xp += xpAmount;

        // Check for level-up
        if (player.xp >= player.xpToNextLevel) {
            const oldLevel = player.level;
            player.level++;
            player.xp -= player.xpToNextLevel;
            player.xpToNextLevel = this.getXpForLevel(player.level);

            // Stat increases
            const hpGain = 5;
            const attackGain = 1;

            player.maxHp += hpGain;
            player.hp += hpGain;  // Also heal on level-up
            player.attack += attackGain;

            return {
                leveledUp: true,
                newLevel: player.level,
                hpGain,
                attackGain
            };
        }

        return null;
    }

    /**
     * Award gold to player
     */
    static awardGold(player: PlayerState, goldAmount: number): void {
        player.gold += goldAmount;
    }

    /**
     * Get random gold amount within range
     */
    static getRandomGold(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Set player to defeated state
     */
    static setDefeated(player: PlayerState): void {
        player.hp = 1;  // Don't kill, just bring to 1 HP
        player.status = 'přizabitý';
    }

    /**
     * Heal player (witch hut)
     */
    static heal(player: PlayerState, cost: number): boolean {
        if (player.gold < cost) {
            return false;  // Not enough gold
        }

        player.gold -= cost;
        player.hp = player.maxHp;
        player.status = 'healthy';
        return true;
    }

    /**
     * Create initial player state
     */
    static createInitialPlayer(): PlayerState {
        return {
            name: 'Hrdina',
            level: 1,
            xp: 0,
            xpToNextLevel: this.getXpForLevel(1),
            hp: 10,
            maxHp: 10,
            gold: 0,
            status: 'healthy',
            attack: 1,
            defense: 0,
            equippedWeapon: null,
            equippedArmor: null
        };
    }
}

import type { EnemyDefinition } from '../types';

/** Scene-specific placement for an enemy that is visually represented outside battle. */
export interface EnemyScenePlacement {
    visualEnemyId: string;
    x: number;
    y: number;
    scale?: number;
    depth?: number;
    flipX?: boolean;
}

export interface EnemyScenePresentation {
    x: number;
    y: number;
    scale: number;
    depth: number;
    flipX: boolean;
    spriteKey: string;
    idleAnimation?: string;
}

export interface EnemyBattlePresentation {
    x: number;
    y: number;
    scale: number;
}

/**
 * Resolve one enemy's intrinsic artwork from enemies.json and its transform
 * from the scene placement. A placement override is explicit and always wins.
 */
export function resolveEnemyScenePresentation(
    placement: EnemyScenePlacement,
    enemy: EnemyDefinition,
    defaults: { scale?: number; depth: number },
): EnemyScenePresentation {
    if (placement.visualEnemyId !== enemy.id) {
        throw new Error(
            `Enemy placement references ${placement.visualEnemyId}, received definition ${enemy.id}`,
        );
    }

    const scale = placement.scale ?? enemy.worldScale ?? enemy.scale ?? defaults.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`Enemy ${enemy.id} has invalid scene scale ${scale}`);
    }

    const depth = placement.depth ?? defaults.depth;
    if (!Number.isFinite(depth)) {
        throw new Error(`Enemy ${enemy.id} has invalid scene depth ${depth}`);
    }

    return {
        x: placement.x,
        y: placement.y,
        scale,
        depth,
        flipX: placement.flipX ?? false,
        spriteKey: enemy.spriteKey,
        idleAnimation: enemy.animPrefix ? `${enemy.animPrefix}-idle` : undefined,
    };
}

/** Resolve the battle-specific scale and spawn correction stored with the enemy. */
export function resolveEnemyBattlePresentation(
    enemy: EnemyDefinition,
    spawn: { x: number; y: number },
): EnemyBattlePresentation {
    const scale = enemy.battleScale ?? enemy.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`Enemy ${enemy.id} has invalid battle scale ${scale}`);
    }

    const offsetX = enemy.battleOffsetX ?? 0;
    const offsetY = enemy.battleOffsetY ?? 0;
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
        throw new Error(`Enemy ${enemy.id} has an invalid battle offset`);
    }

    return {
        x: spawn.x + offsetX,
        y: spawn.y + offsetY,
        scale,
    };
}

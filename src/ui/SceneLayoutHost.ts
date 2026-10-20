import type Phaser from 'phaser';
import type { SceneBuilder } from '../systems/SceneBuilder';

export type WaterHost = { x: number; y: number; width: number; height: number; depth: number };

/** Read layout without importing the dialogs and actor animations that use it. */
export function waterHost(builder: SceneBuilder, id: string): WaterHost {
    const host = builder.get<Phaser.GameObjects.Container>(id);
    const def = builder.getElementDef(id);
    if (!host || !def) throw new Error(`Missing underwater layout host: ${id}`);
    return {
        x: host.x, y: host.y, depth: host.depth,
        width: def.width ?? 200,
        height: def.height ?? 60,
    };
}

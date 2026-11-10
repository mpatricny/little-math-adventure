import Phaser from 'phaser';
import type { EnemyDefinition } from '../types';
import type { WaterHost } from './SceneLayoutHost';

export const ENEMY_ELITE_BADGE = 'underwater-elite-rank-badge';

/** Same read-free crystal crest in exploration and combat; never changes actor art. */
export function createEnemyRankBadge(
    scene: Phaser.Scene,
    enemy: EnemyDefinition,
    host: WaterHost,
    follow?: { anchor: Phaser.GameObjects.Container; reference: { x: number; y: number } },
): Phaser.GameObjects.Image | undefined {
    if (enemy.rank !== 'elite') return undefined;
    const badge = scene.add.image(host.x, host.y, ENEMY_ELITE_BADGE)
        .setName(`enemy-rank-${enemy.id}`).setDepth(host.depth)
        .setData('enemyRank', 'elite').setData('enemyId', enemy.id);
    badge.setScale(Math.min(host.width / badge.width, host.height / badge.height));
    if (follow) {
        const offset = { x: host.x - follow.reference.x, y: host.y - follow.reference.y };
        const stop = () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, update);
        const update = () => {
            if (!badge.scene || !follow.anchor.scene) {
                if (badge.scene) badge.setVisible(false);
                stop();
                return;
            }
            badge.setPosition(follow.anchor.x + offset.x, follow.anchor.y + offset.y);
            badge.setAlpha(follow.anchor.alpha).setVisible(follow.anchor.visible);
        };
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, update);
        badge.once(Phaser.GameObjects.Events.DESTROY, stop);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
        update();
    }
    return badge;
}

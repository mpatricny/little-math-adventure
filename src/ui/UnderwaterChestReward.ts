import Phaser from 'phaser';
import { sfx } from '../audio/AudioDirector';
import { SceneBuilder } from '../systems/SceneBuilder';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterHost } from './UnderwaterUI';

export type UnderwaterChestLoot = { coins: number; mana: number; players?: string[] };

/** A visible receipt, never a second grant. Show after the lock has closed. */
export class UnderwaterChestReward {
    constructor(scene: Phaser.Scene, loot: UnderwaterChestLoot) {
        scene.children.getByName('underwaterChestReward')?.destroy();
        const builder = new SceneBuilder(scene); builder.buildScene('UnderwaterChestReward');
        const panel = waterHost(builder, 'chestRewardPanelHost');
        const root = scene.add.container(0, 0).setDepth(panel.depth).setAlpha(0)
            .setName('underwaterChestReward').setData('loot', loot);
        root.add(waterArtwork(scene, 'silverpond-fairy-title-frame', panel));
        const label = (id: string, value: string, size: number, color: string) => {
            const host = waterHost(builder, id);
            const text = scene.add.text(host.x, host.y, value, { resolution: 2, fontFamily: 'Georgia',
                fontSize: `${size}px`, color, stroke: '#062335', strokeThickness: 2, align: 'center' })
                .setOrigin(0.5).setName(id).setDepth(host.depth);
            fitWaterText(text, host, size); root.add(text);
        };
        label('chestRewardTitleHost', loot.players?.length ? `POKLAD · ${loot.players.join(' + ')}` : 'POKLAD', 23, '#f4e8c3');
        const coin = waterHost(builder, 'chestRewardCoinIconHost');
        const coinImage = scene.add.image(coin.x, coin.y, 'shop-coins-sheet', 1).setData('waterArtwork', true);
        coinImage.setScale(Math.min(coin.width / coinImage.width, coin.height / coinImage.height));
        root.add(coinImage);
        root.add(waterArtwork(scene, 'mana-icon', waterHost(builder, 'chestRewardManaIconHost')));
        label('chestRewardCoinsHost', `+${loot.coins}`, 35, '#ffe7a2');
        label('chestRewardManaHost', `+${loot.mana}`, 35, '#bbf6ff');
        scene.tweens.add({ targets: root, alpha: 1, duration: 220 });
        const fade = scene.time.delayedCall(4800, () => scene.tweens.add({ targets: root, alpha: 0,
            duration: 400, onComplete: () => root.destroy(true) }));
        root.once('destroy', () => {
            fade.remove(false); scene.tweens.killTweensOf(root);
            for (const def of scene.cache.json.get('scenes').scenes.UnderwaterChestReward.elements) builder.get(def.id)?.destroy();
        });
        sfx(scene, 'reward.coins');
    }
}

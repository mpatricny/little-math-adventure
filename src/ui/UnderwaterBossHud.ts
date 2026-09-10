import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import type { BossPhaseDefinition } from '../types/encounters';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterHost } from './UnderwaterUI';

/** Silverpond phase feedback shares the chapter's enamel art and editor layout. */
export class UnderwaterBossHud {
    private builder: SceneBuilder;
    private root: Phaser.GameObjects.Container;
    private phase: Phaser.GameObjects.Text;
    private wave: Phaser.GameObjects.Text;
    constructor(private scene: Phaser.Scene) {
        this.builder = new SceneBuilder(scene); this.builder.buildScene('UnderwaterBossHud');
        this.root = scene.add.container(0, 0).setDepth(waterHost(this.builder, 'bossPhaseHost').depth);
        this.root.add(waterArtwork(scene, 'silverpond-fairy-title-frame', waterHost(this.builder, 'bossPhaseHost')));
        this.phase = this.text('bossPhaseHost', '', 21);
        this.wave = this.text('bossWaveHost', '', 20);
        this.root.add([this.phase, this.wave]);
    }
    private text(id: string, value: string, size: number): Phaser.GameObjects.Text {
        const host = waterHost(this.builder, id);
        const text = this.scene.add.text(host.x, host.y, value, { resolution: 2, fontFamily: 'Georgia',
            fontSize: `${size}px`, color: '#e6fff4', align: 'center', stroke: '#042333', strokeThickness: 2 })
            .setOrigin(0.5).setDepth(host.depth).setName(id);
        fitWaterText(text, { ...host, width: host.width * 0.8 }, size); return text;
    }
    update(phase: number, count: number, wave: string): void {
        this.phase.setText(`STRÁŽCE · ${phase + 1}/${count}`);
        this.wave.setText(wave);
        fitWaterText(this.wave, waterHost(this.builder, 'bossWaveHost'), 20);
    }
    setVisible(visible: boolean): void { this.root.setVisible(visible); }
    transition(phase: BossPhaseDefinition, healPercent: number, complete: () => void): void {
        const shade = waterHost(this.builder, 'bossTransitionShadeHost');
        const overlay = this.scene.add.container(0, 0).setDepth(shade.depth).setName('depthPhaseTransition');
        overlay.add(this.scene.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x031827, 0.8).setInteractive());
        overlay.add(waterArtwork(this.scene, 'silverpond-fairy-reward-frame', waterHost(this.builder, 'bossTransitionFrameHost')));
        overlay.add(this.text('bossTransitionTitleHost', phase.nameCs, 30));
        overlay.add(this.text('bossTransitionHelpHost', phase.ability === 'tidal_wave' ? 'Každá druhá vlna je silnější.' : 'Pouto krystalu praská.', 23));
        overlay.add(this.text('bossTransitionHealHost', healPercent ? `Síla perel: +${healPercent} % zdraví` : '', 22));
        overlay.setAlpha(0);
        this.scene.tweens.add({ targets: overlay, alpha: 1, duration: 250 });
        this.scene.time.delayedCall(2800, () => this.scene.tweens.add({ targets: overlay, alpha: 0, duration: 300,
            onComplete: () => { overlay.destroy(true); complete(); } }));
    }
}

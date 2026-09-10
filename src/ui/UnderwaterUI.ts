import { gameAudio, sfx } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { auditUnderwaterLayout, fitWaterText, UnderwaterButton, waterArtwork } from './UnderwaterTheme';
import type { EnamelIcon } from './UnderwaterTheme';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { buyUnderwaterHint, UNDERWATER_HINT } from '../systems/UnderwaterHintPolicy';

export type WaterHost = { x: number; y: number; width: number; height: number; depth: number };

/** Every static coordinate belongs to the editor, including modal children. */
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

export class UnderwaterUI {
    readonly builder: SceneBuilder;
    modal: Phaser.GameObjects.Container | null = null;
    private buttons: UnderwaterButton[] = [];
    private toast?: Phaser.GameObjects.Text;
    private captions: (Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[] = [];
    private roomControls: UnderwaterButton[] = [];
    private hintTime = new Map<string, number>();

    constructor(private scene: Phaser.Scene) {
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('UnderwaterOverlay');
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.close();
            this.roomControls.forEach(button => button.destroy());
        });
    }

    text(id: string, value: string, size = 22, modal = false): Phaser.GameObjects.Text {
        const host = waterHost(this.builder, id);
        const text = this.scene.add.text(host.x, host.y, value, {
            resolution: 2,
            fontFamily: id === 'modalTitleHost' || id === 'titleHost' || id === 'puzzleEquationHost' ? 'Georgia, serif' : 'Arial, sans-serif',
            fontSize: `${size}px`, color: '#e9f6ef',
            align: 'center', wordWrap: { width: host.width }, lineSpacing: 6,
            stroke: '#082a3b', strokeThickness: modal ? 0 : 2,
        }).setOrigin(0.5).setDepth(host.depth).setName(id);
        fitWaterText(text, host, size);
        if (modal) this.modal?.add(text);
        else if (id === 'titleHost' || id === 'objectiveHost') this.captions.push(text);
        return text;
    }

    updateText(text: Phaser.GameObjects.Text, value: string): void {
        text.setText(value);
        fitWaterText(text, waterHost(this.builder, text.name), text.getData('waterFontSize'));
    }

    button(builder: SceneBuilder, id: string, label: string, onClick: () => void, modal = false, fontSize = 18, icon?: EnamelIcon): UnderwaterButton {
        const host = waterHost(builder, id);
        const button = new UnderwaterButton(this.scene, {
            ...host, label, fontSize, pearl: id.startsWith('puzzleChoice') || id.startsWith('icon'), icon, name: id, onClick,
        });
        if (modal) {
            this.modal?.add(button.root);
            this.buttons.push(button);
        } else this.roomControls.push(button);
        return button;
    }

    open(title: string): void {
        this.close();
        this.toast?.destroy();
        this.captions.forEach(caption => caption.setVisible(false));
        this.roomControls.forEach(button => button.root.setVisible(false));
        const shade = waterHost(this.builder, 'modalShadeHost');
        const panel = waterHost(this.builder, 'modalPanelHost');
        this.modal = this.scene.add.container(0, 0).setDepth(shade.depth).setName('underwaterModal');
        this.modal.setData('waterModalSafeArea', waterHost(this.builder, 'modalSafeAreaHost'));
        const blocker = this.scene.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x021820, 0.82)
            .setInteractive();
        const frame = waterArtwork(this.scene, 'silverpond-fairy-reward-frame', panel).setName('waterModalFrame');
        this.modal.add([blocker, frame]);
        this.text('modalTitleHost', title, 30, true);
    }

    /** One consistent paid, delayed hint control for every underwater puzzle. */
    hint(builder: SceneBuilder, id: string, reveal: () => void, useful: () => boolean): UnderwaterButton {
        const state = GameStateManager.getInstance();
        // Capture the payer before a world callback can switch co-op profiles.
        const coop = CoopSessionManager.getInstance();
        const owner = coop.getActivePlayer();
        const key = `${state.getPlayer().underwaterProgress?.roomId ?? ''}:${owner}:${id}`;
        let balance = ProgressionSystem.getTotalCoinValue(state.getPlayer().coins);
        let elapsed = this.hintTime.get(key) ?? 0;
        const host = waterHost(builder, `${id}Status`);
        const status = this.scene.add.text(host.x, host.y, '', { resolution: 2, fontFamily: 'Arial',
            fontSize: '16px', color: '#e9d8b5', align: 'center', stroke: '#062b3b', strokeThickness: 3 })
            .setOrigin(0.5).setDepth(host.depth).setName(`${id}Status`);
        this.modal!.add(status);
        let disposed = false;
        const button = this.button(builder, id, '', () => {
            const previous = coop.getActivePlayer();
            owner === 'A' ? coop.activatePlayerA() : coop.activatePlayerB();
            const bought = buyUnderwaterHint(state.getPlayer(), elapsed, useful());
            balance = ProgressionSystem.getTotalCoinValue(state.getPlayer().coins);
            if (bought) state.save();
            previous === 'A' ? coop.activatePlayerA() : coop.activatePlayerB();
            if (!bought) { refresh(); return; }
            reveal(); refresh();
        }, true, 20, 'hint');
        let lastEnabled: boolean | undefined;
        const refresh = () => {
            if (disposed || !status.active) return;
            const waiting = elapsed < UNDERWATER_HINT.delayMs;
            const affordable = balance >= UNDERWATER_HINT.cost;
            const enabled = !waiting && affordable && useful();
            if (enabled !== lastEnabled) button.setState(enabled ? 'normal' : 'disabled');
            lastEnabled = enabled;
            const caption = !useful() ? '' : waiting ? `${Math.ceil((UNDERWATER_HINT.delayMs - elapsed) / 1000)} s · 1 mince` : affordable ? '1 mince' : 'Chybí mince';
            if (status.text !== caption) { status.setText(caption); fitWaterText(status, host, 16); }
            button.root.setData('hintElapsedMs', elapsed).setData('hintCost', UNDERWATER_HINT.cost);
        };
        const tick = (_time: number, delta: number) => {
            // EventEmitter may still hold this callback in its current-frame snapshot after off().
            if (disposed || !status.active) return;
            elapsed = Math.min(UNDERWATER_HINT.delayMs, elapsed + delta);
            this.hintTime.set(key, elapsed); refresh();
        };
        this.scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
        this.modal!.once('destroy', () => { disposed = true; this.scene.events.off(Phaser.Scenes.Events.UPDATE, tick); });
        refresh(); return button;
    }

    dialog(title: string, text: string, button: string, next: () => void, cancel?: () => void, cancelLabel = 'PŘESKOČIT ŘEČ'): void {
        this.open(title);
        const host = waterHost(this.builder, 'modalPortraitHost');
        const portrait = this.scene.add.sprite(host.x, host.y, 'spritesheet-zyx-transparent2-sheet', 0);
        if (this.scene.anims.exists('zyx-idle')) portrait.play('zyx-idle');
        portrait.setScale(Math.min(host.width / portrait.width, host.height / portrait.height));
        portrait.setData('waterArtwork', true);
        this.modal!.add(portrait);
        this.text('modalTextHost', text, 27, true);
        this.button(this.builder, 'modalNextHost', button, () => { this.close(); next(); }, true);
        if (cancel) this.button(this.builder, 'modalCloseHost', cancelLabel, () => { this.close(); cancel(); }, true);
    }

    notice(message: string): void {
        this.toast?.destroy();
        this.toast = this.text('toastHost', message, 18);
        this.toast.setBackgroundColor('#082936').setPadding(10, 5);
        fitWaterText(this.toast, { ...waterHost(this.builder, 'toastHost'), width: waterHost(this.builder, 'toastHost').width - 24 }, 18);
        const toast = this.toast;
        this.scene.tweens.add({ targets: toast, alpha: 0, delay: 3200, duration: 350, onComplete: () => toast.destroy() });
    }

    close(): void {
        gameAudio().cancel(this.scene);
        if (this.modal) sfx(this.scene, 'ui.back');
        this.buttons.forEach(button => button.destroy());
        this.buttons = [];
        this.modal?.destroy(true);
        this.modal = null;
        this.captions.forEach(caption => { if (caption.active) caption.setVisible(true); });
        this.roomControls.forEach(button => { if (button.root.active) button.root.setVisible(true); });
    }

    /** Low-contrast wayfinding; unfinished paths must not look like active actions. */
    landmark(builder: SceneBuilder, id: string, label: string): void {
        const host = waterHost(builder, id);
        const plate = this.scene.add.graphics().setDepth(host.depth);
        plate.fillStyle(0x092b39, 0.82).fillRoundedRect(host.x - host.width / 2, host.y - host.height / 2, host.width, host.height, 12);
        plate.lineStyle(1, 0x76a9af, 0.5).strokeRoundedRect(host.x - host.width / 2, host.y - host.height / 2, host.width, host.height, 12);
        const text = this.scene.add.text(host.x, host.y, `${label}\nDALŠÍ ČÁST`, {
            resolution: 2,
            fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#b1ccd1', align: 'center', lineSpacing: 5,
        }).setOrigin(0.5).setDepth(host.depth).setName(id);
        fitWaterText(text, { ...host, width: host.width - 24, height: host.height - 12 }, 18);
        this.captions.push(plate, text);
    }

    resolveChoices(selected: UnderwaterButton, correct: boolean): void {
        this.buttons.filter(button => button.root.name.startsWith('puzzleChoice'))
            .forEach(button => button.setState(button === selected && correct ? 'selected' : 'disabled'));
    }

    auditLayout(): string[] { return auditUnderwaterLayout(this.scene); }
}

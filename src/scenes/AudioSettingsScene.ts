import { MedievalActionButton } from '../ui/MedievalActionButton';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { gameAudio, sfx } from '../audio/AudioDirector';

/** Shared scene-editor-positioned sound settings, reached from menu and pause. */
export class AudioSettingsScene extends Phaser.Scene {
    private returnScene = 'MenuScene';
    private builder!: SceneBuilder;
    constructor() { super('AudioSettingsScene'); }
    init(data: { returnScene?: string } = {}): void { this.returnScene = data.returnScene ?? 'MenuScene'; }
    create(): void {
        this.scene.bringToTop();
        this.builder = new SceneBuilder(this); this.builder.buildScene('AudioSettingsScene');
        const host = (id: string) => this.builder.get<Phaser.GameObjects.Container>(id)!;
        const panel = host('audioPanel');
        const backdrop = host('audioBackdrop');
        this.add.rectangle(backdrop.x, backdrop.y, 1280, 720, 0x081017, 0.96).setDepth(backdrop.depth).setInteractive();
        this.add.rectangle(panel.x, panel.y, 650, 480, 0x19222c).setStrokeStyle(3, 0x88b6bd).setDepth(panel.depth);
        const text = (id: string, label: string, size: number) => {
            const h = host(id); return this.add.text(h.x, h.y, label, { fontFamily: 'Georgia', fontSize: size, color: '#f4eddc', resolution: 2 }).setOrigin(0.5).setDepth(h.depth).setName(id);
        };
        text('audioTitle', 'ZVUK', 32);
        text('audioHelp', 'Nastavení se ukládá pro tento prohlížeč.', 18);
        const button = (id: string, label: string, click: () => void, width = 64) => {
            const h = host(id), root = this.add.container(h.x, h.y).setDepth(h.depth).setSize(width, 48).setName(id);
            const bg = this.add.rectangle(0, 0, width, 48, 0x294250).setStrokeStyle(2, 0x7da8b5);
            const title = this.add.text(0, 0, label, { fontFamily: 'Arial', fontSize: 20, color: '#fff6df', resolution: 2 }).setOrigin(0.5);
            root.add([bg, title]).setInteractive({ useHandCursor: true });
            root.on('pointerover', () => bg.setFillStyle(0x36586a));
            root.on('pointerout', () => bg.setFillStyle(0x294250));
            root.on('pointerdown', () => { bg.setFillStyle(0x1c303c); click(); });
            root.on('pointerup', () => bg.setFillStyle(0x36586a));
            return title;
        };
        for (const [channel, label] of [['music', 'Hudba'], ['voice', 'Hlas'], ['effects', 'Efekty']] as const) {
            text(`audio${channel}Label`, label, 23);
            const value = text(`audio${channel}Value`, '', 21);
            let mute: Phaser.GameObjects.Text;
            const refresh = () => { value.setText(`${Math.round(gameAudio().settings[channel] * 100)} %`); mute?.setText(gameAudio().settings[channel] ? 'VYPNOUT' : 'ZAPNOUT'); };
            const adjust = (amount: number) => { gameAudio().setVolume(channel, gameAudio().settings[channel] + amount); refresh(); };
            button(`audio${channel}Minus`, '−', () => adjust(-0.1));
            button(`audio${channel}Plus`, '+', () => adjust(0.1));
            mute = button(`audio${channel}Mute`, 'VYPNOUT', () => {
                gameAudio().setVolume(channel, gameAudio().settings[channel] ? 0 : 0.8);
                refresh(); mute.setText(gameAudio().settings[channel] ? 'VYPNOUT' : 'ZAPNOUT');
            }, 126);
            mute.setText(gameAudio().settings[channel] ? 'VYPNOUT' : 'ZAPNOUT'); refresh();
        }
        button('audioPreview', 'UKÁZKA HLASU', () => { void gameAudio().speak('vo.crash.hello', this); sfx(this, 'reward.crystal'); }, 230);
        const close = () => { gameAudio().cancel(this); this.scene.resume(this.returnScene); this.scene.stop(); };
        button('audioClose', 'HOTOVO', close, 180);
        this.input.keyboard?.on('keydown-ESC', close);
        this.events.once('shutdown', () => gameAudio().cancel(this));
    }
}

export function openAudioSettings(scene: Phaser.Scene): void {
    gameAudio().setPaused(scene, false);
    scene.scene.launch('AudioSettingsScene', { returnScene: scene.sys.settings.key });
    scene.scene.pause();
}

export function audioSettingsButton(scene: Phaser.Scene, onClick = () => openAudioSettings(scene), hostId = 'audioOpen'): Phaser.GameObjects.Container {
    const builder = new SceneBuilder(scene); builder.buildScene('AudioControlHosts');
    const host = builder.get<Phaser.GameObjects.Container>(hostId)!;
    return new MedievalActionButton(scene, {
        x: host.x, y: host.y, depth: host.depth, width: 190, height: 52,
        layout: 'text', label: 'ZVUK', labelFontSize: 20, accent: 0x88b6bd,
        name: 'audioOpen', onClick,
    }).root;
}

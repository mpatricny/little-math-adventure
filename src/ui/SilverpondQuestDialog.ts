import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { StorySystem } from '../systems/StorySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { getSilverpondQuestStage, hasUnseenSilverpondQuest, type SilverpondQuestStage } from '../systems/SilverpondQuestProgress';
import { gameAudio } from '../audio/AudioDirector';
import { GuideConfirmButton, blockGuidePointer } from './GuideConfirmButton';
import { waterArtwork, type WaterBox } from './WaterArtwork';
import { createZyxDialogPortrait } from './ZyxDialogPortrait';

type HostLayout = WaterBox & { depth: number };
type QuestSymbol = 'lake-crystal' | 'confused-fairy' | 'water-scale' | 'saved-crystal';
type QuestPage = { title: string; symbol: QuestSymbol; voice: string };

const PAGES: Record<SilverpondQuestStage, QuestPage[]> = {
    fairy: [
        { title: 'KRYSTAL V HLUBINÁCH', symbol: 'lake-crystal', voice: 'vo.silverpond.quest.crystal' },
        { title: 'OSVOBOĎ VÍLU', symbol: 'confused-fairy', voice: 'vo.silverpond.quest.fairy' },
        { title: 'KOUZELNÁ ŠUPINA', symbol: 'water-scale', voice: 'vo.silverpond.quest.scale' },
    ],
    dive: [{ title: 'POD HLADINU', symbol: 'water-scale', voice: 'vo.silverpond.quest.dive' }],
    crystal: [{ title: 'KRYSTAL ZACHRÁNĚN', symbol: 'saved-crystal', voice: 'vo.silverpond.quest.complete' }],
};

/** Replayable picture-led guidance. Attention is acknowledged per displayed stage. */
export class SilverpondQuestDialog {
    private readonly story = StorySystem.getInstance();
    private readonly root: Phaser.GameObjects.Container;
    private readonly symbolRoot: Phaser.GameObjects.Container;
    private readonly title: Phaser.GameObjects.Text;
    private readonly actionButton: GuideConfirmButton;
    private readonly marker: Phaser.GameObjects.Text;
    private pages: QuestPage[] = PAGES.fairy;
    private displayedStage: SilverpondQuestStage = 'fairy';
    private pageIndex = 0;
    private readyTimer?: Phaser.Time.TimerEvent;
    private openTimer?: Phaser.Time.TimerEvent;
    private destroyed = false;

    constructor(private readonly scene: Phaser.Scene, private readonly sceneBuilder: SceneBuilder, openPaths?: () => void,
        mayAutoOpen: () => boolean = () => true) {
        const overlay = this.host('silverpondQuestOverlayHost');
        this.root = scene.add.container(0, 0).setName('silverpondQuestDialog').setDepth(overlay.depth).setVisible(false);
        this.root.setData('dialog', this);
        const veil = blockGuidePointer(scene.add.rectangle(overlay.x, overlay.y, overlay.width, overlay.height, 0x041218, 0.76));
        const frame = waterArtwork(scene, 'zyx-dialog-frame-story', this.host('silverpondQuestDialogHost')).setName('zyxDialogFrame');
        const zyx = createZyxDialogPortrait(scene, this.host('silverpondQuestPortraitHost'));
        const speaker = this.label('silverpondQuestSpeakerHost', 'ZYX', 25);
        this.title = this.label('silverpondQuestTextHost', '', 30);
        this.symbolRoot = scene.add.container(0, 0).setDepth(this.host('silverpondQuestSymbolHost').depth);
        const button = this.host('silverpondQuestButtonHost');
        this.actionButton = new GuideConfirmButton(scene, {
            name: 'silverpondQuestAction', ...button, theme: 'water', enabled: false,
            onConfirm: () => this.advance(),
        });
        this.root.add([veil, frame, zyx, speaker, this.title, this.symbolRoot, this.actionButton.root]);
        this.root.sort('depth');

        const marker = this.host('silverpondQuestMarkerHost');
        this.marker = scene.add.text(marker.x, marker.y, '!', {
            resolution: 2, fontFamily: 'Arial, sans-serif', fontSize: '34px', fontStyle: 'bold',
            color: '#fff2a8', stroke: '#174b56', strokeThickness: 6,
        }).setName('silverpondQuestMarker').setOrigin(0.5).setDepth(marker.depth);
        const hit = this.host('silverpondQuestZyxHitHost');
        scene.add.zone(hit.x, hit.y, hit.width, hit.height).setName('silverpondQuestZyx')
            .setDepth(hit.depth).setInteractive({ useHandCursor: true }).on('pointerup', () => {
                if (openPaths && !this.marker.visible) openPaths();
                else this.show();
            });
        if (openPaths) {
            const replay = this.host('zyxQuestReplayHost');
            const button = scene.add.container(replay.x, replay.y).setDepth(replay.depth).setName('zyxQuestReplay')
                .setSize(replay.width, replay.height).setInteractive({ useHandCursor: true });
            button.add(waterArtwork(scene, 'silverpond-water-breathing-scale',
                { ...replay, x: 0, y: 0, width: replay.width * .78, height: replay.height * .78 }));
            button.on('pointerup', () => this.show());
        }
        scene.tweens.add({ targets: this.marker, y: marker.y - 7, alpha: 0.62,
            duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.refreshAttention();
        if (this.marker.visible) this.openTimer = scene.time.delayedCall(430, () => { if (mayAutoOpen()) this.show(); });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    show(): void {
        if (this.destroyed || this.root.visible) return;
        this.displayedStage = getSilverpondQuestStage(GameStateManager.getInstance().getPlayer());
        this.pages = PAGES[this.displayedStage];
        this.pageIndex = 0;
        this.actionButton.setEnabled(false);
        this.renderPage();
        this.root.setVisible(true).setAlpha(0);
        this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 220, ease: 'Sine.easeOut' });
    }

    private advance(): void {
        if (this.destroyed || !this.root.visible) return;
        gameAudio().cancel(this);
        this.readyTimer?.remove();
        this.actionButton.setEnabled(false);
        if (this.pageIndex >= this.pages.length - 1) {
            // Capture the stage shown when opened: later progress must retain its new alert.
            this.story.markSilverpondQuestSeen(this.displayedStage);
            this.refreshAttention();
            this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 180,
                onComplete: () => this.root.setVisible(false) });
            return;
        }
        this.pageIndex++;
        this.scene.tweens.add({ targets: [this.title, this.symbolRoot], alpha: 0, duration: 120,
            onComplete: () => {
                this.renderPage();
                this.scene.tweens.add({ targets: [this.title, this.symbolRoot], alpha: 1, duration: 180,
                });
            } });
    }

    private refreshAttention(): void {
        this.marker.setVisible(hasUnseenSilverpondQuest(GameStateManager.getInstance().getPlayer()));
    }

    private renderPage(): void {
        const page = this.pages[this.pageIndex];
        this.title.setText(page.title).setAlpha(1);
        this.actionButton.setEnabled(false);
        this.drawSymbol(page.symbol);
        void gameAudio().speak(page.voice, this);
        this.readyTimer?.remove();
        this.readyTimer = this.scene.time.delayedCall(1200, () => {
            if (!this.destroyed && this.root.visible) this.actionButton.setEnabled(true);
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.openTimer?.remove(); this.readyTimer?.remove();
        gameAudio().cancel(this);
        this.scene.tweens.killTweensOf([this.root, this.title, this.symbolRoot, this.marker]);
        this.symbolRoot.each((child: Phaser.GameObjects.GameObject) => this.scene.tweens.killTweensOf(child));
        this.actionButton.destroy();
        this.root.destroy(true); this.marker.destroy();
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    private drawSymbol(symbol: QuestSymbol): void {
        // Replacing a page also removes its demonstration tweens.
        this.symbolRoot.each((child: Phaser.GameObjects.GameObject) => this.scene.tweens.killTweensOf(child));
        this.symbolRoot.removeAll(true).setAlpha(1);
        const art = (texture: string, host: string) => {
            const image = waterArtwork(this.scene, texture, this.host(host)).setName(host + ':art');
            this.symbolRoot.add(image);
            return image;
        };
        if (symbol === 'lake-crystal') {
            art('underwater-glow-grotto-bg', 'silverpondQuestSymbolHost');
            const crystal = art('underwater-depth-crystal', 'silverpondQuestCenterHost');
            this.scene.tweens.add({ targets: crystal, y: crystal.y - 6, duration: 1000, yoyo: true, repeat: -1 });
        } else if (symbol === 'confused-fairy') {
            const fairy = art('silverpond-fairy-static', 'silverpondQuestCenterHost');
            const h = this.host('silverpondQuestSymbolHost');
            const aura = this.scene.add.graphics().setPosition(h.x, h.y).setDepth(h.depth);
            aura.lineStyle(5, 0xbd70db, 0.9).strokeEllipse(0, 0, h.height * 0.75, h.height * 0.9);
            // Five wave tokens connect the pictured fairy to the arena's five waves.
            for (let i = 0; i < 5; i++) aura.fillStyle(0x8ce5e9).fillCircle((i - 2) * 30, h.height * 0.45, 8);
            this.symbolRoot.add(aura);
            this.symbolRoot.bringToTop(fairy);
            this.scene.tweens.add({ targets: aura, alpha: 0.4, duration: 850, yoyo: true, repeat: -1 });
        } else if (symbol === 'saved-crystal') {
            art('underwater-depth-crystal', 'silverpondQuestLeftHost');
            art('enamel-check-active', 'silverpondQuestRightHost');
        } else {
            const scale = art('silverpond-water-breathing-scale', 'silverpondQuestLeftHost');
            art('enamel-continue-normal', 'silverpondQuestArrowHost');
            const heroTexture = GameStateManager.getInstance().getPlayer().characterType?.startsWith('boy_')
                ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait';
            art(heroTexture, 'silverpondQuestRightHost');
            for (const id of ['silverpondQuestBubble1Host', 'silverpondQuestBubble2Host', 'silverpondQuestBubble3Host']) {
                const b = this.host(id);
                const bubble = this.scene.add.ellipse(b.x, b.y, b.width, b.height, 0x8defff, 0.15).setStrokeStyle(2, 0xc3fbff).setDepth(b.depth);
                this.symbolRoot.add(bubble);
                this.scene.tweens.add({ targets: bubble, y: b.y - 20, alpha: 0.2, duration: 1300,
                    delay: (b.y % 3) * 180, yoyo: true, repeat: -1 });
            }
            this.scene.tweens.add({ targets: scale, y: scale.y - 7, duration: 900, yoyo: true, repeat: -1 });
        }
        this.symbolRoot.sort('depth');
    }

    private label(id: string, text: string, fontSize: number): Phaser.GameObjects.Text {
        const h = this.host(id);
        return this.scene.add.text(h.x, h.y, text, { resolution: 2, fontFamily: 'Georgia, serif',
            fontSize: `${fontSize}px`, fontStyle: 'bold', color: '#fff1bd', stroke: '#101827', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(h.depth).setName(id + ':text').setData('waterTextBox', h);
    }

    private host(id: string): HostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as HostLayout;
        return { x: object?.x ?? definition.x, y: object?.y ?? definition.y,
            width: definition.width, height: definition.height, depth: object?.depth ?? definition.depth };
    }
}

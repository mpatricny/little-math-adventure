import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { StorySystem } from '../systems/StorySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { MedievalActionButton } from './MedievalActionButton';

type HostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

type QuestSymbol = 'lake-crystal' | 'confused-fairy' | 'water-scale';

type QuestPage = {
    kicker: string;
    text: string;
    symbol: QuestSymbol;
    button: string;
};

const QUEST_PAGES: QuestPage[] = [
    {
        kicker: 'HLAS POD HLADINOU',
        text: 'Druhý velký krystal cítím\nna samém dně jezera.',
        symbol: 'lake-crystal',
        button: 'DÁLE',
    },
    {
        kicker: 'ZTRACENÁ STRÁŽKYNĚ',
        text: 'Cestu zná jezerní víla.\nNumera ji zmátla ve vodní aréně.',
        symbol: 'confused-fairy',
        button: 'DÁLE',
    },
    {
        kicker: 'DAR JEZERA',
        text: 'Osvoboď ji. Dá ti kouzelnou šupinu,\nse kterou můžeš dýchat pod vodou.',
        symbol: 'water-scale',
        button: 'ROZUMÍM',
    },
];

const COMPLETE_PAGE: QuestPage = {
    kicker: 'CESTA POD HLADINU JE OTEVŘENÁ',
    text: 'Víla je svobodná a její šupina září.\nDalší velký krystal čeká na dně jezera.',
    symbol: 'water-scale',
    button: 'ZAVŘÍT',
};

/** Symbolic, replayable Zyx quest dialog used only in the Silverpond guild. */
export class SilverpondQuestDialog {
    private readonly scene: Phaser.Scene;
    private readonly sceneBuilder: SceneBuilder;
    private readonly story = StorySystem.getInstance();
    private readonly root: Phaser.GameObjects.Container;
    private readonly symbolRoot: Phaser.GameObjects.Container;
    private readonly kicker: Phaser.GameObjects.Text;
    private readonly dialogueText: Phaser.GameObjects.Text;
    private readonly actionButton: MedievalActionButton;
    private readonly marker: Phaser.GameObjects.Text;
    private pages: QuestPage[] = QUEST_PAGES;
    private pageIndex = 0;

    constructor(scene: Phaser.Scene, sceneBuilder: SceneBuilder) {
        this.scene = scene;
        this.sceneBuilder = sceneBuilder;

        const overlayHost = this.getHost('silverpondQuestOverlayHost', {
            x: 640, y: 360, width: 1280, height: 720, depth: 1000,
        });
        const dialogHost = this.getHost('silverpondQuestDialogHost', {
            x: 640, y: 515, width: 1180, height: 315, depth: 1010,
        });
        const symbolHost = this.getHost('silverpondQuestSymbolHost', {
            x: 440, y: 535, width: 160, height: 137, depth: 1012,
        });
        const textHost = this.getHost('silverpondQuestTextHost', {
            x: 552, y: 472, width: 520, height: 140, depth: 1012,
        });
        const buttonHost = this.getHost('silverpondQuestButtonHost', {
            x: 1035, y: 655, width: 320, height: 74, depth: 1020,
        });

        this.root = this.scene.add.container(0, 0)
            .setDepth(overlayHost.depth)
            .setVisible(false);
        const veil = this.scene.add.rectangle(
            overlayHost.x,
            overlayHost.y,
            overlayHost.width,
            overlayHost.height,
            0x041218,
            0.76,
        ).setInteractive();
        const frame = this.scene.add.image(dialogHost.x, dialogHost.y, 'zyx-dialog-frame-story')
            .setDisplaySize(dialogHost.width, dialogHost.height);
        const portrait = this.scene.add.sprite(
            dialogHost.x - dialogHost.width * 0.358,
            dialogHost.y,
            'spritesheet-zyx-transparent2-sheet',
        ).setScale(0.35);
        if (this.scene.anims.exists('zyx-idle')) portrait.play('zyx-idle');

        const speaker = this.scene.add.text(
            dialogHost.x - dialogHost.width * 0.249,
            dialogHost.y - 80,
            'ZYX',
            {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: '27px',
                fontStyle: 'bold',
                color: '#9cecf0',
                stroke: '#1a1010',
                strokeThickness: 4,
                letterSpacing: 2,
            },
        ).setOrigin(0, 0.5);
        const iconFrame = this.scene.add.graphics();
        iconFrame.fillStyle(0x0d2932, 0.98);
        iconFrame.lineStyle(3, 0x5fc5d8, 0.92);
        iconFrame.fillRoundedRect(
            symbolHost.x - symbolHost.width / 2,
            symbolHost.y - symbolHost.height / 2,
            symbolHost.width,
            symbolHost.height,
            17,
        );
        iconFrame.strokeRoundedRect(
            symbolHost.x - symbolHost.width / 2,
            symbolHost.y - symbolHost.height / 2,
            symbolHost.width,
            symbolHost.height,
            17,
        );

        this.symbolRoot = this.scene.add.container(symbolHost.x, symbolHost.y);
        this.kicker = this.scene.add.text(textHost.x, textHost.y, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#77e8f7',
            letterSpacing: 1.2,
            stroke: '#081419',
            strokeThickness: 3,
        }).setOrigin(0, 0);
        this.dialogueText = this.scene.add.text(textHost.x, textHost.y + 28, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: '#f5edd8',
            stroke: '#160e0b',
            strokeThickness: 2,
            lineSpacing: 10,
            wordWrap: { width: textHost.width },
        }).setOrigin(0, 0);
        const path = this.scene.add.text(
            dialogHost.x + 356,
            dialogHost.y - 76,
            'KRYSTAL  ◇  VÍLA  ◇  ŠUPINA',
            {
                fontFamily: 'Arial, sans-serif',
                fontSize: '11px',
                fontStyle: 'bold',
                color: '#9ecbd0',
                letterSpacing: 1,
                stroke: '#102027',
                strokeThickness: 3,
            },
        ).setOrigin(0.5);

        this.actionButton = new MedievalActionButton(this.scene, {
            name: 'silverpondQuestAction',
            x: buttonHost.x,
            y: buttonHost.y,
            depth: buttonHost.depth,
            width: buttonHost.width,
            height: buttonHost.height,
            label: 'DÁLE',
            labelFontSize: 18,
            accent: 0x57ddf2,
            layout: 'text',
            frameTexture: 'zyx-dialog-action-frame-story',
            onClick: () => this.advance(),
        });
        this.actionButton.label.setColor('#fff1b5').setStroke('#1b1008', 4);
        this.root.add([
            veil,
            frame,
            portrait,
            speaker,
            iconFrame,
            this.symbolRoot,
            this.kicker,
            this.dialogueText,
            path,
            this.actionButton.root,
        ]);

        const markerHost = this.getHost('silverpondQuestMarkerHost', {
            x: 270, y: 353, width: 56, height: 56, depth: 90,
        });
        const zyxHitHost = this.getHost('silverpondQuestZyxHitHost', {
            x: 270, y: 462, width: 150, height: 250, depth: 91,
        });
        this.marker = this.scene.add.text(markerHost.x, markerHost.y, '!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#fff2a8',
            stroke: '#174b56',
            strokeThickness: 6,
        }).setOrigin(0.5).setDepth(markerHost.depth).setResolution(2);
        const zyxZone = this.scene.add.zone(
            zyxHitHost.x,
            zyxHitHost.y,
            zyxHitHost.width,
            zyxHitHost.height,
        ).setDepth(zyxHitHost.depth).setInteractive({ useHandCursor: true });
        zyxZone.on('pointerup', () => this.show());
        zyxZone.on('pointerover', () => this.marker.setScale(1.12));
        zyxZone.on('pointerout', () => this.marker.setScale(1));

        this.scene.tweens.add({
            targets: this.marker,
            y: markerHost.y - 7,
            alpha: 0.62,
            duration: 760,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const progress = this.story.getProgress();
        if (progress.hasSeenSilverpondQuest) {
            this.marker.setText(progress.hasWaterBreathingScale ? '✦' : '?').setAlpha(0.78);
        } else {
            this.scene.time.delayedCall(430, () => this.show());
        }
    }

    show(): void {
        if (this.root.visible) return;
        const progress = this.story.getProgress();
        this.pages = GameStateManager.getInstance().getPlayer().underwaterProgress?.depthCrystalClaimed
            ? [{ kicker: 'JEZERO JE ZASE KLIDNÉ', text: 'Strážce hlubin je svobodný.\nDruhý velký krystal máme!', symbol: 'lake-crystal', button: 'ZAVŘÍT' }]
            : progress.hasWaterBreathingScale ? [COMPLETE_PAGE] : QUEST_PAGES;
        this.pageIndex = 0;
        this.renderPage(false);
        this.root.setVisible(true).setAlpha(0);
        this.scene.tweens.add({
            targets: this.root,
            alpha: 1,
            duration: 220,
            ease: 'Sine.easeOut',
        });
    }

    private advance(): void {
        if (this.pageIndex >= this.pages.length - 1) {
            const progress = this.story.getProgress();
            if (!progress.hasSeenSilverpondQuest) {
                this.story.setFlag('hasSeenSilverpondQuest');
            }
            this.marker.setText(progress.hasWaterBreathingScale ? '✦' : '?').setAlpha(0.78);
            this.scene.tweens.add({
                targets: this.root,
                alpha: 0,
                duration: 180,
                onComplete: () => this.root.setVisible(false),
            });
            return;
        }

        this.pageIndex += 1;
        this.actionButton.setEnabled(false);
        this.scene.tweens.add({
            targets: [this.kicker, this.dialogueText, this.symbolRoot],
            alpha: 0,
            duration: 120,
            onComplete: () => {
                this.renderPage(true);
                this.scene.tweens.add({
                    targets: [this.kicker, this.dialogueText, this.symbolRoot],
                    alpha: 1,
                    duration: 180,
                    onComplete: () => this.actionButton.setEnabled(true),
                });
            },
        });
    }

    private renderPage(keepAlpha: boolean): void {
        const page = this.pages[this.pageIndex];
        this.kicker.setText(page.kicker);
        this.dialogueText.setText(page.text);
        this.actionButton.setLabel(page.button);
        this.drawSymbol(page.symbol);
        if (!keepAlpha) {
            this.kicker.setAlpha(1);
            this.dialogueText.setAlpha(1);
            this.symbolRoot.setAlpha(1);
        }
    }

    private drawSymbol(symbol: QuestSymbol): void {
        this.symbolRoot.removeAll(true);
        const graphics = this.scene.add.graphics();
        this.symbolRoot.add(graphics);

        if (symbol === 'lake-crystal') {
            graphics.fillStyle(0x0f5266, 0.92);
            graphics.fillRoundedRect(-62, -48, 124, 96, 24);
            graphics.lineStyle(3, 0x7befff, 0.9);
            [-30, -17, -4].forEach((y, index) => {
                graphics.beginPath();
                graphics.arc(0, y, 18 + index * 14, Math.PI * 0.12, Math.PI * 0.88);
                graphics.strokePath();
            });
            graphics.fillStyle(0xb7f6a4, 0.95);
            graphics.fillTriangle(0, 13, -22, 36, 0, 50);
            graphics.fillTriangle(0, 13, 22, 36, 0, 50);
            graphics.lineStyle(2, 0xffffff, 0.8);
            graphics.strokeTriangle(0, 13, -22, 36, 0, 50);
            graphics.strokeTriangle(0, 13, 22, 36, 0, 50);
        } else if (symbol === 'confused-fairy') {
            graphics.lineStyle(5, 0x3aa5b8, 0.95);
            graphics.strokeCircle(0, 0, 54);
            graphics.lineStyle(2, 0x8eeeff, 0.55);
            [-34, 34].forEach((x) => graphics.strokeRoundedRect(x - 8, -45, 16, 90, 8));
            graphics.fillStyle(0xdffcff, 0.94);
            graphics.fillCircle(0, -22, 9);
            graphics.fillTriangle(-5, -12, -14, 28, 3, 28);
            graphics.fillStyle(0x73d9e8, 0.72);
            graphics.fillTriangle(-7, -9, -43, -27, -18, 14);
            graphics.fillTriangle(7, -9, 43, -27, 18, 14);
            graphics.lineStyle(3, 0xffe993, 0.9);
            graphics.beginPath();
            graphics.arc(0, 8, 28, -1.2, 2.2);
            graphics.strokePath();
            graphics.fillStyle(0xffe993, 0.95);
            graphics.fillCircle(-24, 25, 4);
        } else {
            graphics.fillStyle(0x63dbea, 0.16);
            graphics.fillCircle(0, 0, 58);
            graphics.fillStyle(0x58ccda, 0.9);
            graphics.fillEllipse(0, 5, 60, 90);
            graphics.fillTriangle(0, -52, -23, -18, 23, -18);
            graphics.lineStyle(3, 0xcafcff, 0.95);
            graphics.strokeEllipse(0, 5, 60, 90);
            graphics.beginPath();
            graphics.moveTo(-23, -18);
            graphics.lineTo(0, -52);
            graphics.lineTo(23, -18);
            graphics.strokePath();
            graphics.lineStyle(2, 0xeaffff, 0.75);
            [-18, 0, 18].forEach((y) => {
                graphics.beginPath();
                graphics.arc(0, y, 23, 0.25, Math.PI - 0.25);
                graphics.strokePath();
            });
            graphics.fillStyle(0xcafcff, 0.9);
            graphics.fillCircle(43, -28, 5);
            graphics.fillCircle(53, -45, 3);
            graphics.fillCircle(48, 26, 4);
        }
    }

    private getHost(id: string, fallback: HostLayout): HostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<HostLayout> | undefined;
        return {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
    }
}

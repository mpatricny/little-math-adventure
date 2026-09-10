import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { StorySystem } from '../systems/StorySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { MedievalActionButton } from '../ui/MedievalActionButton';

type RewardData = {
    returnScene?: string;
    returnData?: Record<string, unknown>;
    testMode?: boolean;
};

type HostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

/**
 * One-off Silverpond story reward. All visible surfaces use generated production
 * assets; SceneBuilder hosts remain the authoritative layout source.
 */
export class SilverpondFairyRewardScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private returnScene = 'SilverpondTownMockScene';
    private returnData: Record<string, unknown> = {};
    private testMode = false;
    private pageIndex = 0;
    private transitioning = false;

    private fairy!: Phaser.GameObjects.Sprite;
    private player!: Phaser.GameObjects.Sprite;
    private titleFrame!: Phaser.GameObjects.Image;
    private title!: Phaser.GameObjects.Text;
    private dialogueFrame!: Phaser.GameObjects.Image;
    private dialogueKicker!: Phaser.GameObjects.Text;
    private dialogue!: Phaser.GameObjects.Text;
    private rewardFrame!: Phaser.GameObjects.Image;
    private rewardScale!: Phaser.GameObjects.Image;
    private rewardKicker!: Phaser.GameObjects.Text;
    private rewardTitle!: Phaser.GameObjects.Text;
    private rewardDescription!: Phaser.GameObjects.Text;
    private actionButton!: MedievalActionButton;

    constructor() {
        super({ key: 'SilverpondFairyRewardScene' });
    }

    init(data: RewardData = {}): void {
        this.returnScene = data.returnScene ?? 'SilverpondTownMockScene';
        this.returnData = data.returnData ?? {};
        this.testMode = data.testMode === true;
        this.pageIndex = 0;
        this.transitioning = false;
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('SilverpondFairyRewardScene');
        this.cameras.main.fadeIn(480, 7, 24, 40);

        // Grant on successful arena completion, not on a later click. Re-entry
        // is therefore safe even if the cinematic was interrupted.
        if (!this.testMode) StorySystem.getInstance().completeLakeFairyQuest();

        this.createCharacters();
        this.createStoryUi();
        this.playArrival();
    }

    private createCharacters(): void {
        const fairyHost = this.getHost('fairyRewardPortraitHost', {
            x: 770, y: 335, width: 512, height: 512, depth: 24,
        });
        const builtFairy = this.sceneBuilder.get<Phaser.GameObjects.Sprite>('fairyRewardFairy');
        this.fairy = builtFairy ?? this.add.sprite(
            fairyHost.x,
            fairyHost.y,
            'silverpond-lake-fairy-idle-sheet',
            0,
        ).setDepth(fairyHost.depth);
        this.fairy.setPosition(fairyHost.x, fairyHost.y).setDepth(fairyHost.depth);
        this.fairy.setAlpha(0).setScale(0.86).setY(fairyHost.y + 70);
        if (this.anims.exists('silverpond-lake-fairy-idle')) {
            this.fairy.play('silverpond-lake-fairy-idle');
        }

        const playerHost = this.getHost('fairyRewardPlayerHost', {
            x: 270, y: 655, width: 200, height: 220, depth: 24,
        });
        const playerConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType,
        );
        this.player = this.add.sprite(
            playerHost.x,
            playerHost.y,
            playerConfig.idleTexture,
        ).setOrigin(0.5, 1).setDepth(playerHost.depth).setAlpha(0);
        if (this.anims.exists(playerConfig.idleAnim)) this.player.play(playerConfig.idleAnim);
    }

    private createStoryUi(): void {
        const titleHost = this.getHost('fairyRewardTitleHost', {
            x: 640, y: 82, width: 790, height: 138, depth: 100,
        });
        this.titleFrame = this.add.image(
            titleHost.x,
            titleHost.y,
            'silverpond-fairy-title-frame',
        ).setDisplaySize(titleHost.width, titleHost.height)
            .setDepth(titleHost.depth)
            .setAlpha(0);
        this.title = this.add.text(titleHost.x, titleHost.y, 'VÍLA JE SVOBODNÁ', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#fff1bd',
            stroke: '#101827',
            strokeThickness: 5,
            letterSpacing: 1.2,
        }).setOrigin(0.5).setDepth(titleHost.depth + 1).setAlpha(0);

        const dialogueHost = this.getHost('fairyRewardDialogHost', {
            x: 640, y: 590, width: 1030, height: 178, depth: 100,
        });
        this.dialogueFrame = this.add.image(
            dialogueHost.x,
            dialogueHost.y,
            'silverpond-fairy-title-frame',
        ).setDisplaySize(dialogueHost.width, dialogueHost.height)
            .setDepth(dialogueHost.depth)
            .setAlpha(0);
        this.dialogueKicker = this.add.text(
            dialogueHost.x - dialogueHost.width * 0.39,
            dialogueHost.y - 38,
            'JEZERNÍ VÍLA',
            {
                fontFamily: 'Arial, sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#7cebf7',
                stroke: '#091722',
                strokeThickness: 3,
                letterSpacing: 1.4,
            },
        ).setOrigin(0, 0.5).setDepth(dialogueHost.depth + 1).setAlpha(0);
        this.dialogue = this.add.text(
            dialogueHost.x - dialogueHost.width * 0.39,
            dialogueHost.y - 10,
            'Děkuji. Jezero si znovu vzpomnělo na svůj hlas.\nPřijmi jednu šupinu z mé koruny.',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '22px',
                color: '#f7f0dd',
                stroke: '#0b1420',
                strokeThickness: 3,
                lineSpacing: 7,
                wordWrap: { width: dialogueHost.width * 0.63 },
            },
        ).setOrigin(0, 0).setDepth(dialogueHost.depth + 1).setAlpha(0);

        const rewardHost = this.getHost('fairyRewardOverlayHost', {
            x: 640, y: 425, width: 1040, height: 500, depth: 100,
        });
        this.rewardFrame = this.add.image(
            rewardHost.x,
            rewardHost.y,
            'silverpond-fairy-reward-frame',
        ).setDisplaySize(rewardHost.width, rewardHost.height)
            .setDepth(rewardHost.depth)
            .setAlpha(0)
            .setVisible(false);

        const symbolHost = this.getHost('fairyRewardSymbolHost', {
            x: 395, y: 445, width: 230, height: 230, depth: 103,
        });
        this.rewardScale = this.add.image(
            symbolHost.x,
            symbolHost.y,
            'silverpond-water-breathing-scale',
        ).setDisplaySize(symbolHost.width, symbolHost.height)
            .setDepth(symbolHost.depth)
            .setVisible(false)
            .setAlpha(0);

        const textHost = this.getHost('fairyRewardTextHost', {
            x: 545, y: 335, width: 500, height: 210, depth: 103,
        });
        this.rewardKicker = this.add.text(textHost.x, textHost.y, 'TRVALÁ SCHOPNOST', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#79e9f7',
            stroke: '#091722',
            strokeThickness: 3,
            letterSpacing: 1.5,
        }).setOrigin(0, 0).setDepth(textHost.depth).setVisible(false).setAlpha(0);
        this.rewardTitle = this.add.text(textHost.x, textHost.y + 31, 'KOUZELNÁ ŠUPINA', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '36px',
            fontStyle: 'bold',
            color: '#fff0b5',
            stroke: '#111526',
            strokeThickness: 5,
        }).setOrigin(0, 0).setDepth(textHost.depth).setVisible(false).setAlpha(0);
        this.rewardDescription = this.add.text(
            textHost.x,
            textHost.y + 84,
            'Pod hladinou ti půjčí dech jezera.\nNyní můžeš vstoupit do zatopených ruin.',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '22px',
                color: '#eefcff',
                stroke: '#0b1420',
                strokeThickness: 3,
                lineSpacing: 9,
                wordWrap: { width: textHost.width },
            },
        ).setOrigin(0, 0).setDepth(textHost.depth).setVisible(false).setAlpha(0);

        const buttonHost = this.getHost('fairyRewardButtonHost', {
            x: 900, y: 620, width: 405, height: 92, depth: 110,
        });
        this.actionButton = new MedievalActionButton(this, {
            name: 'fairyRewardAction',
            x: buttonHost.x,
            y: buttonHost.y,
            depth: buttonHost.depth,
            width: buttonHost.width,
            height: buttonHost.height,
            label: 'DÁLE',
            labelFontSize: 20,
            labelOffsetX: -44,
            labelMaxWidth: 250,
            accent: 0x54e4f6,
            layout: 'text',
            frameTexture: 'silverpond-fairy-action-normal',
            enabled: false,
            onClick: () => this.advance(),
        });
        this.actionButton.label.setColor('#fff1bd').setStroke('#101827', 4);
        this.actionButton.root.setAlpha(0);
    }

    private playArrival(): void {
        const fairyHost = this.getHost('fairyRewardPortraitHost', {
            x: 770, y: 335, width: 512, height: 512, depth: 24,
        });
        this.tweens.add({
            targets: this.player,
            alpha: 1,
            duration: 420,
            delay: 200,
        });
        this.tweens.add({
            targets: this.fairy,
            alpha: 1,
            y: fairyHost.y,
            scale: 1,
            duration: 1050,
            delay: 250,
            ease: 'Cubic.easeOut',
        });
        this.tweens.add({
            targets: [this.titleFrame, this.title],
            alpha: 1,
            duration: 430,
            delay: 950,
            ease: 'Sine.easeOut',
        });
        this.tweens.add({
            targets: [this.dialogueFrame, this.dialogueKicker, this.dialogue],
            alpha: 1,
            duration: 430,
            delay: 1250,
            ease: 'Sine.easeOut',
        });
        this.tweens.add({
            targets: this.actionButton.root,
            alpha: 1,
            duration: 300,
            delay: 1650,
            onComplete: () => this.actionButton.setEnabled(true),
        });
    }

    private advance(): void {
        if (this.transitioning) return;
        if (this.pageIndex === 0) {
            this.showGift();
            return;
        }
        this.claimGift();
    }

    private showGift(): void {
        this.transitioning = true;
        this.actionButton.setEnabled(false);
        this.pageIndex = 1;

        this.tweens.add({
            targets: [this.dialogueFrame, this.dialogueKicker, this.dialogue, this.actionButton.root],
            alpha: 0,
            duration: 260,
            onComplete: () => {
                if (this.anims.exists('silverpond-lake-fairy-give')) {
                    this.fairy.play('silverpond-lake-fairy-give');
                }
                this.time.delayedCall(560, () => this.revealRewardCard());
            },
        });
    }

    private revealRewardCard(): void {
        const fairyHand = { x: this.fairy.x - 72, y: this.fairy.y - 92 };
        const symbolHost = this.getHost('fairyRewardSymbolHost', {
            x: 395, y: 445, width: 230, height: 230, depth: 103,
        });
        this.rewardFrame.setVisible(true).setAlpha(0);
        [this.rewardKicker, this.rewardTitle, this.rewardDescription].forEach((item) => {
            item.setVisible(true).setAlpha(0);
        });
        this.rewardScale
            .setVisible(true)
            .setAlpha(1)
            .setPosition(fairyHand.x, fairyHand.y)
            .setDisplaySize(62, 62);

        this.tweens.add({
            targets: [this.fairy, this.player],
            alpha: 0.2,
            duration: 330,
        });
        this.tweens.add({
            targets: [this.titleFrame, this.title],
            alpha: 0,
            duration: 260,
        });
        this.tweens.add({
            targets: this.rewardFrame,
            alpha: 1,
            duration: 420,
            ease: 'Sine.easeOut',
        });
        this.tweens.add({
            targets: this.rewardScale,
            x: symbolHost.x,
            y: symbolHost.y,
            displayWidth: symbolHost.width,
            displayHeight: symbolHost.height,
            duration: 760,
            ease: 'Cubic.easeInOut',
        });
        this.tweens.add({
            targets: [this.rewardKicker, this.rewardTitle, this.rewardDescription],
            alpha: 1,
            duration: 350,
            delay: 380,
        });
        this.time.delayedCall(850, () => {
            this.actionButton.setLabel('PŘIJMOUT ŠUPINU', 18);
            this.actionButton.root.setAlpha(0);
            this.tweens.add({
                targets: this.actionButton.root,
                alpha: 1,
                duration: 260,
                onComplete: () => {
                    this.transitioning = false;
                    this.actionButton.setEnabled(true);
                },
            });
        });
    }

    private claimGift(): void {
        this.transitioning = true;
        this.actionButton.setEnabled(false);
        if (!this.testMode) StorySystem.getInstance().markLakeFairyRewardSeen();

        const questHost = this.getHost('fairyRewardQuestHost', {
            x: 1090, y: 76, width: 340, height: 72, depth: 84,
        });
        const unlockFrame = this.add.image(
            questHost.x,
            questHost.y,
            'silverpond-fairy-title-frame',
        ).setDisplaySize(questHost.width, questHost.height)
            .setDepth(questHost.depth - 1)
            .setAlpha(0);
        const unlockText = this.add.text(
            questHost.x - 95,
            questHost.y,
            'DÝCHÁNÍ POD VODOU\nODEMČENO',
            {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: '16px',
                fontStyle: 'bold',
                color: '#dffcff',
                stroke: '#081621',
                strokeThickness: 4,
                align: 'left',
                lineSpacing: 3,
            },
        ).setOrigin(0, 0.5).setDepth(questHost.depth).setAlpha(0);

        this.tweens.add({
            targets: [
                this.rewardFrame,
                this.rewardKicker,
                this.rewardTitle,
                this.rewardDescription,
                this.actionButton.root,
            ],
            alpha: 0,
            duration: 300,
        });
        this.tweens.add({
            targets: this.rewardScale,
            x: questHost.x - 135,
            y: questHost.y,
            displayWidth: 62,
            displayHeight: 62,
            duration: 780,
            ease: 'Cubic.easeInOut',
            onComplete: () => {
                this.tweens.add({
                    targets: [unlockFrame, unlockText],
                    alpha: 1,
                    duration: 320,
                });
                this.tweens.add({
                    targets: [this.fairy, this.player],
                    alpha: 1,
                    duration: 320,
                });
                if (this.anims.exists('silverpond-lake-fairy-idle')) {
                    this.fairy.play('silverpond-lake-fairy-idle');
                }
                this.time.delayedCall(1250, () => this.leaveScene());
            },
        });
    }

    private leaveScene(): void {
        this.cameras.main.fadeOut(420, 7, 24, 40);
        this.time.delayedCall(430, () => {
            this.scene.start(this.returnScene, this.returnData);
        });
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

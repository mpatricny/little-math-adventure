import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { StorySystem } from '../systems/StorySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { waterArtwork, type WaterBox } from '../ui/UnderwaterTheme';
import { gameAudio, voice } from '../audio/AudioDirector';

type RewardData = {
    returnScene?: string;
    returnData?: Record<string, unknown>;
    testMode?: boolean;
};
type HostLayout = WaterBox & { depth: number };

/** A picture-led gift sequence. The editor owns every static region and its safe inset. */
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
    private dialogue!: Phaser.GameObjects.Text;
    private rewardFrame!: Phaser.GameObjects.Image;
    private rewardScale!: Phaser.GameObjects.Image;
    private rewardTitle!: Phaser.GameObjects.Text;
    private demonstration!: Phaser.GameObjects.Container;
    private swimmingPlayer!: Phaser.GameObjects.Sprite;
    private giftMotion!: Phaser.GameObjects.Image;
    private completionCheck!: Phaser.GameObjects.Image;
    private actionButton!: MedievalActionButton;

    constructor() { super({ key: 'SilverpondFairyRewardScene' }); }

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
        // The capability is awarded immediately, including an interrupted/replayed cinematic.
        if (!this.testMode) StorySystem.getInstance().completeLakeFairyQuest();
        this.createCharacters();
        this.createStoryUi();
        this.playArrival();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameAudio().cancel(this));
    }

    private createCharacters(): void {
        const h = this.host('fairyRewardPortraitHost');
        this.fairy = this.sceneBuilder.get<Phaser.GameObjects.Sprite>('fairyRewardFairy')!;
        this.fairy.setPosition(h.x, h.y).setDepth(h.depth);
        this.contain(this.fairy, h);
        this.fairy.setAlpha(0).setY(h.y + 24);
        if (this.anims.exists('silverpond-lake-fairy-idle')) this.fairy.play('silverpond-lake-fairy-idle');
        this.player = this.createPlayer('fairyRewardPlayerHost').setAlpha(0);
    }

    private createPlayer(hostId: string): Phaser.GameObjects.Sprite {
        const h = this.host(hostId);
        const config = getPlayerSpriteConfig(GameStateManager.getInstance().getPlayer().characterType);
        const sprite = this.add.sprite(h.x, h.y, config.idleTexture).setOrigin(0.5, 1).setDepth(h.depth);
        this.contain(sprite, h);
        if (this.anims.exists(config.idleAnim)) sprite.play(config.idleAnim);
        return sprite;
    }

    private createStoryUi(): void {
        this.titleFrame = this.art('silverpond-fairy-title-frame', 'fairyRewardTitleHost').setAlpha(0);
        this.title = this.text('fairyRewardTitleSafeHost', 'VÍLA JE VOLNÁ', 32).setAlpha(0);
        this.dialogueFrame = this.art('silverpond-fairy-title-frame', 'fairyRewardDialogHost').setAlpha(0);
        this.dialogue = this.text('fairyRewardDialogSafeHost', 'Děkuji!', 32).setAlpha(0);
        this.rewardFrame = this.art('silverpond-fairy-reward-frame', 'fairyRewardOverlayHost').setVisible(false);
        this.rewardTitle = this.text('fairyRewardTextHost', 'KOUZELNÁ ŠUPINA', 32).setVisible(false);
        this.rewardScale = this.art('silverpond-water-breathing-scale', 'fairyRewardSymbolHost').setVisible(false);
        this.createDemonstration();

        const h = this.host('fairyRewardButtonHost');
        const frame = this.textures.get('silverpond-fairy-action-normal').get();
        const scale = Math.min(h.width / frame.width, h.height / frame.height);
        this.actionButton = new MedievalActionButton(this, {
            name: 'fairyRewardAction', x: h.x, y: h.y, depth: h.depth,
            width: frame.width * scale, height: frame.height * scale,
            label: 'DÁLE  →', labelFontSize: 25, labelOffsetX: -35,
            labelMaxWidth: 180, labelMaxHeight: 44, accent: 0x54e4f6,
            layout: 'text', frameTexture: 'silverpond-fairy-action-normal',
            enabled: false, onClick: () => this.advance(),
        });
        this.actionButton.label.setColor('#fff1bd').setStroke('#101827', 2);
        // The safe inset follows the moving surface, while the hit area stays fixed.
        this.actionButton.label.setData('waterTextBox', { x: -35, y: 1, width: 180, height: 44 });
        this.actionButton.root.setAlpha(0);
    }

    private createDemonstration(): void {
        const h = this.host('fairyRewardDemoHost');
        // Each illustration has an independent absolute editor host. The grouping
        // container only controls visibility; it must not translate those hosts.
        this.demonstration = this.add.container(0, 0).setDepth(h.depth).setVisible(false);
        const water = this.art('underwater-glow-grotto-bg', 'fairyRewardWaterHost');
        this.swimmingPlayer = this.createPlayer('fairyRewardSwimmerHost');
        const arrow = this.art('enamel-continue-normal', 'fairyRewardArrowHost');
        const label = this.text('fairyRewardWaterLabelHost', 'Pod vodu', 26);
        this.giftMotion = this.art('silverpond-water-breathing-scale', 'fairyRewardGiftMotionHost').setAlpha(0);
        this.completionCheck = this.art('enamel-check-active', 'fairyRewardQuestHost').setAlpha(0);
        this.demonstration.add([water, this.swimmingPlayer, arrow, label, this.giftMotion, this.completionCheck]);
        // These small bubbles demonstrate breathing without any words or audio.
        for (const id of ['fairyRewardBubble1Host', 'fairyRewardBubble2Host', 'fairyRewardBubble3Host']) {
            const b = this.host(id);
            const bubble = this.add.ellipse(b.x, b.y, b.width, b.height, 0x8defff, 0.15)
                .setStrokeStyle(2, 0xc3fbff, 0.9).setName(id).setDepth(b.depth);
            this.demonstration.add(bubble);
            this.tweens.add({ targets: bubble, y: b.y - 18, alpha: 0.25,
                duration: 1600, delay: (b.y % 3) * 230, yoyo: true, repeat: -1 });
        }
        this.demonstration.sort('depth');
    }

    private playArrival(): void {
        const h = this.host('fairyRewardPortraitHost');
        this.tweens.add({ targets: this.player, alpha: 1, duration: 420, delay: 200 });
        this.tweens.add({ targets: this.fairy, alpha: 1, y: h.y,
            duration: 850, delay: 250, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: [this.titleFrame, this.title], alpha: 1, duration: 430, delay: 650 });
        this.tweens.add({ targets: [this.dialogueFrame, this.dialogue], alpha: 1, duration: 430, delay: 1000 });
        this.time.delayedCall(1000, () => voice(this, 'vo.fairy.thanks'));
        this.tweens.add({ targets: this.actionButton.root, alpha: 1, duration: 300, delay: 1300,
            onComplete: () => this.actionButton.setEnabled(true) });
    }

    private advance(): void {
        if (this.transitioning) return;
        if (this.pageIndex === 0) this.showGift();
        else if (this.pageIndex === 1) this.claimGift();
        else this.leaveScene();
    }

    private showGift(): void {
        this.transitioning = true;
        gameAudio().cancel(this);
        this.actionButton.setEnabled(false);
        this.pageIndex = 1;
        this.tweens.add({ targets: [this.dialogueFrame, this.dialogue, this.actionButton.root],
            alpha: 0, duration: 240, onComplete: () => {
                if (this.anims.exists('silverpond-lake-fairy-give')) this.fairy.play('silverpond-lake-fairy-give');
                this.time.delayedCall(560, () => this.revealRewardCard());
            } });
    }

    private revealRewardCard(): void {
        voice(this, 'vo.fairy.scale');
        const symbol = this.host('fairyRewardSymbolHost');
        const targetScale = Math.min(symbol.width / this.rewardScale.width, symbol.height / this.rewardScale.height);
        this.rewardScale.setVisible(true).setAlpha(1)
            .setPosition(this.fairy.x - 45, this.fairy.y - 50).setScale(0.11);
        this.rewardFrame.setVisible(true).setAlpha(0);
        this.rewardTitle.setVisible(true).setAlpha(0);
        this.demonstration.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: [this.fairy, this.player, this.titleFrame, this.title], alpha: 0, duration: 280 });
        this.tweens.add({ targets: [this.rewardFrame, this.rewardTitle], alpha: 1, duration: 420 });
        this.tweens.add({ targets: this.rewardScale, x: symbol.x, y: symbol.y,
            scale: targetScale, duration: 760, ease: 'Cubic.easeInOut' });
        this.tweens.add({ targets: this.demonstration, alpha: 1, duration: 350, delay: 500 });
        this.time.delayedCall(850, () => {
            this.demonstrateBreathing();
            const button = this.host('fairyRewardClaimButtonHost');
            this.actionButton.root.setPosition(button.x, button.y).setDepth(button.depth);
            this.actionButton.setLabel('PŘIJMOUT  ✓', 23);
            this.revealAction();
        });
    }

    private demonstrateBreathing(): void {
        const from = this.host('fairyRewardGiftMotionHost');
        const to = this.host('fairyRewardGiftTargetHost');
        const startScale = Math.min(from.width / this.giftMotion.width, from.height / this.giftMotion.height);
        this.giftMotion.setPosition(from.x, from.y).setScale(startScale).setAlpha(0);
        this.tweens.add({ targets: this.giftMotion, x: to.x, y: to.y, alpha: 0.95,
            duration: 1700, hold: 350, repeatDelay: 900, repeat: -1,
            ease: 'Sine.easeInOut', onRepeat: () => this.giftMotion.setPosition(from.x, from.y).setAlpha(0) });
    }

    private claimGift(): void {
        this.transitioning = true;
        gameAudio().cancel(this);
        this.actionButton.setEnabled(false);
        this.pageIndex = 2;
        if (!this.testMode) StorySystem.getInstance().markLakeFairyRewardSeen();
        this.tweens.killTweensOf(this.giftMotion);
        const from = this.host('fairyRewardGiftMotionHost');
        this.giftMotion.setVisible(true).setPosition(from.x, from.y).setAlpha(1);
        const to = this.host('fairyRewardGiftTargetHost');
        this.tweens.add({ targets: this.giftMotion, x: to.x, y: to.y,
            duration: 780, ease: 'Cubic.easeInOut', onComplete: () => {
                this.rewardTitle.setText('MŮŽEŠ POD VODU');
                voice(this, 'vo.fairy.dive');
                this.tweens.add({ targets: this.completionCheck, alpha: 1, duration: 300 });
                this.actionButton.setLabel('DÁLE  →', 25);
                this.revealAction();
            } });
    }

    private revealAction(): void {
        this.actionButton.root.setAlpha(0);
        this.tweens.add({ targets: this.actionButton.root, alpha: 1, duration: 260,
            onComplete: () => { this.transitioning = false; this.actionButton.setEnabled(true); } });
    }

    private leaveScene(): void {
        this.transitioning = true;
        gameAudio().cancel(this);
        this.actionButton.setEnabled(false);
        this.cameras.main.fadeOut(420, 7, 24, 40);
        this.time.delayedCall(430, () => this.scene.start(this.returnScene, this.returnData));
    }

    private contain(object: Phaser.GameObjects.Sprite, box: HostLayout): void {
        object.setScale(Math.min(box.width / object.width, box.height / object.height));
    }

    private art(texture: string, hostId: string): Phaser.GameObjects.Image {
        return waterArtwork(this, texture, this.host(hostId)).setName(hostId + ':art');
    }

    private text(hostId: string, label: string, fontSize: number): Phaser.GameObjects.Text {
        const h = this.host(hostId);
        return this.add.text(h.x, h.y, label, {
            resolution: 2, fontFamily: 'Georgia, serif', fontSize: `${fontSize}px`, fontStyle: 'bold',
            color: '#fff1bd', stroke: '#101827', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(h.depth).setName(hostId + ':text').setData('waterTextBox', h);
    }

    private host(id: string): HostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as HostLayout;
        return { x: object?.x ?? definition.x, y: object?.y ?? definition.y,
            width: definition.width, height: definition.height, depth: object?.depth ?? definition.depth };
    }
}

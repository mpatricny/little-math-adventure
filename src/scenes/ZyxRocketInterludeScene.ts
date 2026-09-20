import { sfx, voice, gameAudio } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { SILVERPOND_ENABLED } from '../config/buildVariant';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { StorySystem } from '../systems/StorySystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { ForestDirectionPrompt } from '../ui/ForestDirectionPrompt';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { getUnderwaterProgress } from '../systems/UnderwaterProgressSystem';
import { hasNextCityAccess } from '../systems/DepthCrystalProgressSystem';
import { UnderwaterUI, waterHost } from '../ui/UnderwaterUI';
import { fitWaterText, UnderwaterButton, waterArtwork } from '../ui/UnderwaterTheme';

type ZyxRocketInterludeData = {
    testMode?: boolean;
    machineCompleted?: boolean;
    crystal?: 'forest' | 'depth';
};

type SceneHost = {
    x: number;
    y: number;
    depth: number;
};

const DIALOGUE_PAGES = [
    {
        text: 'Můj krystal!\nSpadl z lodi.',
        iconTexture: 'story-icon-crystal-fell',
        iconSize: 150,
        button: 'DÁLE',
    },
    {
        text: 'Loď potřebuje 3 krystaly.\nMáme první!',
        iconTexture: 'story-icon-machine',
        iconSize: 150,
        button: 'DÁLE',
    },
    {
        text: 'Pojď ke stroji.\nVložíme krystal.',
        iconTexture: 'forest-crystal-story',
        iconSize: 126,
        button: 'JDEME',
    },
];

export class ZyxRocketInterludeScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private testMode = false;
    private machineCompleted = false;
    private depthCrystal = false;
    private dialoguePage = 0;
    private dialoguePanel!: Phaser.GameObjects.Container;
    private dialogueText!: Phaser.GameObjects.Text;
    private dialogueIcon!: Phaser.GameObjects.Image;
    private actionButton!: MedievalActionButton;

    constructor() {
        super({ key: 'ZyxRocketInterludeScene' });
    }

    init(data: ZyxRocketInterludeData = {}): void {
        CoopSessionManager.getInstance().activatePlayerA();
        this.testMode = data.testMode === true;
        this.depthCrystal = data.crystal === 'depth' || (!data.crystal
            && GameStateManager.getInstance().getPlayer().underwaterProgress?.depthCrystalClaimed === true);
        this.machineCompleted = this.depthCrystal
            ? hasNextCityAccess(GameStateManager.getInstance().getPlayer()) : data.machineCompleted === true;
        this.dialoguePage = 0;
    }

    preload(): void {
        if (SILVERPOND_ENABLED && this.depthCrystal && !this.textures.exists('underwater-depth-crystal')) {
            this.load.image('underwater-depth-crystal', `assets/${this.cache.json.get('textures').images['underwater-depth-crystal']}`);
        }
    }

    create(): void {
        if (!SILVERPOND_ENABLED && this.depthCrystal) {
            this.scene.start('TownScene');
            return;
        }

        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('ZyxRocketInterludeScene');
        this.cameras.main.fadeIn(450, 8, 19, 14);

        const playerEntry = this.getHost('rocketPlayerEntryHost', { x: 1215, y: 620, depth: 20 });
        const playerTalk = this.getHost('rocketPlayerTalkHost', { x: 845, y: 620, depth: 20 });
        const playerConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        const playerStart = this.machineCompleted ? playerTalk : playerEntry;
        const player = this.add.sprite(playerStart.x, playerStart.y, playerConfig.idleTexture)
            .setOrigin(0.5, 1)
            .setScale(1)
            .setDepth(playerEntry.depth)
            .setFlipX(true);
        if (this.anims.exists(this.machineCompleted ? playerConfig.idleAnim : playerConfig.walkAnim)) {
            player.play(this.machineCompleted ? playerConfig.idleAnim : playerConfig.walkAnim);
        }

        const zyxHost = this.getHost('rocketZyxHost', { x: 640, y: 595, depth: 18 });
        const zyx = this.add.sprite(
            zyxHost.x,
            zyxHost.y,
            'spritesheet-zyx-transparent2-sheet'
        ).setOrigin(0.5, 1).setScale(0.38).setDepth(zyxHost.depth);
        if (this.anims.exists('zyx-idle')) zyx.play('zyx-idle');
        this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));

        if (this.depthCrystal) {
            if (!this.textures.exists('underwater-depth-crystal')) {
                new UnderwaterUI(this).dialog('Krystal se nenačetl', 'Zkontroluj připojení. Postup je uložený.',
                    'ZKUSIT ZNOVU', () => this.scene.restart({ crystal: 'depth' }));
                return;
            }
            this.createDepthCrystalReturn(player, playerConfig);
            return;
        }

        if (this.machineCompleted) {
            this.createSilverpondExit(player, playerConfig.walkAnim);
            return;
        }

        this.createDialogue();
        this.dialoguePanel.setAlpha(0).setY(this.dialoguePanel.y + 28);
        this.actionButton.root.setAlpha(0).setVisible(false);

        this.tweens.add({
            targets: player,
            x: playerTalk.x,
            duration: 1300,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (this.anims.exists(playerConfig.idleAnim)) player.play(playerConfig.idleAnim);
                this.tweens.add({
                    targets: this.dialoguePanel,
                    y: this.dialoguePanel.y - 28,
                    alpha: 1,
                    duration: 420,
                    ease: 'Back.easeOut',
                });
                this.actionButton.root.setVisible(true);
                voice(this, 'vo.rocket.1');
                this.tweens.add({
                    targets: this.actionButton.root,
                    alpha: 1,
                    duration: 380,
                    delay: 140,
                });
            },
        });
    }

    private getHost(id: string, fallback: SceneHost): SceneHost {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        return {
            x: host?.x ?? fallback.x,
            y: host?.y ?? fallback.y,
            depth: host?.depth ?? fallback.depth,
        };
    }

    /** The second visit is a world interaction: a glowing hatch, not three dialogue pages. */
    private createDepthCrystalReturn(player: Phaser.GameObjects.Sprite, config: ReturnType<typeof getPlayerSpriteConfig>): void {
        const game = GameStateManager.getInstance(), coop = CoopSessionManager.getInstance();
        const eachPlayer = (callback: () => void) => {
            if (coop.isCoopActive()) coop.forBothPlayers(callback);
            else { callback(); game.save(); }
        };
        eachPlayer(() => { getUnderwaterProgress(game.getPlayer()).depthCrystalShipActive = true; });
        const host = (id: string) => waterHost(this.sceneBuilder, id);
        const party = [{ sprite: player, config, destination: host('depthShipPlayerHost') }];
        if (coop.isCoopActive()) {
            coop.activatePlayerB();
            const guestConfig = getPlayerSpriteConfig(game.getPlayer().characterType);
            coop.activatePlayerA();
            const destination = host('depthShipGuestHost');
            const guest = this.add.sprite(this.machineCompleted ? destination.x : player.x + 110,
                destination.y, guestConfig.idleTexture).setOrigin(.5, 1).setFlipX(true).setDepth(destination.depth);
            party.push({ sprite: guest, config: guestConfig, destination });
        }
        const message = waterArtwork(this, 'silverpond-fairy-title-frame', host('depthShipMessageFrame'));
        const textHost = host('depthShipMessageText');
        const text = this.add.text(textHost.x, textHost.y, this.machineCompleted
            ? 'Dva krystaly září.\nCesta dál je otevřená!'
            : 'Druhý krystal!\nPojďme ho zapojit.', {
            resolution: 2, fontFamily: 'Georgia, serif', fontSize: '25px', color: '#effcfa',
            align: 'center', lineSpacing: 4,
        }).setOrigin(.5).setDepth(textHost.depth).setName('depthShipMessage');
        fitWaterText(text, textHost, 25);
        message.setAlpha(0); text.setAlpha(0);
        const showMessage = () => this.tweens.add({ targets: [message, text], alpha: 1, duration: 400 });

        if (this.machineCompleted) {
            party.forEach(actor => {
                actor.sprite.setPosition(actor.destination.x, actor.destination.y);
                if (this.anims.exists(actor.config.idleAnim)) actor.sprite.play(actor.config.idleAnim);
            });
            showMessage();
            const ui = new UnderwaterUI(this);
            new UnderwaterButton(this, { ...host('depthShipNextCityHost'), name: 'depthShipNextCity',
                label: 'NOVÉ MĚSTO', fontSize: 22, onClick: () => {
                    if (ui.modal) return;
                    ui.dialog('Cesta je otevřená!', 'Nové město nás čeká v další kapitole.\nTato část se ještě připravuje.',
                        'ZPĚT K LODI', () => undefined);
                } });
            new UnderwaterButton(this, { ...host('depthShipReturnHost'), name: 'depthShipReturn',
                label: 'SILVERPOND', fontSize: 22, onClick: () => {
                    if (ui.modal) return;
                    eachPlayer(() => { getUnderwaterProgress(game.getPlayer()).depthCrystalShipActive = false; });
                    this.scene.start(game.isPreviewActive() ? 'MenuScene' : 'SilverpondTownMockScene');
                } });
            return;
        }

        const hatch = host('depthShipHatchHost');
        const glow = this.add.ellipse(hatch.x, hatch.y, hatch.width, hatch.height, 0x66edff, .16)
            .setStrokeStyle(3, 0x9ff5ff, .7).setDepth(hatch.depth);
        const symbol = waterArtwork(this, 'underwater-depth-crystal', host('depthShipCrystalHost'));
        const hit = this.add.container(hatch.x, hatch.y).setSize(hatch.width, hatch.height)
            .setDepth(hatch.depth + 2).setName('depthShipHatch');
        const pulse = this.tweens.add({ targets: glow, alpha: .45, duration: 850, yoyo: true, repeat: -1 });
        hit.on('pointerover', () => { pulse.pause(); glow.setAlpha(1); symbol.setAlpha(1); });
        hit.on('pointerout', () => { pulse.resume(); symbol.setAlpha(.9); });
        hit.once('pointerup', () => {
            hit.disableInteractive();
            sfx(this, 'ui.confirm');
            party.forEach((actor, index) => {
                if (this.anims.exists(actor.config.walkAnim)) actor.sprite.play(actor.config.walkAnim);
                const arrival = host(index ? 'depthShipGuestHatchArrival' : 'depthShipHatchArrival');
                this.tweens.add({ targets: actor.sprite, x: arrival.x, y: arrival.y, duration: 1100, ease: 'Sine.easeInOut' });
            });
            this.time.delayedCall(1000, () => this.cameras.main.fadeOut(400, 10, 24, 29));
            this.time.delayedCall(1410, () => this.scene.start('ZyxCrystalMachineScene', { crystal: 'depth', testMode: this.testMode }));
        });
        party.forEach((actor, index) => {
            if (this.anims.exists(actor.config.walkAnim)) actor.sprite.play(actor.config.walkAnim);
            this.tweens.add({ targets: actor.sprite, x: actor.destination.x, y: actor.destination.y,
                duration: 1300, ease: 'Sine.easeInOut', onComplete: () => {
                    if (this.anims.exists(actor.config.idleAnim)) actor.sprite.play(actor.config.idleAnim);
                    if (!index) { showMessage(); hit.setInteractive({ useHandCursor: true }); }
                } });
        });
    }

    private createDialogue(): void {
        const host = this.getHost('zyxDialogueHost', { x: 640, y: 570, depth: 100 });
        this.dialoguePanel = this.add.container(host.x, host.y).setDepth(host.depth);
        const frame = this.add.image(0, 0, 'zyx-dialog-frame-story')
            .setDisplaySize(1180, 315);
        const portrait = this.add.sprite(-423, 0, 'spritesheet-zyx-transparent2-sheet')
            .setScale(0.35)
            .setOrigin(0.5, 0.5);
        if (this.anims.exists('zyx-idle')) portrait.play('zyx-idle');
        const speaker = this.add.text(-294, -80, 'ZYX', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '27px',
            fontStyle: 'bold',
            color: '#9cecf0',
            stroke: '#1a1010',
            strokeThickness: 4,
            letterSpacing: 2,
        }).setOrigin(0, 0.5);
        const iconFrame = this.add.graphics();
        iconFrame.fillStyle(0x14231c, 0.98);
        iconFrame.lineStyle(3, 0x8b6837, 1);
        iconFrame.fillRoundedRect(-280, -57, 160, 137, 17);
        iconFrame.strokeRoundedRect(-280, -57, 160, 137, 17);
        this.dialogueIcon = this.add.image(
            -200,
            20,
            DIALOGUE_PAGES[0].iconTexture
        ).setDisplaySize(DIALOGUE_PAGES[0].iconSize, DIALOGUE_PAGES[0].iconSize);
        this.dialogueText = this.add.text(-88, -32, DIALOGUE_PAGES[0].text, {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#f5edd8',
            stroke: '#160e0b',
            strokeThickness: 2,
            wordWrap: { width: 520 },
            lineSpacing: 12,
        }).setOrigin(0, 0);
        const crystal = this.add.image(375, -72, 'forest-crystal-story')
            .setDisplaySize(66, 66);
        this.dialoguePanel.add([
            frame,
            portrait,
            speaker,
            iconFrame,
            this.dialogueIcon,
            this.dialogueText,
            crystal,
        ]);

        const buttonHost = this.getHost('zyxDialogueButtonHost', { x: 1035, y: 664, depth: 110 });
        this.actionButton = new MedievalActionButton(this, {
            name: 'zyxDialogueActionButton',
            x: buttonHost.x,
            y: buttonHost.y,
            depth: buttonHost.depth,
            width: 320,
            height: 74,
            label: DIALOGUE_PAGES[0].button,
            labelFontSize: 18,
            accent: 0x70dce8,
            layout: 'text',
            frameTexture: 'zyx-dialog-action-frame-story',
            onClick: () => this.advanceDialogue(),
        });
        this.actionButton.label.setColor('#fff1b5').setStroke('#1b1008', 4);
    }

    private advanceDialogue(): void {
        gameAudio().cancel(this);
        sfx(this, 'ui.page');
        if (!SILVERPOND_ENABLED && this.machineCompleted) {
            this.actionButton.setEnabled(false);
            this.cameras.main.fadeOut(350, 7, 16, 12);
            this.time.delayedCall(360, () => this.scene.start('TownScene'));
            return;
        }

        if (this.dialoguePage >= DIALOGUE_PAGES.length - 1) {
            this.actionButton.setEnabled(false);
            this.cameras.main.fadeOut(350, 7, 16, 12);
            this.time.delayedCall(360, () => {
                this.scene.start('ZyxCrystalMachineScene', { testMode: this.testMode });
            });
            return;
        }

        this.dialoguePage += 1;
        const nextPage = DIALOGUE_PAGES[this.dialoguePage];
        this.actionButton.setEnabled(false);
        this.tweens.add({
            targets: [this.dialogueText, this.dialogueIcon],
            alpha: 0,
            duration: 150,
            onComplete: () => {
                this.dialogueText.setText(nextPage.text);
                voice(this, `vo.rocket.${this.dialoguePage + 1}`);
                this.dialogueIcon
                    .setTexture(nextPage.iconTexture)
                    .setDisplaySize(nextPage.iconSize, nextPage.iconSize);
                this.actionButton.setLabel(nextPage.button);
                this.tweens.add({
                    targets: [this.dialogueText, this.dialogueIcon],
                    alpha: 1,
                    duration: 220,
                    onComplete: () => this.actionButton.setEnabled(true),
                });
            },
        });
    }

    private createSilverpondExit(
        player: Phaser.GameObjects.Sprite,
        walkAnimation: string
    ): void {
        if (!SILVERPOND_ENABLED) {
            this.createDialogue();
            this.dialogueText.setText('Díky za hraní ukázky!\nV Mathorii můžeš hrát dál.');
            this.dialogueIcon.setTexture('forest-crystal-story').setDisplaySize(126, 126);
            this.actionButton.setLabel('ZPĚT DO MATHORIE');
            return;
        }

        const host = this.getHost('rocketSilverpondExitHost', { x: 1160, y: 520, depth: 70 });
        const prompt = new ForestDirectionPrompt(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            label: 'SILVERPOND',
            onClick: () => {
                prompt.setEnabled(false);
                if (!this.testMode) {
                    StorySystem.getInstance().setFlag('hasUnlockedSilverpond');
                }
                if (this.anims.exists(walkAnimation)) player.play(walkAnimation);
                player.setFlipX(false);
                this.tweens.add({
                    targets: player,
                    x: 1360,
                    duration: 1150,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        this.cameras.main.fadeOut(350, 8, 19, 14);
                        this.time.delayedCall(360, () => {
                            this.scene.start('SilverpondTownMockScene');
                        });
                    },
                });
            },
        });

        prompt.root.setAlpha(0);
        this.tweens.add({
            targets: prompt.root,
            alpha: 1,
            duration: 450,
            delay: 200,
        });
    }
}

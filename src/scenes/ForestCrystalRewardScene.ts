import Phaser from 'phaser';
import { voice } from '../audio/AudioDirector';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { StorySystem } from '../systems/StorySystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { ForestDirectionPrompt } from '../ui/ForestDirectionPrompt';

type ForestCrystalRewardData = {
    testMode?: boolean;
    goldReward?: number;
};

type SceneHost = {
    x: number;
    y: number;
    depth: number;
};

export class ForestCrystalRewardScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private testMode = false;
    private goldReward = 0;
    private crystal!: Phaser.GameObjects.Image;
    private aura!: Phaser.GameObjects.Container;
    private rewardUi: Phaser.GameObjects.GameObject[] = [];
    private claimButton!: MedievalActionButton;
    private hasClaimed = false;

    constructor() {
        super({ key: 'ForestCrystalRewardScene' });
    }

    init(data: ForestCrystalRewardData): void {
        this.testMode = data.testMode === true;
        this.goldReward = data.goldReward ?? 0;
        this.hasClaimed = false;
        this.rewardUi = [];
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('ForestCrystalRewardScene');
        this.cameras.main.fadeIn(450, 7, 18, 13);

        if (!this.testMode) {
            StorySystem.getInstance().setFlag('hasDefeatedVerdantGuardian');
        }

        this.createRewardPresentation();
    }

    private getHost(id: string, fallback: SceneHost): SceneHost {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        return {
            x: host?.x ?? fallback.x,
            y: host?.y ?? fallback.y,
            depth: host?.depth ?? fallback.depth,
        };
    }

    private createRewardPresentation(): void {
        const overlayHost = this.getHost('rewardOverlayHost', { x: 640, y: 360, depth: 90 });
        const overlay = this.add.rectangle(
            overlayHost.x,
            overlayHost.y,
            1280,
            720,
            0x07130d,
            0.62
        ).setDepth(overlayHost.depth);
        this.rewardUi.push(overlay);

        const titleHost = this.getHost('rewardTitleHost', { x: 640, y: 82, depth: 100 });
        const titleFrame = this.add.image(
            titleHost.x,
            titleHost.y,
            'zyx-dialog-action-frame-story'
        ).setDisplaySize(700, 98).setDepth(titleHost.depth);
        const title = this.add.text(titleHost.x, titleHost.y - 1, 'KRYSTAL LESA', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '38px',
            fontStyle: 'bold',
            color: '#fff1b5',
            stroke: '#1b1008',
            strokeThickness: 5,
            align: 'center',
        }).setOrigin(0.5).setDepth(titleHost.depth + 1);
        const bossDefeated = this.add.text(
            titleHost.x,
            titleHost.y + 31,
            'VERDANT GUARDIAN PORAŽEN',
            {
                fontFamily: 'Arial, sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#9de8a7',
                letterSpacing: 2,
            }
        ).setOrigin(0.5).setDepth(titleHost.depth + 1);
        this.rewardUi.push(titleFrame, title, bossDefeated);

        const crystalHost = this.getHost('forestCrystalHost', { x: 640, y: 274, depth: 104 });
        this.aura = this.createCrystalAura(crystalHost);
        this.crystal = this.add.image(
            crystalHost.x,
            crystalHost.y,
            'forest-crystal-story'
        ).setDisplaySize(245, 245).setDepth(crystalHost.depth);

        this.tweens.add({
            targets: this.crystal,
            y: crystalHost.y - 9,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const itemTag = this.add.text(crystalHost.x, crystalHost.y + 126, 'PRO ZYXOVU LOĎ', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#d4f5c7',
            stroke: '#14251a',
            strokeThickness: 4,
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(crystalHost.depth + 1);
        this.rewardUi.push(itemTag);

        const panelHost = this.getHost('rewardStoryPanelHost', { x: 640, y: 540, depth: 101 });
        const panel = this.add.graphics().setDepth(panelHost.depth);
        panel.fillStyle(0x101d17, 0.97);
        panel.lineStyle(4, 0x8b5e2c, 1);
        panel.fillRoundedRect(panelHost.x - 470, panelHost.y - 83, 940, 166, 18);
        panel.strokeRoundedRect(panelHost.x - 470, panelHost.y - 83, 940, 166, 18);
        panel.lineStyle(2, 0xd3a451, 0.72);
        panel.strokeRoundedRect(panelHost.x - 461, panelHost.y - 74, 922, 148, 14);

        const storyCards = [
            this.createStoryCard(
                panelHost.x - 285,
                panelHost.y,
                panelHost.depth + 1,
                'story-icon-crystal-fell',
                'SPADL Z LODI'
            ),
            this.createStoryCard(
                panelHost.x,
                panelHost.y,
                panelHost.depth + 1,
                'story-icon-guardian',
                'STRÁŽCE HO HLÍDAL'
            ),
            this.createStoryCard(
                panelHost.x + 285,
                panelHost.y,
                panelHost.depth + 1,
                'zyx',
                'VRAŤ HO ZYXOVI'
            ),
        ];
        const storyArrows = [-142, 143].map((offset) => this.add.text(
            panelHost.x + offset,
            panelHost.y - 4,
            '➜',
            {
                fontFamily: 'Arial, sans-serif',
                fontSize: '37px',
                fontStyle: 'bold',
                color: '#8fdaa0',
                stroke: '#0a130e',
                strokeThickness: 4,
            }
        ).setOrigin(0.5).setDepth(panelHost.depth + 2));
        this.rewardUi.push(panel, ...storyCards, ...storyArrows);

        const buttonHost = this.getHost('claimCrystalButtonHost', { x: 1085, y: 663, depth: 110 });
        this.claimButton = new MedievalActionButton(this, {
            name: 'claimForestCrystalButton',
            x: buttonHost.x,
            y: buttonHost.y,
            depth: buttonHost.depth,
            width: 330,
            height: 76,
            label: 'VEZMI KRYSTAL',
            labelFontSize: 18,
            accent: 0x85e58c,
            layout: 'text',
            frameTexture: 'zyx-dialog-action-frame-story',
            onClick: () => this.claimCrystal(),
        });
        this.claimButton.label.setColor('#fff1b5').setStroke('#1b1008', 4);
        this.rewardUi.push(this.claimButton.root);
    }

    private createStoryCard(
        x: number,
        y: number,
        depth: number,
        icon: string,
        label: string
    ): Phaser.GameObjects.Container {
        const card = this.add.container(x, y).setDepth(depth);
        const background = this.add.graphics();
        background.fillStyle(0x172920, 0.96);
        background.lineStyle(2, 0x507e58, 0.95);
        background.fillRoundedRect(-118, -67, 236, 134, 15);
        background.strokeRoundedRect(-118, -67, 236, 134, 15);

        const children: Phaser.GameObjects.GameObject[] = [background];
        if (icon === 'zyx') {
            const zyx = this.add.sprite(-22, -17, 'spritesheet-zyx-transparent2-sheet')
                .setScale(0.18);
            if (this.anims.exists('zyx-idle')) zyx.play('zyx-idle');
            const crystal = this.add.image(38, -21, 'forest-crystal-story')
                .setDisplaySize(50, 50);
            children.push(zyx, crystal);
        } else {
            const picture = this.add.image(0, -18, icon).setDisplaySize(104, 104);
            children.push(picture);
        }

        const caption = this.add.text(0, 48, label, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#f5edcf',
            stroke: '#0b130f',
            strokeThickness: 3,
            align: 'center',
            letterSpacing: 0.5,
        }).setOrigin(0.5);
        children.push(caption);
        card.add(children);
        return card;
    }

    private createCrystalAura(host: SceneHost): Phaser.GameObjects.Container {
        const aura = this.add.container(host.x, host.y).setDepth(host.depth - 1);
        const outer = this.add.circle(0, 0, 116, 0x65db71, 0.12);
        const inner = this.add.circle(0, 0, 82, 0xd9f59a, 0.16);
        aura.add([outer, inner]);

        for (let index = 0; index < 10; index++) {
            const angle = (Math.PI * 2 * index) / 10;
            const leaf = this.add.ellipse(
                Math.cos(angle) * 126,
                Math.sin(angle) * 88,
                9,
                21,
                index % 2 === 0 ? 0x8de783 : 0xd0ed91,
                0.72
            ).setRotation(angle + Math.PI / 2);
            aura.add(leaf);
        }

        this.tweens.add({
            targets: outer,
            scale: 1.15,
            alpha: 0.05,
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.tweens.add({
            targets: aura,
            angle: 360,
            duration: 18000,
            repeat: -1,
        });
        return aura;
    }

    private claimCrystal(): void {
        if (this.hasClaimed) return;
        this.hasClaimed = true;
        this.claimButton.setEnabled(false);
        this.tweens.killTweensOf(this.crystal);

        if (!this.testMode) {
            StorySystem.getInstance().setFlag('hasClaimedForestCrystal');
        }

        const questHost = this.getHost('forestCrystalQuestHost', { x: 1090, y: 78, depth: 80 });
        const fadingUi = this.rewardUi.filter((item) => item !== this.claimButton.root);
        this.tweens.add({
            targets: fadingUi,
            alpha: 0,
            duration: 320,
            ease: 'Sine.easeOut',
        });
        this.tweens.add({
            targets: this.claimButton.root,
            alpha: 0,
            y: this.claimButton.root.y + 20,
            duration: 260,
        });
        this.tweens.add({
            targets: this.aura,
            alpha: 0,
            duration: 280,
        });
        this.tweens.add({
            targets: this.crystal,
            x: questHost.x - 138,
            y: questHost.y,
            displayWidth: 58,
            displayHeight: 58,
            duration: 780,
            ease: 'Cubic.easeInOut',
            onComplete: () => this.revealAftermath(questHost),
        });
    }

    private revealAftermath(questHost: SceneHost): void {
        const questPanel = this.add.container(questHost.x, questHost.y).setDepth(questHost.depth).setAlpha(0);
        const bg = this.add.graphics();
        bg.fillStyle(0x102019, 0.95);
        bg.lineStyle(3, 0xb88a43, 1);
        bg.fillRoundedRect(-180, -34, 360, 68, 15);
        bg.strokeRoundedRect(-180, -34, 360, 68, 15);
        const objective = this.add.text(-95, -9, 'NOVÝ CÍL', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#91e99a',
            letterSpacing: 1,
        }).setOrigin(0, 0.5);
        const description = this.add.text(-95, 12, 'Vrať Krystal lesa Zyxovi', {
            fontFamily: 'Georgia, serif',
            fontSize: '16px',
            color: '#f4ebcf',
        }).setOrigin(0, 0.5);
        questPanel.add([bg, objective, description]);

        const playerHost = this.getHost('aftermathPlayerHost', { x: 300, y: 610, depth: 20 });
        const playerConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        const player = this.add.sprite(playerHost.x, playerHost.y, playerConfig.idleTexture)
            .setOrigin(0.5, 1)
            .setScale(1)
            .setDepth(playerHost.depth)
            .setAlpha(0);
        if (this.anims.exists(playerConfig.idleAnim)) player.play(playerConfig.idleAnim);

        const exitHost = this.getHost('rocketExitHost', { x: 1135, y: 560, depth: 70 });
        const exit = this.createExitPrompt(exitHost, () => {
            exit.disableInteractive();
            if (this.anims.exists(playerConfig.walkAnim)) player.play(playerConfig.walkAnim);
            player.setFlipX(false);
            this.tweens.add({
                targets: player,
                x: 1360,
                duration: 1250,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    this.cameras.main.fadeOut(350, 5, 15, 10);
                    this.time.delayedCall(360, () => {
                        this.scene.start('ZyxRocketInterludeScene', { testMode: this.testMode });
                    });
                },
            });
        });

        this.tweens.add({
            targets: [questPanel, player, exit],
            alpha: 1,
            duration: 500,
            ease: 'Sine.easeOut',
            onComplete: () => voice(this, 'vo.forest.crystal', true),
        });
    }

    private createExitPrompt(host: SceneHost, onClick: () => void): Phaser.GameObjects.Container {
        return new ForestDirectionPrompt(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            label: 'K ZYXOVI',
            alpha: 0,
            onClick,
        }).root;
    }
}

import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { SceneBuilder } from '../systems/SceneBuilder';
import { MasterySystem } from '../systems/MasterySystem';
import {
    ExamConfig,
    ExamType,
    EXAM_CONFIGS,
    MasteryTargetId,
} from '../types';
import { MedievalActionButton } from './MedievalActionButton';

export type GuildAvailableExam = {
    type: ExamType;
    targetId: MasteryTargetId;
    label: string;
};

type HostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

export type GuildHallUIOptions = {
    scene: Phaser.Scene;
    sceneBuilder: SceneBuilder;
    gameState: GameStateManager;
    accentColor: number;
    standardExam: GuildAvailableExam | null;
    catacombExam: GuildAvailableExam | null;
    onStartExam: () => void;
    onStartManaCollection: () => void;
    onStartCatacomb: (exam: GuildAvailableExam) => void;
    onShowLearning: () => void;
    onShowDailyProgress: () => void;
};

/**
 * Readable top-level Guild Hall UI shared by Mathoria and Silverpond.
 * Every static anchor is sourced from scenes.json; the environment texture and
 * accent are the only visual differences between town variants.
 */
export class GuildHallUI {
    private readonly scene: Phaser.Scene;
    private readonly sceneBuilder: SceneBuilder;
    private readonly gameState: GameStateManager;
    private readonly accentColor: number;
    private readonly standardExam: GuildAvailableExam | null;
    private readonly catacombExam: GuildAvailableExam | null;
    private readonly onStartExam: () => void;
    private readonly onStartManaCollection: () => void;
    private readonly onStartCatacomb: (exam: GuildAvailableExam) => void;
    private readonly onShowLearning: () => void;
    private readonly onShowDailyProgress: () => void;

    constructor(options: GuildHallUIOptions) {
        this.scene = options.scene;
        this.sceneBuilder = options.sceneBuilder;
        this.gameState = options.gameState;
        this.accentColor = options.accentColor;
        this.standardExam = options.standardExam;
        this.catacombExam = options.catacombExam;
        this.onStartExam = options.onStartExam;
        this.onStartManaCollection = options.onStartManaCollection;
        this.onStartCatacomb = options.onStartCatacomb;
        this.onShowLearning = options.onShowLearning;
        this.onShowDailyProgress = options.onShowDailyProgress;

        this.createZyxProgress();
        this.createChallengeBoard();
        this.createManaSpringInteraction();
        this.createCatacombInteraction();
        this.createNavigationButtons();
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

    private createZyxProgress(): void {
        const host = this.getHost('nextExamProgressHost', {
            x: 232, y: 282, width: 300, height: 72, depth: 30,
        });
        const examProgress = MasterySystem.getInstance().getNextSubAtomExamProgress();
        const isReady = this.standardExam !== null;
        const progress = isReady ? 100 : examProgress?.percentage ?? 0;
        const targetId = this.standardExam?.targetId ?? examProgress?.targetId;
        const title = isReady ? 'ZKOUŠKA JE PŘIPRAVENA' : 'POSTUP K DALŠÍ ZKOUŠCE';

        this.scene.add.rectangle(host.x, host.y, host.width, host.height, 0x0d1117, 0.9)
            .setDepth(host.depth)
            .setStrokeStyle(2, this.accentColor, 0.82);
        this.scene.add.text(host.x, host.y - 19, title, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: isReady ? '#fff0bd' : '#e8ddc7',
            stroke: '#080a0d',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(host.depth + 1);

        const barWidth = host.width - 64;
        const barY = host.y + 12;
        this.scene.add.rectangle(host.x, barY, barWidth, 12, 0x080b10, 0.95)
            .setDepth(host.depth + 1)
            .setStrokeStyle(1, 0x8d6a36, 0.9);
        if (progress > 0) {
            const fillWidth = barWidth * Math.min(100, progress) / 100;
            this.scene.add.rectangle(
                host.x - barWidth / 2 + fillWidth / 2,
                barY,
                fillWidth,
                8,
                this.accentColor,
                1,
            ).setDepth(host.depth + 2);
        }
        const progressDetail = examProgress && !isReady
            ? `${progress} %  •  ${examProgress.targetId}  •  ${examProgress.successfulSolves}/${examProgress.requiredSuccessfulSolves} správně`
            : `${progress} %${targetId ? `  •  ${targetId}` : ''}`;
        this.scene.add.text(host.x, host.y + 29, progressDetail, {
            resolution: 2,
            fontFamily: 'Arial, sans-serif',
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#f4ead5',
            stroke: '#080a0d',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(host.depth + 2);
    }

    private createChallengeBoard(): void {
        const host = this.getHost('challengePanelHost', {
            x: 658, y: 328, width: 256, height: 196, depth: 30,
        });
        const actionHost = this.getHost('challengeActionHost', {
            x: 658, y: 402, width: 220, height: 46, depth: 42,
        });
        const isCoop = CoopSessionManager.getInstance().isCoopActive();
        const boardTop = host.y - host.height / 2;

        // This rectangle deliberately matches the actual black inset painted into
        // both guild backgrounds. It is also the hard content boundary for every
        // board label, divider and action below.
        this.scene.add.rectangle(host.x, host.y, host.width, host.height, 0x090b0e, 0.12)
            .setDepth(host.depth)
            .setStrokeStyle(1, this.accentColor, 0.42);

        this.scene.add.text(host.x, boardTop + 9, 'AKTUÁLNÍ VÝZVA', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#f5d98d',
            stroke: '#24170b',
            strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(host.depth + 1);
        this.scene.add.rectangle(
            host.x,
            boardTop + 39,
            host.width - 28,
            2,
            this.accentColor,
            0.75,
        ).setDepth(host.depth + 1);

        const presentation = this.getChallengePresentation(isCoop);
        const challengeTitle = this.scene.add.text(host.x, boardTop + 49, presentation.title, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: this.standardExam ? '17px' : '18px',
            fontStyle: 'bold',
            color: this.standardExam ? '#ffffff' : '#c9c3b8',
            align: 'center',
            lineSpacing: 3,
            wordWrap: { width: host.width - 24 },
            stroke: '#090b0e',
            strokeThickness: 4,
        }).setOrigin(0.5, 0).setDepth(host.depth + 1);
        this.fitTextToWidth(challengeTitle, host.width - 30);

        const detail = this.scene.add.text(host.x, boardTop + 112, presentation.detail, {
            resolution: 2,
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#bfc9d4',
            align: 'center',
            lineSpacing: 2,
            wordWrap: { width: host.width - 30 },
            stroke: '#090b0e',
            strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(host.depth + 1);
        this.fitTextToWidth(detail, host.width - 34);

        const challengeAction = new MedievalActionButton(this.scene, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: presentation.actionLabel,
            layout: 'text',
            accent: this.accentColor,
            labelFontSize: presentation.enabled ? 14 : 12,
            enabled: presentation.enabled,
            onClick: this.onStartExam,
        });
        if (!presentation.enabled) challengeAction.root.setAlpha(0.64);
    }

    private fitTextToWidth(text: Phaser.GameObjects.Text, maxWidth: number): void {
        if (text.width <= maxWidth) return;
        text.setScale(maxWidth / text.width);
    }

    private getChallengePresentation(isCoop: boolean): {
        title: string;
        detail: string;
        actionLabel: string;
        enabled: boolean;
    } {
        if (isCoop) {
            return {
                title: 'SPOLEČNÝ POSTUP',
                detail: 'Zkoušky a výzvy se v co-opu\nvyhodnocují automaticky po soubojích.',
                actionLabel: 'AUTOMATICKÝ POSTUP',
                enabled: false,
            };
        }
        if (this.standardExam) {
            const config = EXAM_CONFIGS[this.standardExam.type] as ExamConfig;
            const threshold = config.passThreshold ?? config.bronzeThreshold ?? config.itemCount;
            return {
                title: this.standardExam.label.toUpperCase(),
                detail: `${config.itemCount} úloh  •  ${threshold}+ správně pro postup`,
                actionLabel: 'ZAČÍT ZKOUŠKU',
                enabled: true,
            };
        }
        return {
            title: 'DALŠÍ ZKOUŠKA\nSE PŘIPRAVUJE',
            detail: 'Pokračuj v soubojích a procvičování.',
            actionLabel: 'ZATÍM NENÍ PŘIPRAVENA',
            enabled: false,
        };
    }

    private createNavigationButtons(): void {
        const learningHost = this.getHost('learningButtonHost', {
            x: 485, y: 640, width: 280, height: 78, depth: 60,
        });
        const dailyProgressHost = this.getHost('dailyProgressButtonHost', {
            x: 780, y: 640, width: 280, height: 78, depth: 60,
        });

        new MedievalActionButton(this.scene, {
            x: learningHost.x,
            y: learningHost.y,
            depth: learningHost.depth,
            width: learningHost.width,
            height: learningHost.height,
            label: 'MAPA UČENÍ',
            layout: 'icon',
            frameTexture: 'guild-nav-frame-v2',
            normalIcon: { texture: 'guild-map-normal-v2' },
            activeIcon: { texture: 'guild-map-active-v2' },
            iconSize: 50,
            iconCenterRatio: 0.145,
            labelCenterRatio: 0.64,
            accent: this.accentColor,
            labelFontSize: 15,
            labelMaxWidth: learningHost.width * 0.57,
            labelMaxHeight: learningHost.height * 0.42,
            onClick: this.onShowLearning,
        });
        new MedievalActionButton(this.scene, {
            x: dailyProgressHost.x,
            y: dailyProgressHost.y,
            depth: dailyProgressHost.depth,
            width: dailyProgressHost.width,
            height: dailyProgressHost.height,
            label: 'DENNÍ POKROK',
            layout: 'icon',
            frameTexture: 'guild-nav-frame-v2',
            normalIcon: { texture: 'guild-daily-normal-v2' },
            activeIcon: { texture: 'guild-daily-active-v2' },
            iconSize: 50,
            iconCenterRatio: 0.145,
            labelCenterRatio: 0.64,
            accent: this.accentColor,
            labelFontSize: 15,
            labelMaxWidth: dailyProgressHost.width * 0.57,
            labelMaxHeight: dailyProgressHost.height * 0.42,
            onClick: this.onShowDailyProgress,
        });

    }

    private createManaSpringInteraction(): void {
        const host = this.getHost('manaSpringHost', {
            x: 1000, y: 465, width: 220, height: 210, depth: 28,
        });
        const labelHost = this.getHost('manaSpringLabelHost', {
            x: 1000, y: 540, width: 210, height: 48, depth: 32,
        });
        const access = this.getManaSpringAccess();

        // The hover follows the crystal silhouettes and water surface instead of
        // drawing a geometric outline around the interaction zone.
        const springLight = this.scene.add.graphics()
            .setPosition(host.x, host.y)
            .setDepth(host.depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);
        springLight.fillStyle(0x78f4ff, 0.28);
        springLight.fillTriangle(0, -88, -24, -18, 0, 10);
        springLight.fillTriangle(0, -88, 24, -18, 0, 10);
        springLight.fillTriangle(-43, -48, -61, -5, -36, 8);
        springLight.fillTriangle(43, -48, 61, -5, 36, 8);
        springLight.fillStyle(0xaafaff, 0.2);
        springLight.fillEllipse(0, 20, host.width * 0.7, 28);
        springLight.fillEllipse(0, 28, host.width * 0.48, 14);

        const moteOffsets = [
            { x: -54, y: -12, r: 3, delay: 0 },
            { x: 49, y: -3, r: 2, delay: 170 },
            { x: -22, y: -58, r: 2, delay: 330 },
            { x: 30, y: -66, r: 3, delay: 490 },
        ];
        const motes = moteOffsets.map(mote => {
            const particle = this.scene.add.circle(
                host.x + mote.x,
                host.y + mote.y,
                mote.r,
                0xd8ffff,
                1,
            ).setDepth(host.depth + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
            particle.setData('baseY', particle.y);
            particle.setData('delay', mote.delay);
            return particle;
        });

        const setSpringHover = (active: boolean): void => {
            this.scene.tweens.killTweensOf([springLight, ...motes]);
            if (!active) {
                motes.forEach(mote => mote.setY(mote.getData('baseY')));
                this.scene.tweens.add({
                    targets: [springLight, ...motes],
                    alpha: 0,
                    duration: 180,
                    ease: 'Sine.easeOut',
                });
                return;
            }

            springLight.setAlpha(0.42);
            this.scene.tweens.add({
                targets: springLight,
                alpha: 0.78,
                duration: 760,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            motes.forEach(mote => {
                mote.setAlpha(0.75).setY(mote.getData('baseY'));
                this.scene.tweens.add({
                    targets: mote,
                    y: mote.getData('baseY') - 13,
                    alpha: 0.18,
                    delay: mote.getData('delay'),
                    duration: 820,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            });
        };

        const status = !access.unlocked
            ? 'ODEMČE SE PŘI 10 MINCÍCH'
            : 'MINIHRA · ZDARMA';
        const activateSpring = (): void => {
            if (!access.unlocked) {
                this.showToast('Manový pramen se odemkne, až získáš alespoň 10 mincí.');
                return;
            }
            this.onStartManaCollection();
        };

        const springCaption = this.createEnvironmentalCaption({
            host: labelHost,
            title: 'MANOVÝ PRAMEN',
            status,
            color: '#bdfaff',
            enabled: access.unlocked,
            onActivate: activateSpring,
            onHover: setSpringHover,
        });
        springCaption.setAlpha(access.unlocked ? 0.9 : 0.58);

        const zone = this.scene.add.zone(host.x, host.y, host.width, host.height)
            .setDepth(host.depth + 2)
            .setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => setSpringHover(true));
        zone.on('pointerout', () => setSpringHover(false));
        zone.on('pointerup', activateSpring);
    }

    private getManaSpringAccess(): { unlocked: boolean } {
        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) {
            const coinValue = ProgressionSystem.getTotalCoinValue(this.gameState.getPlayer().coins);
            return {
                unlocked: coinValue >= 10,
            };
        }

        const originalPlayer = coop.getActivePlayer();
        coop.activatePlayerA();
        const coinsA = ProgressionSystem.getTotalCoinValue(this.gameState.getPlayer().coins);
        coop.activatePlayerB();
        const coinsB = ProgressionSystem.getTotalCoinValue(this.gameState.getPlayer().coins);
        if (originalPlayer === 'A') coop.activatePlayerA();
        else coop.activatePlayerB();

        return {
            unlocked: coinsA >= 10 && coinsB >= 10,
        };
    }

    private createCatacombInteraction(): void {
        const host = this.getHost('catacombDoorHost', {
            x: 1190, y: 380, width: 128, height: 280, depth: 28,
        });
        const labelHost = this.getHost('catacombLabelHost', {
            x: 1190, y: 535, width: 160, height: 48, depth: 33,
        });
        const isCoop = CoopSessionManager.getInstance().isCoopActive();
        const enabled = this.catacombExam !== null && !isCoop;

        // Light spills out from the corridor on hover; there is no outline around
        // the invisible hit area or the masonry arch.
        const corridorLight = this.scene.add.graphics()
            .setPosition(host.x, host.y)
            .setDepth(host.depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);
        corridorLight.fillStyle(this.accentColor, 0.05);
        corridorLight.fillRoundedRect(-34, -82, 68, 178, 30);
        corridorLight.fillStyle(this.accentColor, 0.07);
        corridorLight.fillRoundedRect(-28, -76, 56, 166, 25);
        corridorLight.fillStyle(0xeaffff, 0.06);
        corridorLight.fillRoundedRect(-19, -67, 38, 148, 19);
        corridorLight.fillStyle(this.accentColor, 0.06);
        corridorLight.fillEllipse(0, 28, 68, 138);

        const floorLight = this.scene.add.ellipse(
            host.x,
            host.y + host.height / 2 - 14,
            host.width * 0.82,
            34,
            this.accentColor,
            0.35,
        ).setDepth(host.depth + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

        const setCatacombHover = (active: boolean): void => {
            this.scene.tweens.killTweensOf([corridorLight, floorLight]);
            if (!active) {
                this.scene.tweens.add({
                    targets: [corridorLight, floorLight],
                    alpha: 0,
                    duration: 190,
                    ease: 'Sine.easeOut',
                });
                return;
            }

            corridorLight.setAlpha(0.68);
            floorLight.setAlpha(0.32);
            this.scene.tweens.add({
                targets: corridorLight,
                alpha: 1,
                duration: 820,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            this.scene.tweens.add({
                targets: floorLight,
                alpha: 0.5,
                duration: 820,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        };

        const status = isCoop
            ? 'PŘEHLED V CO-OPU'
            : enabled
                ? 'NOVÁ VÝZVA'
                : 'ZATÍM UZAMČENÉ';

        const activateCatacomb = (): void => {
            if (isCoop) {
                this.showToast('V co-opu se postup do katakomb zapisuje automaticky po soubojích.');
                return;
            }
            if (!this.catacombExam) {
                this.showToast('Další výzva v katakombách zatím není připravená.');
                return;
            }
            this.onStartCatacomb(this.catacombExam);
        };

        const catacombCaption = this.createEnvironmentalCaption({
            host: labelHost,
            title: 'KATAKOMBY',
            status,
            color: this.accentColor === 0x57ddf2 ? '#bdefff' : '#ffe2a2',
            enabled,
            onActivate: activateCatacomb,
            onHover: setCatacombHover,
        });
        catacombCaption.setAlpha(enabled ? 0.9 : 0.58);

        if (enabled) {
            const notification = this.scene.add.text(host.x, host.y - host.height / 2 + 8, '!', {
                resolution: 2,
                fontFamily: 'Arial, sans-serif',
                fontSize: '34px',
                fontStyle: 'bold',
                color: '#fff2a8',
                stroke: '#5b3108',
                strokeThickness: 5,
            }).setOrigin(0.5).setDepth(host.depth + 3);
            this.scene.tweens.add({
                targets: notification,
                alpha: 0.55,
                y: notification.y - 5,
                duration: 720,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        const zone = this.scene.add.zone(host.x, host.y, host.width, host.height)
            .setDepth(host.depth + 2)
            .setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => setCatacombHover(true));
        zone.on('pointerout', () => setCatacombHover(false));
        zone.on('pointerup', activateCatacomb);
    }

    private createEnvironmentalCaption(options: {
        host: HostLayout;
        title: string;
        status: string;
        color: string;
        enabled: boolean;
        onActivate: () => void;
        onHover: (active: boolean) => void;
    }): Phaser.GameObjects.Container {
        const { host } = options;
        const title = this.scene.add.text(0, -8, options.title, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: options.color,
            stroke: '#070a0c',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5);
        const status = this.scene.add.text(0, 10, options.status, {
            resolution: 2,
            fontFamily: 'Arial, sans-serif',
            fontSize: '8px',
            fontStyle: 'bold',
            color: options.enabled ? '#f3ead7' : '#b7b0a5',
            stroke: '#070a0c',
            strokeThickness: 3,
            align: 'center',
        }).setOrigin(0.5).setAlpha(0);

        const caption = this.scene.add.container(host.x, host.y, [title, status])
            .setDepth(host.depth)
            .setSize(host.width, host.height)
            .setInteractive({ useHandCursor: true });
        caption.on('pointerover', () => {
            options.onHover(true);
            this.scene.tweens.killTweensOf(caption);
            this.scene.tweens.killTweensOf(status);
            this.scene.tweens.add({
                targets: caption,
                alpha: 1,
                y: host.y - 2,
                duration: 140,
                ease: 'Sine.easeOut',
            });
            this.scene.tweens.add({
                targets: status,
                alpha: 1,
                duration: 140,
                ease: 'Sine.easeOut',
            });
        });
        caption.on('pointerout', () => {
            options.onHover(false);
            this.scene.tweens.killTweensOf(caption);
            this.scene.tweens.killTweensOf(status);
            this.scene.tweens.add({
                targets: caption,
                alpha: options.enabled ? 0.9 : 0.58,
                y: host.y,
                duration: 160,
                ease: 'Sine.easeOut',
            });
            this.scene.tweens.add({
                targets: status,
                alpha: 0,
                duration: 120,
                ease: 'Sine.easeOut',
            });
        });
        caption.on('pointerup', options.onActivate);
        return caption;
    }

    private showToast(message: string): void {
        const host = this.getHost('toastHost', {
            x: 640, y: 565, width: 520, height: 42, depth: 150,
        });
        const toast = this.scene.add.text(host.x, host.y, message, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#f5f1e6',
            backgroundColor: '#101820ee',
            padding: { x: 18, y: 10 },
            align: 'center',
            wordWrap: { width: host.width - 30 },
            stroke: '#080a0d',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(host.depth);
        this.scene.tweens.add({
            targets: toast,
            alpha: 0,
            y: host.y - 10,
            delay: 1500,
            duration: 350,
            ease: 'Sine.easeIn',
            onComplete: () => toast.destroy(),
        });
    }
}

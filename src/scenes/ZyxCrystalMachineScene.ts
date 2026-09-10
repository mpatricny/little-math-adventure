import { sfx, voice } from '../audio/AudioDirector';
import { acquirePuzzle, puzzleProgress, recordPuzzleAnswer } from '../systems/puzzles/PuzzleService';
import { sumPuzzle } from '../systems/puzzles/PuzzleCatalog';
import { GameStateManager } from '../systems/GameStateManager';
import type { PuzzleInstance, SumPuzzle } from '../types/puzzles';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { StorySystem } from '../systems/StorySystem';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { DEPTH_MACHINE_PUZZLE, installDepthCrystal } from '../systems/DepthCrystalProgressSystem';
import { depthCrystalPuzzle } from '../systems/DepthCrystalPuzzle';
import { UnderwaterUI, waterHost } from '../ui/UnderwaterUI';
import { waterArtwork } from '../ui/UnderwaterTheme';

type ZyxCrystalMachineData = {
    testMode?: boolean;
    crystal?: 'forest' | 'depth';
};

type SceneHost = {
    x: number;
    y: number;
    depth: number;
};

type MachinePhase =
    | 'selecting'
    | 'checking'
    | 'calibrated'
    | 'crystal-selected'
    | 'ready'
    | 'activated';

type NumberOption = {
    value: number;
    root: Phaser.GameObjects.Container;
    text: Phaser.GameObjects.Text;
    highlight: Phaser.GameObjects.Graphics;
};



export class ZyxCrystalMachineScene extends Phaser.Scene {
    private puzzleInstance!: PuzzleInstance<SumPuzzle>;
    private sceneBuilder!: SceneBuilder;
    private testMode = false;
    private depthCrystal = false;
    private phase: MachinePhase = 'selecting';
    private selectedValues: number[] = [];
    private titleText!: Phaser.GameObjects.Text;
    private nodeTexts: Phaser.GameObjects.Text[] = [];
    private options: NumberOption[] = [];
    private crystalRoot!: Phaser.GameObjects.Container;
    private crystalImage!: Phaser.GameObjects.Image;
    private questSlotHost!: SceneHost;
    private questSlotGlow!: Phaser.GameObjects.Ellipse;
    private questSlotZone!: Phaser.GameObjects.Container;
    private actionRoot!: Phaser.GameObjects.Container;
    private actionSurface!: Phaser.GameObjects.Container;
    private actionHighlight!: Phaser.GameObjects.Graphics;
    private actionLabel!: Phaser.GameObjects.Text;
    private actionEnabled = false;

    constructor() {
        super({ key: 'ZyxCrystalMachineScene' });
    }

    init(data: ZyxCrystalMachineData = {}): void {
        CoopSessionManager.getInstance().activatePlayerA();
        this.testMode = data.testMode === true;
        this.depthCrystal = data.crystal === 'depth';
        this.puzzleInstance = acquirePuzzle(this.testMode ? {} : puzzleProgress(GameStateManager.getInstance().getPlayer()).active,
            this.depthCrystal ? DEPTH_MACHINE_PUZZLE : 'zyx:machine', 'sum_selection',
            p => this.depthCrystal ? depthCrystalPuzzle(p) : sumPuzzle(p, 6));
        this.phase = 'selecting';
        this.selectedValues = [...(this.puzzleInstance.state.selection as number[] ?? [])];
        this.nodeTexts = [];
        this.options = [];
        this.actionEnabled = false;
    }

    preload(): void {
        if (this.depthCrystal && !this.textures.exists('underwater-depth-crystal')) {
            this.load.image('underwater-depth-crystal', `assets/${this.cache.json.get('textures').images['underwater-depth-crystal']}`);
        }
    }

    create(): void {
        if (this.depthCrystal && !this.testMode) {
            const progress = GameStateManager.getInstance().getPlayer().underwaterProgress;
            if (!progress?.depthCrystalClaimed || progress.depthCrystalInstalled) {
                this.scene.start('ZyxRocketInterludeScene');
                return;
            }
        }
        if (this.depthCrystal && !this.textures.exists('underwater-depth-crystal')) {
            new UnderwaterUI(this).dialog('Krystal se nenačetl', 'Zkontroluj připojení. Postup je uložený.',
                'ZKUSIT ZNOVU', () => this.scene.restart({ crystal: 'depth', testMode: this.testMode }));
            return;
        }
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('ZyxCrystalMachineScene');
        this.cameras.main.fadeIn(450, 16, 11, 26);

        this.createTitle();
        this.createCalibrationBoard();
        this.createCrystal();
        this.createQuestSlot();
        this.createActionButton();
        this.renderSelection();
        if (this.depthCrystal) this.createInstalledForestCrystal();
        if (this.puzzleInstance.completed) this.enableCrystal();
        else if (this.selectedValues.length === 3) this.checkSelection();
        if (!this.testMode) GameStateManager.getInstance().save();
        this.events.once('shutdown', () => {
            this.puzzleInstance.state.selection = [...this.selectedValues];
            if (!this.testMode) GameStateManager.getInstance().save();
        });

        this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
    }

    private getHost(id: string, fallback: SceneHost): SceneHost {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        return {
            x: host?.x ?? fallback.x,
            y: host?.y ?? fallback.y,
            depth: host?.depth ?? fallback.depth,
        };
    }

    private createTitle(): void {
        const host = this.getHost('machineTitleHost', { x: 640, y: 38, depth: 40 });
        this.titleText = this.add.text(host.x, host.y, 'VYBER 3 ČÍSLA', {
            resolution: 2, fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '29px',
            fontStyle: 'bold',
            color: '#fff0bd',
            stroke: '#1b100d',
            strokeThickness: 5,
            align: 'center',
        }).setOrigin(0.5).setDepth(host.depth);
    }

    private setTitle(value: string): Phaser.GameObjects.Text {
        const safeWidth = this.sceneBuilder.getElementDef('machineTitleHost')?.width ?? 380;
        this.titleText.setText(value).setFontSize(29);
        for (let size = 28; this.titleText.width > safeWidth && size >= 20; size--) {
            this.titleText.setFontSize(size);
        }
        return this.titleText;
    }

    private createCalibrationBoard(): void {
        const nodeHosts = [
            this.getHost('machineNode1Host', { x: 390, y: 363, depth: 60 }),
            this.getHost('machineNode2Host', { x: 636, y: 363, depth: 60 }),
            this.getHost('machineNode3Host', { x: 883, y: 363, depth: 60 }),
        ];
        nodeHosts.forEach((host, index) => {
            const text = this.add.text(host.x, host.y, '?', {
                resolution: 2, fontFamily: 'Georgia, serif',
                fontSize: '39px',
                fontStyle: 'bold',
                color: '#f8edce',
                stroke: '#100d13',
                strokeThickness: 5,
            }).setOrigin(0.5).setDepth(host.depth);
            this.nodeTexts.push(text);

            const removeZone = this.add.container(host.x, host.y)
                .setDepth(host.depth + 1)
                .setSize(112, 112)
                .setInteractive({ useHandCursor: true });
            removeZone.on('pointerup', () => {
                if (this.phase !== 'selecting' || index >= this.selectedValues.length) return;
                this.selectedValues.splice(index, 1);
                this.renderSelection();
            });
        });

        [
            this.getHost('machineOperator1Host', { x: 514, y: 363, depth: 60 }),
            this.getHost('machineOperator2Host', { x: 764, y: 363, depth: 60 }),
        ].forEach((host) => {
            this.add.text(host.x, host.y, '+', {
                resolution: 2, fontFamily: 'Arial, sans-serif',
                fontSize: '32px',
                fontStyle: 'bold',
                color: '#8ee9f2',
                stroke: '#0b1118',
                strokeThickness: 5,
            }).setOrigin(0.5).setDepth(host.depth);
        });

        const equalsHost = this.getHost('machineEqualsHost', { x: 1000, y: 363, depth: 60 });
        this.add.text(equalsHost.x, equalsHost.y, '=', {
            resolution: 2, fontFamily: 'Arial, sans-serif',
            fontSize: '30px',
            fontStyle: 'bold',
            color: '#9aeefa',
            stroke: '#0b1118',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(equalsHost.depth);

        const targetHost = this.getHost('machineTargetHost', { x: 1110, y: 363, depth: 60 });
        this.add.text(targetHost.x, targetHost.y, `${this.puzzleInstance.payload.target}`, {
            resolution: 2, fontFamily: 'Georgia, serif',
            fontSize: '38px',
            fontStyle: 'bold',
            color: '#fff0bd',
            stroke: '#100d13',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(targetHost.depth);

        this.puzzleInstance.payload.values.forEach((value, index) => {
            const host = this.getHost(
                `machineNumber${index + 1}Host`,
                { x: 405 + index * 140, y: 594, depth: 70 }
            );
            this.options.push(this.createNumberOption(host, value, index));
        });
    }

    private createNumberOption(host: SceneHost, value: number, index: number): NumberOption {
        const root = this.add.container(host.x, host.y).setDepth(host.depth);
        const neutralSurface = this.add.graphics();
        neutralSurface.fillStyle(0x171620, 0.98);
        neutralSurface.lineStyle(3, 0x9b7a4f, 1);
        neutralSurface.fillRoundedRect(-61, -67, 122, 134, 16);
        neutralSurface.strokeRoundedRect(-54, -59, 108, 118, 12);
        neutralSurface.lineStyle(2, 0x4b3b55, 0.95);
        neutralSurface.strokeRoundedRect(-48, -53, 96, 106, 9);
        const highlight = this.add.graphics().setAlpha(0);
        highlight.fillStyle(0x69d878, 0.22);
        highlight.lineStyle(4, 0x8af094, 1);
        highlight.fillRoundedRect(-51, -56, 102, 112, 11);
        highlight.strokeRoundedRect(-51, -56, 102, 112, 11);
        const text = this.add.text(0, 0, `${value}`, {
            resolution: 2, fontFamily: 'Georgia, serif',
            fontSize: '35px',
            fontStyle: 'bold',
            color: '#f8edce',
            stroke: '#17101b',
            strokeThickness: 5,
        }).setOrigin(0.5);
        neutralSurface.setScale(0.78, 1); highlight.setScale(0.78, 1);
        root.add([neutralSurface, highlight, text]);
        root.setSize(100, 134).setInteractive({ useHandCursor: true });
        root.on('pointerover', () => {
            if (this.phase === 'selecting') text.setY(-4);
        });
        root.on('pointerout', () => text.setY(0));
        root.on('pointerdown', () => {
            if (this.phase === 'selecting') text.setY(2);
        });
        root.on('pointerup', () => {
            text.setY(0);
            this.toggleNumber(index);
        });
        return { value, root, text, highlight };
    }

    private toggleNumber(value: number): void {
        if (this.phase !== 'selecting') return;
        const selectedIndex = this.selectedValues.indexOf(value);
        if (selectedIndex >= 0) {
            this.selectedValues.splice(selectedIndex, 1);
        } else if (this.selectedValues.length < 3) {
            this.selectedValues.push(value);
        }
        this.renderSelection();

        if (this.selectedValues.length === 3) {
            this.phase = 'checking';
            this.time.delayedCall(280, () => this.checkSelection());
        }
    }

    private renderSelection(): void {
        this.puzzleInstance.state.selection = [...this.selectedValues];
        if (!this.testMode) GameStateManager.getInstance().save();
        this.nodeTexts.forEach((text, index) => {
            text.setText(this.selectedValues[index] === undefined ? '?' : String(this.puzzleInstance.payload.values[this.selectedValues[index]]));
        });
        this.options.forEach((option, index) => {
            const selected = this.selectedValues.includes(index);
            option.highlight.setAlpha(selected ? 1 : 0);
            option.text
                .setAlpha(1)
                .setColor(selected ? '#b9ffc0' : '#f8edce');
        });
    }

    private checkSelection(): void {
        const sum = this.selectedValues.reduce((total, value) => total + this.puzzleInstance.payload.values[value], 0);
        recordPuzzleAnswer(this.puzzleInstance, sum === this.puzzleInstance.payload.target, false, this.testMode ? null : GameStateManager.getInstance().getPlayer());
        if (!this.testMode) GameStateManager.getInstance().save();
        if (sum === this.puzzleInstance.payload.target) {
            sfx(this, 'math.correct');
            this.setTitle('SPRÁVNĚ!').setColor('#9cf0a1');
            this.nodeTexts.forEach((text) => text.setColor('#9cf0a1'));
            this.options.forEach((option) => option.root.disableInteractive());
            this.tweens.add({
                targets: this.nodeTexts,
                scale: 1.13,
                duration: 220,
                yoyo: true,
                ease: 'Back.easeOut',
            });
            this.time.delayedCall(650, () => this.enableCrystal());
            return;
        }

        sfx(this, 'math.retry');
        this.setTitle('ZKUS TO ZNOVU').setColor('#ffd083');
        this.tweens.add({
            targets: this.nodeTexts,
            x: '+=8',
            duration: 55,
            yoyo: true,
            repeat: 4,
        });
        this.time.delayedCall(800, () => {
            this.selectedValues = [];
            this.phase = 'selecting';
            this.setTitle('VYBER 3 ČÍSLA').setColor('#fff0bd');
            this.renderSelection();
        });
    }

    private createCrystal(): void {
        const host = this.getHost('machineCrystalHost', { x: 210, y: 578, depth: 76 });
        const cover = this.add.graphics().setDepth(host.depth - 1);
        cover.fillStyle(0x171822, 0.98);
        cover.lineStyle(3, 0x775735, 0.95);
        cover.fillRoundedRect(host.x - 60, host.y - 108, 120, 198, 28);
        cover.strokeRoundedRect(host.x - 60, host.y - 108, 120, 198, 28);

        this.crystalRoot = this.add.container(host.x, host.y).setDepth(host.depth);
        this.crystalImage = waterArtwork(this, this.depthCrystal ? 'underwater-depth-crystal' : 'forest-crystal-story',
            { x: 0, y: 0, width: 150, height: 150 });
        this.crystalRoot.setName('machineLooseCrystal');
        this.crystalRoot.add(this.crystalImage);
        this.crystalRoot.setSize(110, 160);
    }

    private enableCrystal(): void {
        this.phase = 'calibrated';
        voice(this, 'vo.machine.crystal');
        this.setTitle('KLIKNI NA KRYSTAL').setColor('#fff0bd');
        this.crystalRoot.setInteractive({ useHandCursor: true });
        this.tweens.add({
            targets: this.crystalRoot,
            scale: 1.07,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.crystalRoot.once('pointerup', () => this.selectCrystal());
    }

    private createQuestSlot(): void {
        this.questSlotHost = this.depthCrystal ? waterHost(this.sceneBuilder, 'machineDepthSlotHost')
            : this.getHost('machineQuestSlotHost', { x: 450, y: 155, depth: 72 });
        if (this.depthCrystal) {
            // Reuse a frame of the canonical machine artwork at its original aspect.
            // These are texture-frame coordinates, not scene layout coordinates.
            const texture = this.textures.get('zyx-crystal-machine-bg');
            if (!texture.has('open-crystal-socket')) texture.add('open-crystal-socket', 0, 384, 86, 132, 158);
            const host = waterHost(this.sceneBuilder, 'machineDepthSlotHost');
            const opening = this.add.image(host.x, host.y, 'zyx-crystal-machine-bg', 'open-crystal-socket')
                .setDepth(host.depth - 1).setData('waterArtwork', true).setName('machineSecondSocketArt');
            opening.setScale(Math.min(host.width / opening.width, host.height / opening.height));
        }
        this.questSlotGlow = this.add.ellipse(
            this.questSlotHost.x,
            this.questSlotHost.y,
            125,
            164,
            this.depthCrystal ? 0x64dce8 : 0x64e879,
            0.14
        ).setStrokeStyle(4, this.depthCrystal ? 0x8cedff : 0x8cff9a, 0.9)
            .setDepth(this.questSlotHost.depth)
            .setAlpha(0);
        this.questSlotZone = this.add.container(this.questSlotHost.x, this.questSlotHost.y)
            .setDepth(this.questSlotHost.depth + 2)
            .setSize(140, 180).setName('machineCrystalSocket');
    }

    private createInstalledForestCrystal(): void {
        if (!GameStateManager.getInstance().getPlayer().storyProgress?.hasInstalledForestCrystal
            && !GameStateManager.getInstance().isPreviewActive()) return;
        waterArtwork(this, 'forest-crystal-story', waterHost(this.sceneBuilder, 'machineForestInstalledHost'))
            .setName('installedForestCrystal');
    }

    private selectCrystal(): void {
        if (this.phase !== 'calibrated') return;
        this.phase = 'crystal-selected';
        this.tweens.killTweensOf(this.crystalRoot);
        this.crystalRoot.setScale(1.08).disableInteractive();
        if (!this.depthCrystal) voice(this, 'vo.machine.slot');
        sfx(this, 'puzzle.place');
        this.setTitle(this.depthCrystal ? 'VLOŽ KRYSTAL' : 'KLIKNI NA ZELENÉ MÍSTO');
        this.questSlotGlow.setAlpha(1);
        this.tweens.add({
            targets: this.questSlotGlow,
            scale: 1.08,
            alpha: 0.42,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.questSlotZone.setInteractive({ useHandCursor: true });
        this.questSlotZone.once('pointerup', () => this.insertCrystal());
    }

    private insertCrystal(): void {
        if (this.phase !== 'crystal-selected') return;
        this.phase = 'ready';
        this.questSlotZone.disableInteractive();
        this.tweens.killTweensOf(this.questSlotGlow);
        this.questSlotGlow.setAlpha(0.5).setScale(1);
        this.tweens.add({
            targets: this.crystalRoot,
            x: this.questSlotHost.x,
            y: this.questSlotHost.y,
            scale: 0.82,
            duration: 750,
            ease: 'Cubic.easeInOut',
            onComplete: () => {
                voice(this, 'vo.machine.activate');
                this.setTitle('AKTIVUJ STROJ');
                this.setActionEnabled(true);
            },
        });
    }

    private createActionButton(): void {
        const host = this.getHost('machineActionHost', { x: 1095, y: 598, depth: 85 });
        this.actionRoot = this.add.container(host.x, host.y).setDepth(host.depth);
        this.actionSurface = this.add.container(0, 0);
        this.actionHighlight = this.add.graphics().setAlpha(0);
        this.actionHighlight.fillStyle(0x72df87, 0.14);
        this.actionHighlight.lineStyle(3, 0x8ff29d, 0.9);
        this.actionHighlight.fillRoundedRect(-80, -34, 196, 68, 20);
        this.actionHighlight.strokeRoundedRect(-80, -34, 196, 68, 20);
        this.actionLabel = this.add.text(18, 1, 'AKTIVOVAT', {
            resolution: 2, fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#e7d6aa',
            stroke: '#1a1010',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this.actionSurface.add([this.actionHighlight, this.actionLabel]);
        this.actionRoot.add(this.actionSurface);
        this.actionRoot.setSize(238, 72);
        this.setActionEnabled(false);
    }

    private setActionEnabled(enabled: boolean): void {
        this.actionEnabled = enabled;
        this.actionRoot.setAlpha(enabled ? 1 : 0.42);
        if (!enabled) {
            this.actionRoot.disableInteractive();
            return;
        }

        this.actionRoot.setInteractive({ useHandCursor: true });
        this.actionRoot.removeAllListeners();
        this.actionRoot.on('pointerover', () => {
            this.actionSurface.setY(-3);
            this.actionHighlight.setAlpha(1);
        });
        this.actionRoot.on('pointerout', () => {
            this.actionSurface.setY(0);
            this.actionHighlight.setAlpha(0);
        });
        this.actionRoot.on('pointerdown', () => this.actionSurface.setY(2));
        this.actionRoot.on('pointerup', () => {
            this.actionSurface.setY(-3);
            if (!this.actionEnabled) return;
            if (this.phase === 'ready') this.activateMachine();
            else if (this.phase === 'activated') this.leaveMachine();
        });
    }

    private activateMachine(): void {
        if (this.phase !== 'ready' || !this.puzzleInstance.completed) return;
        if (this.depthCrystal && !this.testMode) {
            const game = GameStateManager.getInstance(), coop = CoopSessionManager.getInstance();
            const worldPlayer = game.getPlayer();
            if (!installDepthCrystal(worldPlayer)) return;
            if (coop.isCoopActive()) coop.forBothPlayers(() => installDepthCrystal(game.getPlayer(), worldPlayer));
            else game.save();
        }
        this.setActionEnabled(false);
        this.phase = 'activated';
        if (!this.depthCrystal) voice(this, 'vo.machine.done');
        sfx(this, 'machine.activate');
        this.setTitle(this.depthCrystal ? '2 ZE 3 HOTOVO!' : '1 ZE 3 HOTOVO!').setColor('#9cf0a1');
        this.actionLabel.setText('VEN');
        this.questSlotGlow.setAlpha(0.65);

        if (!this.testMode && !this.depthCrystal) {
            StorySystem.getInstance().setFlag('hasInstalledForestCrystal');
        }

        const energyDots: Phaser.GameObjects.Arc[] = [];
        for (let index = 0; index < 12; index++) {
            const dot = this.add.circle(270, 352, 5, index % 2 ? 0x8ff3a0 : 0x83e8ff, 0)
                .setDepth(82);
            energyDots.push(dot);
            this.tweens.add({
                targets: dot,
                x: 1140,
                alpha: { from: 0, to: 0.9 },
                duration: 900,
                delay: index * 65,
                ease: 'Sine.easeInOut',
                onComplete: () => dot.destroy(),
            });
        }

        this.time.delayedCall(1250, () => this.setActionEnabled(true));
    }

    private leaveMachine(): void {
        this.setActionEnabled(false);
        this.cameras.main.fadeOut(350, 16, 11, 26);
        this.time.delayedCall(360, () => {
            this.scene.start('ZyxRocketInterludeScene', {
                testMode: this.testMode,
                machineCompleted: true,
                crystal: this.depthCrystal ? 'depth' : 'forest',
            });
        });
    }
}

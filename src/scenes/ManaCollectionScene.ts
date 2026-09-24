import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ManaSystem } from '../systems/ManaSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ManaPlayerLane, PlayerLaneConfig } from '../ui/ManaPlayerLane';
import { manaForCorrectAnswers } from '../systems/ManaCollectionRewards';
import { sfx } from '../audio/AudioDirector';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { SaveSlotData } from '../types';

/**
 * ManaCollectionScene — falling-text math puzzle for mana collection.
 *
 * In single-player: one full-width channel (same as original).
 * In co-op: split-screen with two side-by-side lanes, one per player.
 */

const MAX_LIVES = 3;

// Original single-player channel constants (used for SceneBuilder fallbacks)
const CHANNEL_LEFT = 300;
const CHANNEL_RIGHT = 900;
const CHANNEL_TOP = 80;
const CHANNEL_BOTTOM = 560;
const LEFT_NUM_X = CHANNEL_LEFT - 40;
const RIGHT_NUM_X = CHANNEL_RIGHT + 40;
const PROBLEM_X = (CHANNEL_LEFT + CHANNEL_RIGHT) / 2;
const NEXT_PREVIEW_X = 1100;
const NEXT_PREVIEW_Y = 180;

type ManaPopupHostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

type LaneBaseConfig = Omit<PlayerLaneConfig, 'titleWidth' | 'headerDepth' | 'scoreX' | 'scoreY'
    | 'gainX' | 'gainY' | 'gainDepth' | 'buttonDepth' | 'buttonWidth' | 'buttonHeight' | 'onScoreChanged'
    | 'livesDepth' | 'manaDepth' | 'scoreDepth' | 'previewDepth'>;

// Co-op lane configs
const LANE_A_CONFIG: LaneBaseConfig = {
    channelLeft: 110,
    channelRight: 520,
    channelTop: CHANNEL_TOP,
    channelBottom: CHANNEL_BOTTOM,
    leftNumX: 80,
    rightNumX: 550,
    problemX: 315,
    nextPreviewX: 570,
    nextPreviewY: 180,
    heartsX: 70,
    heartsY: 45,
    titleX: 315,
    titleY: 30,
    manaX: 550,
    manaY: 45,
    buttonX: 315,
    buttonY: 630,
    playerLabel: '',
    playerIdentifier: 'A',
    rewardMode: 'shared',
    resolveKey: 'X',
    fontScale: 0.85,
};

const LANE_B_CONFIG: LaneBaseConfig = {
    channelLeft: 750,
    channelRight: 1160,
    channelTop: CHANNEL_TOP,
    channelBottom: CHANNEL_BOTTOM,
    leftNumX: 720,
    rightNumX: 1190,
    problemX: 955,
    nextPreviewX: 1210,
    nextPreviewY: 180,
    heartsX: 710,
    heartsY: 45,
    titleX: 955,
    titleY: 30,
    manaX: 1190,
    manaY: 45,
    buttonX: 955,
    buttonY: 630,
    playerLabel: '',
    playerIdentifier: 'B',
    rewardMode: 'shared',
    resolveKey: 'M',
    fontScale: 0.85,
};

export class ManaCollectionScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private sceneBuilder!: SceneBuilder;
    private returnScene: string = 'GuildScene';

    private laneA: ManaPlayerLane | null = null;
    private laneB: ManaPlayerLane | null = null;
    private isCoopMode: boolean = false;
    private isGameOverVisible: boolean = false;
    private coopSaveA: SaveSlotData | null = null;
    private coopSaveB: SaveSlotData | null = null;
    private persistCoopPlayerA: (() => void) | null = null;
    private persistCoopPlayerB: (() => void) | null = null;
    private displayedManaReward = 0;

    private introOverlay!: Phaser.GameObjects.Container;
    private gameOverOverlay!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'ManaCollectionScene' });
    }

    init(data: { returnScene?: string }): void {
        this.returnScene = data?.returnScene ?? 'GuildScene';
        this.laneA = null;
        this.laneB = null;
        this.isGameOverVisible = false;
        this.coopSaveA = null;
        this.coopSaveB = null;
        this.persistCoopPlayerA = null;
        this.persistCoopPlayerB = null;
        this.displayedManaReward = 0;
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.isCoopMode = CoopSessionManager.getInstance().isCoopActive();
        this.events.once('shutdown', () => this.cleanupScene());

        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        this.createBackground();

        if (this.isCoopMode) {
            this.coopSaveA = this.getCoopSaveData('A');
            this.coopSaveB = this.getCoopSaveData('B');
            this.createDivider();
        }

        this.showIntroOverlay();
    }

    // ============ BACKGROUND ============

    private createBackground(): void {
        this.add.rectangle(640, 360, 1280, 720, 0x1a150e).setDepth(-10);
        this.add.rectangle(640, 360, 1280, 720, 0x0a0806, 0.4).setDepth(-5);
    }

    // ============ DIVIDER (co-op only) ============

    private createDivider(): void {
        const gfx = this.add.graphics();
        gfx.setDepth(5);
        gfx.lineStyle(2, 0x6b5020, 0.6);
        gfx.lineBetween(640, 0, 640, 720);
    }

    // ============ SINGLE-PLAYER LANE ============

    private createSingleLane(): void {
        const player = this.gameState.getPlayer();
        this.registry.set('playerLevel', player.level);
        const mathEngine = new MathEngine(this.registry);
        const pool = ManaPlayerLane.buildManaPool(mathEngine, this.gameState.getMathStats().masteryData);

        // Lane geometry defaults; laneConfig reads the editable HUD hosts.
        const config: LaneBaseConfig = {
            channelLeft: CHANNEL_LEFT,
            channelRight: CHANNEL_RIGHT,
            channelTop: CHANNEL_TOP,
            channelBottom: CHANNEL_BOTTOM,
            leftNumX: LEFT_NUM_X,
            rightNumX: RIGHT_NUM_X,
            problemX: PROBLEM_X,
            nextPreviewX: NEXT_PREVIEW_X,
            nextPreviewY: NEXT_PREVIEW_Y,
            heartsX: 100,
            heartsY: 37,
            titleX: 640,
            titleY: 34,
            manaX: 1100,
            manaY: 32,
            buttonX: PROBLEM_X,
            buttonY: 683,
            playerLabel: player.name || 'Dobrodruh',
            playerIdentifier: 'A',
            fontScale: 1.0,
        };

        this.laneA = new ManaPlayerLane(this, this.laneConfig(config, 'solo'), mathEngine, this.gameState, pool, () => this.onLaneDead());
    }

    // ============ CO-OP LANES ============

    private createCoopLanes(): void {
        const saveA = this.coopSaveA ?? this.getCoopSaveData('A');
        const saveB = this.coopSaveB ?? this.getCoopSaveData('B');
        const coop = CoopSessionManager.getInstance();
        const slotA = coop.getPlayerASlotIndex();
        const slotB = coop.getPlayerBSlotIndex();
        const masteryA = coop.getPlayerAMasteryData() ?? saveA?.mathStats.masteryData;
        const masteryB = coop.getPlayerBMasteryData() ?? saveB?.mathStats.masteryData;

        this.coopSaveA = saveA;
        this.coopSaveB = saveB;

        const mathEngineA = new MathEngine(this.registry, {
            fixedLevel: saveA?.player.level ?? 1,
            initialStats: saveA?.mathStats,
            autoPersist: false,
        });
        const mathEngineB = new MathEngine(this.registry, {
            fixedLevel: saveB?.player.level ?? 1,
            initialStats: saveB?.mathStats,
            autoPersist: false,
        });
        const poolA = ManaPlayerLane.buildManaPool(mathEngineA, masteryA);
        const poolB = ManaPlayerLane.buildManaPool(mathEngineB, masteryB);

        this.persistCoopPlayerA = () => {
            if (!saveA || slotA < 0) return;
            const stats = mathEngineA.getStats();
            if (masteryA) stats.masteryData = masteryA;
            saveA.mathStats = stats;
            SaveSystem.save(slotA, saveA.player, stats);
        };
        this.persistCoopPlayerB = () => {
            if (!saveB || slotB < 0) return;
            const stats = mathEngineB.getStats();
            if (masteryB) stats.masteryData = masteryB;
            saveB.mathStats = stats;
            SaveSystem.save(slotB, saveB.player, stats);
        };

        this.laneA = new ManaPlayerLane(
            this,
            this.laneConfig({ ...LANE_A_CONFIG, playerLabel: saveA?.player.name || 'Dobrodruh' }, 'A'),
            mathEngineA,
            this.gameState,
            poolA,
            () => this.onLaneDead(),
            {
                playerState: saveA?.player,
                masteryData: masteryA,
                persistProgress: this.persistCoopPlayerA,
            },
        );
        this.laneB = new ManaPlayerLane(
            this,
            this.laneConfig({ ...LANE_B_CONFIG, playerLabel: saveB?.player.name || 'Dobrodruh' }, 'B'),
            mathEngineB,
            this.gameState,
            poolB,
            () => this.onLaneDead(),
            {
                playerState: saveB?.player,
                masteryData: masteryB,
                persistProgress: this.persistCoopPlayerB,
            },
        );
    }

    private laneConfig(base: LaneBaseConfig, id: 'solo' | 'A' | 'B'): PlayerLaneConfig {
        const title = this.getPopupHost(`manaLane${id}TitleHost`, { x: base.titleX, y: 34, width: 280, height: 48, depth: 10 });
        const lives = this.getPopupHost(`manaLane${id}LivesHost`, { x: base.heartsX, y: 37, width: 112, height: 40, depth: 10 });
        const mana = this.getPopupHost(`manaLane${id}ManaHost`, { x: base.manaX, y: 32, width: 100, height: 46, depth: 10 });
        const score = this.getPopupHost(`manaLane${id}ScoreHost`, { x: base.manaX, y: 66, width: 100, height: 26, depth: 10 });
        const preview = this.getPopupHost(`manaLane${id}NextHost`, { x: base.nextPreviewX, y: base.nextPreviewY, width: 130, height: 70, depth: 10 });
        const gain = this.getPopupHost(`manaLane${id}GainHost`, { x: base.problemX, y: 602, width: 200, height: 96, depth: 30 });
        const button = this.getPopupHost(`manaLane${id}ButtonHost`, { x: base.buttonX, y: 683, width: 220, height: 56, depth: 20 });
        return { ...base, titleX: title.x, titleY: title.y, titleWidth: title.width, headerDepth: title.depth,
            heartsX: lives.x, heartsY: lives.y, livesDepth: lives.depth, manaX: mana.x, manaY: mana.y, manaDepth: mana.depth,
            scoreX: score.x, scoreY: score.y, scoreDepth: score.depth, gainX: gain.x, gainY: gain.y, gainDepth: gain.depth,
            nextPreviewX: preview.x, nextPreviewY: preview.y, previewDepth: preview.depth,
            buttonX: button.x, buttonY: button.y, buttonDepth: button.depth, buttonWidth: button.width, buttonHeight: button.height,
            onScoreChanged: () => this.updateManaReward() };
    }

    private updateManaReward(): void {
        const correct = (this.laneA?.getResults().correctCount ?? 0) + (this.laneB?.getResults().correctCount ?? 0);
        const reward = manaForCorrectAnswers(correct);
        this.laneA?.setManaReward(reward);
        this.laneB?.setManaReward(reward);
        if (reward > this.displayedManaReward) sfx(this, 'mana.collect');
        this.displayedManaReward = reward;
    }

    // ============ GAME OVER LOGIC ============

    private onLaneDead(): void {
        if (this.isGameOverVisible) {
            return;
        }

        if (this.isCoopMode) {
            if (this.laneA && !this.laneA.isAlive() && this.laneB && !this.laneB.isAlive()) {
                // Both dead — show full game-over overlay
                this.showGameOver();
            } else {
                // One lane dead, other continues — show "Konec!" on the dead lane
                if (this.laneA && !this.laneA.isAlive()) this.laneA.showLaneFinished();
                if (this.laneB && !this.laneB.isAlive()) this.laneB.showLaneFinished();
            }
        } else {
            this.showGameOver();
        }
    }

    // ============ INTRO OVERLAY ============

    private showIntroOverlay(): void {
        this.introOverlay = this.popupRoot('manaIntroPopupHost', 'manaIntroOverlay');
        this.popupText(this.introOverlay, 'manaIntroTitleHost', 'Sbírání many', 30, '#f7d57b');
        this.popupText(this.introOverlay, 'manaIntroObjectiveHost', 'Zastav u výsledku', 24, '#b6f5ff');
        this.showIntroDemo();
        if (this.isCoopMode) {
            this.popupText(this.introOverlay, 'manaIntroPlayerAHost', `${this.coopSaveA?.player.name || 'Dobrodruh'} · X`, 23);
            this.popupText(this.introOverlay, 'manaIntroPlayerBHost', `${this.coopSaveB?.player.name || 'Dobrodruh'} · M`, 23);
        } else {
            this.popupText(this.introOverlay, 'manaIntroLivesHost', Array(MAX_LIVES).fill('♥').join('  '), 30, '#ef7777');
        }
        const back = this.createPopupButton(this.popupHost('manaIntroBackHost'), 'ZPĚT', 0x8a755f, true,
            () => this.scene.start(this.returnScene));
        const play = this.createPopupButton(this.popupHost('manaIntroPlayHost'), 'HRÁT', 0x5ee6ef, true,
            () => this.startGame());
        this.introOverlay.add([back.root, play.root]);
    }

    /** A silent demonstration: wait on a floor, step to 2, stop, then receive mana. */
    private showIntroDemo(): void {
        const host = this.popupHost('manaIntroDemoHost');
        const demo = this.add.container(host.x, host.y).setDepth(host.depth).setName('manaIntroDemo');
        this.introOverlay.add(demo);
        const top = -host.height / 2 + 20, step = 65, targetY = top + step;
        const edge = host.width / 2 - 28;
        const board = this.add.graphics().fillStyle(0x102936, 0.95)
            .fillRoundedRect(-host.width / 2, -host.height / 2, host.width, host.height - 44, 14)
            .lineStyle(2, 0x7b8d7b).strokeRoundedRect(-host.width / 2, -host.height / 2, host.width, host.height - 44, 14);
        const row = this.add.rectangle(0, targetY, host.width - 4, 54, 0x4bb88e, 0).setName('manaDemoCorrectRow');
        demo.add([board, row]);
        for (const [i, value] of [3, 2, 4].entries()) {
            for (const x of [-edge, edge]) demo.add(this.add.text(x, top + i * step, `${value}`, {
                resolution: 2, fontFamily: 'Arial', fontSize: '28px', color: '#e2dabd', fontStyle: 'bold',
            }).setOrigin(0.5));
        }
        const equation = this.add.text(0, top, '1 + 1', { resolution: 2, fontFamily: 'Arial',
            fontSize: '32px', fontStyle: 'bold', color: '#fff5cf', backgroundColor: '#314149', padding: { x: 12, y: 4 } }).setOrigin(0.5);
        const stopY = host.height / 2 - 8;
        const stop = this.add.rectangle(0, stopY, 168, 46, 0x203c49).setStrokeStyle(2, 0x81cfdb);
        const stopText = this.add.text(0, stopY, 'Zastav', { resolution: 2, fontFamily: 'Arial',
            fontSize: '23px', fontStyle: 'bold', color: '#e3faff' }).setOrigin(0.5);
        const touch = this.add.circle(0, stopY, 27, 0x91f4ff, 0).setStrokeStyle(3, 0x91f4ff).setAlpha(0);
        demo.add([equation, stop, stopText, touch]);
        const rewardHost = this.popupHost('manaIntroRewardHost');
        const reward = this.add.container(rewardHost.x, rewardHost.y).setDepth(rewardHost.depth).setAlpha(0).setName('manaIntroReward');
        const icon = this.add.image(0, -22, 'mana-icon');
        icon.setScale(Math.min(90 / icon.width, 90 / icon.height));
        reward.add([icon, this.add.text(0, 45, '+1', { resolution: 2, fontFamily: 'Arial',
            fontSize: '42px', fontStyle: 'bold', color: '#c4f8ff' }).setOrigin(0.5)]);
        this.introOverlay.add(reward);
        let stepTimer: Phaser.Time.TimerEvent | undefined;
        let stopTimer: Phaser.Time.TimerEvent | undefined;
        const play = () => {
            stepTimer?.remove(false); stopTimer?.remove(false);
            this.tweens.killTweensOf([equation, touch, reward]);
            equation.setY(top).setColor('#fff5cf'); row.setFillStyle(0x4bb88e, 0);
            reward.setAlpha(0).setScale(1); touch.setAlpha(0).setScale(1);
            stepTimer = this.time.delayedCall(1400, () => {
                equation.setY(targetY);
                stopTimer = this.time.delayedCall(600, () => {
                    row.setFillStyle(0x4bb88e, 0.5); equation.setColor('#adffd1'); touch.setAlpha(1); reward.setAlpha(1);
                    this.tweens.add({ targets: touch, scale: 1.25, alpha: 0, duration: 450 });
                    this.tweens.add({ targets: reward, scale: 1.1, duration: 240, yoyo: true });
                });
            });
        };
        const repeat = this.time.addEvent({ delay: 3800, loop: true, callback: play });
        this.introOverlay.once('destroy', () => {
            repeat.remove(false); stepTimer?.remove(false); stopTimer?.remove(false);
            this.tweens.killTweensOf([equation, touch, reward]);
        });
        play();
    }

    // ============ START GAME ============

    private startGame(): void {
        this.ensureLanesCreated();
        this.introOverlay.destroy();

        this.laneA!.startGame();
        if (this.laneB) {
            this.laneB.startGame();
        }
    }

    // ============ GAME OVER ============

    private showGameOver(): void {
        if (this.isGameOverVisible) {
            return;
        }
        this.isGameOverVisible = true;

        // Stop any remaining lane activity
        this.laneA?.stopGame();
        this.laneB?.stopGame();

        const resultsA = this.laneA!.getResults();
        const resultsB = this.laneB?.getResults();
        const combinedCorrect = this.isCoopMode && resultsB ? resultsA.correctCount + resultsB.correctCount : resultsA.correctCount;
        const earnedManaA = manaForCorrectAnswers(combinedCorrect);
        const sharedManaReward = earnedManaA;

        // Mana is awarded only from the minigame score, never from study-progress thresholds.
        if (this.isCoopMode && resultsB) {
            if (sharedManaReward > 0 && this.coopSaveA?.player) {
                ManaSystem.add(this.coopSaveA.player, sharedManaReward);
            }
            if (sharedManaReward > 0 && this.coopSaveB?.player) {
                ManaSystem.add(this.coopSaveB.player, sharedManaReward);
            }
            this.persistCoopPlayerA?.();
            this.persistCoopPlayerB?.();
            // The lane engines save independently; reload the active slot before
            // applying mastery rewards so an older in-memory state cannot replace it.
            this.syncActiveCoopPlayerState();
            CoopSessionManager.getInstance().applyAndPersistMasteryProgress();
        } else {
            if (earnedManaA > 0) {
                const player = this.gameState.getPlayer();
                ManaSystem.add(player, earnedManaA);
                this.gameState.save();
            }
        }

        this.gameOverOverlay = this.popupRoot('manaResultsPopupHost', 'manaResultsOverlay');
        this.popupText(this.gameOverOverlay, 'manaResultsTitleHost', 'Nasbíráno', 30, '#f7d57b');
        if (this.isCoopMode && resultsB) {
            this.createResultCard('A', this.coopSaveA?.player.name || 'Dobrodruh', resultsA.correctCount, earnedManaA);
            this.createResultCard('B', this.coopSaveB?.player.name || 'Dobrodruh', resultsB.correctCount, sharedManaReward);
        } else {
            this.createResultCard('solo', this.gameState.getPlayer().name || 'Dobrodruh', resultsA.correctCount, earnedManaA);
        }
        const button = this.createPopupButton(this.popupHost('manaResultsContinueHost'), 'POKRAČOVAT', 0x5ee6ef, true, () => {
            if (this.isCoopMode) this.syncActiveCoopPlayerState();
            else this.gameState.save();
            this.scene.start(this.returnScene);
        });
        this.gameOverOverlay.add(button.root);
    }

    private createResultCard(id: string, name: string, correct: number, mana: number): void {
        const root = this.gameOverOverlay;
        const card = this.popupHost(`manaResult${id}CardHost`);
        const background = this.add.graphics().setDepth(card.depth).fillStyle(0x15303d, 0.66)
            .fillRoundedRect(card.x - card.width / 2, card.y - card.height / 2, card.width, card.height, 18)
            .lineStyle(1, 0x809580, 0.65).strokeRoundedRect(card.x - card.width / 2, card.y - card.height / 2, card.width, card.height, 18);
        root.add(background);
        this.popupText(root, `manaResult${id}NameHost`, name, 30, '#f7d57b');
        const check = this.popupHost(`manaResult${id}CorrectIconHost`);
        const radius = Math.min(check.width, check.height) / 2;
        const mark = this.add.graphics().setPosition(check.x, check.y).setDepth(check.depth)
            .fillStyle(0x235d48).fillCircle(0, 0, radius)
            .lineStyle(3, 0x8de7b1).strokeCircle(0, 0, radius)
            .lineStyle(9, 0xc6ffd8).beginPath().moveTo(-radius * 0.5, 0).lineTo(-radius * 0.13, radius * 0.36)
            .lineTo(radius * 0.52, -radius * 0.4).strokePath().setName(`manaResult${id}CorrectIcon`);
        root.add(mark);
        this.popupText(root, `manaResult${id}CorrectValueHost`, `${correct}`, 60, '#c6ffd8');
        const iconHost = this.popupHost(`manaResult${id}ManaIconHost`);
        const icon = this.add.image(iconHost.x, iconHost.y, 'mana-icon').setDepth(iconHost.depth).setName(`manaResult${id}ManaIcon`);
        icon.setScale(Math.min(iconHost.width / icon.width, iconHost.height / icon.height));
        root.add(icon);
        this.popupText(root, `manaResult${id}ManaValueHost`, `+${mana}`, 60, '#baf5ff');
    }

    private popupRoot(hostId: string, name: string): Phaser.GameObjects.Container {
        const host = this.popupHost(hostId);
        const root = this.add.container(0, 0).setDepth(host.depth).setName(name);
        const backdrop = this.add.rectangle(640, 360, 1280, 720, 0x02070d, 0.85).setInteractive();
        const frame = this.add.image(host.x, host.y, 'mana-popup-frame-v2');
        frame.setScale(Math.min(host.width / frame.width, host.height / frame.height));
        root.add([backdrop, frame]);
        return root;
    }

    private popupText(root: Phaser.GameObjects.Container, id: string, label: string, size: number, color = '#e8dfce'): Phaser.GameObjects.Text {
        const host = this.popupHost(id);
        const text = this.add.text(host.x, host.y, label, { resolution: 2, fontFamily: 'Arial, sans-serif',
            fontSize: `${size}px`, fontStyle: 'bold', align: 'center', color }).setOrigin(0.5).setName(id).setDepth(host.depth);
        this.fitTextToHost(text, host);
        root.add(text);
        return text;
    }

    private popupHost(id: string): ManaPopupHostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const def = this.sceneBuilder.getElementDef(id);
        if (!object || !def?.width || !def.height) throw new Error(`Missing mana host: ${id}`);
        return { x: object.x, y: object.y, depth: object.depth, width: def.width, height: def.height };
    }

    private getPopupHost(id: string, fallback: ManaPopupHostLayout): ManaPopupHostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<ManaPopupHostLayout> | undefined;
        return {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
    }

    private fitTextToHost(text: Phaser.GameObjects.Text, host: ManaPopupHostLayout): void {
        let size = Number.parseInt(String(text.style.fontSize), 10);
        while ((text.width > host.width || text.height > host.height) && size > 16) text.setFontSize(--size);
        if (text.width > host.width) text.setWordWrapWidth(host.width);
    }

    private createPopupButton(
        host: ManaPopupHostLayout,
        label: string,
        accent: number,
        enabled: boolean,
        onClick: () => void,
    ): MedievalActionButton {
        return new MedievalActionButton(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            width: host.width,
            height: host.height,
            label,
            labelFontSize: 18,
            labelMaxWidth: host.width * 0.76,
            labelMaxHeight: host.height * 0.48,
            accent,
            layout: 'text',
            enabled,
            onClick,
        });
    }

    private cleanupScene(): void {
        this.laneA?.destroy();
        this.laneB?.destroy();
        this.laneA = null;
        this.laneB = null;
        this.coopSaveA = null;
        this.coopSaveB = null;
        this.persistCoopPlayerA = null;
        this.persistCoopPlayerB = null;

        if (this.introOverlay?.active) {
            this.introOverlay.destroy();
        }
        if (this.gameOverOverlay?.active) {
            this.gameOverOverlay.destroy();
        }

        this.isGameOverVisible = false;
    }

    private getCoopSaveData(playerId: 'A' | 'B'): SaveSlotData | null {
        const coop = CoopSessionManager.getInstance();
        const slotIndex = playerId === 'A' ? coop.getPlayerASlotIndex() : coop.getPlayerBSlotIndex();
        if (slotIndex < 0) {
            return null;
        }
        return SaveSystem.load(slotIndex);
    }

    private syncActiveCoopPlayerState(): void {
        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) {
            return;
        }

        const activeSlotIndex = coop.getActivePlayer() === 'A'
            ? coop.getPlayerASlotIndex()
            : coop.getPlayerBSlotIndex();

        if (activeSlotIndex >= 0) {
            this.gameState.loadSlot(activeSlotIndex);
        }
    }

    private ensureLanesCreated(): void {
        if (this.laneA) {
            return;
        }

        if (this.isCoopMode) {
            this.createCoopLanes();
        } else {
            this.createSingleLane();
        }
    }
}

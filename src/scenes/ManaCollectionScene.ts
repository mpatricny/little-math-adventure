import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ManaSystem } from '../systems/ManaSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ManaPlayerLane, PlayerLaneConfig } from '../ui/ManaPlayerLane';
import { SaveSlotData } from '../types';

/**
 * ManaCollectionScene — falling-text math puzzle for mana collection.
 *
 * In single-player: one full-width channel (same as original).
 * In co-op: split-screen with two side-by-side lanes, one per player.
 */

const PLAY_COST = 3;
const MAX_LIVES = 3;
const BONUS_MANA_INTERVAL = 5;

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

// Co-op lane configs
const LANE_A_CONFIG: PlayerLaneConfig = {
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
    playerLabel: 'Hráč 1',
    playerIdentifier: 'A',
    resolveKey: 'X',
    fontScale: 0.85,
};

const LANE_B_CONFIG: PlayerLaneConfig = {
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
    playerLabel: 'Hráč 2',
    playerIdentifier: 'B',
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

        // Read positions from SceneBuilder (same as original code)
        const livesEl = this.sceneBuilder.get('livesDisplay');
        const titleEl = this.sceneBuilder.get('title');
        const manaEl = this.sceneBuilder.get('manaDisplay');
        const btnEl = this.sceneBuilder.get('resolveButton');

        const config: PlayerLaneConfig = {
            channelLeft: CHANNEL_LEFT,
            channelRight: CHANNEL_RIGHT,
            channelTop: CHANNEL_TOP,
            channelBottom: CHANNEL_BOTTOM,
            leftNumX: LEFT_NUM_X,
            rightNumX: RIGHT_NUM_X,
            problemX: PROBLEM_X,
            nextPreviewX: NEXT_PREVIEW_X,
            nextPreviewY: NEXT_PREVIEW_Y,
            heartsX: (livesEl as any)?.x ?? 100,
            heartsY: (livesEl as any)?.y ?? 45,
            titleX: (titleEl as any)?.x ?? 640,
            titleY: (titleEl as any)?.y ?? 35,
            manaX: (manaEl as any)?.x ?? 1100,
            manaY: (manaEl as any)?.y ?? 45,
            buttonX: (btnEl as any)?.x ?? PROBLEM_X,
            buttonY: (btnEl as any)?.y ?? CHANNEL_BOTTOM + 60,
            playerLabel: '~ Sbírání many ~',
            playerIdentifier: 'A',
            fontScale: 1.0,
        };

        this.laneA = new ManaPlayerLane(this, config, mathEngine, this.gameState, pool, () => this.onLaneDead());
    }

    // ============ CO-OP LANES ============

    private createCoopLanes(): void {
        const saveA = this.coopSaveA ?? this.getCoopSaveData('A');
        const saveB = this.coopSaveB ?? this.getCoopSaveData('B');
        const coop = CoopSessionManager.getInstance();
        const slotA = coop.getPlayerASlotIndex();
        const slotB = coop.getPlayerBSlotIndex();

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
        const poolA = ManaPlayerLane.buildManaPool(mathEngineA, saveA?.mathStats.masteryData);
        const poolB = ManaPlayerLane.buildManaPool(mathEngineB, saveB?.mathStats.masteryData);

        this.persistCoopPlayerA = () => {
            if (!saveA || slotA < 0) return;
            const stats = mathEngineA.getStats();
            saveA.mathStats = stats;
            SaveSystem.save(slotA, saveA.player, stats);
        };
        this.persistCoopPlayerB = () => {
            if (!saveB || slotB < 0) return;
            const stats = mathEngineB.getStats();
            saveB.mathStats = stats;
            SaveSystem.save(slotB, saveB.player, stats);
        };

        this.laneA = new ManaPlayerLane(
            this,
            LANE_A_CONFIG,
            mathEngineA,
            this.gameState,
            poolA,
            () => this.onLaneDead(),
            {
                playerState: saveA?.player,
                persistProgress: this.persistCoopPlayerA,
                sharedManaRewards: true,
            },
        );
        this.laneB = new ManaPlayerLane(
            this,
            LANE_B_CONFIG,
            mathEngineB,
            this.gameState,
            poolB,
            () => this.onLaneDead(),
            {
                playerState: saveB?.player,
                persistProgress: this.persistCoopPlayerB,
                sharedManaRewards: true,
            },
        );
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
        let canAfford: boolean;

        if (this.isCoopMode) {
            const playerA = this.coopSaveA?.player ?? this.getCoopSaveData('A')?.player;
            const playerB = this.coopSaveB?.player ?? this.getCoopSaveData('B')?.player;
            const canAffordA = ProgressionSystem.getTotalCoinValue(playerA?.coins ?? { copper: 0, silver: 0, gold: 0, pouch: 0 }) >= PLAY_COST;
            const canAffordB = ProgressionSystem.getTotalCoinValue(playerB?.coins ?? { copper: 0, silver: 0, gold: 0, pouch: 0 }) >= PLAY_COST;
            canAfford = canAffordA && canAffordB;
        } else {
            const player = this.gameState.getPlayer();
            canAfford = ProgressionSystem.getTotalCoinValue(player.coins) >= PLAY_COST;
        }

        this.introOverlay = this.add.container(640, 360);
        this.introOverlay.setDepth(100);

        const backdrop = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7);
        backdrop.setInteractive();

        const panel = this.add.rectangle(0, 0, 500, 380, 0x1e1810)
            .setStrokeStyle(3, 0x8b6914);
        const innerPanel = this.add.rectangle(0, 0, 490, 370, 0x000000, 0)
            .setStrokeStyle(1, 0x5a4a2a);

        const titleLabel = this.isCoopMode ? '~ Sbírání many ~ (Co-op)' : '~ Sbírání many ~';
        const title = this.add.text(0, -140, titleLabel, {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const rulesLines = [
            'Příklady padají shora dolů kanálem.',
            'Na stranách jsou čísla — výsledky.',
            this.isCoopMode
                ? 'Levý kanál vyhodnocuje klávesa X, pravý kanál klávesa M.'
                : 'Stiskni VYHODNOTIT ve správný čas,',
            this.isCoopMode
                ? 'Kliknutí zůstává jako záloha, ale hlavní jsou klávesy.'
                : 'aby se příklad zastavil u správného čísla.',
            '',
            `Máš ${MAX_LIVES} životy. Špatná odpověď = -1 ♥`,
            'Příklady se postupně zrychlují!',
        ];

        if (this.isCoopMode) {
            rulesLines.push('', 'Oba hráči hrají současně!');
            rulesLines.push(`Cena: ${PLAY_COST} mincí za hráče`);
        } else {
            rulesLines.push('', `Cena: ${PLAY_COST} mincí`);
        }

        const rules = this.add.text(0, -25, rulesLines.join('\n'), {
            fontSize: '15px',
            fontFamily: 'Arial, sans-serif',
            color: '#b8a88a',
            align: 'center',
            lineSpacing: 4,
        }).setOrigin(0.5);

        // Buttons: ZPĚT | HRÁT
        const btnY = 145;
        const btnGap = 10;
        const backW = 120;
        const playW = 200;
        const totalW = backW + btnGap + playW;
        const startX = -totalW / 2;

        const backBg = this.add.rectangle(startX + backW / 2, btnY, backW, 52, 0x2a1a14)
            .setStrokeStyle(2, 0x5a3a2a);
        const backText = this.add.text(startX + backW / 2, btnY, 'ZPĚT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#9a8a7a',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        backBg.setInteractive({ useHandCursor: true });
        backBg.on('pointerover', () => { backBg.setFillStyle(0x3a2a1e); backText.setColor('#c0b0a0'); });
        backBg.on('pointerout', () => { backBg.setFillStyle(0x2a1a14); backText.setColor('#9a8a7a'); });
        backBg.on('pointerdown', () => this.scene.start(this.returnScene));

        const playColor = canAfford ? 0x2a3a1a : 0x333333;
        const playBg = this.add.rectangle(startX + backW + btnGap + playW / 2, btnY, playW, 52, playColor)
            .setStrokeStyle(3, canAfford ? 0x5a8a2a : 0x555555);
        const playText = this.add.text(startX + backW + btnGap + playW / 2, btnY,
            canAfford ? 'HRÁT' : 'NEDOSTATEK MINCÍ', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: canAfford ? '#a0cc60' : '#666666',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        if (canAfford) {
            playBg.setInteractive({ useHandCursor: true });
            playBg.on('pointerover', () => { playBg.setFillStyle(0x3a4a24); playText.setColor('#c0ee80'); });
            playBg.on('pointerout', () => { playBg.setFillStyle(0x2a3a1a); playText.setColor('#a0cc60'); });
            playBg.on('pointerdown', () => this.startGame());
        }

        this.introOverlay.add([backdrop, panel, innerPanel, title, rules, backBg, backText, playBg, playText]);
    }

    // ============ START GAME ============

    private startGame(): void {
        if (this.isCoopMode) {
            const playerA = this.coopSaveA?.player;
            const playerB = this.coopSaveB?.player;
            if (!playerA || !playerB) {
                return;
            }

            if (!ProgressionSystem.spendCoins(playerA, PLAY_COST) || !ProgressionSystem.spendCoins(playerB, PLAY_COST)) {
                return;
            }
        } else {
            const player = this.gameState.getPlayer();
            if (!ProgressionSystem.spendCoins(player, PLAY_COST)) return;
            this.gameState.save();
        }

        this.ensureLanesCreated();

        if (this.isCoopMode) {
            this.persistCoopPlayerA?.();
            this.persistCoopPlayerB?.();
        }

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
        const combinedProblems = this.isCoopMode && resultsB ? resultsA.problemCount + resultsB.problemCount : resultsA.problemCount;
        const sharedManaReward = this.isCoopMode && resultsB ? Math.floor(combinedCorrect / BONUS_MANA_INTERVAL) : 0;
        const bonusManaA = this.isCoopMode ? sharedManaReward : Math.floor(resultsA.correctCount / BONUS_MANA_INTERVAL);

        // Award bonus mana
        if (this.isCoopMode && resultsB) {
            if (sharedManaReward > 0 && this.coopSaveA?.player) {
                ManaSystem.add(this.coopSaveA.player, sharedManaReward);
            }
            if (sharedManaReward > 0 && this.coopSaveB?.player) {
                ManaSystem.add(this.coopSaveB.player, sharedManaReward);
            }
            this.persistCoopPlayerA?.();
            this.persistCoopPlayerB?.();
        } else {
            if (bonusManaA > 0) {
                const player = this.gameState.getPlayer();
                ManaSystem.add(player, bonusManaA);
                this.gameState.save();
            }
        }

        // Build stats display
        const totalManaA = resultsA.manaEarnedThreshold + bonusManaA;

        this.gameOverOverlay = this.add.container(640, 360);
        this.gameOverOverlay.setDepth(100);

        const backdrop = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7);
        backdrop.setInteractive();

        const panelH = this.isCoopMode ? 420 : 360;
        const panel = this.add.rectangle(0, 0, 500, panelH, 0x1e1810)
            .setStrokeStyle(3, 0x8b6914);
        const innerPanel = this.add.rectangle(0, 0, 490, panelH - 10, 0x000000, 0)
            .setStrokeStyle(1, 0x5a4a2a);

        const title = this.add.text(0, -(panelH / 2 - 40), '~ Konec hry ~', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        let statsLines: string[];

        if (this.isCoopMode && resultsB) {
            statsLines = [
                `Hráč 1 vyřešil správně: ${resultsA.correctCount} / ${resultsA.problemCount}`,
                '',
                `Hráč 2 vyřešil správně: ${resultsB.correctCount} / ${resultsB.problemCount}`,
                '',
                `Dohromady správně: ${combinedCorrect}`,
                `Dohromady odehráno: ${combinedProblems}`,
                `Společná odměna: oba hráči získali ⚡ ${sharedManaReward}`,
            ];
        } else {
            statsLines = [
                `Správně: ${resultsA.correctCount} / ${resultsA.problemCount}`,
                '',
                `Mana ze studijních cílů: ⚡ ${resultsA.manaEarnedThreshold}`,
            ];
            if (bonusManaA > 0) {
                statsLines.push(`Bonusová mana (${resultsA.correctCount} správně): ⚡ +${bonusManaA}`);
            }
            statsLines.push('', `Celkem mana: ⚡ ${totalManaA}`);
        }

        const statsText = this.add.text(0, -10, statsLines.join('\n'), {
            fontSize: '17px',
            fontFamily: 'Arial, sans-serif',
            color: '#b8a88a',
            align: 'center',
            lineSpacing: 5,
        }).setOrigin(0.5);

        const btnY = panelH / 2 - 50;
        const btnBg = this.add.rectangle(0, btnY, 200, 52, 0x2a1f14)
            .setStrokeStyle(3, 0x8b6914);
        const btnText = this.add.text(0, btnY, 'POKRAČOVAT', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on('pointerover', () => { btnBg.setFillStyle(0x3d2e1c); btnText.setColor('#ffe066'); });
        btnBg.on('pointerout', () => { btnBg.setFillStyle(0x2a1f14); btnText.setColor('#d4aa44'); });
        btnBg.on('pointerdown', () => {
            if (this.isCoopMode) {
                this.syncActiveCoopPlayerState();
            } else {
                this.gameState.save();
            }
            this.scene.start(this.returnScene);
        });

        this.gameOverOverlay.add([backdrop, panel, innerPanel, title, statsText, btnBg, btnText]);
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

import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ManaSystem } from '../systems/ManaSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { SaveSystem } from '../systems/SaveSystem';
import { MANA_REWARD_INTERVAL, ManaPlayerLane, PlayerLaneConfig } from '../ui/ManaPlayerLane';
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
    rewardMode: 'shared',
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
            LANE_A_CONFIG,
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
            LANE_B_CONFIG,
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
        const panelHost = this.getPopupHost('manaIntroPopupHost', {
            x: 640, y: 360, width: 620, height: 485, depth: 100,
        });
        const titleHost = this.getPopupHost('manaIntroTitleHost', {
            x: 640, y: 174, width: 410, height: 32, depth: 102,
        });
        const objectiveHost = this.getPopupHost('manaIntroObjectiveHost', {
            x: 640, y: 232, width: 500, height: 48, depth: 102,
        });
        const rulesHost = this.getPopupHost('manaIntroRulesHost', {
            x: 640, y: 332, width: 500, height: 145, depth: 102,
        });
        const rewardHost = this.getPopupHost('manaIntroRewardHost', {
            x: 640, y: 442, width: 500, height: 44, depth: 102,
        });
        const backHost = this.getPopupHost('manaIntroBackHost', {
            x: 505, y: 526, width: 190, height: 62, depth: 103,
        });
        const playHost = this.getPopupHost('manaIntroPlayHost', {
            x: 745, y: 526, width: 250, height: 62, depth: 103,
        });

        this.introOverlay = this.add.container(0, 0).setDepth(panelHost.depth);

        const backdrop = this.add.rectangle(640, 360, 1280, 720, 0x02070d, 0.78);
        backdrop.setInteractive();

        const panel = this.add.image(panelHost.x, panelHost.y, 'mana-popup-frame-v2')
            .setDisplaySize(panelHost.width, panelHost.height);

        const titleLabel = this.isCoopMode ? 'SBÍRÁNÍ MANY · CO-OP' : 'SBÍRÁNÍ MANY';
        const title = this.add.text(titleHost.x, titleHost.y, titleLabel, {
            fontSize: '22px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#f7d57b',
            fontStyle: 'bold',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(title, titleHost);

        const objective = this.add.text(
            objectiveHost.x,
            objectiveHost.y,
            this.isCoopMode
                ? 'KAŽDÝ HRÁČ OVLÁDÁ SVŮJ KANÁL'
                : 'ZASTAV PŘÍKLAD U SPRÁVNÉHO VÝSLEDKU',
            {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#69e6ef',
                fontStyle: 'bold',
                align: 'center',
            },
        ).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(objective, objectiveHost);

        const rulesLines = this.isCoopMode
            ? [
                'Příklady padají kanálem mezi výsledky.',
                'Jen sčítání a odčítání se dvěma čísly.',
                'Hráč 1 zastavuje klávesou X · Hráč 2 klávesou M.',
                `Každý má ${MAX_LIVES} životy. Chyba stojí 1 život.`,
                'Tempo se postupně zrychluje.',
            ]
            : [
                'Příklady padají kanálem mezi výsledky.',
                'Jen sčítání a odčítání se dvěma čísly.',
                'Stiskni VYHODNOTIT ve správný okamžik.',
                `Máš ${MAX_LIVES} životy. Chyba stojí 1 život.`,
                'Tempo se postupně zrychluje.',
            ];

        const rules = this.add.text(rulesHost.x, rulesHost.y, rulesLines.join('\n'), {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#e8dfce',
            align: 'center',
            lineSpacing: 5,
        }).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(rules, rulesHost);

        const rewardLabel = this.isCoopMode
            ? `⚡ 1 MANA KAŽDÉMU ZA ${MANA_REWARD_INTERVAL} SPOLEČNÝCH SPRÁVNÝCH   ·   VSTUP ZDARMA`
            : `⚡ 1 MANA ZA ${MANA_REWARD_INTERVAL} SPRÁVNÝCH   ·   VSTUP ZDARMA`;
        const reward = this.add.text(rewardHost.x, rewardHost.y, rewardLabel, {
            fontSize: '15px',
            fontFamily: 'Arial, sans-serif',
            color: '#f7d57b',
            fontStyle: 'bold',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(reward, rewardHost);

        const backButton = this.createPopupButton(backHost, 'ZPĚT', 0x8a755f, true, () => {
            this.scene.start(this.returnScene);
        });
        const playButton = this.createPopupButton(
            playHost,
            'HRÁT',
            0x5ee6ef,
            true,
            () => this.startGame(),
        );

        this.introOverlay.add([
            backdrop,
            panel,
            title,
            objective,
            rules,
            reward,
            backButton.root,
            playButton.root,
        ]);
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
        const combinedProblems = this.isCoopMode && resultsB ? resultsA.problemCount + resultsB.problemCount : resultsA.problemCount;
        const sharedManaReward = this.isCoopMode && resultsB ? Math.floor(combinedCorrect / MANA_REWARD_INTERVAL) : 0;
        const earnedManaA = this.isCoopMode ? sharedManaReward : Math.floor(resultsA.correctCount / MANA_REWARD_INTERVAL);

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

        const panelHost = this.getPopupHost('manaResultsPopupHost', {
            x: 640, y: 360, width: 620, height: 485, depth: 100,
        });
        const titleHost = this.getPopupHost('manaResultsTitleHost', {
            x: 640, y: 174, width: 410, height: 32, depth: 102,
        });
        const statsHost = this.getPopupHost('manaResultsStatsHost', {
            x: 640, y: 338, width: 500, height: 245, depth: 102,
        });
        const continueHost = this.getPopupHost('manaResultsContinueHost', {
            x: 640, y: 526, width: 240, height: 62, depth: 103,
        });

        this.gameOverOverlay = this.add.container(0, 0).setDepth(panelHost.depth);

        const backdrop = this.add.rectangle(640, 360, 1280, 720, 0x02070d, 0.78);
        backdrop.setInteractive();

        const panel = this.add.image(panelHost.x, panelHost.y, 'mana-popup-frame-v2')
            .setDisplaySize(panelHost.width, panelHost.height);

        const title = this.add.text(titleHost.x, titleHost.y, 'VÝSLEDEK SBĚRU', {
            fontSize: '22px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#f7d57b',
            fontStyle: 'bold',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(title, titleHost);

        let statsLines: string[];

        if (this.isCoopMode && resultsB) {
            statsLines = [
                `Hráč 1 vyřešil správně: ${resultsA.correctCount} / ${resultsA.problemCount}`,
                '',
                `Hráč 2 vyřešil správně: ${resultsB.correctCount} / ${resultsB.problemCount}`,
                '',
                `Dohromady správně: ${combinedCorrect}`,
                `Dohromady odehráno: ${combinedProblems}`,
                `Společná odměna (1 mana / ${MANA_REWARD_INTERVAL} správně): oba hráči ⚡ ${sharedManaReward}`,
            ];
        } else {
            statsLines = [
                `Správně: ${resultsA.correctCount} / ${resultsA.problemCount}`,
                '',
                `Získaná mana (1 / ${MANA_REWARD_INTERVAL} správně): ⚡ ${earnedManaA}`,
            ];
        }

        const statsText = this.add.text(statsHost.x, statsHost.y, statsLines.join('\n'), {
            fontSize: this.isCoopMode ? '17px' : '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#e8dfce',
            align: 'center',
            lineSpacing: 8,
        }).setOrigin(0.5).setResolution(2);
        this.fitTextToHost(statsText, statsHost);

        const continueButton = this.createPopupButton(continueHost, 'POKRAČOVAT', 0x5ee6ef, true, () => {
            if (this.isCoopMode) {
                this.syncActiveCoopPlayerState();
            } else {
                this.gameState.save();
            }
            this.scene.start(this.returnScene);
        });

        this.gameOverOverlay.add([backdrop, panel, title, statsText, continueButton.root]);
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
        const scale = Math.min(
            1,
            text.width > 0 ? host.width / text.width : 1,
            text.height > 0 ? host.height / text.height : 1,
        );
        text.setScale(scale);
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

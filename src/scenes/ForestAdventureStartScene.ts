import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem, JourneyConfig } from '../systems/JourneySystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { LocalizationService } from '../systems/LocalizationService';
import { SceneBuilder } from '../systems/SceneBuilder';

/**
 * ForestAdventureStartScene - Entry point to Verdant Forest journey
 *
 * Uses SceneBuilder to render scene editor layout:
 * - Scroll title with forest name
 * - Black frame with requirements + stats
 * - Arrow to start journey
 * - Diamond banner with ready/warning message
 * - Back button to town
 */

const LOW_LEVEL_THRESHOLD = 5;

// Template text area IDs
const SCROLL_TITLE_TEXT_ID = '1769081033683-hsgpfw758';

export class ForestAdventureStartScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private journeySystem = JourneySystem.getInstance();
    private localization = LocalizationService.getInstance();
    private sceneBuilder!: SceneBuilder;
    private journeyConfig: JourneyConfig | null = null;
    private debugMode = false;

    constructor() {
        super({ key: 'ForestAdventureStartScene' });
    }

    private t(key: string, ...params: any[]): string {
        return this.localization.t(key, ...params);
    }

    init(data: { debugMode?: boolean }) {
        this.debugMode = data.debugMode ?? false;
    }

    preload(): void {
        if (!this.cache.json.has('forestJourney')) {
            this.load.json('forestJourney', 'assets/data/forest-journey.json');
        }
        if (!this.cache.json.has('forestEnemies')) {
            this.load.json('forestEnemies', 'assets/data/forest-enemies.json');
        }
        if (!this.cache.json.has('forestRooms')) {
            this.load.json('forestRooms', 'assets/data/forest-rooms.json');
        }
    }

    create(): void {
        // Get journey config
        const data = this.cache.json.get('forestJourney');
        this.journeyConfig = data?.journey ?? null;

        if (!this.journeyConfig) {
            console.error('Failed to load forest journey config');
            this.scene.start('TownScene');
            return;
        }

        // Build all scene editor elements (background, frame, scroll, arrow, banner, back button)
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        // Set scroll title text
        this.setupScrollTitle();

        // Check requirements (arena + gold only, level is no longer blocking)
        const check = this.journeySystem.canStartJourney(this.journeyConfig);
        const canStart = check.canStart || this.debugMode;

        // Render requirements + stats inside the black frame
        this.createFrameContent(canStart);

        // Setup diamond banner message (warning or ready)
        if (canStart) {
            this.createLevelWarningOrReady();
        } else {
            this.createBlockedMessage(check.reason || '');
        }

        // Setup arrow click (start journey)
        if (canStart) {
            this.sceneBuilder.bindClick('Arrow-forest', () => this.startJourney());
        } else {
            // Dim the arrow when requirements not met
            const arrow = this.sceneBuilder.get('Arrow-forest');
            if (arrow) (arrow as Phaser.GameObjects.Container).setAlpha(0.3);
        }

        // Setup back button click
        this.sceneBuilder.bindClick('Back button', () => this.scene.start('TownScene'));

        // Debug indicator
        if (this.debugMode) {
            this.add.text(640, 680, this.t('forest_gate.debug_mode'), {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffff00',
                fontStyle: 'italic'
            }).setOrigin(0.5);
        }
    }

    private setupScrollTitle(): void {
        const scrollContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Scroll title (Copy)');
        if (!scrollContainer) return;

        const textObjects = scrollContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
        if (textObjects) {
            const titleText = textObjects.get(SCROLL_TITLE_TEXT_ID);
            if (titleText) {
                titleText.text.setText(this.t('forest_gate.forest_name'));
            }
        }
    }

    /**
     * Render requirements and player stats inside the black frame.
     * Frame center is read from the scene editor element definition.
     */
    private createFrameContent(allMet: boolean): void {
        const player = this.gameState.getPlayer();
        const req = this.journeyConfig!.requirements;

        // Get frame position from scene builder
        const frameDef = this.sceneBuilder.getElementDef('Black-frmae-Forest');
        const frameX = frameDef?.x ?? 485;
        const frameY = frameDef?.y ?? 411;

        // Calculate total gold
        const totalGold = player.coins ? ProgressionSystem.getTotalCoinValue(player.coins) : 0;

        // Requirements title
        this.add.text(frameX, frameY - 120, this.t('forest_gate.requirements_title'), {
            fontSize: '24px',
            fontFamily: 'Georgia, serif',
            color: '#a8e6cf',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10);

        // Requirements list
        const requirements = [
            {
                label: this.t('forest_gate.req_arena_level', req.arenaLevel),
                met: (player.arena?.arenaLevel ?? 0) >= req.arenaLevel || this.debugMode,
                current: this.t('forest_gate.req_current', player.arena?.arenaLevel ?? 0)
            },
            {
                label: this.t('forest_gate.req_supply_cost', req.supplyCost),
                met: totalGold >= req.supplyCost || this.debugMode,
                current: this.t('forest_gate.req_current', totalGold)
            }
        ];

        requirements.forEach((r, index) => {
            const y = frameY - 60 + index * 50;
            const icon = r.met ? '✅' : '❌';
            const color = r.met ? '#88ff88' : '#ff8888';

            this.add.text(frameX - 220, y, `${icon} ${r.label}`, {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: color
            }).setOrigin(0, 0.5).setDepth(10);

            this.add.text(frameX + 130, y, r.current, {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa',
                fontStyle: 'italic'
            }).setOrigin(0, 0.5).setDepth(10);
        });

        // Player stats line
        this.add.text(frameX, frameY + 60, this.t('forest_gate.stats_line', player.hp, player.maxHp, player.attack, totalGold), {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(10);

        // Blocked message below stats if not met
        if (!allMet) {
            this.add.text(frameX, frameY + 120, this.t('forest_gate.blocked_come_back'), {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa',
                fontStyle: 'italic'
            }).setOrigin(0.5).setDepth(10);
        }
    }

    /**
     * Show warning or ready message on the diamond banner.
     */
    private createLevelWarningOrReady(): void {
        const player = this.gameState.getPlayer();
        const banner = this.sceneBuilder.get<Phaser.GameObjects.Image>('label with diamonds');
        const bannerX = banner?.x ?? 1024;
        const bannerY = banner?.y ?? 252;

        if (player.level < LOW_LEVEL_THRESHOLD) {
            this.add.text(bannerX, bannerY - 5, this.t('forest_gate.warning_low_level', player.level), {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffcc44',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
                wordWrap: { width: 200 },
                align: 'center'
            }).setOrigin(0.5).setDepth(10);
        } else {
            this.add.text(bannerX, bannerY - 5, this.t('forest_gate.ready_message'), {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#88ff88',
                fontStyle: 'bold',
                wordWrap: { width: 200 },
                align: 'center'
            }).setOrigin(0.5).setDepth(10);
        }
    }

    private createBlockedMessage(reason: string): void {
        const banner = this.sceneBuilder.get<Phaser.GameObjects.Image>('label with diamonds');
        const bannerX = banner?.x ?? 1024;
        const bannerY = banner?.y ?? 252;

        this.add.text(bannerX, bannerY - 5, this.t('forest_gate.blocked_reason', reason), {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff8888',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
            wordWrap: { width: 200 },
            align: 'center'
        }).setOrigin(0.5).setDepth(10);
    }

    private startJourney(): void {
        if (!this.journeyConfig) return;

        const roomsData = this.cache.json.get('forestRooms');

        if (roomsData && roomsData.startRoom) {
            const success = this.journeySystem.startRoomJourney(
                this.journeyConfig.id,
                roomsData.startRoom,
                this.debugMode
            );

            if (success) {
                if (!this.debugMode) {
                    this.deductSupplyCost();
                }
                this.scene.start('ForestRoomScene', { roomId: roomsData.startRoom });
            } else {
                console.error('Failed to start room journey');
            }
        } else {
            const success = this.journeySystem.startJourney(this.journeyConfig, this.debugMode);

            if (success) {
                this.scene.start('ForestMapScene');
            } else {
                console.error('Failed to start journey');
            }
        }
    }

    private deductSupplyCost(): void {
        const player = this.gameState.getPlayer();
        const cost = this.journeyConfig!.requirements.supplyCost;
        ProgressionSystem.spendCoins(player, cost);

        this.gameState.save();
    }
}

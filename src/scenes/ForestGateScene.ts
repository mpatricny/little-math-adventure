import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem, JourneyConfig } from '../systems/JourneySystem';

/**
 * ForestGateScene - Entry point to Verdant Forest journey
 * 
 * Handles:
 * - Requirement checks (level, arena, gold)
 * - Buying supplies
 * - Starting the journey
 * - Debug mode bypass
 */
export class ForestGateScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private journeySystem = JourneySystem.getInstance();
    private journeyConfig: JourneyConfig | null = null;
    private debugMode = false;

    constructor() {
        super({ key: 'ForestGateScene' });
    }

    init(data: { debugMode?: boolean }) {
        this.debugMode = data.debugMode ?? false;
    }

    preload(): void {
        // Load journey config if not already loaded
        if (!this.cache.json.has('forestJourney')) {
            this.load.json('forestJourney', 'assets/data/forest-journey.json');
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

        // Background
        this.add.rectangle(640, 360, 1280, 720, 0x2d4a3e);

        // Title
        this.add.text(640, 80, '🌲 VSTUP DO LESA 🌲', {
            fontSize: '42px',
            fontFamily: 'Arial, sans-serif',
            color: '#a8e6cf',
            fontStyle: 'bold',
            stroke: '#1a3a2a',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Journey name
        this.add.text(640, 140, this.journeyConfig.nameCs || this.journeyConfig.name, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'italic'
        }).setOrigin(0.5);

        // Check requirements
        const check = this.journeySystem.canStartJourney(this.journeyConfig);

        // Requirements panel
        this.createRequirementsPanel(check.canStart || this.debugMode);

        // Player stats
        this.createPlayerStats();

        // Action buttons
        if (check.canStart || this.debugMode) {
            this.createStartButton();
        } else {
            this.createBlockedMessage(check.reason || 'Requirements not met');
        }

        // Back button
        this.createBackButton();

        // Debug indicator
        if (this.debugMode) {
            this.add.text(640, 680, '🔧 DEBUG MODE - Requirements bypassed', {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffff00',
                fontStyle: 'italic'
            }).setOrigin(0.5);
        }
    }

    private createRequirementsPanel(_allMet: boolean): void {
        const player = this.gameState.getPlayer();
        const req = this.journeyConfig!.requirements;

        const panelX = 640;
        const panelY = 300;
        
        // Calculate total gold
        const totalGold = (player.coins?.gold ?? 0) * 10 + 
                          (player.coins?.silver ?? 0) * 5 + 
                          (player.coins?.largeCopper ?? 0) * 2 + 
                          (player.coins?.smallCopper ?? 0);

        // Panel background
        this.add.rectangle(panelX, panelY, 500, 200, 0x1a3a2a, 0.9)
            .setStrokeStyle(3, 0x4a8a6a);

        this.add.text(panelX, panelY - 70, 'Požadavky:', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#a8e6cf',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Requirements list
        const requirements = [
            {
                label: `Úroveň ${req.minLevel}+`,
                met: player.level >= req.minLevel || this.debugMode,
                current: `(máš ${player.level})`
            },
            {
                label: `Aréna úroveň ${req.arenaLevel}+`,
                met: (player.arena?.arenaLevel ?? 0) >= req.arenaLevel || this.debugMode,
                current: `(máš ${player.arena?.arenaLevel ?? 0})`
            },
            {
                label: `${req.supplyCost} zlatých na zásoby`,
                met: totalGold >= req.supplyCost || this.debugMode,
                current: `(máš ${totalGold})`
            }
        ];

        requirements.forEach((req, index) => {
            const y = panelY - 30 + index * 40;
            const icon = req.met ? '✅' : '❌';
            const color = req.met ? '#88ff88' : '#ff8888';

            this.add.text(panelX - 200, y, `${icon} ${req.label}`, {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: color
            }).setOrigin(0, 0.5);

            this.add.text(panelX + 150, y, req.current, {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa',
                fontStyle: 'italic'
            }).setOrigin(0, 0.5);
        });
    }

    private createPlayerStats(): void {
        const player = this.gameState.getPlayer();
        const totalGold = (player.coins?.gold ?? 0) * 10 + 
                          (player.coins?.silver ?? 0) * 5 + 
                          (player.coins?.largeCopper ?? 0) * 2 + 
                          (player.coins?.smallCopper ?? 0);

        this.add.text(640, 450, `❤️ HP: ${player.hp}/${player.maxHp}  |  ⚔️ ATK: ${player.attack}  |  🪙 Zlato: ${totalGold}`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);
    }

    private createStartButton(): void {
        const btn = this.add.container(640, 550);

        const bg = this.add.rectangle(0, 0, 300, 70, 0x4a9a4a)
            .setStrokeStyle(4, 0x6aca6a);

        const text = this.add.text(0, 0, '🌲 VYRAZIT NA CESTU 🌲', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(300, 70);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => {
            bg.setFillStyle(0x5aba5a);
        });

        btn.on('pointerout', () => {
            bg.setFillStyle(0x4a9a4a);
        });

        btn.on('pointerdown', () => {
            this.startJourney();
        });
    }

    private createBlockedMessage(reason: string): void {
        this.add.text(640, 550, `⚠️ ${reason}`, {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff8888',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.add.text(640, 590, 'Vrať se, až budeš připraven!', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'italic'
        }).setOrigin(0.5);
    }

    private createBackButton(): void {
        const btn = this.add.container(100, 650);

        const bg = this.add.rectangle(0, 0, 150, 50, 0x666666)
            .setStrokeStyle(2, 0x888888);

        const text = this.add.text(0, 0, '← Zpět', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(150, 50);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x888888));
        btn.on('pointerout', () => bg.setFillStyle(0x666666));
        btn.on('pointerdown', () => this.scene.start('TownScene'));
    }

    private startJourney(): void {
        if (!this.journeyConfig) return;

        const success = this.journeySystem.startJourney(this.journeyConfig, this.debugMode);

        if (success) {
            // Go to forest map scene
            this.scene.start('ForestMapScene');
        } else {
            console.error('Failed to start journey');
        }
    }
}

import Phaser from 'phaser';
import { JourneySystem, Encounter } from '../systems/JourneySystem';
import { createEncounterCatalog, type EncounterCatalog } from '../systems/EncounterCatalog';
import type { EnemyDefinition } from '../types';

/**
 * ForestMapScene - Journey progress hub
 * 
 * Shows:
 * - Current stage and progress
 * - HP bar
 * - Stage overview
 * - Continue to next encounter
 */
export class ForestMapScene extends Phaser.Scene {
    private journeySystem = JourneySystem.getInstance();
    private encounterCatalog!: EncounterCatalog;

    private battleWon: boolean = false;

    constructor() {
        super({ key: 'ForestMapScene' });
    }

    init(data?: { battleWon?: boolean }): void {
        this.battleWon = data?.battleWon || false;
    }

    create(): void {
        this.encounterCatalog = createEncounterCatalog(this.cache.json.get('encounters'), {
            core: this.cache.json.get('enemies') as EnemyDefinition[],
        });

        // If returning from a won battle, advance the encounter
        if (this.battleWon) {
            console.log('[ForestMapScene] Returning from battle victory, advancing encounter...');
            this.journeySystem.advanceEncounter();
            this.battleWon = false; // Reset flag
        }
        const state = this.journeySystem.getJourneyState();
        const config = this.journeySystem.getJourneyConfig();

        // Debug: Log current journey state
        if (state && config) {
            const stage = config.stages[state.currentStage];
            const encounter = stage?.encounters[state.currentEncounter];
            console.log(`[ForestMapScene] Current: Stage ${state.currentStage} (${stage?.nameCs}), Encounter ${state.currentEncounter} (${encounter?.type})`);
        }

        if (!state || !config) {
            console.error('No active journey');
            this.scene.start('TownScene');
            return;
        }

        // Check if journey is complete
        if (state.completed) {
            this.showVictoryScreen();
            return;
        }

        // Check if journey failed
        if (state.failed) {
            this.showFailedScreen();
            return;
        }

        // Background - forest green
        this.add.rectangle(640, 360, 1280, 720, 0x1a3a2a);

        // Title
        const stage = this.journeySystem.getCurrentStage();
        this.add.text(640, 50, `🌲 ${config.nameCs || config.name} 🌲`, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#a8e6cf',
            fontStyle: 'bold',
            stroke: '#0a1a0a',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Stage name
        if (stage) {
            this.add.text(640, 100, stage.nameCs || stage.name, {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'italic'
            }).setOrigin(0.5);
        }

        // HP Bar
        this.createHpBar();

        // Progress indicator
        this.createProgressBar();

        // Stage map visualization
        this.createStageMap();

        // Current encounter preview
        this.createEncounterPreview();

        // Continue button
        this.createContinueButton();

        // Abandon button
        this.createAbandonButton();
    }

    private createHpBar(): void {
        const hp = this.journeySystem.getJourneyHp();
        const maxHp = this.journeySystem.getJourneyMaxHp();
        const hpPercent = hp / maxHp;

        const barX = 640;
        const barY = 160;
        const barWidth = 400;
        const barHeight = 30;

        // Background
        this.add.rectangle(barX, barY, barWidth, barHeight, 0x333333)
            .setStrokeStyle(2, 0x666666);

        // HP fill
        const fillColor = hpPercent > 0.5 ? 0x44aa44 : hpPercent > 0.25 ? 0xaaaa44 : 0xaa4444;
        this.add.rectangle(
            barX - barWidth/2 + (barWidth * hpPercent)/2,
            barY,
            barWidth * hpPercent,
            barHeight - 4,
            fillColor
        ).setOrigin(0.5);

        // HP text
        this.add.text(barX, barY, `❤️ ${hp} / ${maxHp}`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    private createProgressBar(): void {
        const progress = this.journeySystem.getProgress();
        const summary = this.journeySystem.getJourneySummary();

        const barX = 640;
        const barY = 210;

        // Progress text
        this.add.text(barX, barY, `Postup: ${Math.round(progress * 100)}%`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccaa'
        }).setOrigin(0.5);

        if (summary) {
            this.add.text(barX, barY + 25, `Etapa ${summary.encounterIndex}/${summary.totalEncounters}`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa'
            }).setOrigin(0.5);
        }
    }

    private createStageMap(): void {
        const config = this.journeySystem.getJourneyConfig();
        const state = this.journeySystem.getJourneyState();
        if (!config || !state) return;

        const startX = 200;
        const startY = 320;
        const stageWidth = 220;

        config.stages.forEach((stage, index) => {
            const x = startX + index * stageWidth;
            const isCurrent = index === state.currentStage;
            const isComplete = index < state.currentStage;
            const isFuture = index > state.currentStage;

            // Stage circle
            const circleColor = isComplete ? 0x44aa44 : isCurrent ? 0xaaaa44 : 0x444444;
            this.add.circle(x, startY, 30, circleColor)
                .setStrokeStyle(3, isCurrent ? 0xffffff : 0x666666);

            // Stage number
            const icon = isComplete ? '✓' : `${index + 1}`;
            this.add.text(x, startY, icon, {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Stage name
            this.add.text(x, startY + 50, stage.nameCs || stage.name, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: isFuture ? '#666666' : '#ffffff',
                align: 'center',
                wordWrap: { width: 100 }
            }).setOrigin(0.5, 0);

            // Connection line to next stage
            if (index < config.stages.length - 1) {
                const lineColor = isComplete ? 0x44aa44 : 0x444444;
                this.add.line(0, 0, x + 35, startY, x + stageWidth - 35, startY, lineColor)
                    .setLineWidth(3);
            }
        });
    }

    private createEncounterPreview(): void {
        const encounter = this.journeySystem.getCurrentEncounter();
        if (!encounter) return;

        const panelX = 640;
        const panelY = 480;

        // Panel background
        this.add.rectangle(panelX, panelY, 500, 120, 0x2a4a3a, 0.9)
            .setStrokeStyle(2, 0x4a8a6a);

        // Encounter type icon and description
        const { icon, label } = this.getEncounterDisplay(encounter);

        this.add.text(panelX, panelY - 30, `Další: ${icon}`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(panelX, panelY + 15, label, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaddaa'
        }).setOrigin(0.5);
    }

    private getEncounterDisplay(encounter: Encounter): { icon: string; label: string } {
        switch (encounter.type) {
            case 'battle':
                return { icon: '⚔️', label: `Souboj: ${this.getEncounterEnemyName(encounter)}` };
            case 'rest':
                const restName = encounter.nameCs || encounter.name || 'Odpočinek';
                return { icon: '🏕️', label: `${restName} (+${encounter.healPercent}% HP)` };
            case 'puzzle':
                return { icon: '🧩', label: 'Hádanka' };
            case 'chest':
                return { icon: '💰', label: `Poklad (+${encounter.gold} zlato)` };
            case 'boss':
                return { icon: '👹', label: `BOSS: ${this.getEncounterEnemyName(encounter)}` };
            default:
                return { icon: '❓', label: 'Neznámé' };
        }
    }

    private getEncounterEnemyName(encounter: Encounter): string {
        if (!encounter.encounterId) return encounter.enemy || 'Nepřítel';
        const definition = this.encounterCatalog.getJourneyEncounterById(encounter.encounterId);
        return this.encounterCatalog.resolveEnemy(definition.enemies[0]).name;
    }

    private createContinueButton(): void {
        const btn = this.add.container(640, 600);

        const bg = this.add.rectangle(0, 0, 250, 60, 0x4a9a4a)
            .setStrokeStyle(3, 0x6aca6a);

        const text = this.add.text(0, 0, '▶ POKRAČOVAT', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(250, 60);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x5aba5a));
        btn.on('pointerout', () => bg.setFillStyle(0x4a9a4a));
        btn.on('pointerdown', () => this.continueJourney());
    }

    private createAbandonButton(): void {
        const btn = this.add.container(100, 670);

        const bg = this.add.rectangle(0, 0, 140, 40, 0x664444)
            .setStrokeStyle(2, 0x886666);

        const text = this.add.text(0, 0, '🚪 Vzdát se', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaaaa'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(140, 40);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x885555));
        btn.on('pointerout', () => bg.setFillStyle(0x664444));
        btn.on('pointerdown', () => this.abandonJourney());
    }

    private continueJourney(): void {
        const encounter = this.journeySystem.getCurrentEncounter();
        if (!encounter) return;

        switch (encounter.type) {
            case 'battle':
            case 'boss':
                const currentStage = this.journeySystem.getCurrentStage();
                const state = this.journeySystem.getJourneyState();
                if (!currentStage || !state || !encounter.encounterId) {
                    throw new Error('Forest map battle is missing stage state or encounterId');
                }
                const mappedEncounter = this.encounterCatalog.getForestMapEncounter(
                    currentStage.id,
                    state.currentEncounter,
                );
                if (mappedEncounter.id !== encounter.encounterId) {
                    throw new Error(
                        `Forest map ${currentStage.id}/${state.currentEncounter} points to ${encounter.encounterId}, expected ${mappedEncounter.id}`,
                    );
                }
                const bgKey = currentStage?.background || 'bg-forest';
                
                this.scene.start('BattleScene', {
                    mode: 'journey',
                    encounterId: encounter.encounterId,
                    returnScene: 'ForestMapScene',
                    backgroundKey: bgKey,
                });
                break;

            case 'rest':
                // Handle rest encounter
                this.journeySystem.handleRestEncounter(encounter);
                this.journeySystem.advanceEncounter();
                this.scene.restart(); // Refresh to show next encounter
                break;

            case 'chest':
                // Handle chest encounter
                this.journeySystem.handleChestEncounter(encounter);
                this.journeySystem.advanceEncounter();
                this.scene.restart();
                break;

            case 'puzzle':
                // Go to puzzle scene
                this.scene.start('ForestPuzzleScene', {
                    puzzleId: encounter.puzzleId
                });
                break;

            default:
                console.warn('Unknown encounter type:', encounter.type);
                this.journeySystem.advanceEncounter();
                this.scene.restart();
        }
    }

    private abandonJourney(): void {
        // Confirm dialog would be nice, but for MVP just abandon
        this.journeySystem.abandonJourney();
        this.scene.start('TownScene');
    }

    private showFailedScreen(): void {
        const state = this.journeySystem.getJourneyState();

        // Dark overlay
        this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.8);

        this.add.text(640, 250, '💀 CESTA SELHALA 💀', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        if (state?.lastSavePoint) {
            this.add.text(640, 350, 'Máš uložený postup!', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5);

            // Resume button
            const resumeBtn = this.add.container(640, 450);
            const resumeBg = this.add.rectangle(0, 0, 300, 60, 0x4a9a4a);
            const resumeText = this.add.text(0, 0, '🔄 Pokračovat od uložení', {
                fontSize: '22px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            resumeBtn.add([resumeBg, resumeText]);
            resumeBtn.setSize(300, 60);
            resumeBtn.setInteractive({ useHandCursor: true });
            resumeBtn.on('pointerdown', () => {
                this.journeySystem.resumeFromSavePoint();
                this.scene.restart();
            });
        }

        // Back to village button
        const backBtn = this.add.container(640, 530);
        const backBg = this.add.rectangle(0, 0, 250, 50, 0x666666);
        const backText = this.add.text(0, 0, '🏠 Zpět do vesnice', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);
        backBtn.add([backBg, backText]);
        backBtn.setSize(250, 50);
        backBtn.setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', () => {
            this.journeySystem.abandonJourney();
            this.scene.start('TownScene');
        });
    }

    private showVictoryScreen(): void {
        const config = this.journeySystem.getJourneyConfig();

        // Victory background
        this.add.rectangle(640, 360, 1280, 720, 0x1a4a2a);

        // Title
        this.add.text(640, 180, '🏆 VÍTĚZSTVÍ! 🏆', {
            fontSize: '56px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Journey name
        this.add.text(640, 260, `${config?.nameCs || config?.name || 'Cesta'} dokončena!`, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Rewards
        const rewards = config?.rewards;
        if (rewards) {
            this.add.text(640, 340, rewards.unlockMessageCs || rewards.unlockMessage || '', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#88ff88',
                fontStyle: 'italic'
            }).setOrigin(0.5);
        }

        // Return button
        const btn = this.add.container(640, 500);
        const bg = this.add.rectangle(0, 0, 300, 70, 0x4a9a4a)
            .setStrokeStyle(4, 0x6aca6a);
        const text = this.add.text(0, 0, '🏠 Zpět do vesnice', {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(300, 70);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x5aba5a));
        btn.on('pointerout', () => bg.setFillStyle(0x4a9a4a));
        btn.on('pointerdown', () => {
            // Journey rewards already applied when advanceEncounter() marked it complete
            // Just clean up the journey state
            this.journeySystem.abandonJourney();
            this.scene.start('TownScene');
        });
    }
}

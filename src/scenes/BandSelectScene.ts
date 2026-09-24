import { createMedievalPanel } from '../ui/MedievalPanel';
import Phaser from 'phaser';
import { BandId, CharacterType } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { PlacementInitializer } from '../systems/PlacementInitializer';
import { MasterySystem } from '../systems/MasterySystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { voice } from '../audio/AudioDirector';

interface BandSelectData {
    slotIndex?: number;
    isReturningPlayer?: boolean;
    returnScene?: string;
    selectedBand?: BandId;
    returnData?: Record<string, unknown>;
    characterDraft?: { characterName: string; selectedCharacter: CharacterType };
}

const BANDS: { band: BandId; range: string; example: string; label: string; voice: string }[] = [
    { band: 'A', range: '0–5', example: '2 + 1', label: 'Do pěti', voice: 'five' },
    { band: 'B', range: '0–8', example: '5 + 3', label: 'Do osmi', voice: 'eight' },
    { band: 'C', range: '0–10', example: '6 + 4', label: 'Do deseti', voice: 'ten' },
    { band: 'D', range: '0–20', example: '12 + 3', label: 'Bez přechodu', voice: 'twenty' },
    { band: 'E', range: '0–20', example: '8 + 5', label: 'Přes desítku', voice: 'crossing' },
];

/** Mandatory second step. A draft is saved only after an explicit band choice. */
export class BandSelectScene extends Phaser.Scene {
    private selectionData!: BandSelectData;
    private selectedBand?: BandId;
    private sceneBuilder!: SceneBuilder;
    private confirmButton!: MedievalActionButton;
    private cards: { band: BandId; surface: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Rectangle; check: Phaser.GameObjects.Text }[] = [];
    private confirmed = false;
    private introTimer?: Phaser.Time.TimerEvent;

    constructor() { super({ key: 'BandSelectScene' }); }

    init(data: BandSelectData = {}): void {
        this.selectionData = data;
        this.selectedBand = data.selectedBand;
        this.cards = [];
        this.confirmed = false;
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('BandSelectScene');
        const shade = this.host('bandShade');
        this.add.rectangle(shade.x, shade.y, 1280, 720, 0x10121a, 0.62).setDepth(shade.depth);
        const title = this.host('bandTitle');
        this.add.text(title.x, title.y, 'VYBER POČÍTÁNÍ', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '38px', color: '#ffe7ad',
            stroke: '#23170f', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(title.depth);
        const step = this.host('bandStep');
        this.add.text(step.x, step.y, '2 / 2', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '22px', color: '#e0c391',
        }).setOrigin(0.5).setDepth(step.depth);
        BANDS.forEach((config, index) => this.createCard(config, index));
        this.confirmButton = new MedievalActionButton(this, {
            ...this.host('bandConfirm'), width: 280, height: 80, layout: 'text', label: 'HRÁT  ▶',
            labelFontSize: 25, accent: 0x98d77b, enabled: false,
            name: 'band-confirm', onClick: () => this.confirmSelection(),
        });
        new MedievalActionButton(this, {
            ...this.host('bandBack'), width: 190, height: 70, layout: 'text', label: '◀  ZPĚT',
            labelFontSize: 21, accent: 0xe8c283, onClick: () => this.goBack(),
        });
        if (this.selectedBand) this.selectBand(this.selectedBand, false);
        this.introTimer = this.time.delayedCall(450, () => voice(this, 'vo.level.intro'));
    }

    private host(id: string): { x: number; y: number; depth: number } {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id)!;
        return { x: host.x, y: host.y, depth: host.depth };
    }

    private createCard(config: typeof BANDS[number], index: number): void {
        const host = this.host(`band${config.band}`);
        const root = this.add.container(host.x, host.y).setDepth(host.depth).setName(`band-${config.band}`);
        const surface = this.add.container(0, 0);
        const frame = createMedievalPanel(this, 0, 0, 218, 330, 28);
        const glow = this.add.rectangle(0, 0, 182, 288, 0xf3c75b, 0.08)
            .setStrokeStyle(3, 0xffd77b).setVisible(false);
        const text = (y: number, value: string, size: number, color = '#f9e6ba') => this.add.text(0, y, value, {
            resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color,
            stroke: '#171411', strokeThickness: 2,
        }).setOrigin(0.5);
        surface.add([frame, glow, text(-94, config.range, 45), text(-35, config.label, 19),
            text(27, config.example, 31, '#ffffff')]);
        // Increasing stars show progression even with all prose hidden.
        for (let star = 0; star < 5; star++) {
            surface.add(this.add.text((star - 2) * 28, 84, star <= index ? '★' : '☆', {
                resolution: 2, fontSize: '23px', color: star <= index ? '#ffce63' : '#7a746e',
            }).setOrigin(0.5));
        }
        const check = text(123, '✓', 30, '#aceda0').setVisible(false);
        surface.add(check);
        root.add(surface).setSize(218, 330).setInteractive({ useHandCursor: true });
        root.on('pointerover', () => surface.setY(-3));
        root.on('pointerdown', () => { surface.setY(2); this.selectBand(config.band); });
        root.on('pointerup', () => surface.setY(-3));
        root.on('pointerout', () => surface.setY(0));
        this.cards.push({ band: config.band, surface, glow, check });
    }

    private selectBand(band: BandId, speak = true): void {
        this.selectedBand = band;
        this.cards.forEach(card => { card.glow.setVisible(card.band === band); card.check.setVisible(card.band === band); });
        this.confirmButton.setEnabled(true);
        if (speak) {
            this.introTimer?.remove();
            voice(this, `vo.level.${BANDS.find(item => item.band === band)!.voice}`);
        }
    }

    private goBack(): void {
        this.scene.start(this.selectionData.returnScene ?? 'CharacterSelectNewScene', {
            ...this.selectionData.returnData, ...this.selectionData.characterDraft,
            slotIndex: this.selectionData.slotIndex ?? 0, selectedBand: this.selectedBand,
        });
    }

    private confirmSelection(): void {
        if (!this.selectedBand || this.confirmed) return;
        this.confirmed = true;
        if (this.selectionData.returnScene) {
            this.scene.start(this.selectionData.returnScene, {
                ...this.selectionData.returnData, selectedBand: this.selectedBand, slotIndex: this.selectionData.slotIndex ?? 0,
            });
            return;
        }
        const gameState = GameStateManager.getInstance();
        if (this.selectionData.characterDraft) {
            const slot = this.selectionData.slotIndex ?? 0;
            gameState.setActiveSlotIndex(slot);
            gameState.reset(this.selectionData.characterDraft.selectedCharacter, this.selectionData.characterDraft.characterName, slot);
        }
        PlacementInitializer.applyBandSelection(this.selectedBand, gameState);
        MasterySystem.getInstance().updatePlayerLevel();
        this.scene.start(this.selectionData.isReturningPlayer ? 'TownScene' : 'ComicScene');
    }
}

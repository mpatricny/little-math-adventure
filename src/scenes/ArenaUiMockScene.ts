import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { ArenaPlayerStatusPod } from '../ui/ArenaPlayerStatusPod';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { TownResourceHud } from '../ui/TownResourceHud';

type Host = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
    scale?: number;
};

/**
 * Isolated visual test for a quieter arena entrance. It intentionally uses
 * local state and never changes production ArenaScene progress or save data.
 */
export class ArenaUiMockScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private choiceIndex = 0;
    private choiceStatusText?: Phaser.GameObjects.Text;
    private waveTitleText?: Phaser.GameObjects.Text;

    private readonly mockChoices = [
        { status: 'POKRAČOVAT V PŘÍBĚHU  ·  1/3', wave: 'KOLO 3/5' },
        { status: 'PROCVIČIT DŘÍVĚJŠÍ KOLO  ·  2/3', wave: 'KOLO 1/5' },
        { status: 'VYLEPŠIT VÝSLEDEK  ·  3/3', wave: 'KOLO 2/5' },
    ];

    constructor() {
        super({ key: 'ArenaUiMockScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.registerHandler('arenaMockBack', () => this.scene.start('MenuScene'));
        this.sceneBuilder.registerHandler('arenaMockPrevious', () => this.cycleMockChoice(-1));
        this.sceneBuilder.registerHandler('arenaMockNext', () => this.cycleMockChoice(1));
        this.sceneBuilder.buildScene('ArenaUiMockScene');

        this.createOpponentPreview();
        this.createPlayerPreview();
        this.createWaveBoard();
        this.createChoiceHeader();
        this.createResourcePanel();
        this.createPlayerStatusPods();
        this.createActions();
        this.createMockCaption();

        this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
    }

    private createOpponentPreview(): void {
        const enemyAHost = this.getHost('arenaMockEnemyAHost', { x: 840, y: 500, depth: 5 });
        const enemyBHost = this.getHost('arenaMockEnemyBHost', { x: 1005, y: 530, depth: 6 });

        const enemyA = this.add.sprite(enemyAHost.x, enemyAHost.y, 'purple-attack-sheet', 0)
            .setScale(enemyAHost.scale ?? 0.86)
            .setDepth(enemyAHost.depth);
        if (this.anims.exists('purple-idle')) enemyA.play('purple-idle');

        const enemyB = this.add.sprite(enemyBHost.x, enemyBHost.y, 'pink-idle-sheet', 0)
            .setScale(enemyBHost.scale ?? 0.82)
            .setDepth(enemyBHost.depth);
        if (this.anims.exists('pink-idle')) enemyB.play('pink-idle');
    }

    private createPlayerPreview(): void {
        this.createAnimatedActor(
            'arenaMockHeroAHost',
            { x: 318, y: 516, depth: 8, scale: 1 },
            'knight-idle-sheet',
            'knight-idle',
        );
        this.createAnimatedActor(
            'arenaMockPetAHost',
            { x: 423, y: 598, depth: 7, scale: 0.5 },
            'slime-sheet',
            'slime-idle',
            true,
        );
        this.createAnimatedActor(
            'arenaMockHeroBHost',
            { x: 176, y: 572, depth: 9, scale: 1.35 },
            'boy-knight-idle-sheet',
            'boy-knight-idle',
        );
        this.createAnimatedActor(
            'arenaMockPetBHost',
            { x: 276, y: 659, depth: 8, scale: 0.5 },
            'pink-idle-sheet',
            'pink-idle',
            true,
        );
    }

    private createAnimatedActor(
        hostId: string,
        fallback: Host,
        texture: string,
        animation: string,
        flipX = false,
    ): Phaser.GameObjects.Sprite {
        const host = this.getHost(hostId, fallback);
        const sprite = this.add.sprite(host.x, host.y, texture, 0)
            .setName(hostId)
            .setScale(host.scale ?? fallback.scale ?? 1)
            .setFlipX(flipX)
            .setDepth(host.depth);
        if (this.anims.exists(animation)) sprite.play(animation);
        return sprite;
    }

    private createWaveBoard(): void {
        const host = this.getHost('arenaMockWaveListHost', {
            x: 227,
            y: 255,
            depth: 12,
        });
        const root = this.add.container(host.x, host.y).setDepth(host.depth);
        const currentWave = 2;
        const waves = [
            ['purple-attack-sheet'],
            ['pink-idle-sheet'],
            ['purple-attack-sheet', 'pink-idle-sheet'],
            ['slime-sheet', 'purple-attack-sheet'],
            ['leafy-idle-sheet', 'pink-idle-sheet'],
        ];

        const header = this.add.text(0, -176, 'PŘEHLED VLN', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#f5d89d',
            stroke: '#26150c',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);
        const doneHeader = this.add.text(102, -151, '✓', {
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            color: '#9bc889',
        }).setOrigin(0.5).setResolution(2);
        const perfectHeader = this.add.text(145, -151, '★', {
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            color: '#d9b55d',
        }).setOrigin(0.5).setResolution(2);
        root.add([header, doneHeader, perfectHeader]);

        waves.forEach((textures, index) => {
            const rowY = -118 + index * 58;
            const isCurrent = index === currentWave;
            const isFuture = index > currentWave;
            const row = this.add.container(0, rowY);

            const rowPlate = this.add.rectangle(0, 0, 350, 50, isCurrent ? 0x5c3a1d : 0x25180f, isCurrent ? 0.4 : 0.2)
                .setStrokeStyle(isCurrent ? 2 : 1, isCurrent ? 0xe7b957 : 0x8e6139, isCurrent ? 0.95 : 0.45);
            const numberPlate = this.add.circle(-151, 0, 17, isCurrent ? 0x7a4b1e : 0x24160e, 0.96)
                .setStrokeStyle(2, isCurrent ? 0xf0c36b : 0x8b5a32, 0.95);
            const number = this.add.text(-151, 0, `${index + 1}`, {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: '17px',
                fontStyle: 'bold',
                color: isCurrent ? '#fff0bc' : '#d8bd8f',
            }).setOrigin(0.5).setResolution(2);
            row.add([rowPlate, numberPlate, number]);

            textures.forEach((texture, enemyIndex) => {
                const icon = this.add.image(-96 + enemyIndex * 48, 0, texture, 0)
                    .setDisplaySize(42, 42);
                row.add(icon);
            });

            const completed = index < currentWave;
            const perfect = index === 0;
            const completion = this.add.text(102, 0, completed ? '✓' : '○', {
                fontFamily: 'Georgia, serif',
                fontSize: '21px',
                fontStyle: 'bold',
                color: completed ? '#75d66b' : '#776451',
            }).setOrigin(0.5).setResolution(2);
            const perfection = this.add.text(145, 0, perfect ? '★' : '☆', {
                fontFamily: 'Georgia, serif',
                fontSize: '21px',
                color: perfect ? '#ffd36a' : '#776451',
            }).setOrigin(0.5).setResolution(2);
            row.add([completion, perfection]);

            if (isFuture) row.setAlpha(0.48);
            root.add(row);
        });
    }

    private createChoiceHeader(): void {
        const statusHost = this.getHost('arenaMockChoiceStatusHost', {
            x: 805,
            y: 144,
            depth: 30,
        });
        const waveHost = this.getHost('arenaMockWaveTitleHost', {
            x: 805,
            y: 190,
            depth: 30,
        });
        this.choiceStatusText = this.add.text(statusHost.x, statusHost.y, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#ffd02f',
            stroke: '#26160d',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(statusHost.depth).setResolution(2);
        this.waveTitleText = this.add.text(waveHost.x, waveHost.y, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#24150d',
            strokeThickness: 7,
        }).setOrigin(0.5).setDepth(waveHost.depth).setResolution(2);
        this.updateMockChoice();
    }

    private createResourcePanel(): void {
        const host = this.getHost('arenaMockResourceHost', {
            x: 1120,
            y: 42,
            depth: 72,
            width: 258,
            height: 74,
        });
        const resources = new TownResourceHud(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            width: host.width ?? 258,
            height: host.height ?? 74,
        });
        resources.setValues(249, 2533);
    }

    private createPlayerStatusPods(): void {
        const playerA = this.getHost('arenaMockPlayerAPodHost', {
            x: 470,
            y: 500,
            depth: 72,
            width: 178,
            height: 78,
        });
        new ArenaPlayerStatusPod(this, {
            x: playerA.x,
            y: playerA.y,
            depth: playerA.depth,
            width: playerA.width ?? 178,
            height: playerA.height ?? 78,
            playerLabel: 'A',
            pointerSide: 'left',
            hp: 8,
            maxHp: 10,
            potionCount: 1,
            preparationKind: 'sword',
            preparationCharges: 2,
        });

        const playerB = this.getHost('arenaMockPlayerBPodHost', {
            x: 89,
            y: 630,
            depth: 72,
            width: 176,
            height: 77,
        });
        new ArenaPlayerStatusPod(this, {
            x: playerB.x,
            y: playerB.y,
            depth: playerB.depth,
            width: playerB.width ?? 176,
            height: playerB.height ?? 77,
            playerLabel: 'B',
            pointerSide: 'right',
            hp: 9,
            maxHp: 10,
            potionCount: 1,
            preparationKind: 'shield',
            preparationCharges: 1,
        });
    }

    private createActions(): void {
        const startHost = this.getHost('arenaMockStartHost', {
            x: 980,
            y: 654,
            depth: 80,
            width: 276,
            height: 110,
        });
        new MedievalActionButton(this, {
            ...startHost,
            width: startHost.width ?? 276,
            height: startHost.height ?? 110,
            label: 'ZAČÍT BOJ',
            labelFontSize: 20,
            accent: 0xf0b447,
            frameTexture: 'arena-entry-start-v1',
            normalIcon: { texture: 'arena-entry-crossed-swords-normal-v1' },
            activeIcon: { texture: 'arena-entry-crossed-swords-active-v1' },
            iconSize: 70,
            iconCenterRatio: 0.19,
            labelCenterRatio: 0.65,
            onClick: () => this.scene.start('BattleUiMockScene'),
        });
    }

    private cycleMockChoice(direction: -1 | 1): void {
        this.choiceIndex = Phaser.Math.Wrap(
            this.choiceIndex + direction,
            0,
            this.mockChoices.length,
        );
        this.updateMockChoice();
    }

    private updateMockChoice(): void {
        const choice = this.mockChoices[this.choiceIndex];
        this.choiceStatusText?.setText(choice.status);
        this.waveTitleText?.setText(choice.wave);
    }

    private createMockCaption(): void {
        const host = this.getHost('arenaMockCaptionHost', { x: 640, y: 18, depth: 90 });
        this.add.text(host.x, host.y, 'ARENA UI · MOCK', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#d8f8ff',
            backgroundColor: '#18333daa',
            padding: { x: 9, y: 4 },
        }).setOrigin(0.5).setDepth(host.depth).setResolution(2);
    }

    private getHost(id: string, fallback: Host): Host {
        const element = this.sceneBuilder.get<Phaser.GameObjects.GameObject & {
            x: number;
            y: number;
            depth: number;
            displayWidth?: number;
            displayHeight?: number;
            scaleX?: number;
        }>(id);
        // Empty SceneBuilder containers do not apply width/height/scale to the
        // Phaser object itself, so read those editable values from the scene
        // definition while keeping the live object's position and depth.
        const definition = this.sceneBuilder.getElementDef(id);
        return {
            x: element?.x ?? fallback.x,
            y: element?.y ?? fallback.y,
            depth: element?.depth ?? fallback.depth,
            width: definition?.width ?? (element?.displayWidth || fallback.width),
            height: definition?.height ?? (element?.displayHeight || fallback.height),
            scale: definition?.scale ?? definition?.scaleX ?? fallback.scale,
        };
    }
}

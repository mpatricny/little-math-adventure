import Phaser from 'phaser';

// Building configuration
interface BuildingConfig {
    id: string;
    name: string;
    textureKey: string;
    x: number;
}

const BUILDINGS: BuildingConfig[] = [
    { id: 'witch', name: 'Chaloupka čarodějnice', textureKey: 'building-witch', x: 130 },
    { id: 'guild', name: 'Cech', textureKey: 'building-guild', x: 315 },
    { id: 'tavern', name: 'Hospoda', textureKey: 'building-tavern', x: 485 },
    { id: 'shop', name: 'Obchod', textureKey: 'building-shop', x: 675 },
];

// Scene constants
const WORLD_WIDTH = 800;
const BUILDING_SCALE = 0.224;
const GRASS_SCALE = 0.14;
const GRASS_DISPLAY_HEIGHT = 70;
const BG_GRASS_HEIGHT = 80;
const GROUND_Y = 575;  // Base ground level
const KNIGHT_SPEED = 200;
const PARALLAX_BG = 0.3;

type TownState = 'exploring' | 'walking' | 'inside';

export class TownScene extends Phaser.Scene {
    private bgLayer!: Phaser.GameObjects.TileSprite;
    private bgGrassLayer!: Phaser.GameObjects.TileSprite;  // Grass behind buildings
    private grassLayer!: Phaser.GameObjects.TileSprite;    // Grass in front
    private knight!: Phaser.GameObjects.Sprite;
    private buildingSprites: Map<string, Phaser.GameObjects.Image> = new Map();
    private nameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
    private townState: TownState = 'exploring';
    private currentBuilding: string | null = null;
    private interiorOverlay!: Phaser.GameObjects.Container;
    private walkTween: Phaser.Tweens.Tween | null = null;

    // Debug mode
    private debugMode: boolean = false;
    private debugText!: Phaser.GameObjects.Text;
    private debugSelection: number = 0;
    private debugElements = [
        'witch', 'guild', 'tavern', 'shop',  // Individual buildings
        'knight', 'bgGrass', 'fgGrass', 'background'
    ];
    private debugValues = {
        witch: { x: 130, y: 575, scale: 0.224 },
        guild: { x: 315, y: 605, scale: 0.224 },
        tavern: { x: 485, y: 570, scale: 0.224 },
        shop: { x: 675, y: 580, scale: 0.184 },
        knight: { x: 80, y: 565, scale: 0.4 },
        bgGrass: { y: 575, scale: 0.14 },
        fgGrass: { scale: 0.14 },
        background: { scale: 0.66 },
    };

    constructor() {
        super({ key: 'TownScene' });
    }

    create(): void {
        this.townState = 'exploring';
        this.currentBuilding = null;

        // Set up world bounds (single screen, no scrolling needed)
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 600);

        // Create parallax layers (order matters for depth)
        this.createBackground();
        this.createBackgroundGrass();  // Grass behind buildings
        this.createBuildings();
        this.createForegroundGrass();  // Grass in front
        this.createKnight();
        this.createInteriorOverlay();

        // Camera is static - everything fits on one screen
        // No follow or deadzone needed

        // Start floating animation for labels
        this.animateLabels();

        // Setup debug mode
        this.setupDebugMode();
    }

    private createBackground(): void {
        // Background layer - sky and mountains (1456x816)
        // Scale to show more of the background (smaller = more visible)
        this.bgLayer = this.add.tileSprite(0, 0, WORLD_WIDTH * 2, 600, 'town-bg')
            .setOrigin(0, 0)
            .setScrollFactor(0);

        // Scale the tile to show more of the sky (smaller scale = more visible)
        this.bgLayer.setTileScale(1, 0.5);
    }

    private createBuildings(): void {
        BUILDINGS.forEach((config) => {
            // Create building sprite - use debug values for position
            const debugVal = (this.debugValues as any)[config.id] || { x: config.x, y: GROUND_Y, scale: BUILDING_SCALE };
            const building = this.add.image(debugVal.x, debugVal.y, config.textureKey)
                .setScale(debugVal.scale)
                .setOrigin(0.5, 1) // Bottom center anchor
                .setInteractive({ useHandCursor: true });

            // Store reference
            this.buildingSprites.set(config.id, building);

            // Create name label above building
            const label = this.add.text(debugVal.x, debugVal.y - building.displayHeight - 10, config.name, {
                fontSize: '18px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4,
                shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, fill: true }
            }).setOrigin(0.5, 1);

            this.nameLabels.set(config.id, label);

            // Building interactions
            building.on('pointerover', () => this.onBuildingHover(config.id, true));
            building.on('pointerout', () => this.onBuildingHover(config.id, false));
            building.on('pointerdown', () => this.onBuildingClick(config.id));
        });
    }

    private createBackgroundGrass(): void {
        // Background grass layer - sits behind buildings
        const bgGrassY = this.debugValues.bgGrass.y;
        this.bgGrassLayer = this.add.tileSprite(0, bgGrassY, WORLD_WIDTH * 2, BG_GRASS_HEIGHT, 'town-grass')
            .setOrigin(0, 1)
            .setScrollFactor(0)
            .setAlpha(0.8);  // Slightly transparent for depth

        // Scale the grass texture
        this.bgGrassLayer.setTileScale(this.debugValues.bgGrass.scale, BG_GRASS_HEIGHT / 427);
    }

    private createForegroundGrass(): void {
        // Foreground grass layer - sits in front of buildings (at character feet level)
        this.grassLayer = this.add.tileSprite(0, 600, WORLD_WIDTH * 2, GRASS_DISPLAY_HEIGHT, 'town-grass')
            .setOrigin(0, 1)
            .setScrollFactor(0);

        // Scale the grass texture
        this.grassLayer.setTileScale(this.debugValues.fgGrass.scale, GRASS_DISPLAY_HEIGHT / 427);
    }

    private createKnight(): void {
        // Knight sprite - use debug values
        this.knight = this.add.sprite(this.debugValues.knight.x, this.debugValues.knight.y, 'knight', 0)
            .setScale(this.debugValues.knight.scale)
            .setOrigin(0.5, 1);

        // Play idle animation
        this.knight.play('knight-idle');
    }

    private createInteriorOverlay(): void {
        // Interior overlay container (hidden by default)
        this.interiorOverlay = this.add.container(400, 300);
        this.interiorOverlay.setScrollFactor(0);
        this.interiorOverlay.setDepth(100);
        this.interiorOverlay.setVisible(false);

        // Dark background
        const bg = this.add.rectangle(0, 0, 800, 600, 0x000000, 0.85);
        this.interiorOverlay.add(bg);

        // Content will be added dynamically when entering a building
    }

    private onBuildingHover(buildingId: string, isOver: boolean): void {
        if (this.townState !== 'exploring') return;

        const building = this.buildingSprites.get(buildingId);
        const label = this.nameLabels.get(buildingId);

        if (building && label) {
            if (isOver) {
                // Scale up and brighten
                this.tweens.add({
                    targets: building,
                    scaleX: BUILDING_SCALE * 1.05,
                    scaleY: BUILDING_SCALE * 1.05,
                    duration: 150,
                    ease: 'Back.easeOut'
                });
                building.setTint(0xffffcc);

                // Label bounce
                this.tweens.add({
                    targets: label,
                    scaleX: 1.1,
                    scaleY: 1.1,
                    duration: 150,
                    ease: 'Back.easeOut'
                });
            } else {
                // Reset
                this.tweens.add({
                    targets: building,
                    scaleX: BUILDING_SCALE,
                    scaleY: BUILDING_SCALE,
                    duration: 150
                });
                building.clearTint();

                this.tweens.add({
                    targets: label,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 150
                });
            }
        }
    }

    private onBuildingClick(buildingId: string): void {
        if (this.townState !== 'exploring') return;

        const building = this.buildingSprites.get(buildingId);
        if (!building) return;

        this.townState = 'walking';
        this.currentBuilding = buildingId;

        // Disable all building interactions while walking
        this.buildingSprites.forEach(b => b.disableInteractive());

        // Calculate target position (in front of building door)
        const targetX = building.x;

        // Flip knight based on direction
        this.knight.setFlipX(targetX < this.knight.x);

        // Calculate duration based on distance
        const distance = Math.abs(targetX - this.knight.x);
        const duration = (distance / KNIGHT_SPEED) * 1000;

        // Cancel any existing walk tween
        if (this.walkTween) {
            this.walkTween.stop();
        }

        // Walk to building
        this.walkTween = this.tweens.add({
            targets: this.knight,
            x: targetX,
            duration: duration,
            ease: 'Linear',
            onComplete: () => {
                this.enterBuilding(buildingId);
            }
        });
    }

    private enterBuilding(buildingId: string): void {
        this.townState = 'inside';

        // Fade knight out
        this.tweens.add({
            targets: this.knight,
            alpha: 0,
            duration: 200
        });

        // Show interior overlay
        this.showInterior(buildingId);
    }

    private showInterior(buildingId: string): void {
        const config = BUILDINGS.find(b => b.id === buildingId);
        if (!config) return;

        // Clear previous interior content (keep background)
        while (this.interiorOverlay.length > 1) {
            this.interiorOverlay.removeAt(1, true);
        }

        // Title
        const title = this.add.text(0, -200, config.name, {
            fontSize: '42px',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);
        this.interiorOverlay.add(title);

        // Placeholder message
        const message = this.add.text(0, 0, 'Připravujeme...', {
            fontSize: '28px',
            color: '#cccccc',
            fontStyle: 'italic'
        }).setOrigin(0.5);
        this.interiorOverlay.add(message);

        // Exit button
        const exitBtn = this.add.text(0, 150, '[ Zpět ]', {
            fontSize: '24px',
            color: '#ffcc00',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        exitBtn.on('pointerover', () => exitBtn.setColor('#ffffff'));
        exitBtn.on('pointerout', () => exitBtn.setColor('#ffcc00'));
        exitBtn.on('pointerdown', () => this.exitBuilding());

        this.interiorOverlay.add(exitBtn);

        // Show with fade
        this.interiorOverlay.setAlpha(0);
        this.interiorOverlay.setVisible(true);
        this.tweens.add({
            targets: this.interiorOverlay,
            alpha: 1,
            duration: 300
        });
    }

    private exitBuilding(): void {
        // Hide interior
        this.tweens.add({
            targets: this.interiorOverlay,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.interiorOverlay.setVisible(false);
            }
        });

        // Show knight
        this.tweens.add({
            targets: this.knight,
            alpha: 1,
            duration: 200
        });

        // Re-enable building interactions
        this.buildingSprites.forEach(b => b.setInteractive({ useHandCursor: true }));

        this.townState = 'exploring';
        this.currentBuilding = null;
    }

    private animateLabels(): void {
        // Subtle floating animation for labels
        this.nameLabels.forEach((label, id) => {
            this.tweens.add({
                targets: label,
                y: label.y - 5,
                duration: 1500 + Math.random() * 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
    }

    private setupDebugMode(): void {
        // Create debug text overlay (hidden by default)
        this.debugText = this.add.text(10, 10, '', {
            fontSize: '14px',
            color: '#00ff00',
            backgroundColor: '#000000',
            padding: { x: 10, y: 10 }
        }).setDepth(1000).setScrollFactor(0).setVisible(false);

        // Keyboard controls
        this.input.keyboard!.on('keydown-D', () => {
            this.debugMode = !this.debugMode;
            this.debugText.setVisible(this.debugMode);
            if (this.debugMode) {
                this.updateDebugDisplay();
            }
        });

        this.input.keyboard!.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            if (this.debugMode) {
                this.debugSelection = (this.debugSelection + 1) % this.debugElements.length;
                this.updateDebugDisplay();
            }
        });

        this.input.keyboard!.on('keydown-SHIFT_LEFT', () => {
            if (this.debugMode) {
                console.log('=== CURRENT DEBUG VALUES ===');
                console.log(JSON.stringify(this.debugValues, null, 2));
                console.log('===========================');
            }
        });

        this.input.keyboard!.on('keydown-S', () => {
            if (this.debugMode) {
                this.saveDebugValues();
            }
        });
    }

    private saveDebugValues(): void {
        const json = JSON.stringify(this.debugValues, null, 2);

        // Save to localStorage
        localStorage.setItem('townSceneDebugValues', json);

        // Create modal overlay to display values
        const overlay = this.add.container(400, 300).setDepth(2000).setScrollFactor(0);

        const bg = this.add.rectangle(0, 0, 700, 500, 0x000000, 0.95);
        overlay.add(bg);

        const title = this.add.text(0, -220, 'Debug Values Saved!', {
            fontSize: '24px',
            color: '#00ff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        overlay.add(title);

        const instructions = this.add.text(0, -190, 'Values saved to localStorage. Copy from below:', {
            fontSize: '14px',
            color: '#ffffff'
        }).setOrigin(0.5);
        overlay.add(instructions);

        const text = this.add.text(0, -50, json, {
            fontSize: '12px',
            color: '#00ff00',
            fontFamily: 'monospace',
            backgroundColor: '#222222',
            padding: { x: 15, y: 15 }
        }).setOrigin(0.5);
        overlay.add(text);

        const closeBtn = this.add.text(0, 210, 'Press SPACE or ESC to close', {
            fontSize: '16px',
            color: '#ffff00'
        }).setOrigin(0.5);
        overlay.add(closeBtn);

        // Add close handlers
        const closeHandler = () => {
            overlay.destroy();
            this.input.keyboard!.off('keydown-SPACE', closeHandler);
            this.input.keyboard!.off('keydown-ESC', closeHandler);
        };

        this.input.keyboard!.once('keydown-SPACE', closeHandler);
        this.input.keyboard!.once('keydown-ESC', closeHandler);
    }

    private updateDebugDisplay(): void {
        const element = this.debugElements[this.debugSelection];
        const vals = (this.debugValues as any)[element];

        let valueDisplay = '';
        if (vals) {
            if ('x' in vals) valueDisplay += `\n  X: ${vals.x.toFixed(0)}`;
            if ('y' in vals) valueDisplay += `\n  Y: ${vals.y.toFixed(0)}`;
            if ('scale' in vals) valueDisplay += `\n  Scale: ${vals.scale.toFixed(3)}`;
        }

        this.debugText.setText([
            '=== DEBUG MODE (Press D to toggle) ===',
            `Selected: ${element.toUpperCase()} (TAB to cycle)`,
            '',
            'Controls:',
            '  ←/→: Move X (Left/Right for buildings/knight)',
            '  ↑/↓: Move Y position',
            '  P/L: Scale up/down',
            '  S: Save & show values',
            '',
            `Current:${valueDisplay}`,
        ].join('\n'));
    }

    private applyDebugChanges(): void {
        const element = this.debugElements[this.debugSelection];

        // Update individual buildings
        if (['witch', 'guild', 'tavern', 'shop'].includes(element)) {
            const building = this.buildingSprites.get(element);
            const vals = (this.debugValues as any)[element];
            if (building && vals) {
                building.setPosition(vals.x, vals.y);
                building.setScale(vals.scale);

                // Update label
                const label = this.nameLabels.get(element);
                if (label) {
                    label.setPosition(vals.x, vals.y - building.displayHeight - 10);
                }
            }
        }

        // Update knight
        if (element === 'knight') {
            const vals = this.debugValues.knight;
            this.knight.setPosition(vals.x, vals.y);
            this.knight.setScale(vals.scale);
        }

        // Update background grass
        if (element === 'bgGrass') {
            const vals = this.debugValues.bgGrass;
            this.bgGrassLayer.setY(vals.y);
            this.bgGrassLayer.setTileScale(vals.scale, BG_GRASS_HEIGHT / 427);
        }

        // Update foreground grass
        if (element === 'fgGrass') {
            const vals = this.debugValues.fgGrass;
            this.grassLayer.setTileScale(vals.scale, GRASS_DISPLAY_HEIGHT / 427);
        }

        // Update background
        if (element === 'background') {
            const vals = this.debugValues.background;
            this.bgLayer.setTileScale(1, vals.scale);
        }
    }

    update(): void {
        // Update parallax
        const scrollX = this.cameras.main.scrollX;
        this.bgLayer.tilePositionX = scrollX * PARALLAX_BG;
        this.grassLayer.tilePositionX = scrollX;

        if (!this.debugMode) return;

        // Debug mode controls
        const cursors = this.input.keyboard!.createCursorKeys();
        const element = this.debugElements[this.debugSelection];
        const vals = (this.debugValues as any)[element];
        if (!vals) return;

        let changed = false;
        const step = 5;
        const scaleStep = 0.01;

        // Movement controls
        if (Phaser.Input.Keyboard.JustDown(cursors.up!)) {
            if ('y' in vals) {
                vals.y -= step;
                changed = true;
            }
        }

        if (Phaser.Input.Keyboard.JustDown(cursors.down!)) {
            if ('y' in vals) {
                vals.y += step;
                changed = true;
            }
        }

        if (Phaser.Input.Keyboard.JustDown(cursors.left!)) {
            if ('x' in vals) {
                vals.x -= step;
                changed = true;
            }
        }

        if (Phaser.Input.Keyboard.JustDown(cursors.right!)) {
            if ('x' in vals) {
                vals.x += step;
                changed = true;
            }
        }

        // Scale controls - P to increase, L to decrease
        const pKey = this.input.keyboard!.addKey('P');
        const lKey = this.input.keyboard!.addKey('L');

        if (Phaser.Input.Keyboard.JustDown(pKey)) {
            if ('scale' in vals) {
                vals.scale += scaleStep;
                changed = true;
            }
        }

        if (Phaser.Input.Keyboard.JustDown(lKey)) {
            if ('scale' in vals) {
                vals.scale = Math.max(0.05, vals.scale - scaleStep);
                changed = true;
            }
        }

        if (changed) {
            this.applyDebugChanges();
            this.updateDebugDisplay();
        }
    }
}

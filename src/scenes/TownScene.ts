import Phaser from 'phaser';

// Building configuration
interface BuildingConfig {
    id: string;
    name: string;
    textureKey: string;
    x: number;
}

const BUILDINGS: BuildingConfig[] = [
    { id: 'witch', name: 'Chaloupka čarodějnice', textureKey: 'building-witch', x: 150 },
    { id: 'guild', name: 'Cech', textureKey: 'building-guild', x: 300 },
    { id: 'tavern', name: 'Hospoda', textureKey: 'building-tavern', x: 500 },
    { id: 'shop', name: 'Obchod', textureKey: 'building-shop', x: 650 },
];

// Scene constants
const WORLD_WIDTH = 800;
const BUILDING_SCALE = 0.28;
const GRASS_SCALE = 0.33;     // Zoom out grass 3x
const GRASS_DISPLAY_HEIGHT = 140;  // How tall grass appears on screen
const GROUND_Y = 600 - GRASS_DISPLAY_HEIGHT + 30;  // Where ground level is
const KNIGHT_SPEED = 200;
const PARALLAX_BG = 0.3;

type TownState = 'exploring' | 'walking' | 'inside';

export class TownScene extends Phaser.Scene {
    private bgLayer!: Phaser.GameObjects.TileSprite;
    private grassLayer!: Phaser.GameObjects.TileSprite;
    private knight!: Phaser.GameObjects.Sprite;
    private buildingSprites: Map<string, Phaser.GameObjects.Image> = new Map();
    private nameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
    private townState: TownState = 'exploring';
    private currentBuilding: string | null = null;
    private interiorOverlay!: Phaser.GameObjects.Container;
    private walkTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super({ key: 'TownScene' });
    }

    create(): void {
        this.townState = 'exploring';
        this.currentBuilding = null;

        // Set up world bounds (single screen, no scrolling needed)
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 600);

        // Create parallax layers
        this.createBackground();
        this.createBuildings();
        this.createGrass();
        this.createKnight();
        this.createInteriorOverlay();

        // Camera is static - everything fits on one screen
        // No follow or deadzone needed

        // Start floating animation for labels
        this.animateLabels();
    }

    private createBackground(): void {
        // Background layer - sky and mountains (1456x816)
        // Scale to fill screen height, tile horizontally
        this.bgLayer = this.add.tileSprite(0, 0, WORLD_WIDTH * 2, 600, 'town-bg')
            .setOrigin(0, 0)
            .setScrollFactor(0);

        // Scale the tile to show more of the sky (zoom out vertically)
        this.bgLayer.setTileScale(1, 600 / 816);
    }

    private createBuildings(): void {
        BUILDINGS.forEach((config) => {
            // Create building sprite - bottom center sits on ground
            const building = this.add.image(config.x, GROUND_Y, config.textureKey)
                .setScale(BUILDING_SCALE)
                .setOrigin(0.5, 1) // Bottom center anchor
                .setInteractive({ useHandCursor: true });

            // Store reference
            this.buildingSprites.set(config.id, building);

            // Create name label above building
            const label = this.add.text(config.x, GROUND_Y - building.displayHeight - 10, config.name, {
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

    private createGrass(): void {
        // Grass layer - foreground (tiles horizontally)
        // Original is 5000x427, scale down to ~1/3 size
        this.grassLayer = this.add.tileSprite(0, 600, WORLD_WIDTH * 2, GRASS_DISPLAY_HEIGHT, 'town-grass')
            .setOrigin(0, 1)
            .setScrollFactor(0);

        // Scale the grass texture to appear zoomed out (smaller blades)
        this.grassLayer.setTileScale(GRASS_SCALE, GRASS_DISPLAY_HEIGHT / 427);
    }

    private createKnight(): void {
        // Knight sprite - starts on the left, feet on ground
        this.knight = this.add.sprite(80, GROUND_Y, 'knight', 0)
            .setScale(0.4)
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

    update(): void {
        // Update parallax based on camera scroll
        const scrollX = this.cameras.main.scrollX;

        // Background parallax (slowest)
        this.bgLayer.tilePositionX = scrollX * PARALLAX_BG;

        // Grass parallax (foreground, moves with camera)
        this.grassLayer.tilePositionX = scrollX;

        // Buildings move with a medium parallax factor
        // Since buildings have normal scrollFactor, we adjust their visual position
        // Actually buildings should scroll naturally, so we don't need to adjust
    }
}

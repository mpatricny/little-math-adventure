import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { JourneySystem } from '../systems/JourneySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { ManaSystem } from '../systems/ManaSystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

/**
 * Scene initialization data
 */
interface SceneData {
    roomId?: string;
    fromDirection?: 'left' | 'right';
    battleWon?: boolean;
    defeatedObjectId?: string;
}

/**
 * Room object from forest-rooms.json
 */
interface RoomObject {
    id: string;
    type: string;
    enemyId?: string;
    x: number;
    y: number;
    sprite?: string;
    aggroRadius?: number;
    hidden?: boolean;
    appearsAfter?: {
        puzzleSolved?: string;
        objectDefeated?: string;
    };
}

/**
 * Puzzle configuration defines the sequence and which slots are drop zones
 */
interface RiddleConfig {
    // Full sequence (e.g., [2, 4, 6, 8, 10])
    sequence: number[];
    // Indices that are fixed (shown on stepping stones)
    fixedIndices: number[];
    // Distractor values to show on floating rocks (in addition to correct answers)
    distractors: number[];
    // Mana reward for solving
    manaReward: number;
    // Damage on wrong answer
    wrongAnswerDamage: number;
}

/**
 * Represents a floating rock that can be dragged
 */
interface FloatingRock {
    container: Phaser.GameObjects.Container;
    value: number;
    originalX: number;
    originalY: number;
    placedInSlot: number | null;
}

/**
 * Represents a stepping stone slot (drop zone)
 */
interface SteppingStone {
    slotIndex: number;
    x: number;
    y: number;
    isDropZone: boolean;
    expectedValue: number | null;
    currentValue: number | null;
    zone?: Phaser.GameObjects.Zone;
}

/**
 * ForestRiddleScene - Explorable room with a bridge puzzle
 *
 * The player walks into a forest clearing with a stone bridge.
 * Floating magical stones hover nearby with numbers.
 * The player must drag the correct stones onto stepping stones
 * to complete a number sequence and unlock the bridge.
 *
 * Key mechanics:
 * - Player can walk around the room
 * - Bridge blocks passage until puzzle is solved
 * - Validation only triggers when BOTH drop zones are filled
 * - Wrong answers: screen shake, red flash, -1 HP, rocks reset
 * - Correct answer: blue particles, +3 mana, bridge unlocks
 */
export class ForestRiddleScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private journeySystem = JourneySystem.getInstance();
    private gameState = GameStateManager.getInstance();

    // Puzzle configs keyed by roomId — allows reuse of this scene for multiple bridge riddles
    private static PUZZLE_CONFIGS: Record<string, {
        sequence: number[];
        fixedIndices: number[];
        distractors: number[];
        stoneDisplayValues: number[];
        dropZoneConfig: { expectedValue: number; sequenceIndex: number }[];
        floatingRockValues: number[];
    }> = {
        'forest_riddle': {
            sequence: [2, 4, 6, 8, 10, 12, 14],
            fixedIndices: [0, 2, 3, 4, 6],
            distractors: [3, 5, 7],
            stoneDisplayValues: [2, 6, 8, 10, 14],
            dropZoneConfig: [
                { expectedValue: 4, sequenceIndex: 1 },
                { expectedValue: 12, sequenceIndex: 5 }
            ],
            floatingRockValues: [4, 12, 3, 7, 5]
        },
        'ancient_bridge': {
            sequence: [3, 6, 9, 12, 15, 18, 21],
            fixedIndices: [0, 2, 3, 4, 6],
            distractors: [5, 10, 14],
            stoneDisplayValues: [3, 9, 12, 15, 21],
            dropZoneConfig: [
                { expectedValue: 6, sequenceIndex: 1 },
                { expectedValue: 18, sequenceIndex: 5 }
            ],
            floatingRockValues: [5, 18, 14, 6, 10]
        }
    };

    // Scene data
    private roomId = 'forest_riddle';
    private fromDirection?: 'left' | 'right';

    // Puzzle configuration (selected from PUZZLE_CONFIGS in init())
    private config: RiddleConfig = {
        sequence: [2, 4, 6, 8, 10, 12, 14],
        fixedIndices: [0, 2, 3, 4, 6],
        distractors: [3, 5, 7],
        manaReward: 3,
        wrongAnswerDamage: 1
    };

    // Values driven by selected puzzle config
    private stoneDisplayValues = [2, 6, 8, 10, 14];

    private dropZoneConfig = [
        { expectedValue: 4, sequenceIndex: 1 },
        { expectedValue: 12, sequenceIndex: 5 },
    ];

    // Floating rock element IDs from scenes.json (shared visual layout)
    private floatingRockIds = [
        'rock with number',
        'rock with number_1',
        'rock with number_2',
        'rock with number_3',
        'rock with number_4',
    ];

    private floatingRockValues = [4, 12, 3, 7, 5];

    // Game state
    private floatingRocks: FloatingRock[] = [];
    private steppingStones: SteppingStone[] = [];
    private puzzleSolved = false;
    private bridgeUnlocked = false;

    // Player
    private player!: Phaser.GameObjects.Sprite;
    private isWalking = false;
    private hasCrossedBridge = false;  // Once crossed, no going back

    // Bridge blocker position (X coordinate where player can't pass)
    private bridgeBlockX = 280;

    // Room data (objects like mushroom)
    private roomData: { objects: RoomObject[]; battleBackground?: string; exits?: { targetRoom: string; direction: string }[] } | null = null;
    private mushroomSprite: Phaser.GameObjects.Container | null = null;
    private mushroomDefeated = false;
    private battleWon = false;
    private defeatedObjectId?: string;

    // Path heights - player Y is fixed based on X position (no free vertical movement)
    // Before bridge: flat path at y=590
    // Ascending: from bridgeBlockX to first bridge point
    // On bridge top: flat between two points (295-980) at y=520
    // Descending: from second bridge point to exit path
    private getPathY(x: number): number {
        const bridgeStartX = 280;      // Start ascending (near block point)
        const bridgeTopStartX = 295;   // First bridge top point
        const bridgeTopEndX = 980;     // Second bridge top point
        const bridgeEndX = 1000;       // End descending

        if (x < bridgeStartX) {
            // Before bridge - flat path
            return 590;
        } else if (x < bridgeTopStartX) {
            // Ascending to bridge top
            const progress = (x - bridgeStartX) / (bridgeTopStartX - bridgeStartX);
            return 590 - (progress * 70);  // Rise from 590 to 520
        } else if (x <= bridgeTopEndX) {
            // On bridge top - flat
            return 520;
        } else if (x < bridgeEndX) {
            // Descending from bridge
            const progress = (x - bridgeTopEndX) / (bridgeEndX - bridgeTopEndX);
            return 520 + (progress * 60);  // Go down to 580
        } else {
            // After bridge - flat path
            return 580;
        }
    }

    constructor() {
        super({ key: 'ForestRiddleScene' });
    }

    init(data: SceneData) {
        this.roomId = data.roomId || 'forest_riddle';
        this.fromDirection = data.fromDirection;
        this.battleWon = data.battleWon || false;
        this.defeatedObjectId = data.defeatedObjectId;
        this.puzzleSolved = false;
        this.bridgeUnlocked = false;
        this.floatingRocks = [];
        this.steppingStones = [];
        this.isWalking = false;
        this.hasCrossedBridge = false;
        this.mushroomSprite = null;
        this.mushroomDefeated = false;

        // Select puzzle config based on roomId
        const puzzleConfig = ForestRiddleScene.PUZZLE_CONFIGS[this.roomId]
            ?? ForestRiddleScene.PUZZLE_CONFIGS['forest_riddle'];
        this.config = {
            sequence: puzzleConfig.sequence,
            fixedIndices: puzzleConfig.fixedIndices,
            distractors: puzzleConfig.distractors,
            manaReward: 3,
            wrongAnswerDamage: 1
        };
        this.stoneDisplayValues = puzzleConfig.stoneDisplayValues;
        this.dropZoneConfig = puzzleConfig.dropZoneConfig;
        this.floatingRockValues = puzzleConfig.floatingRockValues;

        // Check if puzzle was already solved in this journey
        const state = this.journeySystem.getObjectState(this.roomId, 'bridge_riddle');
        if (state?.completed) {
            this.puzzleSolved = true;
            this.bridgeUnlocked = true;
        }

        // Check if mushroom was already defeated
        const mushroomState = this.journeySystem.getObjectState(this.roomId, 'mushroom_1');
        if (mushroomState?.defeated) {
            this.mushroomDefeated = true;
        }

        // Handle returning from battle
        if (this.battleWon && this.defeatedObjectId) {
            this.journeySystem.setObjectState(this.roomId, this.defeatedObjectId, {
                interacted: true,
                defeated: true
            });
            if (this.defeatedObjectId === 'mushroom_1') {
                this.mushroomDefeated = true;
                // If returning from mushroom battle, puzzle MUST have been solved
                // (otherwise mushroom wouldn't have appeared)
                this.puzzleSolved = true;
                this.bridgeUnlocked = true;
            }
        }

        // Load room data from cache (keyed by roomId, not hardcoded)
        this.roomData = this.cache.json.get('forestRooms')?.rooms?.[this.roomId] || null;

        // BLOCK: Cannot enter this scene from the right (no backtracking)
        if (this.fromDirection === 'right') {
            // Find the right exit's target room to redirect back to
            const rightExit = this.roomData?.exits?.find((e: any) => e.direction === 'right');
            const redirectRoom = rightExit?.targetRoom || 'deep_forest';
            this.scene.start('ForestRoomScene', {
                roomId: redirectRoom,
                fromDirection: 'left'
            });
        }
    }

    create(): void {
        // Build scene from JSON (background + floating rocks from scene editor)
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('ForestRiddleScene');

        // Update journey system with current room
        this.journeySystem.setCurrentRoom(this.roomId);

        // Create background (if not from scene editor)
        this.createFallbackBackground();

        // Initialize stepping stones (drop zones)
        this.setupSteppingStones();

        // Initialize floating rocks (draggables) - only if puzzle not solved
        if (!this.puzzleSolved) {
            this.setupFloatingRocks();
            this.setupDragEvents();
        } else {
            // Puzzle already solved - place correct rocks in drop zones, destroy distractors
            this.placeCorrectRocksInSolvedState();
        }

        // Create player
        this.createPlayer();

        // Create mushroom if puzzle is solved and mushroom not defeated
        if (this.puzzleSolved && !this.mushroomDefeated) {
            this.createMushroom();
        }

        // Create UI
        this.createUI();

        // Setup click to move
        this.setupClickToMove();

        // Add title
        this.add.text(640, 50, 'Most s hádankou', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

        // Add instruction if puzzle not solved
        if (!this.puzzleSolved) {
            this.add.text(640, 100, 'Doplň správná čísla na kameny', {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaffaa',
                fontStyle: 'italic'
            }).setOrigin(0.5).setDepth(100);
        }

        // Fade in
        this.cameras.main.fadeIn(300, 0, 0, 0);
    }

    /**
     * Create a fallback gradient background if no texture exists
     */
    private createFallbackBackground(): void {
        // Check if background already exists from scene builder
        const bgContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Forest Riddle');
        if (bgContainer) return;

        // Fallback: gradient forest background
        const graphics = this.add.graphics();

        // Sky gradient
        for (let y = 0; y < 400; y++) {
            const ratio = y / 400;
            const r = Math.floor(30 + ratio * 20);
            const g = Math.floor(60 + ratio * 40);
            const b = Math.floor(30 + ratio * 30);
            graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
            graphics.fillRect(0, y, 1280, 1);
        }

        // Ground gradient
        for (let y = 400; y < 720; y++) {
            const ratio = (y - 400) / 320;
            const r = Math.floor(40 + ratio * 20);
            const g = Math.floor(80 + ratio * 30);
            const b = Math.floor(40 + ratio * 20);
            graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
            graphics.fillRect(0, y, 1280, 1);
        }

        graphics.setDepth(-10);
    }

    /**
     * Create the player sprite
     */
    private createPlayer(): void {
        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        // Spawn position based on entry direction (Y follows path)
        let spawnX = 80;

        if (this.fromDirection === 'right') {
            spawnX = 1100;
            this.hasCrossedBridge = true;  // Coming from right means already crossed
        }

        // Override spawn to defeated enemy position (player continues from where they fought)
        if (this.battleWon && this.defeatedObjectId) {
            const defeatedObj = this.roomData?.objects?.find(o => o.id === this.defeatedObjectId);
            if (defeatedObj) {
                spawnX = defeatedObj.x;
                this.hasCrossedBridge = true; // Mushroom is on far side, so player crossed
            }
        }

        const spawnY = this.getPathY(spawnX);

        this.player = this.add.sprite(spawnX, spawnY, spriteConfig.idleTexture)
            .setScale(1.0)
            .setDepth(10)
            .play(spriteConfig.idleAnim);

        // Flip based on entry direction
        if (this.fromDirection === 'right') {
            this.player.setFlipX(true);
        }
    }

    /**
     * Setup stepping stones and drop zones
     *
     * Layout: [Stone:2] [DROP] [Stone:6] [Stone:8] [Stone:10] [DROP] [Stone:14]
     *
     * - 5 stepping stones in the stream show fixed numbers
     * - 2 drop zones are in the GAPS between stones
     */
    private setupSteppingStones(): void {
        // Get the background container to update its text areas
        const bgContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Forest Riddle');

        // Stepping stone positions (from template text areas)
        // These 5 positions show fixed numbers on the stream rocks
        const stonePositions = [
            { x: 359 + 23, y: 592 + 23 },  // Stone 0 - shows "2"
            { x: 534 + 23, y: 587 + 23 },  // Stone 1 - shows "6"
            { x: 629 + 23, y: 590 + 23 },  // Stone 2 - shows "8"
            { x: 727 + 23, y: 587 + 23 },  // Stone 3 - shows "10"
            { x: 887 + 23, y: 588 + 23 },  // Stone 4 - shows "14"
        ];

        // Update the text areas in the background template to show correct numbers
        if (bgContainer) {
            const textObjects = bgContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
            if (textObjects) {
                let stoneIndex = 0;
                for (const [, info] of textObjects) {
                    if (stoneIndex < this.stoneDisplayValues.length) {
                        info.text.setText(this.stoneDisplayValues[stoneIndex].toString());
                        stoneIndex++;
                    }
                }
            }
        }

        // Calculate drop zone positions (in the GAPS between stepping stones)
        // Drop zone 0: between stone 0 (x:382) and stone 1 (x:557) - midpoint ~470
        // Drop zone 1: between stone 3 (x:750) and stone 4 (x:910) - midpoint ~830
        // Y position lowered to fit rocks properly between the stepping stones
        const dropZonePositions = [
            { x: (stonePositions[0].x + stonePositions[1].x) / 2, y: 625 },  // Gap between 2 and 6
            { x: (stonePositions[3].x + stonePositions[4].x) / 2, y: 625 },  // Gap between 10 and 14
        ];

        // Create drop zone data structures
        this.dropZoneConfig.forEach((dzConfig, dropIndex) => {
            const pos = dropZonePositions[dropIndex];

            const stone: SteppingStone = {
                slotIndex: dropIndex,
                x: pos.x,
                y: pos.y,
                isDropZone: true,
                expectedValue: dzConfig.expectedValue,
                currentValue: null,
            };

            // Create drop zone (only if puzzle not solved)
            if (!this.puzzleSolved) {
                const zone = this.add.zone(pos.x, pos.y, 70, 70)
                    .setRectangleDropZone(70, 70)
                    .setData('slotIndex', dropIndex)
                    .setDepth(50);

                stone.zone = zone;

                // Visual indicator for drop zone (question mark with glow)
                this.add.text(pos.x, pos.y, '?', {
                    fontSize: '44px',
                    fontFamily: 'Arial',
                    color: '#88ccff',
                    fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(55).setData('slotIndex', dropIndex).setName(`dropZoneText_${dropIndex}`);

                // Add subtle glow effect to drop zone
                const glow = this.add.circle(pos.x, pos.y, 35, 0x88ccff, 0.2).setDepth(45);
                this.tweens.add({
                    targets: glow,
                    alpha: 0.4,
                    scale: 1.1,
                    duration: 800,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
            // When puzzle is solved, rocks are placed by placeCorrectRocksInSolvedState()

            this.steppingStones.push(stone);
        });
    }

    /**
     * Setup floating rocks as draggable objects
     * Reads positions from sceneBuilder and makes them interactive
     */
    private setupFloatingRocks(): void {
        this.floatingRockIds.forEach((id, index) => {
            const container = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
            if (!container) {
                console.warn(`[ForestRiddleScene] Floating rock not found: ${id}`);
                return;
            }

            const value = this.floatingRockValues[index];
            const originalX = container.x;
            const originalY = container.y;

            // Store rock data
            const rock: FloatingRock = {
                container,
                value,
                originalX,
                originalY,
                placedInSlot: null
            };

            // Make container draggable
            container.setSize(130 * 0.7, 150 * 0.7);  // Template size * scale
            container.setInteractive({ useHandCursor: true, draggable: true });
            container.setData('rockIndex', index);
            container.setData('value', value);
            container.setDepth(60);

            // Update the text in the rock to show the value
            this.updateRockText(container, value.toString());

            // Add floating animation
            this.addFloatingAnimation(container, originalY);

            this.floatingRocks.push(rock);
        });
    }

    /**
     * Place correct answer rocks in their solved positions when puzzle was already solved
     * Destroys distractor rocks, keeps and positions correct answer rocks
     */
    private placeCorrectRocksInSolvedState(): void {
        // Calculate drop zone positions (same logic as setupSteppingStones)
        const stonePositions = [
            { x: 359 + 23, y: 592 + 23 },  // Stone 0
            { x: 534 + 23, y: 587 + 23 },  // Stone 1
            { x: 629 + 23, y: 590 + 23 },  // Stone 2
            { x: 727 + 23, y: 587 + 23 },  // Stone 3
            { x: 887 + 23, y: 588 + 23 },  // Stone 4
        ];

        const dropZonePositions = [
            { x: (stonePositions[0].x + stonePositions[1].x) / 2, y: 625 },
            { x: (stonePositions[3].x + stonePositions[4].x) / 2, y: 625 },
        ];

        // Match rocks to drop zones by value (correct answers can be at any index)
        const expectedValues = this.dropZoneConfig.map(dz => dz.expectedValue);

        this.floatingRockIds.forEach((id, index) => {
            const container = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
            if (!container) return;

            const rockValue = this.floatingRockValues[index];
            const dropZoneIndex = expectedValues.indexOf(rockValue);

            if (dropZoneIndex !== -1) {
                // Correct answer rock - position it in the matching drop zone
                const dropZonePos = dropZonePositions[dropZoneIndex];
                container.setPosition(dropZonePos.x, dropZonePos.y);
                container.setScale(0.7);  // Scaled down like when placed
                container.setDepth(60);

                // Update the text to show correct value
                this.updateRockText(container, rockValue.toString());
            } else {
                // Distractor rock - destroy it
                container.destroy();
            }
        });
    }

    /**
     * Update the text displayed on a floating rock
     */
    private updateRockText(container: Phaser.GameObjects.Container, text: string): void {
        // Find the text object in the container (created by UiElementBuilder)
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (textObjects) {
            for (const [, info] of textObjects) {
                info.text.setText(text);
            }
        }
    }

    /**
     * Add a gentle floating animation to a rock
     */
    private addFloatingAnimation(container: Phaser.GameObjects.Container, baseY: number): void {
        this.tweens.add({
            targets: container,
            y: baseY - 8,
            duration: 1500 + Math.random() * 500,  // Slight variation
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Setup global drag event handlers
     */
    private setupDragEvents(): void {
        // Drag start - bring to front and clear slot if placed
        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
            // Stop any active tweens on this object
            this.tweens.killTweensOf(gameObject);

            // If this rock was placed in a slot, clear that slot
            const rockIndex = gameObject.getData('rockIndex') as number;
            const rock = this.floatingRocks[rockIndex];
            if (rock && rock.placedInSlot !== null) {
                const stone = this.steppingStones[rock.placedInSlot];
                stone.currentValue = null;
                const textObj = this.children.getByName(`dropZoneText_${rock.placedInSlot}`) as Phaser.GameObjects.Text;
                if (textObj) {
                    textObj.setText('?');
                    textObj.setColor('#88ccff');
                    textObj.setScale(1);
                    textObj.setVisible(true);
                }
                rock.placedInSlot = null;
            }

            // Bring to front
            gameObject.setDepth(100);

            // Scale up slightly for pickup feel
            this.tweens.add({
                targets: gameObject,
                scaleX: 0.8,
                scaleY: 0.8,
                duration: 100,
                ease: 'Back.easeOut'
            });
        });

        // Drag - follow cursor
        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
        });

        // Drag enter - highlight drop zone
        this.input.on('dragenter', (_pointer: Phaser.Input.Pointer, _gameObject: Phaser.GameObjects.Container, dropZone: Phaser.GameObjects.Zone) => {
            const slotIndex = dropZone.getData('slotIndex') as number;
            const textObj = this.children.getByName(`dropZoneText_${slotIndex}`) as Phaser.GameObjects.Text;
            if (textObj) {
                textObj.setColor('#44ff44');
                textObj.setScale(1.2);
            }
        });

        // Drag leave - unhighlight drop zone
        this.input.on('dragleave', (_pointer: Phaser.Input.Pointer, _gameObject: Phaser.GameObjects.Container, dropZone: Phaser.GameObjects.Zone) => {
            const slotIndex = dropZone.getData('slotIndex') as number;
            const stone = this.steppingStones[slotIndex];
            const textObj = this.children.getByName(`dropZoneText_${slotIndex}`) as Phaser.GameObjects.Text;
            if (textObj && stone.currentValue === null) {
                textObj.setColor('#88ccff');
                textObj.setScale(1);
            }
        });

        // Drop - place rock in slot
        this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dropZone: Phaser.GameObjects.Zone) => {
            const slotIndex = dropZone.getData('slotIndex') as number;
            const rockIndex = gameObject.getData('rockIndex') as number;
            const rock = this.floatingRocks[rockIndex];
            const stone = this.steppingStones[slotIndex];

            // Check if slot is already occupied
            if (stone.currentValue !== null) {
                // Return rock to original position
                this.returnRockToOrigin(rock);
                return;
            }

            // Place rock in slot
            this.placeRockInSlot(rock, stone);
        });

        // Drag end - return to origin if not dropped on valid zone
        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container, dropped: boolean) => {
            const rockIndex = gameObject.getData('rockIndex') as number;
            const rock = this.floatingRocks[rockIndex];

            if (!dropped) {
                this.returnRockToOrigin(rock);
            }
        });
    }

    /**
     * Place a rock in a stepping stone slot
     */
    private placeRockInSlot(rock: FloatingRock, stone: SteppingStone): void {
        // If rock was in another slot, clear that slot
        if (rock.placedInSlot !== null) {
            const prevStone = this.steppingStones[rock.placedInSlot];
            prevStone.currentValue = null;
            const prevTextObj = this.children.getByName(`dropZoneText_${rock.placedInSlot}`) as Phaser.GameObjects.Text;
            if (prevTextObj) {
                prevTextObj.setText('?');
                prevTextObj.setColor('#88ccff');
                prevTextObj.setVisible(true);
            }
        }

        // Update stone state
        stone.currentValue = rock.value;
        rock.placedInSlot = stone.slotIndex;

        // Kill any existing tweens (floating animation) before placement
        this.tweens.killTweensOf(rock.container);

        // Snap rock to slot center (aligned with drop zone)
        this.tweens.add({
            targets: rock.container,
            x: stone.x,
            y: stone.y,  // Snap directly to drop zone position
            scaleX: 0.7,
            scaleY: 0.7,
            duration: 150,
            ease: 'Back.easeOut'
        });

        // Hide question mark
        const textObj = this.children.getByName(`dropZoneText_${stone.slotIndex}`) as Phaser.GameObjects.Text;
        if (textObj) {
            textObj.setVisible(false);
        }

        // Check solution after placement (deferred validation)
        this.checkSolution();
    }

    /**
     * Return a rock to its original position with animation
     */
    private returnRockToOrigin(rock: FloatingRock): void {
        // Clear slot if rock was placed
        if (rock.placedInSlot !== null) {
            const stone = this.steppingStones[rock.placedInSlot];
            stone.currentValue = null;
            const textObj = this.children.getByName(`dropZoneText_${rock.placedInSlot}`) as Phaser.GameObjects.Text;
            if (textObj) {
                textObj.setText('?');
                textObj.setColor('#88ccff');
                textObj.setScale(1);
                textObj.setVisible(true);
            }
            rock.placedInSlot = null;
        }

        // Animate back to origin
        this.tweens.add({
            targets: rock.container,
            x: rock.originalX,
            y: rock.originalY,
            scaleX: 0.7,
            scaleY: 0.7,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Restore floating animation
                rock.container.setDepth(60);
                this.addFloatingAnimation(rock.container, rock.originalY);
            }
        });
    }

    /**
     * Check if solution is complete (both slots filled)
     * Only validates when ALL drop zones have values
     */
    private checkSolution(): void {
        if (this.puzzleSolved) return;

        // Count filled drop zones
        const dropZones = this.steppingStones.filter(s => s.isDropZone);
        const filledSlots = dropZones.filter(s => s.currentValue !== null);

        // Only validate when ALL drop zones are filled
        if (filledSlots.length < dropZones.length) {
            return;  // Wait for all slots to be filled
        }

        // Check if all correct
        const isCorrect = dropZones.every(s => s.currentValue === s.expectedValue);

        if (isCorrect) {
            this.onPuzzleSolved();
        } else {
            this.onWrongAnswer();
        }
    }

    /**
     * Handle wrong answer - gentle shake, subtle flash, damage, reset rocks
     */
    private onWrongAnswer(): void {
        // 1. Gentle screen shake (reduced intensity)
        this.cameras.main.shake(200, 0.004);

        // 2. Subtle red tint overlay (gentler than flash)
        const redOverlay = this.add.rectangle(640, 360, 1280, 720, 0xff3333, 0.15).setDepth(200);
        this.tweens.add({
            targets: redOverlay,
            alpha: 0,
            duration: 300,
            onComplete: () => redOverlay.destroy()
        });

        // 3. -1 HP damage
        const player = this.gameState.getPlayer();
        player.hp = Math.max(0, player.hp - this.config.wrongAnswerDamage);
        this.gameState.save();

        // Show damage text at player position
        this.showFloatingText(`-${this.config.wrongAnswerDamage} HP`, '#ff4444', this.player.x, this.player.y - 50);

        // Check for death
        if (player.hp <= 0) {
            this.onPlayerDeath();
            return;
        }

        // 4. Return all rocks to origin after a delay
        this.time.delayedCall(400, () => {
            this.floatingRocks.forEach(rock => {
                this.returnRockToOrigin(rock);
            });
        });

        // Reset stepping stone states
        this.steppingStones.forEach(stone => {
            if (stone.isDropZone) {
                stone.currentValue = null;
            }
        });
    }

    /**
     * Handle puzzle solved - victory effects and unlock bridge
     */
    private onPuzzleSolved(): void {
        this.puzzleSolved = true;
        this.bridgeUnlocked = true;

        // Mark puzzle as completed in journey system
        this.journeySystem.setObjectState(this.roomId, 'bridge_riddle', {
            interacted: true,
            completed: true
        });

        // Disable further rock interaction
        this.floatingRocks.forEach(rock => {
            rock.container.disableInteractive();
        });

        // 1. Blue particles effect
        this.createBlueParticleEffect();

        // 2. Fade out only UNUSED floating rocks (keep placed ones to complete the bridge)
        this.floatingRocks.forEach(rock => {
            if (rock.placedInSlot === null) {
                // This rock wasn't used - fade it out
                this.tweens.add({
                    targets: rock.container,
                    alpha: 0,
                    y: rock.container.y - 30,
                    duration: 500,
                    ease: 'Power2.easeOut'
                });
            } else {
                // This rock is part of the completed bridge - keep it visible
                // Stop any floating animation and settle it in place
                this.tweens.killTweensOf(rock.container);
            }
        });

        // 3. Award mana
        const player = this.gameState.getPlayer();
        ManaSystem.add(player, this.config.manaReward);
        this.gameState.save();

        // Show reward
        this.showFloatingText(`+${this.config.manaReward} ✨ Mana`, '#44aaff', 640, 300);

        // 4. Victory flash
        this.cameras.main.flash(300, 100, 255, 100);

        // 5. Spawn enemy after a delay if room has one (blocks path forward)
        const hasEnemyObj = this.roomData?.objects?.some(o => o.type === 'enemy');
        if (hasEnemyObj) {
            this.time.delayedCall(2000, () => {
                if (!this.mushroomDefeated) {
                    this.createMushroom();
                    this.showMessage('Pozor! Něco blokuje cestu...');
                }
            });
        }
    }

    /**
     * Create the enemy sprite on the far side of the bridge (blocks path after puzzle)
     */
    private createMushroom(): void {
        if (this.mushroomSprite) return; // Already created

        const mushroomObj = this.roomData?.objects?.find(o => o.id === 'mushroom_1');
        if (!mushroomObj) {
            console.warn('Enemy object (mushroom_1) not found in room data');
            return;
        }

        // Create container for enemy
        const container = this.add.container(mushroomObj.x, mushroomObj.y);

        // Use the sprite from room data
        const spriteKey = mushroomObj.sprite || 'spritesheet--36--sheet';
        let enemySprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Circle;

        if (this.textures.exists(spriteKey)) {
            enemySprite = this.add.sprite(0, 0, spriteKey);
            enemySprite.setScale(1.5);

            // Apply scale and play idle animation from enemies.json or forest-enemies.json
            if (mushroomObj.enemyId) {
                const enemies = this.cache.json.get('enemies') as any[];
                let enemyDef = enemies?.find((e: any) => e.id === mushroomObj.enemyId);

                // Fallback to forest enemies
                if (!enemyDef && this.cache.json.has('forestEnemies')) {
                    const forestData = this.cache.json.get('forestEnemies') as any;
                    const fe = forestData?.enemies?.[mushroomObj.enemyId];
                    if (fe) {
                        enemyDef = { ...fe, attack: fe.atk, animPrefix: fe.animPrefix || fe.spriteKey?.replace('-sheet', '') };
                    }
                }

                if (enemyDef) {
                    if (enemyDef.scale) {
                        enemySprite.setScale(enemyDef.scale);
                    }
                    if (enemyDef.animPrefix) {
                        const idleAnim = `${enemyDef.animPrefix}-idle`;
                        if (this.anims.exists(idleAnim)) {
                            enemySprite.play(idleAnim);
                        }
                    }
                }
            }
        } else {
            // Fallback placeholder
            enemySprite = this.add.circle(0, 0, 40, 0x884422, 1);
        }

        container.add(enemySprite);
        container.setDepth(8);
        container.setSize(80, 100);

        // Store reference
        this.mushroomSprite = container;

        // Entrance animation - slide in from right
        container.setAlpha(0);
        container.x = mushroomObj.x + 100;
        this.tweens.add({
            targets: container,
            x: mushroomObj.x,
            alpha: 1,
            duration: 500,
            ease: 'Power2.easeOut'
        });
    }

    /**
     * Check if player is within aggro range of mushroom
     */
    private checkMushroomAggro(): boolean {
        if (!this.mushroomSprite || this.mushroomDefeated) return false;

        const mushroomObj = this.roomData?.objects?.find(o => o.id === 'mushroom_1');
        if (!mushroomObj?.aggroRadius) return false;

        const dx = this.player.x - mushroomObj.x;
        const dy = this.player.y - mushroomObj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance <= mushroomObj.aggroRadius;
    }

    /**
     * Start battle with mushroom
     */
    private startMushroomBattle(): void {
        const mushroomObj = this.roomData?.objects?.find(o => o.id === 'mushroom_1');
        if (!mushroomObj?.enemyId) return;

        const battleBg = this.roomData?.battleBackground || 'bg-battle';

        this.scene.start('BattleScene', {
            mode: 'journey',
            enemyId: mushroomObj.enemyId,
            returnScene: 'ForestRiddleScene',
            returnData: {
                roomId: this.roomId,
                defeatedObjectId: mushroomObj.id
            },
            backgroundKey: battleBg,
            isBoss: false
        });
    }

    /**
     * Create blue particle burst effect at stepping stones
     */
    private createBlueParticleEffect(): void {
        this.steppingStones.forEach(stone => {
            for (let i = 0; i < 15; i++) {
                const particle = this.add.circle(
                    stone.x + Phaser.Math.Between(-30, 30),
                    stone.y + Phaser.Math.Between(-30, 30),
                    Phaser.Math.Between(3, 8),
                    0x44aaff,
                    0.8
                ).setDepth(100);

                this.tweens.add({
                    targets: particle,
                    y: particle.y - 60,
                    alpha: 0,
                    scale: 0,
                    duration: 800 + Math.random() * 400,
                    ease: 'Power2.easeOut',
                    onComplete: () => particle.destroy()
                });
            }
        });
    }

    /**
     * Handle player death from wrong answers
     */
    private onPlayerDeath(): void {
        // Disable all interaction
        this.floatingRocks.forEach(rock => {
            rock.container.disableInteractive();
        });
        this.input.enabled = false;

        // Show death message
        this.showMessage('Padl jsi! Vracíš se k poslednímu odpočívadlu.');

        // Fade out and return to save point
        this.time.delayedCall(1500, () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);

            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.journeySystem.resumeFromRoomSavePoint();
                const room = this.journeySystem.getCurrentRoom() || 'forest_edge';
                this.scene.start('ForestRoomScene', { roomId: room });
            });
        });
    }

    /**
     * Show floating text that rises and fades
     */
    private showFloatingText(text: string, color: string, x: number, y: number): void {
        const textObj = this.add.text(x, y, text, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(201);

        this.tweens.add({
            targets: textObj,
            y: y - 50,
            alpha: 0,
            duration: 1500,
            delay: 500,
            ease: 'Power2.easeOut',
            onComplete: () => textObj.destroy()
        });
    }

    /**
     * Show a message banner
     */
    private showMessage(text: string): void {
        const msg = this.add.text(640, 300, text, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#446644',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: msg,
            alpha: 0,
            y: 260,
            duration: 2000,
            delay: 1500,
            onComplete: () => msg.destroy()
        });
    }

    /**
     * Create UI elements (HP bar, back button)
     */
    private createUI(): void {
        // HP Bar at top
        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        this.add.rectangle(150, 70, 200, 20, 0x333333)
            .setStrokeStyle(2, 0x666666)
            .setDepth(100);

        this.add.rectangle(52, 70, 196 * hpPercent, 16, 0x44aa44)
            .setOrigin(0, 0.5)
            .setDepth(100);

        this.add.text(150, 70, `HP: ${player.hp}/${player.maxHp}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Back button (abandon)
        const backBtn = this.add.container(80, 680).setDepth(100);
        const backBg = this.add.rectangle(0, 0, 120, 40, 0x664444)
            .setStrokeStyle(2, 0x886666);
        const backText = this.add.text(0, 0, '← Odejít', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        backBtn.add([backBg, backText]);
        backBtn.setSize(120, 40);
        backBtn.setInteractive({ useHandCursor: true });

        backBtn.on('pointerover', () => backBg.setFillStyle(0x885555));
        backBtn.on('pointerout', () => backBg.setFillStyle(0x664444));
        backBtn.on('pointerdown', () => this.confirmAbandon());
    }

    /**
     * Setup click-to-move mechanics
     * Player moves along a fixed path (Y determined by X position)
     */
    private setupClickToMove(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Only respond to clicks on empty space (not objects or UI)
            if (this.isWalking) return;

            // Ignore clicks on interactive objects (like draggable rocks or UI buttons)
            const hitObjects = this.input.hitTestPointer(pointer);
            if (hitObjects.length > 0) {
                // Clicked on something interactive - don't move
                return;
            }

            // Check if click is in a reasonable area (not top UI)
            if (pointer.y > 300) {
                let targetX = pointer.x;

                // Prevent backtracking after crossing the bridge
                if (this.hasCrossedBridge && targetX < this.bridgeBlockX + 100) {
                    // Already crossed - don't allow going back
                    return;
                }

                // Check if trying to cross bridge without solving puzzle
                if (!this.bridgeUnlocked && targetX > this.bridgeBlockX) {
                    // Walk to bridge blocker position
                    targetX = this.bridgeBlockX - 50;
                    const targetY = this.getPathY(targetX);
                    this.walkTo(targetX, targetY, () => {
                        this.hintAtPuzzle();
                    });
                } else {
                    // Normal movement - Y is determined by path
                    const targetY = this.getPathY(targetX);
                    this.walkTo(targetX, targetY, () => {
                        // Mark as crossed if past the bridge
                        if (this.bridgeUnlocked && targetX > 900) {
                            this.hasCrossedBridge = true;
                        }
                        // Check if reached exit zone
                        this.checkExitZones();
                    });
                }
            }
        });
    }

    /**
     * Visual hint that player needs to solve puzzle - shake/glow floating rocks
     */
    private hintAtPuzzle(): void {
        // Shake each floating rock with stagger (only unplaced rocks)
        this.floatingRocks.forEach((rock, i) => {
            // Don't shake rocks that are already placed in slots
            if (rock.placedInSlot !== null) return;

            this.time.delayedCall(i * 80, () => {
                // Shake animation
                this.tweens.add({
                    targets: rock.container,
                    x: rock.originalX + 5,
                    duration: 50,
                    yoyo: true,
                    repeat: 3,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        rock.container.x = rock.originalX;
                    }
                });

                // Glow pulse (scale up briefly)
                this.tweens.add({
                    targets: rock.container,
                    scaleX: 0.8,
                    scaleY: 0.8,
                    duration: 200,
                    yoyo: true,
                    ease: 'Sine.easeOut'
                });
            });
        });
    }

    /**
     * Walk player to a position, following the path curve defined by getPathY()
     */
    private walkTo(targetX: number, targetY: number, onComplete?: () => void): void {
        this.isWalking = true;

        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        const dx = targetX - this.player.x;
        const distance = Math.abs(dx);  // Only horizontal distance matters for path-following
        const duration = (distance / 350) * 1000;

        // Flip sprite based on direction
        this.player.setFlipX(dx < 0);

        // Play walk animation
        this.player.play(spriteConfig.walkAnim);

        // Only tween X - Y follows the path curve via onUpdate
        const tween = this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                // Continuously update Y based on current X position to follow the path
                this.player.y = this.getPathY(this.player.x);

                // Check mushroom aggro during movement
                if (this.checkMushroomAggro()) {
                    tween.stop();
                    this.player.play(spriteConfig.idleAnim);
                    this.isWalking = false;
                    this.startMushroomBattle();
                }
            },
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);
                this.isWalking = false;

                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    /**
     * Check if player is in exit zone and handle transition
     */
    private checkExitZones(): void {
        // Find exit targets from room data
        const exits = (this.roomData as any)?.exits || [];
        const leftExit = exits.find((e: any) => e.direction === 'left');
        const rightExit = exits.find((e: any) => e.direction === 'right');

        // Left exit - only allowed if bridge NOT yet crossed
        if (this.player.x < 80 && !this.hasCrossedBridge && leftExit) {
            this.transitionToRoom(leftExit.targetRoom, 'left');
            return;
        }

        // Right exit - only if bridge unlocked AND enemy defeated (if any)
        if (this.player.x > 1150 && this.bridgeUnlocked && rightExit) {
            // Check if there's an enemy blocking the path (e.g. mushroom_1)
            const hasEnemy = this.roomData?.objects?.some(o => o.type === 'enemy');
            if (hasEnemy && !this.mushroomDefeated) {
                this.showMessage('Musíš porazit nepřítele, který blokuje cestu!');
                return;
            }
            this.transitionToRoom(rightExit.targetRoom, 'right');
            return;
        }
    }

    /**
     * Transition to another room
     */
    private transitionToRoom(targetRoom: string, direction: string): void {
        this.isWalking = true;

        // Determine opposite direction for spawn
        const oppositeDirection = direction === 'left' ? 'right' : 'left';

        // Fade out
        this.cameras.main.fadeOut(300, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('ForestRoomScene', {
                roomId: targetRoom,
                fromDirection: oppositeDirection
            });
        });
    }

    /**
     * Show abandon confirmation dialog
     */
    private confirmAbandon(): void {
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
            .setDepth(300);

        const panel = this.add.container(640, 360).setDepth(301);

        const bg = this.add.rectangle(0, 0, 400, 200, 0x333355)
            .setStrokeStyle(3, 0x5566aa);

        const title = this.add.text(0, -60, 'Opustit výpravu?', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const warning = this.add.text(0, -20, 'Ztratíš veškerý postup!', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44'
        }).setOrigin(0.5);

        // Yes button
        const yesBtn = this.add.rectangle(-80, 50, 120, 40, 0x884444)
            .setStrokeStyle(2, 0xaa6666)
            .setInteractive({ useHandCursor: true });
        const yesText = this.add.text(-80, 50, 'Ano', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        yesBtn.on('pointerover', () => yesBtn.setFillStyle(0xaa5555));
        yesBtn.on('pointerout', () => yesBtn.setFillStyle(0x884444));
        yesBtn.on('pointerdown', () => {
            this.journeySystem.abandonJourney();
            this.scene.start('TownScene');
        });

        // No button
        const noBtn = this.add.rectangle(80, 50, 120, 40, 0x448844)
            .setStrokeStyle(2, 0x66aa66)
            .setInteractive({ useHandCursor: true });
        const noText = this.add.text(80, 50, 'Ne', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        noBtn.on('pointerover', () => noBtn.setFillStyle(0x55aa55));
        noBtn.on('pointerout', () => noBtn.setFillStyle(0x448844));
        noBtn.on('pointerdown', () => {
            overlay.destroy();
            panel.destroy();
        });

        panel.add([bg, title, warning, yesBtn, yesText, noBtn, noText]);
    }
}

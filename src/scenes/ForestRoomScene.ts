import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem } from '../systems/JourneySystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

/**
 * Room object definition from forest-rooms.json
 */
interface RoomObject {
    id: string;
    type: 'enemy' | 'boss' | 'chest' | 'letter_lock_chest' | 'rest' | 'puzzle' | 'well' | 'decoration';
    x: number;
    y: number;
    sprite?: string;
    enemyId?: string;
    // Additional enemies that join the battle (multi-enemy encounters)
    companions?: string[];
    // Enemy aggro - triggers battle when player gets within this radius
    aggroRadius?: number;
    flipX?: boolean;
    // Letter lock chest
    riddle?: string;
    riddleEn?: string;
    answer?: string;
    // Rewards
    reward?: { gold?: number; diamonds?: number };
    // Rest point
    healPercent?: number;
    isSavePoint?: boolean;
    // Puzzle
    puzzleId?: string;
    // Hidden object support
    hidden?: boolean;
    appearsAfter?: {
        objectDefeated?: string;    // Show after this enemy is defeated
        puzzleSolved?: string;      // Show after this puzzle is solved
        puzzleInteracted?: string;  // Show after puzzle is interacted with (solved or skipped)
    };
}

/**
 * Exit definition connecting rooms
 */
interface RoomExit {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    targetRoom: string;
    direction: 'left' | 'right' | 'up' | 'down';
    requiresAllDefeated?: boolean;
    requiresDefeated?: string[];    // Specific enemy IDs that must be defeated
    requiresPuzzle?: string;        // Specific puzzle ID that must be solved
}

/**
 * Room configuration from JSON
 */
interface RoomConfig {
    id: string;
    name: string;
    nameCs: string;
    background: string;
    battleBackground?: string;
    isWaypoint?: boolean;
    objects: RoomObject[];
    exits: RoomExit[];
    playerSpawn: { x: number; y: number };
    spawnFromDirection?: {
        left?: { x: number; y: number };
        right?: { x: number; y: number };
        up?: { x: number; y: number };
        down?: { x: number; y: number };
    };
}

/**
 * Data passed to the scene on start
 */
interface SceneData {
    roomId?: string;
    fromDirection?: 'left' | 'right' | 'up' | 'down';
    battleWon?: boolean;
    defeatedObjectId?: string;
    puzzleSolved?: boolean;
    solvedObjectId?: string;
}

/**
 * ForestRoomScene - Room-based exploration for the forest journey
 *
 * Players walk through full-screen rooms, interact with objects (enemies, chests, puzzles),
 * and navigate via exit points that connect rooms together.
 */
export class ForestRoomScene extends Phaser.Scene {
    private journeySystem = JourneySystem.getInstance();
    private gameState = GameStateManager.getInstance();

    private roomsData!: { rooms: Record<string, RoomConfig>; startRoom: string; waypoints: string[] };
    private currentRoom!: RoomConfig;

    private player!: Phaser.GameObjects.Sprite;
    private objectSprites: Map<string, Phaser.GameObjects.Container> = new Map();
    private exitZones: Phaser.GameObjects.Zone[] = [];

    private isWalking = false;
    private roomId!: string;
    private fromDirection?: 'left' | 'right' | 'up' | 'down';

    // Scene data from battle/puzzle returns
    private battleWon = false;
    private defeatedObjectId?: string;
    private puzzleSolved = false;
    private solvedObjectId?: string;

    constructor() {
        super({ key: 'ForestRoomScene' });
    }

    init(data: SceneData): void {
        this.roomId = data.roomId || this.journeySystem.getCurrentRoom() || 'forest_entrance';
        this.fromDirection = data.fromDirection;
        this.battleWon = data.battleWon || false;
        this.defeatedObjectId = data.defeatedObjectId;
        this.puzzleSolved = data.puzzleSolved || false;
        this.solvedObjectId = data.solvedObjectId;
    }

    preload(): void {
        // Load room data if not cached
        if (!this.cache.json.has('forestRooms')) {
            this.load.json('forestRooms', 'assets/data/forest-rooms.json');
        }
    }

    create(): void {
        // Get room data
        this.roomsData = this.cache.json.get('forestRooms');
        if (!this.roomsData || !this.roomsData.rooms[this.roomId]) {
            console.error(`Room not found: ${this.roomId}`);
            this.scene.start('TownScene');
            return;
        }

        this.currentRoom = this.roomsData.rooms[this.roomId];

        // Update journey system with current room
        this.journeySystem.setCurrentRoom(this.roomId);

        // Handle returning from battle
        if (this.battleWon && this.defeatedObjectId) {
            this.journeySystem.setObjectState(this.roomId, this.defeatedObjectId, {
                interacted: true,
                defeated: true
            });

            // Check if this was the boss
            const defeatedObj = this.currentRoom.objects.find(o => o.id === this.defeatedObjectId);
            if (defeatedObj?.type === 'boss') {
                this.journeySystem.completeRoomJourney();
                // Show victory and return to town
                this.showJourneyVictory();
                return;
            }

            // Schedule check for newly revealed hidden objects after scene builds
            this.time.delayedCall(100, () => {
                this.checkAndRevealHiddenObjects();
                this.refreshExits();
            });
        }

        // Handle returning from puzzle
        if (this.puzzleSolved && this.solvedObjectId) {
            this.journeySystem.setObjectState(this.roomId, this.solvedObjectId, {
                interacted: true,
                completed: true,
                looted: true
            });

            // Schedule check for newly revealed hidden objects after scene builds
            this.time.delayedCall(100, () => {
                this.checkAndRevealHiddenObjects();
                this.refreshExits();
            });
        }

        // Check journey state
        const journeyState = this.journeySystem.getJourneyState();
        if (!journeyState || journeyState.completed) {
            this.scene.start('TownScene');
            return;
        }

        if (journeyState.failed) {
            this.showFailedScreen();
            return;
        }

        // Build the room
        this.createBackground();
        this.createPlayer();
        this.createObjects();
        this.createExits();
        this.createUI();
        this.setupClickToMove();

        // Listen for puzzle solved events from overlay scenes
        this.events.on('puzzleSolved', (data: { objectId: string; roomId: string }) => {
            this.handlePuzzleSolved(data.objectId);
        });

        // Unlock waypoint if this is one
        if (this.currentRoom.isWaypoint) {
            this.journeySystem.unlockWaypoint(this.roomId);
        }

        // Ensure input is enabled (important after room transitions)
        this.input.enabled = true;
        this.isWalking = false;

        // Fade in if coming from another room
        if (this.fromDirection) {
            this.cameras.main.fadeIn(300, 0, 0, 0);
        }

        console.log('[ForestRoomScene] Room created:', this.roomId, 'Input enabled:', this.input.enabled);
    }

    private createBackground(): void {
        // Try to use the room's background, fall back to a default
        const bgKey = this.currentRoom.background;

        if (this.textures.exists(bgKey)) {
            this.add.image(640, 360, bgKey).setDisplaySize(1280, 720);
        } else {
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

            // Add some tree silhouettes
            this.addTreeSilhouettes(graphics);
        }

        // Room name
        this.add.text(640, 30, this.currentRoom.nameCs, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);
    }

    private addTreeSilhouettes(graphics: Phaser.GameObjects.Graphics): void {
        // Simple tree shapes in background
        const treePositions = [100, 250, 400, 600, 800, 1000, 1150];
        treePositions.forEach((x, i) => {
            const height = 200 + Math.sin(i * 1.5) * 50;
            const width = 60 + Math.sin(i * 2) * 20;

            // Tree trunk
            graphics.fillStyle(0x2a1a0a);
            graphics.fillRect(x - 10, 400 - height * 0.3, 20, height * 0.4);

            // Tree crown (triangle)
            graphics.fillStyle(0x1a4020 + (i % 3) * 0x050505);
            graphics.fillTriangle(
                x, 400 - height,
                x - width, 400 - height * 0.3,
                x + width, 400 - height * 0.3
            );
        });
    }

    private createPlayer(): void {
        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        // Determine spawn position
        let spawnX = this.currentRoom.playerSpawn.x;
        let spawnY = this.currentRoom.playerSpawn.y;

        // Override spawn based on entry direction
        if (this.fromDirection && this.currentRoom.spawnFromDirection) {
            const dirSpawn = this.currentRoom.spawnFromDirection[this.fromDirection];
            if (dirSpawn) {
                spawnX = dirSpawn.x;
                spawnY = dirSpawn.y;
            }
        }

        // Override spawn to defeated enemy position (player continues from where they fought)
        if (this.battleWon && this.defeatedObjectId) {
            const defeatedObj = this.currentRoom.objects.find(o => o.id === this.defeatedObjectId);
            if (defeatedObj) {
                spawnX = defeatedObj.x;
                spawnY = defeatedObj.y;
            }
        }

        this.player = this.add.sprite(spawnX, spawnY, spriteConfig.idleTexture)
            .setScale(1.0)
            .setDepth(10)
            .play(spriteConfig.idleAnim);

        // Flip based on entry direction
        if (this.fromDirection === 'right') {
            this.player.setFlipX(true);
        }
    }

    private createObjects(): void {
        this.objectSprites.clear();

        this.currentRoom.objects.forEach(obj => {
            const state = this.journeySystem.getObjectState(this.roomId, obj.id);

            // Skip defeated enemies
            if ((obj.type === 'enemy' || obj.type === 'boss') && state?.defeated) {
                return;
            }

            // Skip looted chests (they could show opened, but for simplicity we hide)
            if ((obj.type === 'chest' || obj.type === 'letter_lock_chest') && state?.looted) {
                return;
            }

            // Skip hidden objects that haven't had their conditions met
            if (obj.hidden && !this.shouldObjectAppear(obj)) {
                return;
            }

            const container = this.createObjectSprite(obj);
            this.objectSprites.set(obj.id, container);
        });
    }

    /**
     * Check if a hidden object should now appear based on its appearsAfter conditions
     */
    private shouldObjectAppear(obj: RoomObject): boolean {
        if (!obj.appearsAfter) return true;

        const { objectDefeated, puzzleSolved, puzzleInteracted } = obj.appearsAfter;

        // Check if required enemy is defeated
        if (objectDefeated) {
            const state = this.journeySystem.getObjectState(this.roomId, objectDefeated);
            if (!state?.defeated) return false;
        }

        // Check if required puzzle is solved
        if (puzzleSolved) {
            const state = this.journeySystem.getObjectState(this.roomId, puzzleSolved);
            if (!state?.completed) return false;
        }

        // Check if required puzzle has been interacted with (solved or skipped)
        if (puzzleInteracted) {
            const state = this.journeySystem.getObjectState(this.roomId, puzzleInteracted);
            if (!state?.interacted) return false;
        }

        return true;
    }

    /**
     * Check and reveal any hidden objects whose conditions are now met
     */
    private checkAndRevealHiddenObjects(): void {
        this.currentRoom.objects.forEach(obj => {
            // Only process hidden objects that aren't already rendered
            if (!obj.hidden || this.objectSprites.has(obj.id)) return;

            // Check if conditions are now met
            if (this.shouldObjectAppear(obj)) {
                this.revealObject(obj);
            }
        });
    }

    /**
     * Reveal a previously hidden object with animation
     */
    private revealObject(obj: RoomObject): void {
        const container = this.createObjectSprite(obj);
        container.setAlpha(0);
        container.setScale(0.5);
        this.objectSprites.set(obj.id, container);

        // Reveal animation
        this.tweens.add({
            targets: container,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Back.easeOut'
        });

        // Show notification
        const notifyText = obj.type === 'boss' ? 'Boss se objevil!' :
            obj.type === 'chest' ? 'Objevila se truhla!' :
                obj.type === 'puzzle' ? 'Objevila se hádanka!' :
                    'Nový objekt se objevil!';

        this.showMessage(notifyText);
    }

    private createObjectSprite(obj: RoomObject): Phaser.GameObjects.Container {
        const container = this.add.container(obj.x, obj.y);
        container.setDepth(5);

        // Try to use actual sprite, fall back to placeholder
        if (obj.sprite && this.textures.exists(obj.sprite)) {
            const sprite = this.add.sprite(0, 0, obj.sprite).setScale(0.8);
            if (obj.flipX) sprite.setFlipX(true);
            container.add(sprite);

            // For enemies, apply scale and play idle animation from enemies.json or forest-enemies.json
            if (obj.enemyId) {
                const enemies = this.cache.json.get('enemies') as any[];
                let enemyDef = enemies?.find((e: any) => e.id === obj.enemyId);

                // Fallback to forest enemies
                if (!enemyDef && this.cache.json.has('forestEnemies')) {
                    const forestData = this.cache.json.get('forestEnemies') as any;
                    const fe = forestData?.enemies?.[obj.enemyId];
                    if (fe) {
                        enemyDef = { ...fe, attack: fe.atk, animPrefix: fe.animPrefix || fe.spriteKey?.replace('-sheet', '') };
                    }
                }

                if (enemyDef) {
                    if (enemyDef.scale) {
                        sprite.setScale(enemyDef.scale);
                    }
                    if (enemyDef.animPrefix) {
                        const idleAnim = `${enemyDef.animPrefix}-idle`;
                        if (this.anims.exists(idleAnim)) {
                            sprite.play(idleAnim);
                        }
                    }
                }
            }
        } else {
            // Placeholder based on type
            const placeholder = this.createPlaceholder(obj);
            container.add(placeholder);
        }

        // Add interaction indicator (pulsing circle) - skip for aggro enemies (they auto-trigger)
        if (!obj.aggroRadius) {
            const indicator = this.add.circle(0, -50, 8, this.getObjectColor(obj.type), 0.8);
            container.add(indicator);

            // Pulsing animation
            this.tweens.add({
                targets: indicator,
                scaleX: 1.3,
                scaleY: 1.3,
                alpha: 0.4,
                duration: 800,
                yoyo: true,
                repeat: -1
            });
        }

        // Store object data for interaction
        container.setData('objectData', obj);

        // Make interactive
        container.setSize(80, 100);
        container.setInteractive({ useHandCursor: true });

        container.on('pointerdown', () => {
            if (!this.isWalking) {
                this.walkToAndInteract(obj);
            }
        });

        container.on('pointerover', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: 150
            });
        });

        container.on('pointerout', () => {
            this.tweens.add({
                targets: container,
                scaleX: 1,
                scaleY: 1,
                duration: 150
            });
        });

        return container;
    }

    private createPlaceholder(obj: RoomObject): Phaser.GameObjects.Container {
        const placeholder = this.add.container(0, 0);

        const color = this.getObjectColor(obj.type);
        const size = obj.type === 'boss' ? 80 : 60;

        // Background shape
        const bg = this.add.rectangle(0, 0, size, size, color, 0.8)
            .setStrokeStyle(3, 0xffffff);
        placeholder.add(bg);

        // Emoji based on type
        const emoji = this.getObjectEmoji(obj.type);
        const emojiText = this.add.text(0, -5, emoji, {
            fontSize: obj.type === 'boss' ? '36px' : '28px'
        }).setOrigin(0.5);
        placeholder.add(emojiText);

        // Label below
        const labelText = obj.type === 'boss' ? 'BOSS' :
            obj.type === 'enemy' ? 'Enemy' :
                obj.type === 'chest' || obj.type === 'letter_lock_chest' ? 'Chest' :
                    obj.type === 'rest' ? 'Rest' : obj.type;

        const label = this.add.text(0, size / 2 + 10, labelText, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);
        placeholder.add(label);

        return placeholder;
    }

    private getObjectColor(type: string): number {
        switch (type) {
            case 'enemy': return 0xaa4444;
            case 'boss': return 0x882288;
            case 'chest':
            case 'letter_lock_chest': return 0xaa8844;
            case 'rest': return 0x44aa44;
            case 'puzzle':
            case 'well': return 0x4466aa;
            default: return 0x666666;
        }
    }

    private getObjectEmoji(type: string): string {
        switch (type) {
            case 'enemy': return '🐺';
            case 'boss': return '👹';
            case 'chest':
            case 'letter_lock_chest': return '📦';
            case 'rest': return '🔥';
            case 'puzzle':
            case 'well': return '⛲';
            default: return '❓';
        }
    }

    private exitArrows: Map<string, Phaser.GameObjects.Container> = new Map();
    private exitLocks: Map<string, Phaser.GameObjects.Text> = new Map();

    private createExits(): void {
        this.exitZones = [];
        this.exitArrows.clear();
        this.exitLocks.clear();

        this.currentRoom.exits.forEach(exit => {
            // Create visual indicator
            const arrow = this.createExitArrow(exit);
            this.exitArrows.set(exit.id, arrow);

            // Create invisible zone for collision detection
            const zone = this.add.zone(exit.x + exit.width / 2, exit.y + exit.height / 2, exit.width, exit.height);
            zone.setData('exitData', exit);
            this.exitZones.push(zone);

            // Check if exit is locked
            if (!this.isExitAccessible(exit)) {
                arrow.setAlpha(0.3);
                // Add lock indicator
                const lockX = exit.direction === 'left' ? exit.x + 40 : exit.x + exit.width - 40;
                const lockY = exit.y + exit.height / 2;
                const lock = this.add.text(lockX, lockY, '🔒', { fontSize: '24px' })
                    .setOrigin(0.5)
                    .setDepth(20);
                this.exitLocks.set(exit.id, lock);
            }
        });
    }

    /**
     * Check if an exit is accessible based on all its requirements
     */
    private isExitAccessible(exit: RoomExit): boolean {
        // Check requiresAllDefeated (legacy)
        if (exit.requiresAllDefeated) {
            const isCleared = this.journeySystem.isRoomCleared(this.roomId, this.currentRoom.objects);
            if (!isCleared) return false;
        }

        // Check specific enemy defeats required
        if (exit.requiresDefeated && exit.requiresDefeated.length > 0) {
            for (const enemyId of exit.requiresDefeated) {
                const state = this.journeySystem.getObjectState(this.roomId, enemyId);
                if (!state?.defeated) return false;
            }
        }

        // Check specific puzzle required
        if (exit.requiresPuzzle) {
            const state = this.journeySystem.getObjectState(this.roomId, exit.requiresPuzzle);
            if (!state?.completed) return false;
        }

        return true;
    }

    /**
     * Refresh exit visuals after state changes (enemy defeated, puzzle solved)
     */
    private refreshExits(): void {
        this.currentRoom.exits.forEach(exit => {
            const arrow = this.exitArrows.get(exit.id);
            const lock = this.exitLocks.get(exit.id);

            if (this.isExitAccessible(exit)) {
                // Unlock the exit
                if (arrow) {
                    this.tweens.add({
                        targets: arrow,
                        alpha: 1,
                        duration: 300
                    });
                }
                if (lock) {
                    this.tweens.add({
                        targets: lock,
                        alpha: 0,
                        duration: 300,
                        onComplete: () => lock.destroy()
                    });
                    this.exitLocks.delete(exit.id);
                }
            }
        });
    }

    private createExitArrow(exit: RoomExit): Phaser.GameObjects.Container {
        const isLocked = !this.isExitAccessible(exit);

        const container = this.add.container(0, 0).setDepth(15);

        // Position based on direction
        let x = exit.x + exit.width / 2;
        let y = exit.y + exit.height / 2;
        let rotation = 0;

        switch (exit.direction) {
            case 'left':
                x = 40;
                rotation = Math.PI;
                break;
            case 'right':
                x = 1240;
                rotation = 0;
                break;
            case 'up':
                y = 60;
                rotation = -Math.PI / 2;
                break;
            case 'down':
                y = 680;
                rotation = Math.PI / 2;
                break;
        }

        container.setPosition(x, y);

        // Arrow shape
        const arrow = this.add.triangle(0, 0,
            -15, -20,
            -15, 20,
            25, 0,
            isLocked ? 0x666666 : 0x88cc88
        ).setRotation(rotation);
        container.add(arrow);

        // Pulsing animation if not locked
        if (!isLocked) {
            this.tweens.add({
                targets: arrow,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 600,
                yoyo: true,
                repeat: -1
            });

            // Make clickable
            container.setSize(60, 60);
            container.setInteractive({ useHandCursor: true });
            container.on('pointerdown', () => {
                if (!this.isWalking) {
                    this.walkToExit(exit);
                }
            });
        }

        return container;
    }

    private createUI(): void {
        // HP Bar at top
        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        const hpBarBg = this.add.rectangle(150, 70, 200, 20, 0x333333)
            .setStrokeStyle(2, 0x666666)
            .setDepth(100);

        const hpBarFill = this.add.rectangle(52, 70, 196 * hpPercent, 16, 0x44aa44)
            .setOrigin(0, 0.5)
            .setDepth(100);

        const hpText = this.add.text(150, 70, `HP: ${player.hp}/${player.maxHp}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Back to town button
        const backBtn = this.add.container(80, 680).setDepth(100);
        const backBg = this.add.rectangle(0, 0, 120, 40, 0x664444)
            .setStrokeStyle(2, 0x886666);
        const backText = this.add.text(0, 0, '← Zpět', {
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

    private setupClickToMove(): void {
        // Click on ground to move there
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Only respond to clicks on empty space (not objects or UI)
            if (this.isWalking) return;

            // Check if click is in the walkable area (y >= 620 to stay on ground)
            if (pointer.y >= 620 && pointer.y < 700) {
                this.walkTo(pointer.x, pointer.y);
            }
        });
    }

    private walkTo(targetX: number, targetY: number, onComplete?: () => void): void {
        this.isWalking = true;
        this.input.enabled = false;

        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        const dx = targetX - this.player.x;
        const dy = targetY - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const duration = (distance / 350) * 1000;

        // Flip sprite based on direction
        this.player.setFlipX(dx < 0);

        // Play walk animation
        this.player.play(spriteConfig.walkAnim);

        const tween = this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                // Check proximity to enemies with aggroRadius
                const aggroEnemy = this.checkAggroProximity();
                if (aggroEnemy) {
                    tween.stop();
                    this.player.play(spriteConfig.idleAnim);
                    this.isWalking = false;
                    this.input.enabled = true;
                    this.startBattle(aggroEnemy);
                }
            },
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);
                this.isWalking = false;
                this.input.enabled = true;

                if (onComplete) {
                    onComplete();
                }

                // Check exit zones
                this.checkExitZones();
            }
        });
    }

    /**
     * Check if player is within aggro range of any enemy
     * Returns the enemy object if within range, null otherwise
     */
    private checkAggroProximity(): RoomObject | null {
        for (const obj of this.currentRoom.objects) {
            // Only check enemies/bosses with aggroRadius that aren't defeated
            if ((obj.type === 'enemy' || obj.type === 'boss') && obj.aggroRadius) {
                const state = this.journeySystem.getObjectState(this.roomId, obj.id);
                if (state?.defeated) continue;

                // Check if object should be visible (not hidden or condition met)
                if (obj.hidden && !this.shouldObjectAppear(obj)) {
                    continue;
                }

                const dx = this.player.x - obj.x;
                const dy = this.player.y - obj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= obj.aggroRadius) {
                    return obj;
                }
            }
        }
        return null;
    }

    private walkToAndInteract(obj: RoomObject): void {
        // Walk to object position (slightly in front)
        const targetX = obj.x < 640 ? obj.x + 60 : obj.x - 60;
        const targetY = obj.y + 20;

        this.walkTo(targetX, targetY, () => {
            this.interactWith(obj);
        });
    }

    private walkToExit(exit: RoomExit): void {
        // Check if exit is accessible
        if (!this.isExitAccessible(exit)) {
            // Generate appropriate message based on what's blocking
            if (exit.requiresDefeated && exit.requiresDefeated.length > 0) {
                this.showMessage('Musíš porazit nepřátele, kteří blokují cestu!');
            } else if (exit.requiresPuzzle) {
                this.showMessage('Musíš vyřešit hádanku!');
            } else {
                this.showMessage('Cesta je zablokovaná!');
            }
            return;
        }

        // Walk to exit position
        let targetX = this.player.x;
        let targetY = this.player.y;

        switch (exit.direction) {
            case 'left':
                targetX = 50;
                break;
            case 'right':
                targetX = 1230;
                break;
            case 'up':
                targetY = 100;
                break;
            case 'down':
                targetY = 680;
                break;
        }

        this.walkTo(targetX, targetY, () => {
            this.transitionToRoom(exit.targetRoom, exit.direction);
        });
    }

    private checkExitZones(): void {
        // Check if player is in any exit zone
        for (const zone of this.exitZones) {
            const exit = zone.getData('exitData') as RoomExit;
            const bounds = new Phaser.Geom.Rectangle(
                zone.x - zone.width / 2,
                zone.y - zone.height / 2,
                zone.width,
                zone.height
            );

            if (bounds.contains(this.player.x, this.player.y)) {
                // Check if accessible
                if (!this.isExitAccessible(exit)) continue;

                this.transitionToRoom(exit.targetRoom, exit.direction);
                return;
            }
        }
    }

    private interactWith(obj: RoomObject): void {
        console.log(`Interacting with: ${obj.id} (${obj.type})`);

        switch (obj.type) {
            case 'enemy':
            case 'boss':
                this.startBattle(obj);
                break;

            case 'chest':
                this.openChest(obj);
                break;

            case 'letter_lock_chest':
                this.openLetterLockChest(obj);
                break;

            case 'rest':
                this.showRestMenu(obj);
                break;

            case 'puzzle':
            case 'well':
                this.startPuzzle(obj);
                break;
        }
    }

    private startBattle(obj: RoomObject): void {
        if (!obj.enemyId) {
            console.error('Enemy object missing enemyId');
            return;
        }

        // Use room's battle background if available, otherwise fall back to regular background
        const battleBg = this.currentRoom.battleBackground || this.currentRoom.background;

        // Build multi-enemy encounter if companions are defined
        if (obj.companions && obj.companions.length > 0) {
            const allEnemyIds = [obj.enemyId, ...obj.companions];
            const enemyDefs = allEnemyIds.map(id => this.resolveForestEnemy(id)).filter(Boolean) as import('../types').EnemyDefinition[];

            if (enemyDefs.length > 0) {
                this.scene.start('BattleScene', {
                    mode: 'journey',
                    enemyDefs,
                    returnScene: 'ForestRoomScene',
                    returnData: {
                        roomId: this.roomId,
                        defeatedObjectId: obj.id
                    },
                    backgroundKey: battleBg,
                    isBoss: obj.type === 'boss',
                    useForestEnemy: true
                });
                return;
            }
        }

        this.scene.start('BattleScene', {
            mode: 'journey',
            enemyId: obj.enemyId,
            returnScene: 'ForestRoomScene',
            returnData: {
                roomId: this.roomId,
                defeatedObjectId: obj.id
            },
            backgroundKey: battleBg,
            isBoss: obj.type === 'boss',
            useForestEnemy: true
        });
    }

    private resolveForestEnemy(enemyId: string): import('../types').EnemyDefinition | null {
        // Try forest enemies first (they have full definitions with phases, proper stats, etc.)
        if (this.cache.json.has('forestEnemies')) {
            const forestData = this.cache.json.get('forestEnemies') as any;
            const fe = forestData?.enemies?.[enemyId];
            if (fe) {
                const goldMin = fe.goldMin || 5;
                const goldMax = fe.goldMax || goldMin + 5;
                return {
                    id: fe.id,
                    name: fe.nameCs || fe.name,
                    hp: fe.hp,
                    attack: fe.atk || 3,
                    defense: fe.defense ?? 0,
                    xpReward: fe.xp || 10,
                    goldReward: [goldMin, goldMax],
                    difficulty: fe.difficulty || 5,
                    spriteKey: fe.spriteKey,
                    animPrefix: fe.animPrefix || fe.spriteKey?.replace('-sheet', '') || 'slime',
                    scale: fe.scale,
                    battleOffsetY: fe.battleOffsetY
                } as import('../types').EnemyDefinition;
            }
        }

        // Fall back to main enemies list
        const enemies = this.cache.json.get('enemies') as any[];
        const mainEnemy = enemies?.find((e: any) => e.id === enemyId);
        if (mainEnemy) return mainEnemy;

        console.warn(`[ForestRoomScene] Could not resolve enemy: ${enemyId}`);
        return null;
    }

    private openChest(obj: RoomObject): void {
        // Mark as looted
        this.journeySystem.setObjectState(this.roomId, obj.id, {
            interacted: true,
            looted: true
        });

        // Add rewards
        if (obj.reward) {
            if (obj.reward.gold) {
                this.journeySystem.addRewards(0, obj.reward.gold);
            }
            if (obj.reward.diamonds) {
                this.journeySystem.addRewards(0, 0, obj.reward.diamonds);
            }
        }

        // Show reward popup
        const rewardText = obj.reward ?
            `+${obj.reward.gold || 0} 💰 ${obj.reward.diamonds ? `+${obj.reward.diamonds} 💎` : ''}` :
            'Prázdná!';

        this.showRewardPopup(obj.x, obj.y - 50, rewardText);

        // Remove chest sprite
        const sprite = this.objectSprites.get(obj.id);
        if (sprite) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                scaleX: 0.5,
                scaleY: 0.5,
                duration: 500,
                onComplete: () => sprite.destroy()
            });
        }
    }

    private openLetterLockChest(obj: RoomObject): void {
        // Launch puzzle scene as overlay
        this.scene.launch('SpinLockPuzzleScene', {
            riddle: obj.riddle,
            riddleEn: obj.riddleEn,
            answer: obj.answer,
            reward: obj.reward,
            objectId: obj.id,
            roomId: this.roomId,
            parentScene: 'ForestRoomScene'
        });

        this.scene.pause();
    }

    private showRestMenu(obj: RoomObject): void {
        // Launch rest overlay
        this.scene.launch('ForestCampScene', {
            healPercent: obj.healPercent || 30,
            isSavePoint: obj.isSavePoint || false,
            roomId: this.roomId,
            parentScene: 'ForestRoomScene'
        });

        this.scene.pause();
    }

    private startPuzzle(obj: RoomObject): void {
        if (obj.puzzleId) {
            // Mark as interacted immediately (for puzzleInteracted condition, e.g., boss reveal)
            // This triggers hidden objects that appear when puzzle is interacted with (even if not solved)
            this.journeySystem.setObjectState(this.roomId, obj.id, {
                interacted: true
            });

            this.scene.start('ForestPuzzleScene', {
                puzzleId: obj.puzzleId,
                objectId: obj.id,
                returnScene: 'ForestRoomScene',
                returnData: {
                    roomId: this.roomId,
                    solvedObjectId: obj.id
                }
            });
        }
    }

    /**
     * Handle puzzle solved event from overlay scene
     */
    private handlePuzzleSolved(objectId: string): void {
        // Remove the solved object from the scene
        const sprite = this.objectSprites.get(objectId);
        if (sprite) {
            this.tweens.add({
                targets: sprite,
                alpha: 0,
                scaleX: 0.5,
                scaleY: 0.5,
                duration: 500,
                onComplete: () => {
                    sprite.destroy();
                    this.objectSprites.delete(objectId);
                }
            });
        }

        // Show reward popup
        const obj = this.currentRoom.objects.find(o => o.id === objectId);
        if (obj?.reward) {
            const rewardText = `+${obj.reward.gold || 0} 💰 ${obj.reward.diamonds ? `+${obj.reward.diamonds} 💎` : ''}`;
            this.showRewardPopup(obj.x, obj.y - 50, rewardText);
        }
    }

    private transitionToRoom(targetRoom: string, direction: string): void {
        this.isWalking = true;
        this.input.enabled = false;

        // Determine opposite direction for spawn
        const oppositeDirection = direction === 'left' ? 'right' :
            direction === 'right' ? 'left' :
                direction === 'up' ? 'down' : 'up';

        // Check if target room has a custom scene class
        const targetRoomConfig = this.roomsData.rooms[targetRoom] as RoomConfig & { sceneClass?: string };
        const sceneKey = targetRoomConfig?.sceneClass || 'ForestRoomScene';

        // Fade out
        this.cameras.main.fadeOut(300, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(sceneKey, {
                roomId: targetRoom,
                fromDirection: oppositeDirection
            });
        });
    }

    private showMessage(text: string): void {
        const msg = this.add.text(640, 300, text, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#664444',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: msg,
            alpha: 0,
            y: 260,
            duration: 2000,
            delay: 1000,
            onComplete: () => msg.destroy()
        });
    }

    private showRewardPopup(x: number, y: number, text: string): void {
        const popup = this.add.text(x, y, text, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffdd44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: popup,
            y: y - 50,
            alpha: 0,
            duration: 1500,
            onComplete: () => popup.destroy()
        });
    }

    private confirmAbandon(): void {
        // Simple confirmation - could be enhanced with a proper dialog
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

    private showFailedScreen(): void {
        this.add.rectangle(640, 360, 1280, 720, 0x220000, 0.9);

        this.add.text(640, 200, '💀 VÝPRAVA SELHALA', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Resume button (if save point exists)
        const hasSavePoint = this.journeySystem.getJourneyState()?.lastSavePoint !== null;

        if (hasSavePoint) {
            const resumeBtn = this.add.container(640, 350);
            const resumeBg = this.add.rectangle(0, 0, 300, 60, 0x446644)
                .setStrokeStyle(3, 0x66aa66);
            const resumeText = this.add.text(0, 0, '🔄 Pokračovat od tábora', {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            resumeBtn.add([resumeBg, resumeText]);
            resumeBtn.setSize(300, 60);
            resumeBtn.setInteractive({ useHandCursor: true });

            resumeBtn.on('pointerover', () => resumeBg.setFillStyle(0x558855));
            resumeBtn.on('pointerout', () => resumeBg.setFillStyle(0x446644));
            resumeBtn.on('pointerdown', () => {
                this.journeySystem.resumeFromRoomSavePoint();
                const room = this.journeySystem.getCurrentRoom() || 'forest_entrance';
                this.scene.start('ForestRoomScene', { roomId: room });
            });
        }

        // Return to town button
        const townBtn = this.add.container(640, 450);
        const townBg = this.add.rectangle(0, 0, 250, 50, 0x664444)
            .setStrokeStyle(2, 0x886666);
        const townText = this.add.text(0, 0, '🏠 Zpět do vesnice', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        townBtn.add([townBg, townText]);
        townBtn.setSize(250, 50);
        townBtn.setInteractive({ useHandCursor: true });

        townBtn.on('pointerover', () => townBg.setFillStyle(0x885555));
        townBtn.on('pointerout', () => townBg.setFillStyle(0x664444));
        townBtn.on('pointerdown', () => {
            this.journeySystem.abandonJourney();
            this.scene.start('TownScene');
        });
    }

    private showJourneyVictory(): void {
        const state = this.journeySystem.getJourneyState();

        this.add.rectangle(640, 360, 1280, 720, 0x002200, 0.9);

        this.add.text(640, 150, '🏆 VÝPRAVA DOKONČENA!', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Rewards summary
        const rewards = [
            `⭐ XP: ${state?.totalXp || 0}`,
            `💰 Zlato: ${state?.totalGold || 0}`,
            `💎 Diamanty: ${state?.totalDiamonds || 0}`
        ];

        rewards.forEach((text, i) => {
            this.add.text(640, 280 + i * 40, text, {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5);
        });

        // Continue button
        const btn = this.add.container(640, 500);
        const bg = this.add.rectangle(0, 0, 250, 60, 0x446644)
            .setStrokeStyle(3, 0x66aa66);
        const text = this.add.text(0, 0, '→ Pokračovat', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(250, 60);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x558855));
        btn.on('pointerout', () => bg.setFillStyle(0x446644));
        btn.on('pointerdown', () => {
            this.scene.start('TownScene');
        });
    }
}

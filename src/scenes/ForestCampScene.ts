import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem } from '../systems/JourneySystem';
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
 * Room configuration subset needed by this scene
 */
interface RoomConfig {
    id: string;
    name: string;
    nameCs: string;
    isWaypoint?: boolean;
    objects: Array<{
        id: string;
        type: string;
        reward?: { gold?: number; diamonds?: number };
        healPercent?: number;
        isSavePoint?: boolean;
    }>;
    exits: Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        targetRoom: string;
        direction: string;
        locked?: boolean;
        lockedMessage?: string;
        requiresDefeated?: string[];
    }>;
    playerSpawn: { x: number; y: number };
    spawnFromDirection?: Record<string, { x: number; y: number }>;
}

/**
 * ForestCampScene - Walkable forest camp with tent rest area, chest, and exit
 *
 * This is a full scene (not an overlay) using SceneBuilder for layout.
 * The scene editor defines:
 * - forest-camp: background image
 * - chest-forest: clickable chest element
 * - Black-frmae-Diamonds: UI template for the rest modal (hidden by default)
 * - marker-1: tent click zone (opens rest modal when player is nearby)
 * - marker-2: non-walkable obstacle zone (clicks inside are ignored)
 */
export class ForestCampScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private gameState = GameStateManager.getInstance();
    private journeySystem = JourneySystem.getInstance();

    // Scene data
    private roomId = 'forest_camp';
    private fromDirection?: 'left' | 'right';

    // Room config from forest-rooms.json
    private roomConfig!: RoomConfig;

    // Player
    private player!: Phaser.GameObjects.Sprite;
    private isWalking = false;

    // State
    private hasRested = false;
    private modalOpen = false;

    // Modal elements (created dynamically, destroyed on close)
    private modalOverlay: Phaser.GameObjects.Rectangle | null = null;
    private modalContainer: Phaser.GameObjects.Container | null = null;
    private modalDynamicElements: Phaser.GameObjects.GameObject[] = [];

    // Marker bounds (cached from SceneBuilder)
    private tentZone: { x: number; y: number; width: number; height: number } | null = null;
    private obstacleZone: { x: number; y: number; width: number; height: number } | null = null;

    // Walkable Y range — player can move vertically within these bounds
    private readonly WALK_Y_MIN = 420;
    private readonly WALK_Y_MAX = 580;
    private readonly DEFAULT_GROUND_Y = 520;

    constructor() {
        super({ key: 'ForestCampScene' });
    }

    init(data: SceneData): void {
        this.roomId = data.roomId || 'forest_camp';
        this.fromDirection = data.fromDirection;
        this.hasRested = false;
        this.modalOpen = false;
        this.isWalking = false;
        this.modalOverlay = null;
        this.modalContainer = null;
        this.modalDynamicElements = [];
        this.tentZone = null;
        this.obstacleZone = null;

        // Load room config from cache
        const forestRooms = this.cache.json.get('forestRooms') as any;
        this.roomConfig = forestRooms?.rooms?.[this.roomId];
    }

    create(): void {
        // Validate room config
        if (!this.roomConfig) {
            console.error(`[ForestCampScene] Room config not found for: ${this.roomId}`);
            this.scene.start('TownScene');
            return;
        }

        // Check journey state
        const journeyState = this.journeySystem.getJourneyState();
        if (!journeyState || journeyState.completed) {
            this.scene.start('TownScene');
            return;
        }

        // Build scene from editor layout
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('ForestCampScene');

        // Update journey tracking
        this.journeySystem.setCurrentRoom(this.roomId);

        // Handle waypoint: save point + unlock
        if (this.roomConfig.isWaypoint) {
            this.journeySystem.createRoomSavePoint();
            this.journeySystem.unlockWaypoint(this.roomId);
        }

        // Cache marker bounds
        this.tentZone = this.sceneBuilder.getMarker('marker-1') ?? null;
        this.obstacleZone = this.sceneBuilder.getMarker('marker-2') ?? null;

        // Hide the rest modal template (it's visible by default from scene editor)
        const modalTemplate = this.sceneBuilder.get<Phaser.GameObjects.Container>('Black-frmae-Diamonds');
        if (modalTemplate) {
            modalTemplate.setVisible(false);
        }

        // Setup tent interactive zone (marker-1) with cursor
        this.setupTentZone();

        // Setup chest interaction
        this.setupChest();

        // Create player sprite
        this.createPlayer();

        // Create exit arrows
        this.createExitArrows();

        // Create UI overlay (HP bar, back button)
        this.createUI();

        // Setup click-to-move
        this.setupClickToMove();

        // Fade in
        this.cameras.main.fadeIn(300, 0, 0, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PLAYER
    // ═══════════════════════════════════════════════════════════════════════

    private createPlayer(): void {
        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        // Spawn position based on entry direction
        let spawnX = this.roomConfig.playerSpawn.x;
        let spawnY = this.roomConfig.playerSpawn.y ?? this.DEFAULT_GROUND_Y;

        if (this.fromDirection && this.roomConfig.spawnFromDirection) {
            const dirSpawn = this.roomConfig.spawnFromDirection[this.fromDirection];
            if (dirSpawn) {
                spawnX = dirSpawn.x;
                spawnY = dirSpawn.y ?? spawnY;
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

    // ═══════════════════════════════════════════════════════════════════════
    // CLICK-TO-MOVE
    // ═══════════════════════════════════════════════════════════════════════

    private setupClickToMove(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.isWalking || this.modalOpen) return;

            // Ignore clicks on interactive objects (chest, UI buttons, etc.)
            const hitObjects = this.input.hitTestPointer(pointer);
            if (hitObjects.length > 0) return;

            // Ignore clicks in the obstacle zone (marker-2)
            if (this.isInsideMarker(pointer.x, pointer.y, this.obstacleZone)) {
                return;
            }

            // Only respond to clicks in the lower walkable area
            if (pointer.y > 300) {
                const targetX = Phaser.Math.Clamp(pointer.x, 50, 1230);
                const targetY = Phaser.Math.Clamp(pointer.y, this.WALK_Y_MIN, this.WALK_Y_MAX);

                // Check if clicking the tent zone (marker-1) — handled by setupTentZone
                // Just do normal walk with 2D target
                this.walkTo(targetX, targetY, () => {
                    this.checkExitZones();
                });
            }
        });
    }

    private isInsideMarker(x: number, y: number, marker: { x: number; y: number; width: number; height: number } | null): boolean {
        if (!marker) return false;
        return x >= marker.x && x <= marker.x + marker.width &&
               y >= marker.y && y <= marker.y + marker.height;
    }

    private walkTo(targetX: number, targetY: number, onComplete?: () => void): void {
        this.isWalking = true;

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

        this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);
                this.isWalking = false;
                if (onComplete) onComplete();
            }
        });
    }

    private setupTentZone(): void {
        if (!this.tentZone) return;

        // Create an invisible interactive zone over the tent area (marker-1)
        const zone = this.add.zone(
            this.tentZone.x + this.tentZone.width / 2,
            this.tentZone.y + this.tentZone.height / 2,
            this.tentZone.width,
            this.tentZone.height
        ).setDepth(5).setInteractive({ useHandCursor: true });

        zone.on('pointerdown', () => {
            if (this.isWalking || this.modalOpen) return;

            // Walk toward the tent front (bottom-center of marker), then open modal
            const tentTargetX = this.tentZone!.x + this.tentZone!.width / 2;
            const tentTargetY = Phaser.Math.Clamp(
                this.tentZone!.y + this.tentZone!.height,
                this.WALK_Y_MIN, this.WALK_Y_MAX
            );

            const dist = Phaser.Math.Distance.Between(
                this.player.x, this.player.y, tentTargetX, tentTargetY
            );

            if (dist < 100) {
                // Already close enough, open modal directly
                this.openRestModal();
            } else {
                this.walkTo(tentTargetX, tentTargetY, () => {
                    this.openRestModal();
                });
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHEST INTERACTION
    // ═══════════════════════════════════════════════════════════════════════

    private setupChest(): void {
        const chestObj = this.roomConfig.objects.find(o => o.id === 'chest_simple');
        const chestState = this.journeySystem.getObjectState(this.roomId, 'chest_simple');

        // If already looted, hide the chest
        if (chestState?.looted) {
            const chestElement = this.sceneBuilder.get<Phaser.GameObjects.Image>('chest-forest');
            if (chestElement) chestElement.setVisible(false);
            return;
        }

        // Bind click handler to chest
        this.sceneBuilder.bindClick('chest-forest', () => {
            if (this.modalOpen || this.isWalking) return;

            // Walk to chest area, then loot
            const chestElement = this.sceneBuilder.get<Phaser.GameObjects.Image>('chest-forest');
            if (!chestElement) return;

            const chestX = chestElement.x - 60; // Stand slightly to the left
            const chestY = Phaser.Math.Clamp(chestElement.y, this.WALK_Y_MIN, this.WALK_Y_MAX);
            this.walkTo(chestX, chestY, () => {
                this.lootChest(chestObj);
            });
        });
    }

    private lootChest(chestObj: RoomConfig['objects'][0] | undefined): void {
        // Check again in case of race condition
        const chestState = this.journeySystem.getObjectState(this.roomId, 'chest_simple');
        if (chestState?.looted) return;

        // Mark as looted
        this.journeySystem.setObjectState(this.roomId, 'chest_simple', {
            interacted: true,
            looted: true
        });

        // Add gold reward
        const goldReward = chestObj?.reward?.gold ?? 40;
        this.journeySystem.addRewards(0, goldReward);

        // Show floating reward text
        const chestElement = this.sceneBuilder.get<Phaser.GameObjects.Image>('chest-forest');
        const cx = chestElement?.x ?? 1084;
        const cy = chestElement?.y ?? 455;

        this.showFloatingText(`+${goldReward} 💰`, '#ffdd44', cx, cy - 40);

        // Fade out chest
        if (chestElement) {
            this.tweens.add({
                targets: chestElement,
                alpha: 0,
                scaleX: 0.3,
                scaleY: 0.3,
                duration: 500,
                onComplete: () => chestElement.setVisible(false)
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REST MODAL
    // ═══════════════════════════════════════════════════════════════════════

    private openRestModal(): void {
        if (this.modalOpen) return;
        this.modalOpen = true;
        this.modalDynamicElements = [];

        // Dark overlay
        this.modalOverlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6)
            .setDepth(50)
            .setInteractive(); // Block clicks through

        // Show the template container — position it at the center of the screen
        // so the frame is nicely visible (original editor position 1007,197 is too far right/up)
        const templateContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Black-frmae-Diamonds');
        const frameX = templateContainer?.x ?? 1007;
        const frameY = templateContainer?.y ?? 197;
        if (templateContainer) {
            templateContainer.setVisible(true);
            templateContainer.setDepth(51);
        }

        // Create modal content centered on the frame
        // The frame is 500x320px; content is positioned relative to its center
        this.modalContainer = this.add.container(frameX, frameY).setDepth(52);

        // Title
        const title = this.add.text(0, -120, '🏕️ LESNÍ TÁBOR', {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#88cc88',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        this.modalContainer.add(title);

        // Waypoint indicator
        if (this.roomConfig.isWaypoint) {
            const waypointText = this.add.text(0, -90, '⭐ Úložný bod', {
                fontSize: '13px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffdd44'
            }).setOrigin(0.5);
            this.modalContainer.add(waypointText);
        }

        // HP Display
        this.createModalHPDisplay();

        // Rest button — fits inside the 500px-wide frame (button is 280px)
        const restBtn = this.createModalButton(0, 35, '🔥 Odpočinek', '+100% ❤️', 0x446644, () => {
            this.handleRest();
        });
        this.modalContainer.add(restBtn);
        this.modalDynamicElements.push(restBtn);

        // Return to town button
        const townBtn = this.createModalButton(0, 90, '🏠 Návrat do vesnice', 'Vzdát výpravu', 0x664444, () => {
            this.handleReturnToTown();
        });
        this.modalContainer.add(townBtn);
        this.modalDynamicElements.push(townBtn);

        // Close button (X) — positioned near top-right corner of the 500x320 frame
        const closeBtn = this.add.text(220, -140, '✕', {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#aaaaaa'));
        closeBtn.on('pointerdown', () => this.closeRestModal());
        this.modalContainer.add(closeBtn);
    }

    private createModalHPDisplay(): void {
        if (!this.modalContainer) return;

        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        // HP Label
        const hpLabel = this.add.text(-110, -55, '❤️', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        this.modalContainer.add(hpLabel);

        // HP Bar background (fits inside 500px frame with margins)
        const barWidth = 220;
        const hpBarBg = this.add.rectangle(30, -46, barWidth, 22, 0x333333)
            .setStrokeStyle(2, 0x666666);
        this.modalContainer.add(hpBarBg);

        // HP Bar fill
        const fillWidth = (barWidth - 4) * hpPercent;
        const hpBarFill = this.add.rectangle(30 - (barWidth - 4) / 2, -46, fillWidth, 18, this.getHPColor(hpPercent))
            .setOrigin(0, 0.5);
        this.modalContainer.add(hpBarFill);
        this.modalDynamicElements.push(hpBarFill);

        // HP Text
        const hpText = this.add.text(30, -46, `${player.hp} / ${player.maxHp}`, {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.modalContainer.add(hpText);
        this.modalDynamicElements.push(hpText);

        // Heal preview
        const restObj = this.roomConfig.objects.find(o => o.type === 'rest');
        const healPercent = restObj?.healPercent ?? 100;
        const healAmount = Math.floor(player.maxHp * (healPercent / 100));
        const potentialHP = Math.min(player.maxHp, player.hp + healAmount);

        if (player.hp < player.maxHp) {
            const healText = this.add.text(0, -18, `Odpočinek: +${healAmount} ❤️ → ${potentialHP}`, {
                fontSize: '13px',
                fontFamily: 'Arial, sans-serif',
                color: '#88cc88'
            }).setOrigin(0.5);
            this.modalContainer.add(healText);
            this.modalDynamicElements.push(healText);
        }
    }

    private getHPColor(percent: number): number {
        if (percent > 0.6) return 0x44aa44;
        if (percent > 0.3) return 0xaaaa44;
        return 0xaa4444;
    }

    private createModalButton(x: number, y: number, label: string, sublabel: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
        const btn = this.add.container(x, y);

        // Button width 280px fits inside the 500px frame with margins
        const bg = this.add.rectangle(0, 0, 280, 44, color)
            .setStrokeStyle(2, this.lightenColor(color));

        const mainText = this.add.text(-10, -7, label, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const subText = this.add.text(-10, 11, sublabel, {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        btn.add([bg, mainText, subText]);
        btn.setSize(280, 44);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(this.lightenColor(color)));
        btn.on('pointerout', () => bg.setFillStyle(color));
        btn.on('pointerdown', onClick);

        return btn;
    }

    private lightenColor(color: number): number {
        const r = Math.min(255, ((color >> 16) & 0xff) + 30);
        const g = Math.min(255, ((color >> 8) & 0xff) + 30);
        const b = Math.min(255, (color & 0xff) + 30);
        return (r << 16) | (g << 8) | b;
    }

    private closeRestModal(): void {
        if (!this.modalOpen) return;
        this.modalOpen = false;

        // Hide template container
        const templateContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Black-frmae-Diamonds');
        if (templateContainer) {
            templateContainer.setVisible(false);
        }

        // Destroy overlay
        if (this.modalOverlay) {
            this.modalOverlay.destroy();
            this.modalOverlay = null;
        }

        // Destroy dynamic modal content
        if (this.modalContainer) {
            this.modalContainer.destroy();
            this.modalContainer = null;
        }
        this.modalDynamicElements = [];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REST & TOWN RETURN
    // ═══════════════════════════════════════════════════════════════════════

    private handleRest(): void {
        if (this.hasRested) {
            this.showFloatingText('Už jsi odpočíval!', '#ffaa44', 640, 200);
            return;
        }

        this.hasRested = true;

        // Get heal config from room objects
        const restObj = this.roomConfig.objects.find(o => o.type === 'rest');
        const healPercent = restObj?.healPercent ?? 100;

        // Apply healing
        this.journeySystem.applyHeal(healPercent);

        // Save point
        if (restObj?.isSavePoint || this.roomConfig.isWaypoint) {
            this.journeySystem.createRoomSavePoint();
            this.journeySystem.unlockWaypoint(this.roomId);
        }

        // Show heal animation above the player
        const player = this.gameState.getPlayer();
        const healAmount = Math.floor(player.maxHp * (healPercent / 100));

        this.showFloatingText(`+${healAmount} ❤️`, '#44ff44', this.player.x, this.player.y - 60);

        // Save point notification
        if (restObj?.isSavePoint || this.roomConfig.isWaypoint) {
            this.time.delayedCall(500, () => {
                this.showFloatingText('⭐ Postup uložen!', '#ffdd44', this.player.x, this.player.y - 90);
            });
        }

        // Close and reopen modal to refresh HP display
        this.closeRestModal();
        this.time.delayedCall(300, () => {
            this.openRestModal();
        });
    }

    private handleReturnToTown(): void {
        // Show confirmation dialog
        const confirmOverlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.5)
            .setDepth(100)
            .setInteractive();

        const confirmPanel = this.add.container(640, 360).setDepth(101);

        const bg = this.add.rectangle(0, 0, 350, 180, 0x333355)
            .setStrokeStyle(3, 0x5566aa);

        const title = this.add.text(0, -50, 'Opustit výpravu?', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const warning = this.add.text(0, -15, 'Ztratíš veškerý postup.', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44'
        }).setOrigin(0.5);

        // Yes button
        const yesBtn = this.add.rectangle(-70, 45, 100, 40, 0x884444)
            .setStrokeStyle(2, 0xaa6666)
            .setInteractive({ useHandCursor: true });
        const yesText = this.add.text(-70, 45, 'Ano', {
            fontSize: '16px',
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
        const noBtn = this.add.rectangle(70, 45, 100, 40, 0x448844)
            .setStrokeStyle(2, 0x66aa66)
            .setInteractive({ useHandCursor: true });
        const noText = this.add.text(70, 45, 'Ne', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        noBtn.on('pointerover', () => noBtn.setFillStyle(0x55aa55));
        noBtn.on('pointerout', () => noBtn.setFillStyle(0x448844));
        noBtn.on('pointerdown', () => {
            confirmOverlay.destroy();
            confirmPanel.destroy();
        });

        confirmPanel.add([bg, title, warning, yesBtn, yesText, noBtn, noText]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXIT ARROWS & TRANSITIONS
    // ═══════════════════════════════════════════════════════════════════════

    private createExitArrows(): void {
        this.roomConfig.exits.forEach(exit => {
            const isLocked = exit.locked === true;

            // Determine arrow position
            let arrowX: number;
            let arrowY: number;
            let rotation: number;

            if (exit.direction === 'left') {
                arrowX = 40;
                arrowY = exit.y + exit.height / 2;
                rotation = Math.PI;
            } else {
                arrowX = 1240;
                arrowY = exit.y + exit.height / 2;
                rotation = 0;
            }

            const container = this.add.container(arrowX, arrowY).setDepth(15);

            const arrow = this.add.triangle(0, 0,
                -15, -20,
                -15, 20,
                25, 0,
                isLocked ? 0x666666 : 0x88cc88
            ).setRotation(rotation);
            container.add(arrow);

            if (isLocked) {
                container.setAlpha(0.3);
                const lock = this.add.text(0, 30, '🔒', { fontSize: '20px' }).setOrigin(0.5);
                container.add(lock);
            } else {
                // Pulsing animation
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
                    if (!this.isWalking && !this.modalOpen) {
                        this.walkToExit(exit);
                    }
                });
            }
        });
    }

    private walkToExit(exit: RoomConfig['exits'][0]): void {
        // Check locked status
        if (exit.locked) {
            const msg = exit.lockedMessage || 'Cesta je uzavřena.';
            this.showMessage(msg);
            return;
        }

        const targetX = exit.direction === 'left' ? 50 : 1230;

        this.walkTo(targetX, this.DEFAULT_GROUND_Y, () => {
            this.transitionToRoom(exit.targetRoom, exit.direction);
        });
    }

    private checkExitZones(): void {
        // Left exit
        if (this.player.x < 80) {
            const leftExit = this.roomConfig.exits.find(e => e.direction === 'left');
            if (leftExit && !leftExit.locked) {
                this.transitionToRoom(leftExit.targetRoom, leftExit.direction);
                return;
            }
        }

        // Right exit
        if (this.player.x > 1150) {
            const rightExit = this.roomConfig.exits.find(e => e.direction === 'right');
            if (rightExit) {
                if (rightExit.locked) {
                    const msg = rightExit.lockedMessage || 'Cesta je uzavřena.';
                    this.showMessage(msg);
                    return;
                }
                this.transitionToRoom(rightExit.targetRoom, rightExit.direction);
                return;
            }
        }
    }

    private transitionToRoom(targetRoom: string, direction: string): void {
        this.isWalking = true;

        const oppositeDirection = direction === 'left' ? 'right' : 'left';

        // Check if target room has a custom scene class
        const forestRooms = this.cache.json.get('forestRooms') as any;
        const targetRoomConfig = forestRooms?.rooms?.[targetRoom];
        const sceneKey = targetRoomConfig?.sceneClass || 'ForestRoomScene';

        this.cameras.main.fadeOut(300, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(sceneKey, {
                roomId: targetRoom,
                fromDirection: oppositeDirection
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UI
    // ═══════════════════════════════════════════════════════════════════════

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

        this.add.text(150, 70, `❤️ ${player.hp}/${player.maxHp}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        // Room name
        this.add.text(640, 30, this.roomConfig.nameCs, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

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
        backBtn.on('pointerdown', () => {
            if (!this.modalOpen) this.confirmAbandon();
        });
    }

    private confirmAbandon(): void {
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
            .setDepth(300)
            .setInteractive();

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

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════════════

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

    private showMessage(text: string): void {
        const msg = this.add.text(640, 300, text, {
            fontSize: '20px',
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
}

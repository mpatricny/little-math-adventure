import { sfx, voice } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem } from '../systems/JourneySystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { WalkingSceneHud } from '../ui/WalkingSceneHud';
import { resolveForestRoomSceneKey } from '../systems/ForestRoomRouting';

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
    private playerBSprite: Phaser.GameObjects.Sprite | null = null;
    private playerBWalkTween: Phaser.Tweens.Tween | null = null;
    private walkingHud!: WalkingSceneHud;
    private isWalking = false;

    // State
    private hasRested = false;
    private modalOpen = false;

    // Modal elements (created dynamically, destroyed on close)
    private modalOverlay: Phaser.GameObjects.Rectangle | null = null;
    private modalContainer: Phaser.GameObjects.Container | null = null;

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
        this.tentZone = null;
        this.obstacleZone = null;
        this.playerBSprite = null;
        this.playerBWalkTween = null;

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
            // Phaser's NineSlice is WebGL-only. Keep the panel opaque and usable
            // on Canvas tablets too, without stretching the decorative bitmap.
            if (this.game.renderer.type === Phaser.CANVAS) {
                const bounds = modalTemplate.getBounds();
                modalTemplate.addAt(this.add.rectangle(0, 0, bounds.width, bounds.height, 0x16241b)
                    .setStrokeStyle(3, 0x88aa77), 0);
            }
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

        // Keep the journey-specific controls and add the shared world HUD.
        this.createUI();
        this.walkingHud = new WalkingSceneHud(this);

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

        // Co-op: show Player B sprite behind Player A
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            coop.activatePlayerB();
            const playerB = this.gameState.getPlayer();
            const spriteBConfig = getPlayerSpriteConfig(playerB.characterType);
            this.playerBSprite = this.add.sprite(spawnX - 30, spawnY + 10, spriteBConfig.idleTexture)
                .setScale(0.9)
                .setDepth(9)
                .play(spriteBConfig.idleAnim);
            if (this.fromDirection === 'right') {
                this.playerBSprite.setFlipX(true);
            }
            coop.activatePlayerA();
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

        // Co-op: Player B follows
        this.walkPlayerBFollow(targetX, targetY, dx, duration);

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

    private walkPlayerBFollow(targetX: number, targetY: number, dx: number, duration: number): void {
        if (!this.playerBSprite) return;

        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) return;

        coop.activatePlayerB();
        const spriteBConfig = getPlayerSpriteConfig(this.gameState.getPlayer().characterType);
        coop.activatePlayerA();

        this.playerBSprite.setFlipX(dx < 0);

        const offsetX = dx < 0 ? 30 : -30;

        this.time.delayedCall(150, () => {
            if (!this.playerBSprite) return;
            this.playerBSprite.play(spriteBConfig.walkAnim);
            this.playerBWalkTween = this.tweens.add({
                targets: this.playerBSprite,
                x: targetX + offsetX,
                y: targetY + 10,
                duration: Math.max(duration - 150, 100),
                ease: 'Linear',
                onComplete: () => {
                    this.playerBSprite?.play(spriteBConfig.idleAnim);
                    this.playerBWalkTween = null;
                }
            });
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
        const overlay = this.sceneBuilder.get<Phaser.GameObjects.Container>('campModalOverlayHost')!;
        const overlayLayout = this.sceneBuilder.getElementDef('campModalOverlayHost')!;
        this.modalOverlay = this.add.rectangle(overlay.x, overlay.y, overlayLayout.width!, overlayLayout.height!, 0x000000, 0.6)
            .setDepth(overlay.depth).setInteractive();

        this.sceneBuilder.get<Phaser.GameObjects.Container>('Black-frmae-Diamonds')!.setVisible(true);
        // This host is also the frame's safe content inset. Each control has an
        // independent editor host; none is positioned relative to another control.
        const content = this.sceneBuilder.get<Phaser.GameObjects.Container>('campModalContentHost')!;
        this.modalContainer = this.add.container(content.x, content.y).setDepth(content.depth);
        const titleHost = this.sceneBuilder.get<Phaser.GameObjects.Container>('campModalTitleHost')!;
        const title = this.add.text(titleHost.x, titleHost.y, '🏕️ Tábor', {
            resolution: 2, fontSize: '28px', fontFamily: 'Georgia, serif', color: '#e8d8ac',
        }).setOrigin(0.5).setDepth(titleHost.depth).setName('campModalTitle');
        this.addToModal(title);
        this.createModalHPDisplay();
        this.addToModal(this.createCampButton('campModalRestButtonHost', '❤️ Odpočinek', () => this.handleRest(), this.hasRested));
        this.addToModal(this.createTownButton('campModalTownButtonHost', true));
        this.addToModal(this.createCampButton('campModalCloseButtonHost', '✕', () => this.closeRestModal()));
    }

    private addToModal(element: Phaser.GameObjects.Container | Phaser.GameObjects.Text): void {
        element.setPosition(element.x - this.modalContainer!.x, element.y - this.modalContainer!.y);
        this.modalContainer!.add(element);
    }

    private createModalHPDisplay(): void {
        if (!this.modalContainer) return;

        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>('campModalHPHost')!;
        const layout = this.sceneBuilder.getElementDef('campModalHPHost')!;
        const health = this.add.container(host.x, host.y).setDepth(host.depth).setName('campModalHP');
        const hpLabel = this.add.text(-layout.width! / 2, 0, '❤️', {
            resolution: 2, fontSize: '26px', fontFamily: 'Arial, sans-serif',
        }).setOrigin(0, 0.5);
        const barWidth = layout.width! - 60, barHeight = layout.height!;
        const hpBarBg = this.add.rectangle(30, 0, barWidth, barHeight, 0x333333).setStrokeStyle(2, 0x88aa77);
        const fillWidth = (barWidth - 4) * hpPercent;
        const hpBarFill = this.add.rectangle(30 - (barWidth - 4) / 2, 0, fillWidth, barHeight - 4, this.getHPColor(hpPercent))
            .setOrigin(0, 0.5);
        const hpText = this.add.text(30, 0, `${player.hp} / ${player.maxHp}`, {
            resolution: 2, fontSize: '22px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold',
            stroke: '#16241b', strokeThickness: 3,
        }).setOrigin(0.5);
        health.add([hpLabel, hpBarBg, hpBarFill, hpText]);
        this.addToModal(health);
    }

    private getHPColor(percent: number): number {
        if (percent > 0.6) return 0x44aa44;
        if (percent > 0.3) return 0xaaaa44;
        return 0xaa4444;
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
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REST & TOWN RETURN
    // ═══════════════════════════════════════════════════════════════════════

    private handleRest(): void {
        if (this.hasRested) {
            sfx(this, 'ui.unavailable');
            this.showFloatingText('Už jsi odpočíval!', '#ffaa44', 640, 200);
            return;
        }

        this.hasRested = true;
        sfx(this, 'reward.rest');
        voice(this, 'vo.camp.rest', true);

        // Get heal config from room objects
        const restObj = this.roomConfig.objects.find(o => o.type === 'rest');
        const healPercent = restObj?.healPercent ?? 100;

        // Apply healing
        this.journeySystem.applyHeal(healPercent);
        this.walkingHud.refresh();

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
        if (!this.journeySystem.pauseRoomJourneyAtWaypoint(this.roomId)) return;
        this.input.enabled = false;
        this.closeRestModal();
        this.scene.start('TownScene');
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
        const sceneKey = resolveForestRoomSceneKey(forestRooms, targetRoom);

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
        // Room name
        this.add.text(850, 52, this.roomConfig.nameCs, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

        this.createTownButton('campTownButtonHost');
    }

    private createTownButton(hostId: string, inModal = false): Phaser.GameObjects.Container {
        return this.createCampButton(hostId, '🏠 Město', () => {
            if (!this.isWalking && (inModal || !this.modalOpen)) this.handleReturnToTown();
        });
    }

    private createCampButton(hostId: string, text: string, onClick: () => void, disabled = false): Phaser.GameObjects.Container {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(hostId)!;
        const layout = this.sceneBuilder.getElementDef(hostId)!;
        const width = layout.width!, height = layout.height!;
        host.setVisible(false);
        const root = this.add.container(host.x, host.y).setDepth(host.depth).setName(`${hostId}-button`);
        const surface = this.add.container(0, 0);
        const bg = this.add.rectangle(0, 0, width, height, 0x344e3c).setStrokeStyle(2, 0x88aa77);
        const label = this.add.text(0, 0, text, {
            resolution: 2, fontSize: '24px', fontFamily: 'Georgia, serif', color: '#f5edce',
        }).setOrigin(0.5);
        surface.add([bg, label]);
        root.add(surface).setSize(width, height);
        if (disabled) return root.setAlpha(0.5);
        root.setInteractive({ useHandCursor: true });
        let pressed = false;
        root.on('pointerover', () => { surface.y = -2; bg.setFillStyle(0x42654c); });
        root.on('pointerout', () => { pressed = false; surface.y = 0; bg.setFillStyle(0x344e3c); });
        root.on('pointerdown', () => { pressed = true; surface.y = 1; });
        root.on('pointerup', () => {
            surface.y = 0;
            if (!pressed) return;
            pressed = false;
            onClick();
        });
        return root;
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

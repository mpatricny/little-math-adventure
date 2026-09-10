import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import {
    BATTLE_MOCK_ENEMY_SPRITES,
    BATTLE_MOCK_LAYOUT_SCENE,
    BATTLE_MOCK_PLAYER_SPRITES,
    BATTLE_MOCK_TARGET_ROTATION,
    type BattleMockSpriteSpec,
} from '../data/battle-ui-mock';

type Host = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
    rotation?: number;
    scale?: number;
};

type Turn = 'hero' | 'pet';
type PreparationKind = 'sword' | 'shield';
type EnemyCount = 1 | 2 | 3;

type HpBarView = {
    root: Phaser.GameObjects.Container;
    width: number;
    height: number;
    color: number;
    background: Phaser.GameObjects.Graphics;
    fill: Phaser.GameObjects.Graphics;
    value: Phaser.GameObjects.Text;
};

type RuneView = {
    normal: Phaser.GameObjects.Image;
    active: Phaser.GameObjects.Image;
    showEmpty: boolean;
};

type ActorAnchoredObject = {
    actor: Phaser.GameObjects.Sprite;
    target: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
    offsetX: number;
    offsetY: number;
};

type ActionControl = {
    root: Phaser.GameObjects.Container;
    surface: Phaser.GameObjects.Container;
    glow: Phaser.GameObjects.Arc;
    hoverRing: Phaser.GameObjects.Arc;
    normalIcon: Phaser.GameObjects.Image;
    activeIcon: Phaser.GameObjects.Image;
    accent: number;
    enabled: boolean;
};

type BadgeView = {
    plate: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
};

type EnemyCountButtonView = {
    plate: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
};

type BattleMode = 'single' | 'coop';

type BattleModeButtonView = {
    plate: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    width: number;
    height: number;
};

/**
 * Layered implementation mock of the approved lightweight battle HUD.
 *
 * Static frames and every independently positioned UI part are represented by
 * SceneBuilder hosts. Runtime layers only provide values, state transitions,
 * hover/pressed feedback and temporary combat effects.
 */
export class BattleUiMockScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private pauseOverlay!: Phaser.GameObjects.Container;
    private playerHpBar!: HpBarView;
    private playerBHpBar!: HpBarView;
    private playerVitalsFrame?: Phaser.GameObjects.Image;
    private playerBVitalsFrame?: Phaser.GameObjects.Image;
    private heroSprite?: Phaser.GameObjects.Sprite;
    private heroBSprite?: Phaser.GameObjects.Sprite;
    private petSprite?: Phaser.GameObjects.Sprite;
    private petBSprite?: Phaser.GameObjects.Sprite;
    private enemySprites: Phaser.GameObjects.Sprite[] = [];
    private enemyHpBars: HpBarView[] = [];
    private enemyVitalsFrames: Phaser.GameObjects.Image[] = [];
    private actorAnchoredObjects: ActorAnchoredObject[] = [];
    private enemyCountButtons = new Map<EnemyCount, EnemyCountButtonView>();
    private battleModeButtons = new Map<BattleMode, BattleModeButtonView>();
    private targetMarker?: Phaser.GameObjects.Image;
    private targetMarkerTween?: Phaser.Tweens.Tween;
    private swordAction!: ActionControl;
    private petAction!: ActionControl;
    private potionAction!: ActionControl;
    private potionBadge!: BadgeView;
    private petBadge!: BadgeView;
    private preparationNormalIcon!: Phaser.GameObjects.Image;
    private preparationActiveIcon!: Phaser.GameObjects.Image;
    private preparationHoverRing!: Phaser.GameObjects.Arc;
    private speedRunes: RuneView[] = [];
    private speedRunesB: RuneView[] = [];
    private preparationRunes: RuneView[] = [];
    private readyPulse?: Phaser.Tweens.Tween;

    private paused = false;
    private turn: Turn = 'hero';
    private speedCharge = 2;
    private speedChargeB = 1;
    private potionFull = true;
    private preparationKind: PreparationKind = 'sword';
    private preparationCharge = 2;
    private playerHp = 8;
    private readonly playerMaxHp = 10;
    private playerBHp = 9;
    private readonly playerBMaxHp = 10;
    private battleMode: BattleMode = 'single';
    private enemyCount: EnemyCount = 1;
    private selectedEnemyIndex = 0;
    private enemyHp = [6, 8, 7];
    private readonly enemyMaxHp = [10, 10, 10];

    constructor() {
        super({ key: 'BattleUiMockScene' });
    }

    create(): void {
        this.speedRunes = [];
        this.speedRunesB = [];
        this.preparationRunes = [];
        this.enemySprites = [];
        this.enemyHpBars = [];
        this.enemyVitalsFrames = [];
        this.actorAnchoredObjects = [];
        this.enemyCountButtons.clear();
        this.battleModeButtons.clear();
        this.resetState();
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('BattleUiMockScene');

        this.setupCombatants();
        this.setupTargetMarker();
        this.createVitals();
        this.createBattleModeControl();
        this.createEnemyCountControl();
        this.createActionDock();
        this.createPreparationIndicator();
        this.createPauseControl();
        this.createPauseOverlay();
        this.renderAll(false);

        this.input.keyboard?.on('keydown', this.handleKeyDown, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard?.off('keydown', this.handleKeyDown, this);
            this.readyPulse?.stop();
            this.readyPulse = undefined;
            this.targetMarkerTween?.stop();
            this.targetMarkerTween = undefined;
        });
    }

    private resetState(): void {
        this.paused = false;
        this.turn = 'hero';
        this.speedCharge = 2;
        this.speedChargeB = 1;
        this.potionFull = true;
        this.preparationKind = 'sword';
        this.preparationCharge = 2;
        this.playerHp = 8;
        this.playerBHp = 9;
        this.battleMode = 'single';
        this.enemyCount = 1;
        this.selectedEnemyIndex = 0;
        this.enemyHp = [6, 8, 7];
    }

    private setupCombatants(): void {
        this.heroSprite = this.createAnimatedSpriteFromHost(
            BATTLE_MOCK_PLAYER_SPRITES.heroA,
        );
        this.petSprite = this.createAnimatedSpriteFromHost(
            BATTLE_MOCK_PLAYER_SPRITES.petA,
        );
        this.heroBSprite = this.createAnimatedSpriteFromHost(
            BATTLE_MOCK_PLAYER_SPRITES.heroB,
        );
        this.petBSprite = this.createAnimatedSpriteFromHost(
            BATTLE_MOCK_PLAYER_SPRITES.petB,
        );

        BATTLE_MOCK_ENEMY_SPRITES.forEach((spec, index) => {
            const sprite = this.createAnimatedSpriteFromHost(spec);
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => this.selectEnemy(index));
            this.enemySprites[index] = sprite;
        });
    }

    private createAnimatedSpriteFromHost(
        spec: BattleMockSpriteSpec,
    ): Phaser.GameObjects.Sprite {
        const existing = this.sceneBuilder.get<Phaser.GameObjects.Image>(spec.hostId);
        const definition = this.sceneBuilder.getElementDef(spec.hostId);
        const x = existing?.x ?? definition?.x ?? 0;
        const y = existing?.y ?? definition?.y ?? 0;
        const depth = existing?.depth ?? definition?.depth ?? 10;
        const scale = definition?.scale ?? spec.scale;
        const rotation = definition?.rotation ?? 0;
        existing?.destroy();

        const sprite = this.add.sprite(x, y, spec.texture, 0)
            .setName(spec.hostId)
            .setScale(scale)
            .setAngle(rotation)
            .setDepth(depth);
        if (this.anims.exists(spec.animation)) sprite.play(spec.animation);
        return sprite;
    }

    private setupTargetMarker(): void {
        const marker = this.sceneBuilder.get<Phaser.GameObjects.Image>('battleMockTargetSword');
        if (!marker) return;

        const markerHost = this.getHost(
            'battleMockTargetSword',
            {
                x: 899,
                y: 350,
                depth: 50,
                rotation: BATTLE_MOCK_TARGET_ROTATION,
            },
        );
        this.targetMarker = marker;

        // Rotation is scene data, not transient animation state. Applying the
        // host value explicitly keeps editor tuning intact when the bob tween
        // is recreated after switching target or enemy count.
        marker.setAngle(markerHost.rotation ?? BATTLE_MOCK_TARGET_ROTATION);
        this.positionTargetMarker(this.selectedEnemyIndex);
    }

    private createVitals(): void {
        this.playerHpBar = this.createHpBar(
            'battleMockPlayerHpHost',
            103,
            8,
            0x63c94d,
        );
        this.playerBHpBar = this.createHpBar(
            'battleMockPlayerBHpHost',
            103,
            8,
            0x5eb7e8,
        );
        this.playerVitalsFrame = this.sceneBuilder.get<Phaser.GameObjects.Image>(
            'battleMockPlayerVitalsFrame',
        );
        this.playerBVitalsFrame = this.sceneBuilder.get<Phaser.GameObjects.Image>(
            'battleMockPlayerBVitalsFrame',
        );
        this.bindActorAnchoredObject(
            this.heroSprite,
            'battleMockHero',
            this.playerVitalsFrame,
            'battleMockPlayerVitalsFrame',
        );
        this.bindActorAnchoredObject(
            this.heroSprite,
            'battleMockHero',
            this.playerHpBar.root,
            'battleMockPlayerHpHost',
        );
        this.bindActorAnchoredObject(
            this.heroBSprite,
            'battleMockHeroB',
            this.playerBVitalsFrame,
            'battleMockPlayerBVitalsFrame',
        );
        this.bindActorAnchoredObject(
            this.heroBSprite,
            'battleMockHeroB',
            this.playerBHpBar.root,
            'battleMockPlayerBHpHost',
        );

        const enemyFrameIds = [
            'battleMockEnemyVitalsFrame',
            'battleMockEnemyGroup2VitalsFrame',
            'battleMockEnemyGroup3VitalsFrame',
        ];
        const enemyHpHostIds = [
            'battleMockEnemyHpHost',
            'battleMockEnemyGroup2HpHost',
            'battleMockEnemyGroup3HpHost',
        ];
        enemyFrameIds.forEach((id, index) => {
            const frame = this.sceneBuilder.get<Phaser.GameObjects.Image>(id);
            if (frame) this.enemyVitalsFrames[index] = frame;
            this.enemyHpBars[index] = this.createHpBar(
                enemyHpHostIds[index],
                86,
                7,
                0xd8403d,
            );
            const enemy = this.enemySprites[index];
            const actorHostId = BATTLE_MOCK_ENEMY_SPRITES[index].hostId;
            this.bindActorAnchoredObject(
                enemy,
                actorHostId,
                frame,
                id,
            );
            this.bindActorAnchoredObject(
                enemy,
                actorHostId,
                this.enemyHpBars[index].root,
                enemyHpHostIds[index],
            );
        });
        for (let index = 1; index <= 4; index++) {
            const playerRuneHost = `battleMockSpeedRune${index}Host`;
            const playerBRuneHost = `battleMockSpeedRuneB${index}Host`;
            const playerRune = this.createRune(playerRuneHost, 18, true);
            const playerBRune = this.createRune(playerBRuneHost, 18, true);
            this.speedRunes.push(playerRune);
            this.speedRunesB.push(playerBRune);
            this.bindRuneToActor(
                this.heroSprite,
                'battleMockHero',
                playerRune,
                playerRuneHost,
            );
            this.bindRuneToActor(
                this.heroBSprite,
                'battleMockHeroB',
                playerBRune,
                playerBRuneHost,
            );
        }
    }

    private createHpBar(
        hostId: string,
        width: number,
        height: number,
        color: number,
    ): HpBarView {
        const host = this.getHost(hostId, { x: 0, y: 0, depth: 81 });
        const displayWidth = host.width ?? width;
        const displayHeight = host.height ?? height;
        const root = this.add.container(host.x, host.y).setDepth(host.depth);
        const background = this.add.graphics();
        const fill = this.add.graphics();
        const value = this.add.text(0, 0, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.max(11, Math.round(displayHeight * 1.5))}px`,
            fontStyle: 'bold',
            color: '#fff4d1',
            stroke: '#24140b',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);

        root.add([background, fill, value]);
        return {
            root,
            width: displayWidth,
            height: displayHeight,
            color,
            background,
            fill,
            value,
        };
    }

    private createBattleModeControl(): void {
        const panelHost = this.getHost(
            'battleMockModePanelHost',
            { x: 285, y: 50, depth: 90, width: 260, height: 54 },
        );
        const panelWidth = panelHost.width ?? 260;
        const panelHeight = panelHost.height ?? 54;
        const panel = this.add.container(panelHost.x, panelHost.y)
            .setDepth(panelHost.depth);
        const background = this.add.graphics();
        background.fillStyle(0x17110c, 0.9);
        background.fillRoundedRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            panelHeight / 2,
        );
        background.lineStyle(3, 0x845127, 0.96);
        background.strokeRoundedRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            panelHeight / 2,
        );
        const title = this.add.text(-91, 0, 'REŽIM', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#e7c589',
            stroke: '#251309',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);
        panel.add([background, title]);

        const modes: Array<{ mode: BattleMode; label: string; hostId: string }> = [
            { mode: 'single', label: '1 HRÁČ', hostId: 'battleMockSingleModeHost' },
            { mode: 'coop', label: 'CO-OP', hostId: 'battleMockCoopModeHost' },
        ];
        modes.forEach(({ mode, label, hostId }, index) => {
            const host = this.getHost(hostId, {
                x: 275 + index * 92,
                y: 50,
                depth: 92,
                width: 82,
                height: 38,
            });
            const width = host.width ?? 82;
            const height = host.height ?? 38;
            const root = this.add.container(host.x, host.y)
                .setDepth(host.depth)
                .setSize(width, height)
                .setInteractive({ useHandCursor: true });
            const plate = this.add.graphics();
            const buttonLabel = this.add.text(0, 0, label, {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#f5d18b',
                stroke: '#251309',
                strokeThickness: 3,
            }).setOrigin(0.5).setResolution(2);
            root.add([plate, buttonLabel]);
            root.on('pointerover', () => {
                if (this.battleMode !== mode) buttonLabel.setColor('#fff3c4');
            });
            root.on('pointerout', () => this.renderBattleModeButtons());
            root.on('pointerdown', () => root.setY(host.y + 2));
            root.on('pointerup', () => {
                root.setY(host.y);
                this.setBattleMode(mode);
            });
            root.on('pointerupoutside', () => root.setY(host.y));
            this.battleModeButtons.set(mode, {
                plate,
                label: buttonLabel,
                width,
                height,
            });
        });
    }

    private createEnemyCountControl(): void {
        const panelHost = this.getHost(
            'battleMockEnemyCountPanelHost',
            { x: 640, y: 50, depth: 90, width: 280, height: 54 },
        );
        const panelWidth = panelHost.width ?? 280;
        const panelHeight = panelHost.height ?? 54;
        const panel = this.add.container(panelHost.x, panelHost.y)
            .setDepth(panelHost.depth);
        const background = this.add.graphics();
        background.fillStyle(0x17110c, 0.9);
        background.fillRoundedRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            panelHeight / 2,
        );
        background.lineStyle(3, 0x845127, 0.96);
        background.strokeRoundedRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            panelHeight / 2,
        );
        const title = this.add.text(-92, 0, 'NEPŘÁTELÉ', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#e7c589',
            stroke: '#251309',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);
        panel.add([background, title]);

        for (const count of [1, 2, 3] as const) {
            const host = this.getHost(
                `battleMockEnemyCount${count}Host`,
                {
                    x: 570 + count * 55,
                    y: 50,
                    depth: 92,
                    width: 40,
                    height: 40,
                },
            );
            const radius = Math.min(host.width ?? 40, host.height ?? 40) / 2;
            const root = this.add.container(host.x, host.y)
                .setDepth(host.depth)
                .setSize(radius * 2, radius * 2)
                .setInteractive({ useHandCursor: true });
            const plate = this.add.circle(0, 0, radius, 0x2d2118, 1)
                .setStrokeStyle(3, 0x9a6433, 1);
            const label = this.add.text(0, 0, `${count}`, {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: `${Math.round(radius * 1.05)}px`,
                fontStyle: 'bold',
                color: '#f5d18b',
                stroke: '#251309',
                strokeThickness: 3,
            }).setOrigin(0.5).setResolution(2);
            root.add([plate, label]);
            root.on('pointerover', () => {
                if (this.enemyCount !== count) plate.setStrokeStyle(3, 0xffd470, 1);
            });
            root.on('pointerout', () => this.renderEnemyCountButtons());
            root.on('pointerdown', () => root.setY(host.y + 2));
            root.on('pointerup', () => {
                root.setY(host.y);
                this.setEnemyCount(count);
            });
            root.on('pointerupoutside', () => root.setY(host.y));
            this.enemyCountButtons.set(count, { plate, label });
        }
    }

    private createRune(
        hostId: string,
        size: number,
        showEmpty = false,
    ): RuneView {
        const host = this.getHost(hostId, { x: 0, y: 0, depth: 82 });
        const width = host.width ?? size;
        const height = host.height ?? size;
        const normal = this.add.image(
            host.x,
            host.y,
            'battle-hud-rune-empty-v1',
        ).setDisplaySize(width, height).setDepth(host.depth);
        const active = this.add.image(
            host.x,
            host.y,
            'battle-hud-rune-charged-v1',
        ).setDisplaySize(width, height).setDepth(host.depth).setAlpha(0);
        return { normal, active, showEmpty };
    }

    private createActionDock(): void {
        this.potionAction = this.createActionControl({
            hostId: 'battleMockPotionActionHost',
            size: 76,
            iconSize: 57,
            normalTexture: 'character-book-red-potion',
            activeTexture: 'character-book-red-potion',
            accent: 0xf25b5b,
            onClick: () => this.usePotion(),
        });
        this.swordAction = this.createActionControl({
            hostId: 'battleMockSwordActionHost',
            size: 118,
            iconSize: 92,
            normalTexture: 'prep-sword-normal-v2',
            activeTexture: 'prep-sword-active-v2',
            accent: 0xffb12d,
            onClick: () => this.heroAttack(),
        });
        this.petAction = this.createActionControl({
            hostId: 'battleMockPetActionHost',
            size: 76,
            iconSize: 63,
            normalTexture: 'slime-sheet',
            activeTexture: 'slime-sheet',
            frame: 0,
            activeTint: 0xcaff9f,
            accent: 0x62e954,
            onClick: () => this.petAttack(),
        });

        this.potionBadge = this.createBadge(
            'battleMockPotionBadgeHost',
            0xc94943,
        );
        this.petBadge = this.createBadge(
            'battleMockPetBadgeHost',
            0x4aae42,
        );
    }

    private createActionControl(options: {
        hostId: string;
        size: number;
        iconSize: number;
        normalTexture: string;
        activeTexture: string;
        frame?: string | number;
        activeTint?: number;
        accent: number;
        onClick: () => void;
    }): ActionControl {
        const host = this.getHost(options.hostId, { x: 0, y: 0, depth: 83 });
        const iconWidth = host.width ?? options.iconSize;
        const iconHeight = host.height ?? options.iconSize;
        const iconRotation = host.rotation ?? 0;
        const root = this.add.container(host.x, host.y)
            .setDepth(host.depth)
            .setSize(options.size, options.size);
        const surface = this.add.container(0, 0);
        const glow = this.add.circle(
            0,
            0,
            options.size * 0.46,
            options.accent,
            0,
        ).setBlendMode(Phaser.BlendModes.ADD);
        const hoverRing = this.add.circle(
            0,
            0,
            options.size * 0.43,
            0x000000,
            0,
        ).setStrokeStyle(
            Math.max(2, options.size * 0.028),
            0xfff0ba,
            1,
        ).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        const normalIcon = this.add.image(
            0,
            0,
            options.normalTexture,
            options.frame,
        ).setDisplaySize(iconWidth, iconHeight).setAngle(iconRotation);
        const activeIcon = this.add.image(
            0,
            0,
            options.activeTexture,
            options.frame,
        ).setDisplaySize(iconWidth, iconHeight)
            .setAngle(iconRotation)
            .setAlpha(0);
        if (options.activeTint !== undefined) activeIcon.setTint(options.activeTint);

        surface.add([glow, hoverRing, normalIcon, activeIcon]);
        root.add(surface);

        const control: ActionControl = {
            root,
            surface,
            glow,
            hoverRing,
            normalIcon,
            activeIcon,
            accent: options.accent,
            enabled: true,
        };
        this.bindActionInteraction(control, options.onClick);
        return control;
    }

    private bindActionInteraction(
        control: ActionControl,
        onClick: () => void,
    ): void {
        let pressed = false;
        control.root.on('pointerover', () => {
            if (!control.enabled || pressed) return;
            control.surface.setY(-3);
            control.hoverRing.setAlpha(0.55);
        });
        control.root.on('pointerout', () => {
            pressed = false;
            control.surface.setY(0);
            control.hoverRing.setAlpha(0);
        });
        control.root.on('pointerdown', () => {
            if (!control.enabled) return;
            pressed = true;
            control.surface.setY(1);
            control.hoverRing.setAlpha(0.34);
        });
        control.root.on('pointerup', () => {
            if (!control.enabled || !pressed) return;
            pressed = false;
            control.surface.setY(-3);
            control.hoverRing.setAlpha(0.55);
            onClick();
        });
        control.root.on('pointerupoutside', () => {
            pressed = false;
            control.surface.setY(0);
            control.hoverRing.setAlpha(0);
        });
    }

    private createBadge(hostId: string, accent: number): BadgeView {
        const host = this.getHost(hostId, { x: 0, y: 0, depth: 84 });
        const radius = Math.min(host.width ?? 32, host.height ?? 32) / 2;
        const root = this.add.container(host.x, host.y).setDepth(host.depth);
        const plate = this.add.circle(0, 0, radius, 0x17110c, 0.97)
            .setStrokeStyle(Math.max(2, radius * 0.19), accent, 0.95);
        const text = this.add.text(0, 0, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.round(radius * 1.06)}px`,
            fontStyle: 'bold',
            color: '#fff1bd',
            stroke: '#2b160c',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);
        root.add([plate, text]);
        return { plate, text };
    }

    private createPreparationIndicator(): void {
        const iconHost = this.getHost(
            'battleMockPreparationIconHost',
            { x: 96, y: 615, depth: 82 },
        );
        const hoverHost = this.getHost(
            'battleMockPreparationHoverHost',
            {
                x: iconHost.x,
                y: iconHost.y,
                depth: iconHost.depth - 1,
                width: 64,
                height: 64,
            },
        );
        const iconWidth = iconHost.width ?? 57;
        const iconHeight = iconHost.height ?? 57;
        const iconRotation = iconHost.rotation ?? 0;
        const hoverRadius = Math.min(
            hoverHost.width ?? 64,
            hoverHost.height ?? 64,
        ) / 2;
        const hoverScale = Math.abs(hoverHost.scale ?? 1);
        this.preparationHoverRing = this.add.circle(
            hoverHost.x,
            hoverHost.y,
            hoverRadius,
            0xffb12d,
            0,
        ).setStrokeStyle(3, 0xffe18d, 1)
            .setScale(hoverScale)
            .setAlpha(0)
            .setDepth(hoverHost.depth)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.preparationNormalIcon = this.add.image(
            iconHost.x,
            iconHost.y,
            'prep-sword-normal-v2',
        ).setDisplaySize(iconWidth, iconHeight)
            .setAngle(iconRotation)
            .setDepth(iconHost.depth);
        this.preparationActiveIcon = this.add.image(
            iconHost.x,
            iconHost.y,
            'prep-sword-active-v2',
        ).setDisplaySize(iconWidth, iconHeight)
            .setAngle(iconRotation)
            .setDepth(iconHost.depth)
            .setAlpha(0);

        for (let index = 1; index <= 3; index++) {
            this.preparationRunes.push(
                this.createRune(`battleMockPreparationRune${index}Host`, 21),
            );
        }

        const frameHost = this.getHost(
            'battleMockPreparationFrame',
            { x: 96, y: 640, depth: 80 },
        );
        const hitArea = this.add.container(frameHost.x, frameHost.y)
            .setDepth(iconHost.depth + 1)
            .setSize(frameHost.width ?? 112, frameHost.height ?? 116)
            .setInteractive({ useHandCursor: true });
        const baseY = iconHost.y;

        hitArea.on('pointerover', () => {
            this.preparationHoverRing.setAlpha(0.55);
            this.preparationNormalIcon.setY(baseY - 2);
            this.preparationActiveIcon.setY(baseY - 2);
        });
        hitArea.on('pointerout', () => {
            this.preparationHoverRing.setAlpha(0);
            this.preparationNormalIcon.setY(baseY);
            this.preparationActiveIcon.setY(baseY);
        });
        hitArea.on('pointerdown', () => {
            this.preparationNormalIcon.setY(baseY + 1);
            this.preparationActiveIcon.setY(baseY + 1);
        });
        hitArea.on('pointerup', () => {
            this.preparationNormalIcon.setY(baseY - 2);
            this.preparationActiveIcon.setY(baseY - 2);
            this.togglePreparation();
        });
    }

    private createPauseControl(): void {
        const pause = this.sceneBuilder.get<Phaser.GameObjects.Image>('battleMockPauseHost');
        if (!pause) return;

        const host = this.getHost(
            'battleMockPauseHost',
            { x: 1225, y: 54, depth: 95 },
        );
        const hoverHost = this.getHost(
            'battleMockPauseHoverHost',
            {
                x: host.x,
                y: host.y,
                depth: host.depth - 1,
                width: 68,
                height: 68,
            },
        );
        const hoverRadius = Math.min(
            hoverHost.width ?? 68,
            hoverHost.height ?? 68,
        ) / 2;
        const hoverScale = Math.abs(hoverHost.scale ?? 1);
        const hoverRing = this.add.circle(
            hoverHost.x,
            hoverHost.y,
            hoverRadius,
            0xffd271,
            0,
        ).setStrokeStyle(3, 0xffedaa, 1)
            .setScale(hoverScale)
            .setAlpha(0)
            .setDepth(hoverHost.depth)
            .setBlendMode(Phaser.BlendModes.ADD);

        pause.setInteractive({ useHandCursor: true });
        pause.on('pointerover', () => hoverRing.setAlpha(0.5));
        pause.on('pointerout', () => {
            hoverRing.setAlpha(0);
            pause.setAlpha(1);
        });
        pause.on('pointerdown', () => pause.setAlpha(0.76));
        pause.on('pointerup', () => {
            pause.setAlpha(1);
            this.togglePause();
        });
    }

    private createPauseOverlay(): void {
        const host = this.getHost(
            'battleMockPauseOverlayHost',
            { x: 640, y: 360, depth: 200 },
        );
        this.pauseOverlay = this.add.container(host.x, host.y)
            .setDepth(host.depth)
            .setVisible(false);

        const blocker = this.add.rectangle(0, 0, 1280, 720, 0x09131a, 0.72)
            .setInteractive();
        const panel = this.add.graphics();
        panel.fillStyle(0x17110d, 0.98);
        panel.fillRoundedRect(-200, -130, 400, 260, 28);
        panel.lineStyle(5, 0x9a6433, 1);
        panel.strokeRoundedRect(-200, -130, 400, 260, 28);
        panel.lineStyle(1, 0xe1a85c, 0.9);
        panel.strokeRoundedRect(-191, -121, 382, 242, 22);

        const title = this.add.text(0, -76, 'PAUZA', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '30px',
            fontStyle: 'bold',
            color: '#ffe1a0',
            stroke: '#32180d',
            strokeThickness: 4,
        }).setOrigin(0.5).setResolution(2);
        const resume = this.createPauseAction(
            -5,
            'POKRAČOVAT',
            () => this.togglePause(),
        );
        const menu = this.createPauseAction(
            62,
            'HLAVNÍ MENU',
            () => this.scene.start('MenuScene'),
        );

        this.pauseOverlay.add([blocker, panel, title, resume, menu]);
    }

    private createPauseAction(
        y: number,
        label: string,
        onClick: () => void,
    ): Phaser.GameObjects.Container {
        const root = this.add.container(0, y).setSize(250, 48);
        const plate = this.add.graphics();
        plate.fillStyle(0x3b2618, 1);
        plate.fillRoundedRect(-125, -24, 250, 48, 12);
        plate.lineStyle(2, 0x9a6433, 1);
        plate.strokeRoundedRect(-125, -24, 250, 48, 12);
        const text = this.add.text(0, 0, label, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '19px',
            fontStyle: 'bold',
            color: '#f5d18b',
        }).setOrigin(0.5).setResolution(2);

        root.add([plate, text]);
        root.setInteractive({ useHandCursor: true });
        root.on('pointerover', () => text.setColor('#ffffff'));
        root.on('pointerout', () => {
            text.setColor('#f5d18b');
            root.setY(y);
        });
        root.on('pointerdown', () => root.setY(y + 2));
        root.on('pointerup', () => {
            root.setY(y);
            onClick();
        });
        return root;
    }

    private setEnemyCount(count: EnemyCount): void {
        this.enemyCount = count;
        this.enemyHp = [6, 8, 7];
        this.selectedEnemyIndex = this.getActiveEnemyIndices()[0];
        this.turn = 'hero';
        this.renderAll(false);
    }

    private setBattleMode(mode: BattleMode): void {
        this.battleMode = mode;
        this.turn = 'hero';
        this.renderAll(false);
    }

    private selectEnemy(index: number): void {
        if (!this.getActiveEnemyIndices().includes(index)) return;
        if ((this.enemyHp[index] ?? 0) <= 0) return;

        this.selectedEnemyIndex = index;
        this.renderEnemyPresentation();
    }

    private damageSelectedEnemy(amount: number): void {
        const index = this.selectedEnemyIndex;
        this.enemyHp[index] = Math.max(0, this.enemyHp[index] - amount);
        if (this.enemyHp[index] > 0) return;

        const nextTarget = this.getActiveEnemyIndices().find(
            candidate => this.enemyHp[candidate] > 0,
        );
        if (nextTarget !== undefined) this.selectedEnemyIndex = nextTarget;
    }

    private getActiveEnemyIndices(): number[] {
        return Array.from({ length: this.enemyCount }, (_, index) => index);
    }

    private updateBattleLayout(): void {
        const coop = this.battleMode === 'coop';
        const layout = this.sceneBuilder.getSpawnPoints(
            BATTLE_MOCK_LAYOUT_SCENE,
            this.enemyCount,
            coop,
        );
        if (!layout) return;

        this.heroSprite?.setPosition(layout.player.x, layout.player.y);
        this.petSprite?.setPosition(layout.pet.x, layout.pet.y);
        if (layout.playerB) {
            this.heroBSprite?.setPosition(layout.playerB.x, layout.playerB.y);
        }
        if (layout.petB) {
            this.petBSprite?.setPosition(layout.petB.x, layout.petB.y);
        }
        this.heroBSprite?.setVisible(coop);
        this.petBSprite?.setVisible(coop);

        this.enemySprites.forEach((sprite, index) => {
            const spawn = layout.enemies[index];
            if (spawn) sprite.setPosition(spawn.x, spawn.y);
        });

        this.syncActorAnchoredObjects();

        [
            this.heroSprite,
            this.petSprite,
            this.heroBSprite,
            this.petBSprite,
            ...this.enemySprites,
        ].forEach(sprite => {
            if (!sprite) return;
            sprite.setDepth(
                Phaser.Math.Clamp(Math.floor((sprite.y - 400) / 10) + 1, 1, 40),
            );
        });
    }

    private renderPlayerPresentation(): void {
        const coop = this.battleMode === 'coop';
        this.playerVitalsFrame?.setVisible(true);
        this.playerHpBar.root.setVisible(true);
        this.playerBVitalsFrame?.setVisible(coop);
        this.playerBHpBar.root.setVisible(coop);
        this.speedRunesB.forEach(rune => {
            rune.normal.setVisible(coop);
            rune.active.setVisible(coop);
        });
        this.renderBattleModeButtons();
    }

    private renderEnemyPresentation(): void {
        this.updateBattleLayout();
        const activeIndices = this.getActiveEnemyIndices();
        const activeSet = new Set(activeIndices);

        this.enemySprites.forEach((sprite, index) => {
            const visible = activeSet.has(index);
            sprite.setVisible(visible);
            sprite.setAlpha((this.enemyHp[index] ?? 0) > 0 ? 1 : 0.34);
            if (visible && (this.enemyHp[index] ?? 0) > 0) {
                sprite.setInteractive({ useHandCursor: true });
            } else {
                sprite.disableInteractive();
            }
        });

        this.enemyVitalsFrames.forEach((frame, index) => {
            frame.setVisible(activeSet.has(index));
        });
        this.enemyHpBars.forEach((bar, index) => {
            bar.root.setVisible(activeSet.has(index));
        });

        const selectedAlive = activeSet.has(this.selectedEnemyIndex)
            && (this.enemyHp[this.selectedEnemyIndex] ?? 0) > 0;
        const fallbackTarget = activeIndices.find(index => this.enemyHp[index] > 0);
        if (!selectedAlive && fallbackTarget !== undefined) {
            this.selectedEnemyIndex = fallbackTarget;
        }

        if (fallbackTarget === undefined) {
            this.targetMarker?.setVisible(false);
        } else {
            this.targetMarker?.setVisible(true);
            this.positionTargetMarker(this.selectedEnemyIndex);
        }
        this.renderEnemyCountButtons();
    }

    private renderBattleModeButtons(): void {
        this.battleModeButtons.forEach((button, mode) => {
            const selected = mode === this.battleMode;
            button.plate.clear();
            button.plate.fillStyle(selected ? 0x8a4f1d : 0x2d2118, 1);
            button.plate.fillRoundedRect(
                -button.width / 2,
                -button.height / 2,
                button.width,
                button.height,
                button.height / 2,
            );
            button.plate.lineStyle(3, selected ? 0xffd470 : 0x9a6433, 1);
            button.plate.strokeRoundedRect(
                -button.width / 2,
                -button.height / 2,
                button.width,
                button.height,
                button.height / 2,
            );
            button.label.setColor(selected ? '#fff3c4' : '#f5d18b');
        });
    }

    private renderEnemyCountButtons(): void {
        this.enemyCountButtons.forEach((button, count) => {
            const selected = count === this.enemyCount;
            button.plate
                .setFillStyle(selected ? 0x8a4f1d : 0x2d2118, 1)
                .setStrokeStyle(3, selected ? 0xffd470 : 0x9a6433, 1);
            button.label.setColor(selected ? '#fff3c4' : '#f5d18b');
        });
    }

    private positionTargetMarker(index: number): void {
        const marker = this.targetMarker;
        const enemy = this.enemySprites[index];
        if (!marker || !enemy) return;

        const frame = this.enemyVitalsFrames[index];
        const anchorX = frame?.x ?? enemy.x;
        const frameTop = frame
            ? frame.y - frame.displayHeight / 2
            : enemy.y - enemy.displayHeight / 2;
        const anchorY = frameTop - marker.displayHeight / 2 - 3;

        this.targetMarkerTween?.stop();
        marker.setPosition(anchorX, anchorY);
        this.targetMarkerTween = this.tweens.add({
            targets: marker,
            y: anchorY - 9,
            duration: 720,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
    }

    private heroAttack(): void {
        if (this.turn !== 'hero') return;

        this.damageSelectedEnemy(1);
        this.speedCharge = this.speedCharge >= 4
            ? 0
            : this.speedCharge + 1;
        this.turn = 'pet';
        this.renderAll(true);
    }

    private petAttack(): void {
        if (this.turn !== 'pet') return;

        this.damageSelectedEnemy(1);
        this.turn = 'hero';
        this.renderAll(true);
    }

    private usePotion(): void {
        if (!this.potionFull) return;

        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 2);
        this.potionFull = false;
        this.renderAll(true);
    }

    private togglePreparation(): void {
        this.preparationKind = this.preparationKind === 'sword'
            ? 'shield'
            : 'sword';
        this.renderPreparation(true);
    }

    private renderAll(animate: boolean): void {
        this.renderEnemyPresentation();
        this.renderPlayerPresentation();
        this.renderHpBar(
            this.playerHpBar,
            this.playerHp,
            this.playerMaxHp,
        );
        this.renderHpBar(
            this.playerBHpBar,
            this.playerBHp,
            this.playerBMaxHp,
        );
        this.enemyHpBars.forEach((bar, index) => {
            this.renderHpBar(
                bar,
                this.enemyHp[index] ?? 0,
                this.enemyMaxHp[index] ?? 10,
            );
        });
        this.renderSpeed(animate);
        this.renderActions();
        this.renderPreparation(animate);
    }

    private renderHpBar(
        view: HpBarView,
        current: number,
        maximum: number,
    ): void {
        const ratio = Phaser.Math.Clamp(current / Math.max(1, maximum), 0, 1);
        const innerWidth = Math.max(0, (view.width - 4) * ratio);

        view.background.clear();
        view.background.fillStyle(0x090805, 0.74);
        view.background.fillRoundedRect(
            -view.width / 2,
            -view.height / 2,
            view.width,
            view.height,
            view.height / 2,
        );

        view.fill.clear();
        if (innerWidth > 0) {
            view.fill.fillGradientStyle(
                Phaser.Display.Color.ValueToColor(view.color).brighten(24).color,
                Phaser.Display.Color.ValueToColor(view.color).brighten(24).color,
                view.color,
                view.color,
                1,
            );
            view.fill.fillRoundedRect(
                -view.width / 2 + 2,
                -view.height / 2 + 2,
                innerWidth,
                view.height - 4,
                Math.max(2, (view.height - 4) / 2),
            );
            view.fill.fillStyle(0xffffff, 0.23);
            view.fill.fillRoundedRect(
                -view.width / 2 + 5,
                -view.height / 2 + 3,
                Math.max(0, innerWidth - 6),
                Math.max(2, (view.height - 4) * 0.3),
                2,
            );
        }
        view.value.setText(`${current} / ${maximum}`);
    }

    private renderSpeed(animate: boolean): void {
        this.speedRunes.forEach((rune, index) => {
            this.setRuneState(rune, index < this.speedCharge, animate);
        });
        this.speedRunesB.forEach((rune, index) => {
            this.setRuneState(rune, index < this.speedChargeB, animate, 0x77d8ff);
        });
    }

    private setRuneState(
        rune: RuneView,
        charged: boolean,
        animate: boolean,
        tint?: number,
    ): void {
        rune.active.setTint(tint ?? 0xffffff);
        this.tweens.killTweensOf([rune.normal, rune.active]);
        // Player speed sockets are separate layers in the lightweight V2 HUD.
        // Preparation sockets remain baked into their canonical frame.
        rune.normal.setAlpha(rune.showEmpty ? 1 : 0);
        if (!animate) {
            rune.active.setAlpha(charged ? 1 : 0);
            return;
        }

        this.tweens.add({
            targets: rune.active,
            alpha: charged ? 1 : 0,
            duration: 190,
            ease: 'Sine.easeOut',
        });
    }

    private renderActions(): void {
        const speedReady = this.speedCharge === 4;
        this.setActionState(
            this.swordAction,
            this.turn === 'hero',
            this.turn === 'hero',
            speedReady && this.turn === 'hero',
        );
        this.setActionState(
            this.petAction,
            this.turn === 'pet',
            this.turn === 'pet',
            false,
        );
        this.setActionState(
            this.potionAction,
            this.potionFull,
            false,
            false,
        );

        this.potionBadge.text.setText(this.potionFull ? '1' : '0');
        this.potionBadge.plate.setAlpha(this.potionFull ? 1 : 0.46);
        this.potionBadge.text.setAlpha(this.potionFull ? 1 : 0.46);
        this.petBadge.text.setText('1');

        this.readyPulse?.stop();
        this.readyPulse = undefined;
        if (speedReady && this.turn === 'hero') {
            this.swordAction.glow.setAlpha(0.42);
            this.readyPulse = this.tweens.add({
                targets: this.swordAction.glow,
                alpha: { from: 0.34, to: 0.68 },
                scale: { from: 0.96, to: 1.08 },
                duration: 720,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1,
            });
        } else {
            this.swordAction.glow.setScale(1);
        }
    }

    private setActionState(
        control: ActionControl,
        enabled: boolean,
        selected: boolean,
        emphasized: boolean,
    ): void {
        control.enabled = enabled;
        control.surface.setAlpha(enabled ? 1 : 0.43);
        control.normalIcon.setAlpha(selected ? 0 : 1);
        control.activeIcon.setAlpha(selected ? 1 : 0);
        control.glow
            .setFillStyle(control.accent, 1)
            .setAlpha(emphasized ? 0.52 : selected ? 0.18 : 0);

        if (enabled) {
            control.root.setInteractive({ useHandCursor: true });
        } else {
            control.root.disableInteractive();
            control.surface.setY(0);
            control.hoverRing.setAlpha(0);
        }
    }

    private renderPreparation(animate: boolean): void {
        const sword = this.preparationKind === 'sword';
        const normalTexture = sword
            ? 'prep-sword-normal-v2'
            : 'prep-shield-normal-v2';
        const activeTexture = sword
            ? 'prep-sword-active-v2'
            : 'prep-shield-active-v2';
        const accent = sword ? 0xffb12d : 0x48c8ff;

        this.preparationNormalIcon.setTexture(normalTexture);
        this.preparationActiveIcon.setTexture(activeTexture);
        this.preparationHoverRing.setStrokeStyle(3, accent, 1);
        this.preparationHoverRing.setFillStyle(accent, 0);
        this.preparationNormalIcon.setAlpha(this.preparationCharge > 0 ? 0 : 1);
        this.preparationActiveIcon.setAlpha(this.preparationCharge > 0 ? 1 : 0);
        this.preparationRunes.forEach((rune, index) => {
            this.setRuneState(
                rune,
                index < this.preparationCharge,
                animate,
                sword ? undefined : 0x77d8ff,
            );
        });
    }

    private togglePause(): void {
        this.paused = !this.paused;
        this.pauseOverlay.setVisible(this.paused);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.togglePause();
            return;
        }
        if (this.paused) return;

        switch (event.key.toLowerCase()) {
            case '1':
                this.turn = 'hero';
                this.renderActions();
                break;
            case '2':
                this.turn = 'pet';
                this.renderActions();
                break;
            case '3':
                this.speedCharge = 4;
                this.renderSpeed(true);
                this.renderActions();
                break;
            case '4':
                this.potionFull = false;
                this.renderActions();
                break;
            case '5':
                this.togglePreparation();
                break;
            case 'r':
                this.resetState();
                this.renderAll(false);
                break;
        }
    }

    private getHost(id: string, fallback: Host): Host {
        const element = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id);
        return {
            x: element?.x ?? definition?.x ?? fallback.x,
            y: element?.y ?? definition?.y ?? fallback.y,
            depth: element?.depth ?? definition?.depth ?? fallback.depth,
            width: definition?.width ?? fallback.width,
            height: definition?.height ?? fallback.height,
            rotation: definition?.rotation ?? fallback.rotation,
            scale: definition?.scale ?? fallback.scale,
        };
    }

    /**
     * Scene Editor coordinates define the local offset from an actor in the
     * default co-op/three-enemy layout. Runtime spawn-point changes move the
     * actor and all of its HUD layers by the same delta.
     */
    private bindActorAnchoredObject(
        actor: Phaser.GameObjects.Sprite | undefined,
        actorHostId: string,
        target: Phaser.GameObjects.Image | Phaser.GameObjects.Container | undefined,
        targetHostId: string,
    ): void {
        if (!actor || !target) return;
        const actorHost = this.sceneBuilder.getElementDef(actorHostId);
        const targetHost = this.sceneBuilder.getElementDef(targetHostId);
        if (!actorHost || !targetHost) return;

        this.actorAnchoredObjects.push({
            actor,
            target,
            offsetX: targetHost.x - actorHost.x,
            offsetY: targetHost.y - actorHost.y,
        });
    }

    private bindRuneToActor(
        actor: Phaser.GameObjects.Sprite | undefined,
        actorHostId: string,
        rune: RuneView,
        runeHostId: string,
    ): void {
        this.bindActorAnchoredObject(actor, actorHostId, rune.normal, runeHostId);
        this.bindActorAnchoredObject(actor, actorHostId, rune.active, runeHostId);
    }

    private syncActorAnchoredObjects(): void {
        this.actorAnchoredObjects.forEach(({ actor, target, offsetX, offsetY }) => {
            target.setPosition(actor.x + offsetX, actor.y + offsetY);
        });
    }
}

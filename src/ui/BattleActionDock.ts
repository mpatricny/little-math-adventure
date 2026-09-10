import Phaser from 'phaser';

export interface BattleHudPoint {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
    rotation?: number;
}

export interface BattleActionDockLayout {
    attack: BattleHudPoint;
    potion: BattleHudPoint;
    potionBadge: BattleHudPoint;
    pet: BattleHudPoint;
    petBadge: BattleHudPoint;
}

export interface BattleActionDockState {
    visible: boolean;
    attackEnabled: boolean;
    attackEmphasized?: boolean;
    potionEnabled: boolean;
    potionCount: number;
    petEnabled: boolean;
    petTexture?: string | null;
    petFrame?: string | number;
    petDamage?: number;
}

type ActionControl = {
    root: Phaser.GameObjects.Container;
    surface: Phaser.GameObjects.Container;
    glow: Phaser.GameObjects.Arc;
    hoverRing: Phaser.GameObjects.Arc;
    normalIcon: Phaser.GameObjects.Image;
    activeIcon: Phaser.GameObjects.Image;
    accent: number;
    enabled: boolean;
    iconWidth: number;
    iconHeight: number;
};

type Badge = {
    root: Phaser.GameObjects.Container;
    plate: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
};

/** Production action controls composed over the canonical battle dock frame. */
export class BattleActionDock {
    readonly attackRoot: Phaser.GameObjects.Container;
    readonly potionRoot: Phaser.GameObjects.Container;
    readonly petRoot: Phaser.GameObjects.Container;

    private readonly attack: ActionControl;
    private readonly potion: ActionControl;
    private readonly pet: ActionControl;
    private readonly potionBadge: Badge;
    private readonly petBadge: Badge;

    constructor(
        private readonly scene: Phaser.Scene,
        layout: BattleActionDockLayout,
        callbacks: {
            onAttack: () => void;
            onPotion: () => void;
            onPet: () => void;
        },
    ) {
        this.potion = this.createControl(layout.potion, {
            size: 76,
            iconSize: 57,
            normalTexture: 'character-book-red-potion',
            activeTexture: 'character-book-red-potion',
            accent: 0xf25b5b,
            onClick: callbacks.onPotion,
        });
        this.attack = this.createControl(layout.attack, {
            size: 118,
            iconSize: 92,
            normalTexture: 'prep-sword-normal-v2',
            activeTexture: 'prep-sword-active-v2',
            accent: 0xffb12d,
            onClick: callbacks.onAttack,
        });
        this.pet = this.createControl(layout.pet, {
            size: 76,
            iconSize: 63,
            normalTexture: 'slime-sheet',
            activeTexture: 'slime-sheet',
            frame: 0,
            activeTint: 0xcaff9f,
            accent: 0x62e954,
            onClick: callbacks.onPet,
        });
        this.potionBadge = this.createBadge(layout.potionBadge, 0xc94943);
        this.petBadge = this.createBadge(layout.petBadge, 0x4aae42);
        this.attackRoot = this.attack.root;
        this.potionRoot = this.potion.root;
        this.petRoot = this.pet.root;
    }

    render(state: BattleActionDockState): void {
        const controls = [this.attack, this.potion, this.pet];
        controls.forEach(control => control.root.setVisible(state.visible));
        this.potionBadge.root.setVisible(state.visible);
        this.petBadge.root.setVisible(state.visible && Boolean(state.petTexture));
        if (!state.visible) return;

        this.setControlState(
            this.attack,
            state.attackEnabled,
            state.attackEnabled,
            Boolean(state.attackEmphasized),
        );
        this.setControlState(this.potion, state.potionEnabled, false, false);

        if (state.petTexture) {
            this.pet.normalIcon.setTexture(state.petTexture, state.petFrame ?? 0)
                .setDisplaySize(this.pet.iconWidth, this.pet.iconHeight)
                .setVisible(true);
            this.pet.activeIcon.setTexture(state.petTexture, state.petFrame ?? 0)
                .setDisplaySize(this.pet.iconWidth, this.pet.iconHeight)
                .setVisible(true);
        } else {
            this.pet.normalIcon.setVisible(false);
            this.pet.activeIcon.setVisible(false);
        }
        this.setControlState(this.pet, state.petEnabled && Boolean(state.petTexture), state.petEnabled, false);

        this.potionBadge.text.setText(`${Math.max(0, state.potionCount)}`);
        this.potionBadge.plate.setAlpha(state.potionEnabled ? 1 : 0.46);
        this.potionBadge.text.setAlpha(state.potionEnabled ? 1 : 0.46);
        this.petBadge.text.setText(`${Math.max(0, state.petDamage ?? 0)}`);
    }

    private createControl(
        host: BattleHudPoint,
        options: {
            size: number;
            iconSize: number;
            normalTexture: string;
            activeTexture: string;
            frame?: string | number;
            activeTint?: number;
            accent: number;
            onClick: () => void;
        },
    ): ActionControl {
        const iconWidth = host.width ?? options.iconSize;
        const iconHeight = host.height ?? options.iconSize;
        const root = this.scene.add.container(host.x, host.y)
            .setDepth(host.depth)
            .setSize(options.size, options.size);
        const surface = this.scene.add.container(0, 0);
        const glow = this.scene.add.circle(0, 0, options.size * 0.46, options.accent, 0)
            .setBlendMode(Phaser.BlendModes.ADD);
        const hoverRing = this.scene.add.circle(0, 0, options.size * 0.43, 0x000000, 0)
            .setStrokeStyle(Math.max(2, options.size * 0.028), 0xfff0ba, 1)
            .setAlpha(0)
            .setBlendMode(Phaser.BlendModes.ADD);
        const normalIcon = this.scene.add.image(0, 0, options.normalTexture, options.frame)
            .setDisplaySize(iconWidth, iconHeight)
            .setAngle(host.rotation ?? 0);
        const activeIcon = this.scene.add.image(0, 0, options.activeTexture, options.frame)
            .setDisplaySize(iconWidth, iconHeight)
            .setAngle(host.rotation ?? 0)
            .setAlpha(0);
        if (options.activeTint !== undefined) activeIcon.setTint(options.activeTint);

        surface.add([glow, hoverRing, normalIcon, activeIcon]);
        root.add(surface);
        const control = {
            root,
            surface,
            glow,
            hoverRing,
            normalIcon,
            activeIcon,
            accent: options.accent,
            enabled: true,
            iconWidth,
            iconHeight,
        };
        this.bindInteraction(control, options.onClick);
        return control;
    }

    private bindInteraction(control: ActionControl, onClick: () => void): void {
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

    private setControlState(
        control: ActionControl,
        enabled: boolean,
        selected: boolean,
        emphasized: boolean,
    ): void {
        control.enabled = enabled;
        control.surface.setAlpha(enabled ? 1 : 0.38);
        control.normalIcon.setAlpha(selected ? 0 : 1);
        control.activeIcon.setAlpha(selected ? 1 : 0);
        control.glow.setFillStyle(control.accent, 1)
            .setAlpha(emphasized ? 0.52 : selected ? 0.18 : 0);
        control.surface.setY(0);
        control.hoverRing.setAlpha(0);
        if (enabled) control.root.setInteractive({ useHandCursor: true });
        else control.root.disableInteractive();
    }

    private createBadge(host: BattleHudPoint, accent: number): Badge {
        const radius = Math.min(host.width ?? 32, host.height ?? 32) / 2;
        const root = this.scene.add.container(host.x, host.y).setDepth(host.depth);
        const plate = this.scene.add.circle(0, 0, radius, 0x17110c, 0.97)
            .setStrokeStyle(Math.max(2, radius * 0.19), accent, 0.95);
        const text = this.scene.add.text(0, 0, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.round(radius * 1.06)}px`,
            fontStyle: 'bold',
            color: '#fff1bd',
            stroke: '#2b160c',
            strokeThickness: 3,
            resolution: 2,
        }).setOrigin(0.5);
        root.add([plate, text]);
        return { root, plate, text };
    }
}

import Phaser from 'phaser';

export type TownHudPlayerView = {
    heroTexture: string;
    petTexture: string | null;
    healthRatio: number;
};

export type TownHudLayout = {
    menu: { x: number; y: number; depth: number };
    playerA: { x: number; y: number; depth: number };
    playerB: { x: number; y: number; depth: number };
};

export type TownHudCallbacks = {
    onMenu: () => void;
    onHero: (playerIndex: number) => void;
    onPet: (playerIndex: number) => void;
};

type PlayerCard = {
    root: Phaser.GameObjects.Container;
    surface: Phaser.GameObjects.Container;
    frameGlow: Phaser.GameObjects.Image;
    hero: Phaser.GameObjects.Image;
    heroCanvas: Phaser.Textures.CanvasTexture;
    pet: Phaser.GameObjects.Image;
    petCanvas: Phaser.Textures.CanvasTexture;
    heroRing: Phaser.GameObjects.Graphics;
    petRing: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    playerLabel: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
    hovered: boolean;
};

const MENU_TEXTURE = 'town-hud-a-menu';
const PLAYER_PANEL_TEXTURE = 'town-hud-a-player-panel';
const ACCENT = 0x69e6ef;
const PANEL_WIDTH = 299;
const PANEL_HEIGHT = 106;
const HERO_X = -83;
const HERO_Y = -1;
const PET_X = 122;
const PET_Y = 20;

/**
 * Layered Town HUD built from the exact isolated artwork of concept A.
 *
 * Only the portrait interiors are covered and replaced at runtime. The
 * original copper rings, wooden rail, green health bar, shadows, menu symbol,
 * and pet badge remain pixel-identical to the approved concept.
 */
export class TownHud {
    private readonly scene: Phaser.Scene;
    private readonly callbacks: TownHudCallbacks;
    private readonly menuRoot: Phaser.GameObjects.Container;
    private readonly cards: [PlayerCard, PlayerCard];
    private activePlayer = 0;
    private coopMode = false;

    constructor(
        scene: Phaser.Scene,
        layout: TownHudLayout,
        callbacks: TownHudCallbacks
    ) {
        this.scene = scene;
        this.callbacks = callbacks;
        this.menuRoot = this.createMenuButton(
            layout.menu.x,
            layout.menu.y,
            layout.menu.depth
        );
        this.cards = [
            this.createPlayerCard(0, layout.playerA),
            this.createPlayerCard(1, layout.playerB),
        ];
        this.setCoopMode(false);
    }

    setCoopMode(enabled: boolean): void {
        this.coopMode = enabled;
        this.cards[1].root.setVisible(enabled);
        this.cards[0].playerLabel.setVisible(enabled).setText('A');
        this.cards[1].playerLabel.setVisible(enabled).setText('B');
        if (!enabled) this.activePlayer = 0;
        this.refreshSelection();
    }

    setActivePlayer(playerIndex: number): void {
        this.activePlayer = this.coopMode
            ? Phaser.Math.Clamp(playerIndex, 0, 1)
            : 0;
        this.refreshSelection();
    }

    setPlayer(playerIndex: number, view: TownHudPlayerView): void {
        const card = this.cards[playerIndex];
        if (!card) return;
        this.renderPortrait(card.heroCanvas, view.heroTexture, 'hero');
        this.renderPortrait(card.petCanvas, view.petTexture, 'pet');
        this.drawHealth(card.healthBar, view.healthRatio);
    }

    destroy(): void {
        this.menuRoot.destroy(true);
        this.cards.forEach((card) => card.root.destroy(true));
    }

    private createMenuButton(
        x: number,
        y: number,
        depth: number
    ): Phaser.GameObjects.Container {
        const root = this.scene.add.container(x, y)
            .setDepth(depth)
            .setSize(90, 88);
        const surface = this.scene.add.container(0, 0);
        const frame = this.scene.add.image(0, 0, MENU_TEXTURE)
            .setDisplaySize(85, 81);
        const glow = this.scene.add.image(0, 0, MENU_TEXTURE)
            .setDisplaySize(85, 81)
            .setTint(ACCENT)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);
        surface.add([frame, glow]);

        const hint = this.createHint(0, 55, 'HLAVNÍ MENU');
        root.add([surface, hint]);
        root.setInteractive({ useHandCursor: true });

        root.on('pointerover', () => {
            this.tweenSurface(surface, -3);
            this.scene.tweens.add({
                targets: [glow, hint],
                alpha: 1,
                duration: 120,
            });
        });
        root.on('pointerout', () => {
            this.tweenSurface(surface, 0);
            this.scene.tweens.add({
                targets: [glow, hint],
                alpha: 0,
                duration: 120,
            });
        });
        root.on('pointerdown', () => this.tweenSurface(surface, 1, 70));
        root.on('pointerup', () => {
            this.tweenSurface(surface, -3, 80);
            this.callbacks.onMenu();
        });
        return root;
    }

    private createPlayerCard(
        playerIndex: number,
        layout: { x: number; y: number; depth: number }
    ): PlayerCard {
        const root = this.scene.add.container(layout.x, layout.y)
            .setDepth(layout.depth);
        const surface = this.scene.add.container(0, 0);
        const frame = this.scene.add.image(0, 0, PLAYER_PANEL_TEXTURE)
            .setDisplaySize(PANEL_WIDTH, PANEL_HEIGHT);
        const frameGlow = this.scene.add.image(0, 0, PLAYER_PANEL_TEXTURE)
            .setDisplaySize(PANEL_WIDTH, PANEL_HEIGHT)
            .setTint(ACCENT)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);

        const portraitCovers = this.scene.add.graphics();
        portraitCovers.fillStyle(0x2c1b16, 1);
        portraitCovers.fillCircle(PET_X, PET_Y, 20);

        const heroCanvas = this.ensurePortraitCanvas(
            `__town-hud-a-hero-${playerIndex}`,
            96
        );
        this.renderPortrait(
            heroCanvas,
            'town-hud-heroine-portrait',
            'hero'
        );
        const hero = this.scene.add.image(HERO_X, HERO_Y, heroCanvas.key)
            .setDisplaySize(74, 74);

        const petCanvas = this.ensurePortraitCanvas(
            `__town-hud-a-pet-${playerIndex}`,
            64
        );
        this.renderPortrait(petCanvas, 'slime-sheet', 'pet');
        const pet = this.scene.add.image(PET_X, PET_Y, petCanvas.key)
            .setDisplaySize(38, 38);

        const heroRing = this.scene.add.graphics().setAlpha(0);
        heroRing.lineStyle(3, 0xbfffff, 0.95);
        heroRing.strokeCircle(HERO_X, HERO_Y, 39);
        const petRing = this.scene.add.graphics().setAlpha(0);
        petRing.lineStyle(3, 0xbfffff, 0.95);
        petRing.strokeCircle(PET_X, PET_Y, 22);
        const healthBar = this.scene.add.graphics();
        this.drawHealth(healthBar, 1);

        const playerLabel = this.scene.add.text(-10, -27, '', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#f6d58a',
            stroke: '#2a1710',
            strokeThickness: 3,
        }).setOrigin(0.5).setVisible(false);

        const hint = this.createHint(0, 64, '');
        surface.add([
            frame,
            frameGlow,
            portraitCovers,
            healthBar,
            hero,
            pet,
            heroRing,
            petRing,
            playerLabel,
        ]);
        root.add([surface, hint]);

        const heroHit = this.scene.add.container(-31, 0).setSize(236, 94);
        const petHit = this.scene.add.container(PET_X, PET_Y).setSize(52, 52);
        root.add([heroHit, petHit]);

        const card: PlayerCard = {
            root,
            surface,
            frameGlow,
            hero,
            heroCanvas,
            pet,
            petCanvas,
            heroRing,
            petRing,
            healthBar,
            playerLabel,
            hint,
            hovered: false,
        };

        heroHit.setInteractive({ useHandCursor: true });
        heroHit.on('pointerover', () => {
            card.hovered = true;
            hint.setText('KLIKNI: PANEL POSTAVY').setAlpha(1);
            heroRing.setAlpha(1);
            this.tweenSurface(surface, -2);
            this.refreshCardGlow(card, true);
        });
        heroHit.on('pointerout', () => {
            card.hovered = false;
            hint.setAlpha(0);
            heroRing.setAlpha(0);
            this.tweenSurface(surface, 0);
            this.refreshCardGlow(card);
        });
        heroHit.on('pointerdown', () => this.tweenSurface(surface, 1, 70));
        heroHit.on('pointerup', () => {
            this.tweenSurface(surface, -2, 80);
            this.callbacks.onHero(playerIndex);
        });

        petHit.setInteractive({ useHandCursor: true });
        petHit.on('pointerover', () => {
            hint.setText('KLIKNI: PANEL POSTAVY').setAlpha(1);
            petRing.setAlpha(1);
        });
        petHit.on('pointerout', () => {
            hint.setAlpha(0);
            petRing.setAlpha(0);
        });
        petHit.on('pointerup', () => this.callbacks.onPet(playerIndex));

        return card;
    }

    private createHint(
        x: number,
        y: number,
        label: string
    ): Phaser.GameObjects.Text {
        return this.scene.add.text(x, y, label, {
            resolution: 2,
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#e9ffff',
            backgroundColor: '#15201fcc',
            padding: { x: 7, y: 4 },
        }).setOrigin(0.5).setAlpha(0);
    }

    private ensurePortraitCanvas(
        key: string,
        size: number
    ): Phaser.Textures.CanvasTexture {
        if (this.scene.textures.exists(key)) {
            return this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
        }
        const texture = this.scene.textures.createCanvas(key, size, size);
        if (!texture) {
            throw new Error(`Unable to create Town HUD portrait texture: ${key}`);
        }
        return texture;
    }

    private renderPortrait(
        canvasTexture: Phaser.Textures.CanvasTexture,
        sourceTexture: string | null,
        kind: 'hero' | 'pet'
    ): void {
        const canvas = canvasTexture.getSourceImage() as HTMLCanvasElement;
        const context = canvasTexture.context;
        const size = canvas.width;
        context.clearRect(0, 0, size, size);
        if (!sourceTexture) {
            canvasTexture.refresh();
            return;
        }
        const sourceFrame = this.scene.textures.getFrame(sourceTexture, 0);
        if (!sourceFrame) {
            canvasTexture.refresh();
            return;
        }
        const sourceImage = sourceFrame.source.image as CanvasImageSource;
        const isHero = kind === 'hero';
        const isReusableHeroPortrait = isHero
            && (
                sourceTexture === 'town-hud-heroine-portrait'
                || sourceTexture === 'town-hud-hero-portrait'
            );
        const cropX = isHero && !isReusableHeroPortrait
            ? Math.round(sourceFrame.cutWidth * 0.15)
            : 0;
        const cropWidth = isHero && !isReusableHeroPortrait
            ? Math.round(sourceFrame.cutWidth * 0.7)
            : sourceFrame.cutWidth;
        const cropHeight = isHero && !isReusableHeroPortrait
            ? Math.round(sourceFrame.cutHeight * 0.7)
            : sourceFrame.cutHeight;
        const padding = isHero ? 0 : 2;

        context.save();
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        context.clip();
        context.imageSmoothingEnabled = true;
        context.drawImage(
            sourceImage,
            sourceFrame.cutX + cropX,
            sourceFrame.cutY,
            cropWidth,
            cropHeight,
            padding,
            padding,
            size - padding * 2,
            size - padding * 2
        );
        context.restore();
        canvasTexture.refresh();
    }

    private drawHealth(
        graphics: Phaser.GameObjects.Graphics,
        ratio: number
    ): void {
        const normalized = Phaser.Math.Clamp(ratio, 0, 1);
        const x = -22;
        const y = -6;
        const width = 115;
        const height = 12;
        graphics.clear();
        graphics.fillStyle(0x173219, 1);
        graphics.fillRoundedRect(x, y, width, height, 5);
        if (normalized <= 0) return;
        graphics.fillStyle(normalized > 0.3 ? 0x73c842 : 0xd74b3f, 1);
        graphics.fillRoundedRect(
            x,
            y,
            Math.max(8, width * normalized),
            height,
            5
        );
        graphics.fillStyle(0xc9f493, 0.34);
        graphics.fillRoundedRect(
            x + 3,
            y + 2,
            Math.max(3, width * normalized - 6),
            3,
            2
        );
    }

    private refreshSelection(): void {
        this.cards.forEach((card, index) => {
            this.refreshCardGlow(card, card.hovered);
            card.playerLabel.setColor(
                this.coopMode && index === this.activePlayer
                    ? '#bfffff'
                    : '#f6d58a'
            );
        });
    }

    private refreshCardGlow(card: PlayerCard, hovered = false): void {
        const index = this.cards?.indexOf(card) ?? -1;
        const selected = this.coopMode && index === this.activePlayer;
        card.frameGlow.setAlpha(hovered ? 0.34 : selected ? 0.14 : 0);
    }

    private tweenSurface(
        target: Phaser.GameObjects.Container,
        y: number,
        duration = 120
    ): void {
        this.scene.tweens.killTweensOf(target);
        this.scene.tweens.add({
            targets: target,
            y,
            duration,
            ease: 'Sine.easeOut',
        });
    }
}

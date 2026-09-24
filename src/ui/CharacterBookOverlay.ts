import Phaser from 'phaser';
import {
    PreparationChargeIndicator,
    PreparationKind,
} from './PreparationChargeIndicator';

export type CharacterBookPlayerView = {
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    portraitTexture: string;
    swordFrame: number | null;
    swordBonus: number;
    shieldFrame: number | null;
    shieldBlock: number;
    attackCount: number;
    attacks: [number, number, number];
    potionCount: number;
    petName: string;
    petTexture: string | null;
    petAttack: number;
    preparationKind: PreparationKind;
    preparationCharges: number;
};

export type CharacterBookCallbacks = {
    onClose: () => void;
    onPlayerTab: (playerIndex: number) => void;
    onPet?: (playerIndex: number) => void;
};

export type CharacterBookLayoutPoint = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
};

export type CharacterBookLayout = {
    book: CharacterBookLayoutPoint;
    hero: CharacterBookLayoutPoint;
    heroName: CharacterBookLayoutPoint;
    heroLevel: CharacterBookLayoutPoint;
    swordLabel: CharacterBookLayoutPoint;
    sword: CharacterBookLayoutPoint;
    swordValue: CharacterBookLayoutPoint;
    shieldLabel: CharacterBookLayoutPoint;
    shield: CharacterBookLayoutPoint;
    shieldValue: CharacterBookLayoutPoint;
    title: CharacterBookLayoutPoint;
    hpHeart: CharacterBookLayoutPoint;
    hpBar: CharacterBookLayoutPoint;
    hpValue: CharacterBookLayoutPoint;
    closeHover: CharacterBookLayoutPoint;
    attacksTitle: CharacterBookLayoutPoint;
    attacks: [
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
    ];
    attackValues: [
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
    ];
    potionLabel: CharacterBookLayoutPoint;
    potion: CharacterBookLayoutPoint;
    potionStatus: CharacterBookLayoutPoint;
    petLabel: CharacterBookLayoutPoint;
    pet: CharacterBookLayoutPoint;
    petName: CharacterBookLayoutPoint;
    petValue: CharacterBookLayoutPoint;
    preparationLabel: CharacterBookLayoutPoint;
    preparation: CharacterBookLayoutPoint;
    dividers: [
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
        CharacterBookLayoutPoint,
    ];
    tabs: [CharacterBookLayoutPoint, CharacterBookLayoutPoint];
};

type LocalLayoutPoint = CharacterBookLayoutPoint;

type PlayerTab = {
    root: Phaser.GameObjects.Container;
    portraitCanvas: Phaser.Textures.CanvasTexture;
    portrait: Phaser.GameObjects.Image;
    selection: Phaser.GameObjects.Graphics;
};

const BOOK_TEXTURE = 'character-book-frame';
const SOCKET_TEXTURE = 'character-book-socket';
const TAB_FRAME_TEXTURE = 'character-book-tab-frame';
const BOOK_WIDTH = 1080;
const BOOK_HEIGHT = 648;
const INK = '#3b2518';
const INK_SOFT = '#725039';
const GOLD = '#f4cb72';

/**
 * Runtime character panel composed over one blank book and one repeated socket.
 *
 * Portraits, item icons, labels, values and charge states are deliberately kept
 * outside the generated artwork so the same component can display any player.
 */
export class CharacterBookOverlay {
    readonly root: Phaser.GameObjects.Container;

    private readonly scene: Phaser.Scene;
    private readonly callbacks: CharacterBookCallbacks;
    private readonly heroCanvas: Phaser.Textures.CanvasTexture;
    private readonly petCanvas: Phaser.Textures.CanvasTexture;
    private readonly heroImage: Phaser.GameObjects.Image;
    private readonly petImage: Phaser.GameObjects.Image;
    private readonly swordImage: Phaser.GameObjects.Image;
    private readonly shieldImage: Phaser.GameObjects.Image;
    private readonly nameText: Phaser.GameObjects.Text;
    private readonly levelText: Phaser.GameObjects.Text;
    private readonly hpText: Phaser.GameObjects.Text;
    private readonly swordValueText: Phaser.GameObjects.Text;
    private readonly shieldValueText: Phaser.GameObjects.Text;
    private readonly attackSlots: Array<{
        socket: Phaser.GameObjects.Image;
        icon: Phaser.GameObjects.Image;
        value: Phaser.GameObjects.Text;
    }>;
    private readonly potionStatusText: Phaser.GameObjects.Text;
    private readonly potionImage: Phaser.GameObjects.Image;
    private readonly petNameText: Phaser.GameObjects.Text;
    private readonly petAttackText: Phaser.GameObjects.Text;
    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly hpBarPosition: LocalLayoutPoint;
    private readonly preparation: PreparationChargeIndicator;
    private readonly preparationLabel: Phaser.GameObjects.Text;
    private readonly tabs: [PlayerTab, PlayerTab];
    private views: [CharacterBookPlayerView, CharacterBookPlayerView] | null = null;
    private activePlayer = 0;
    private coopMode = false;
    private opened = false;

    constructor(
        scene: Phaser.Scene,
        layout: CharacterBookLayout,
        callbacks: CharacterBookCallbacks
    ) {
        this.scene = scene;
        this.callbacks = callbacks;
        const bookHost = layout.book;
        const local = (
            point: CharacterBookLayoutPoint
        ): LocalLayoutPoint => ({
            ...point,
            x: point.x - bookHost.x,
            y: point.y - bookHost.y,
        });
        const hero = local(layout.hero);
        const heroName = local(layout.heroName);
        const heroLevel = local(layout.heroLevel);
        const swordLabel = local(layout.swordLabel);
        const sword = local(layout.sword);
        const swordValue = local(layout.swordValue);
        const shieldLabel = local(layout.shieldLabel);
        const shield = local(layout.shield);
        const shieldValue = local(layout.shieldValue);
        const title = local(layout.title);
        const hpHeart = local(layout.hpHeart);
        const hpBar = local(layout.hpBar);
        const hpValue = local(layout.hpValue);
        const closeHover = local(layout.closeHover);
        const attacksTitle = local(layout.attacksTitle);
        const attacks = layout.attacks.map(local) as CharacterBookLayout['attacks'];
        const attackValues = layout.attackValues.map(local) as CharacterBookLayout['attackValues'];
        const potionLabel = local(layout.potionLabel);
        const potion = local(layout.potion);
        const potionStatus = local(layout.potionStatus);
        const petLabel = local(layout.petLabel);
        const pet = local(layout.pet);
        const petName = local(layout.petName);
        const petValue = local(layout.petValue);
        const preparationLabel = local(layout.preparationLabel);
        const preparation = local(layout.preparation);
        const dividers = layout.dividers.map(local) as CharacterBookLayout['dividers'];
        const tabs = layout.tabs.map(local) as CharacterBookLayout['tabs'];

        this.hpBarPosition = hpBar;
        this.root = scene.add.container(bookHost.x, bookHost.y)
            .setDepth(bookHost.depth)
            .setVisible(false);

        const backdrop = scene.add.rectangle(
            640 - bookHost.x,
            360 - bookHost.y,
            1280,
            720,
            0x07100f,
            0.76
        ).setDepth(bookHost.depth - 1).setInteractive();
        const book = scene.add.image(0, 0, BOOK_TEXTURE)
            .setDisplaySize(BOOK_WIDTH, BOOK_HEIGHT)
            .setDepth(bookHost.depth);
        this.root.add([backdrop, book]);

        this.addPageDecoration(heroName, dividers);

        this.heroCanvas = this.ensureCanvas('__character-book-hero', 256);
        this.heroImage = scene.add.image(hero.x, hero.y, this.heroCanvas.key)
            .setDisplaySize(166, 166)
            .setDepth(hero.depth);
        this.addSocket(hero.x, hero.y, 204, hero.depth);
        this.root.add(this.heroImage);

        this.nameText = this.addText(
            heroName.x,
            heroName.y,
            '',
            23,
            '#f6d58a',
            true,
            heroName.depth
        )
            .setStroke('#28150e', 4);
        this.levelText = this.addText(
            heroLevel.x,
            heroLevel.y,
            '',
            15,
            INK_SOFT,
            true,
            heroLevel.depth
        );

        this.addText(
            swordLabel.x,
            swordLabel.y,
            'MEČ',
            13,
            INK_SOFT,
            true,
            swordLabel.depth
        );
        this.addText(
            shieldLabel.x,
            shieldLabel.y,
            'ŠTÍT',
            13,
            INK_SOFT,
            true,
            shieldLabel.depth
        );
        this.addSocket(sword.x, sword.y, 116, sword.depth);
        this.addSocket(shield.x, shield.y, 116, shield.depth);
        this.swordImage = scene.add.image(
            sword.x,
            sword.y - 3,
            'shop-swords-sheet',
            1
        )
            .setDisplaySize(64, 80)
            .setDepth(sword.depth);
        this.shieldImage = scene.add.image(
            shield.x,
            shield.y,
            'shop-shields-sheet',
            1
        )
            .setDisplaySize(73, 65)
            .setDepth(shield.depth);
        this.root.add([this.swordImage, this.shieldImage]);
        this.swordValueText = this.addValuePlate(
            swordValue.x,
            swordValue.y,
            '',
            swordValue.depth
        );
        this.shieldValueText = this.addValuePlate(
            shieldValue.x,
            shieldValue.y,
            '',
            shieldValue.depth
        );

        this.addText(
            title.x,
            title.y,
            'BOJOVÝ PŘEHLED',
            19,
            INK,
            true,
            title.depth
        );
        this.addSocket(hpHeart.x, hpHeart.y, 72, hpHeart.depth);
        this.addText(
            hpHeart.x,
            hpHeart.y - 2,
            '♥',
            39,
            '#e44343',
            true,
            hpHeart.depth
        )
            .setStroke('#7e1717', 4);
        this.hpFill = scene.add.graphics().setDepth(hpBar.depth);
        this.root.add(this.hpFill);
        this.hpText = this.addText(
            hpValue.x,
            hpValue.y,
            '',
            18,
            '#fff6db',
            true,
            hpValue.depth
        )
            .setStroke('#371d10', 4);

        this.addText(
            attacksTitle.x,
            attacksTitle.y,
            'ÚTOKY',
            14,
            INK_SOFT,
            true,
            attacksTitle.depth
        );
        this.attackSlots = attacks.map((attack, index) => {
            const socket = this.addSocket(
                attack.x,
                attack.y,
                88,
                attack.depth
            );
            const icon = scene.add.image(
                attack.x,
                attack.y - 3,
                'shop-swords-sheet',
                1
            )
                .setDisplaySize(42, 53)
                .setAngle(-8)
                .setDepth(attack.depth);
            this.root.add(icon);
            const value = attackValues[index];
            return {
                socket,
                icon,
                value: this.addValuePlate(value.x, value.y, '', value.depth),
            };
        });

        this.addText(
            potionLabel.x,
            potionLabel.y,
            'LEKTVAR',
            13,
            INK_SOFT,
            true,
            potionLabel.depth
        );
        this.addSocket(potion.x, potion.y, 91, potion.depth);
        this.potionImage = scene.add.image(
            potion.x,
            potion.y,
            'character-book-red-potion'
        )
            .setDisplaySize(65, 65)
            .setDepth(potion.depth);
        this.root.add(this.potionImage);
        this.potionStatusText = this.addText(
            potionStatus.x,
            potionStatus.y,
            '',
            14,
            INK,
            true,
            potionStatus.depth
        );

        this.petCanvas = this.ensureCanvas('__character-book-pet', 160);
        this.addText(
            petLabel.x,
            petLabel.y,
            'MAZLÍČEK',
            13,
            INK_SOFT,
            true,
            petLabel.depth
        );
        this.addSocket(pet.x, pet.y, 105, pet.depth);
        this.petImage = scene.add.image(pet.x, pet.y, this.petCanvas.key)
            .setDisplaySize(76, 76)
            .setDepth(pet.depth);
        this.root.add(this.petImage);
        const petGlow = scene.add.graphics().setAlpha(0).setDepth(pet.depth + 1);
        petGlow.lineStyle(3, 0xbfffff, 1);
        petGlow.strokeCircle(pet.x, pet.y, 43);
        this.root.add(petGlow);
        const petHit = scene.add.container(pet.x, pet.y)
            .setDepth(pet.depth + 2)
            .setSize(88, 88);
        if (this.callbacks.onPet) {
            petHit
                .setInteractive({ useHandCursor: true })
                .on('pointerover', () => petGlow.setAlpha(1))
                .on('pointerout', () => petGlow.setAlpha(0))
                .on('pointerup', () => this.callbacks.onPet?.(this.activePlayer));
        }
        this.root.add(petHit);
        this.petNameText = this.addText(
            petName.x,
            petName.y,
            '',
            13,
            INK,
            true,
            petName.depth
        );
        this.petAttackText = this.addValuePlate(
            petValue.x,
            petValue.y,
            '',
            petValue.depth
        );

        this.preparationLabel = this.addText(
            preparationLabel.x,
            preparationLabel.y,
            'PŘÍPRAVA · MEČ',
            13,
            INK_SOFT,
            true,
            preparationLabel.depth
        );
        this.preparation = new PreparationChargeIndicator(scene, {
            parent: this.root,
            x: preparation.x,
            y: preparation.y,
            kind: 'sword',
            iconSize: 52,
            spacing: 65,
            showEmptySlots: true,
            name: 'character-book-preparation',
        });
        this.preparation.root.setDepth(preparation.depth);

        this.tabs = [
            this.createPlayerTab(0, tabs[0]),
            this.createPlayerTab(1, tabs[1]),
        ];

        const closeX = closeHover.x;
        const closeY = closeHover.y;
        const closeDepth = closeHover.depth;
        const closeWidth = closeHover.width ?? 96;
        const closeHeight = closeHover.height ?? closeWidth;
        const closeGlow = scene.add.graphics().setAlpha(0).setDepth(closeDepth);
        closeGlow.lineStyle(5, 0xbfffff, 0.95);
        closeGlow.strokeEllipse(closeX, closeY, closeWidth, closeHeight);
        const closeHit = scene.add.ellipse(
            closeX,
            closeY,
            closeWidth,
            closeHeight,
            0xffffff,
            0
        )
            .setDepth(closeDepth + 1)
            .setInteractive({ useHandCursor: true });
        closeHit
            .on('pointerover', () => closeGlow.setAlpha(1))
            .on('pointerout', () => closeGlow.setAlpha(0))
            .on('pointerdown', () => closeGlow.setAlpha(0.55))
            .on('pointerup', () => {
                closeGlow.setAlpha(1);
                this.close();
                this.callbacks.onClose();
            });
        this.root.add([closeGlow, closeHit]);
        this.root.sort('depth');
    }

    setState(
        views: [CharacterBookPlayerView, CharacterBookPlayerView],
        activePlayer: number,
        coopMode: boolean
    ): void {
        this.views = views;
        this.coopMode = coopMode;
        this.activePlayer = coopMode
            ? Phaser.Math.Clamp(activePlayer, 0, 1)
            : 0;
        this.render();
    }

    open(playerIndex = 0): void {
        if (!this.views) return;
        this.activePlayer = this.coopMode
            ? Phaser.Math.Clamp(playerIndex, 0, 1)
            : 0;
        this.opened = true;
        this.root.setVisible(true).setAlpha(0);
        this.render();
        this.scene.tweens.killTweensOf(this.root);
        this.scene.tweens.add({
            targets: this.root,
            alpha: 1,
            duration: 170,
            ease: 'Sine.easeOut',
        });
    }

    close(): void {
        if (!this.opened) return;
        this.opened = false;
        this.scene.tweens.killTweensOf(this.root);
        this.scene.tweens.add({
            targets: this.root,
            alpha: 0,
            duration: 130,
            ease: 'Sine.easeIn',
            onComplete: () => this.root.setVisible(false),
        });
    }

    isOpen(): boolean {
        return this.opened;
    }

    destroy(): void {
        this.preparation.destroy();
        this.root.destroy(true);
    }

    private render(): void {
        if (!this.views) return;
        const view = this.views[this.activePlayer];

        this.renderCircularPortrait(
            this.heroCanvas,
            view.portraitTexture,
            'hero'
        );
        this.renderCircularPortrait(this.petCanvas, view.petTexture, 'pet');
        this.heroImage.setTexture(this.heroCanvas.key);
        this.petImage.setTexture(this.petCanvas.key);
        this.swordImage
            .setVisible(view.swordFrame !== null)
            .setFrame(view.swordFrame ?? 0);
        this.shieldImage
            .setVisible(view.shieldFrame !== null)
            .setFrame(view.shieldFrame ?? 0);

        this.nameText.setText(view.name);
        this.levelText.setText(`LEVEL ${view.level}`);
        this.hpText.setText(`${view.hp} / ${view.maxHp}`);
        this.swordValueText.setText(
            view.swordFrame === null ? 'NEMÁ' : `⚔ +${view.swordBonus}`
        );
        this.shieldValueText.setText(
            view.shieldFrame === null ? 'NEMÁ' : `🛡 ${view.shieldBlock}`
        );
        this.renderAttacks(view);
        this.potionStatusText
            .setText(view.potionCount > 0 ? `PLNÝ · ${view.potionCount}` : 'PRÁZDNÝ')
            .setColor(view.potionCount > 0 ? '#a81820' : '#74675f');
        if (view.potionCount > 0) {
            this.potionImage.clearTint().setAlpha(1);
        } else {
            this.potionImage.setTint(0x68636b).setAlpha(0.58);
        }
        this.petNameText.setText(view.petName.toLocaleUpperCase('cs-CZ'));
        this.petAttackText.setText(
            view.petTexture ? `⚔ ${view.petAttack}` : '—'
        );
        this.preparationLabel.setText(
            `PŘÍPRAVA · ${view.preparationKind === 'sword' ? 'MEČ' : 'ŠTÍT'}`
        );
        this.preparation
            .setKind(view.preparationKind)
            .setCount(view.preparationCharges, false);

        this.drawHpBar(view.hp, view.maxHp);
        this.refreshTabs();
    }

    private renderAttacks(view: CharacterBookPlayerView): void {
        const count = Phaser.Math.Clamp(Math.floor(view.attackCount), 0, 3);
        const visibleSlots = count === 1
            ? [1]
            : count === 2
                ? [0, 2]
                : count === 3
                    ? [0, 1, 2]
                    : [];

        this.attackSlots.forEach((slot, slotIndex) => {
            const damageIndex = visibleSlots.indexOf(slotIndex);
            const visible = damageIndex >= 0;
            slot.socket.setVisible(visible);
            slot.icon.setVisible(visible);
            slot.value
                .setVisible(visible)
                .setText(visible ? String(view.attacks[damageIndex]) : '');
        });
    }

    private addPageDecoration(
        namePosition: LocalLayoutPoint,
        dividers: CharacterBookLayout['dividers']
    ): void {
        dividers.forEach((divider) => {
            const width = divider.width ?? 384;
            const graphics = this.scene.add.graphics().setDepth(divider.depth);
            graphics.lineStyle(2, 0x9b7651, 0.35);
            graphics.lineBetween(
                divider.x - width / 2,
                divider.y,
                divider.x + width / 2,
                divider.y
            );
            this.root.add(graphics);
        });

        const namePlate = this.scene.add.graphics().setDepth(namePosition.depth - 1);
        namePlate.fillStyle(0x38251b, 0.96);
        namePlate.fillRoundedRect(
            namePosition.x - 156,
            namePosition.y - 22,
            312,
            43,
            12
        );
        namePlate.lineStyle(3, 0x9f6f3b, 1);
        namePlate.strokeRoundedRect(
            namePosition.x - 156,
            namePosition.y - 22,
            312,
            43,
            12
        );
        this.root.add(namePlate);
    }

    private addSocket(
        x: number,
        y: number,
        size: number,
        depth: number
    ): Phaser.GameObjects.Image {
        const socket = this.scene.add.image(x, y, SOCKET_TEXTURE)
            .setDisplaySize(size, size)
            .setDepth(depth);
        this.root.add(socket);
        return socket;
    }

    private addText(
        x: number,
        y: number,
        content: string,
        size: number,
        color: string,
        bold = false,
        depth = 0
    ): Phaser.GameObjects.Text {
        const text = this.scene.add.text(x, y, content, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${size}px`,
            fontStyle: bold ? 'bold' : 'normal',
            color,
            align: 'center',
        }).setOrigin(0.5).setDepth(depth);
        this.root.add(text);
        return text;
    }

    private addValuePlate(
        x: number,
        y: number,
        content: string,
        depth: number
    ): Phaser.GameObjects.Text {
        const text = this.scene.add.text(x, y, content, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: GOLD,
            stroke: '#28150e',
            strokeThickness: 4,
            backgroundColor: '#35251edd',
            padding: { x: 10, y: 4 },
            align: 'center',
        }).setOrigin(0.5).setDepth(depth);
        this.root.add(text);
        return text;
    }

    private drawHpBar(hp: number, maxHp: number): void {
        const ratio = maxHp > 0
            ? Phaser.Math.Clamp(hp / maxHp, 0, 1)
            : 0;
        this.hpFill.clear();
        const x = this.hpBarPosition.x;
        const y = this.hpBarPosition.y;
        this.hpFill.fillStyle(0x251b15, 0.96);
        this.hpFill.fillRoundedRect(x - 127.5, y - 24, 255, 48, 13);
        this.hpFill.lineStyle(4, 0x805529, 1);
        this.hpFill.strokeRoundedRect(x - 127.5, y - 24, 255, 48, 13);
        this.hpFill.fillStyle(0x183a18, 1);
        this.hpFill.fillRoundedRect(x - 118.5, y - 15, 237, 30, 9);
        if (ratio > 0) {
            const fillWidth = Math.max(18, 237 * ratio);
            this.hpFill.fillStyle(ratio > 0.3 ? 0x6fbe3f : 0xd64b3e, 1);
            this.hpFill.fillRoundedRect(x - 118.5, y - 15, fillWidth, 30, 9);
            this.hpFill.fillStyle(0xc6f38d, 0.38);
            this.hpFill.fillRoundedRect(
                x - 114.5,
                y - 11,
                Math.max(10, fillWidth - 8),
                7,
                4
            );
        }
    }

    private createPlayerTab(
        playerIndex: number,
        position: LocalLayoutPoint
    ): PlayerTab {
        const root = this.scene.add.container(position.x, position.y)
            .setDepth(position.depth)
            .setSize(88, 88);
        const tabBack = this.scene.add.circle(0, 0, 47, 0x4a2b1d, 0.98)
            .setStrokeStyle(5, 0x9f6f3b, 1);
        const innerBack = this.scene.add.circle(0, 0, 34, 0x24201f, 1);
        const socket = this.scene.add.image(0, 0, TAB_FRAME_TEXTURE)
            .setDisplaySize(82, 82);
        const portraitCanvas = this.ensureCanvas(
            `__character-book-tab-${playerIndex}`,
            96
        );
        const portrait = this.scene.add.image(0, 0, portraitCanvas.key)
            .setDisplaySize(72, 72);
        const selection = this.scene.add.graphics().setAlpha(0);
        selection.lineStyle(4, 0xbfffff, 1);
        selection.strokeCircle(0, 0, 43);
        const label = this.scene.add.text(43, 27, playerIndex === 0 ? 'A' : 'B', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#fff2c4',
            stroke: '#2c160d',
            strokeThickness: 4,
            backgroundColor: '#6f4025',
            padding: { x: 5, y: 2 },
        }).setOrigin(0.5);
        root.add([tabBack, innerBack, portrait, socket, selection, label]);
        root.setInteractive({ useHandCursor: true });
        root
            .on('pointerover', () => selection.setAlpha(1))
            .on('pointerout', () => this.refreshTabs())
            .on('pointerup', () => {
                this.activePlayer = playerIndex;
                this.callbacks.onPlayerTab(playerIndex);
                this.render();
            });
        this.root.add(root);
        return { root, portraitCanvas, portrait, selection };
    }

    private refreshTabs(): void {
        if (!this.views) return;
        this.tabs.forEach((tab, index) => {
            tab.root.setVisible(this.coopMode);
            this.renderCircularPortrait(
                tab.portraitCanvas,
                this.views![index].portraitTexture,
                'hero'
            );
            tab.portrait.setTexture(tab.portraitCanvas.key);
            tab.selection.setAlpha(index === this.activePlayer ? 1 : 0);
        });
    }

    private ensureCanvas(
        key: string,
        size: number
    ): Phaser.Textures.CanvasTexture {
        if (this.scene.textures.exists(key)) {
            return this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
        }
        const texture = this.scene.textures.createCanvas(key, size, size);
        if (!texture) {
            throw new Error(`Unable to create character book texture: ${key}`);
        }
        return texture;
    }

    private renderCircularPortrait(
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
        const heroPortrait = kind === 'hero'
            && (
                sourceTexture === 'town-hud-heroine-portrait'
                || sourceTexture === 'town-hud-hero-portrait'
            );
        const cropX = kind === 'hero' && !heroPortrait
            ? Math.round(sourceFrame.cutWidth * 0.15)
            : 0;
        const cropWidth = kind === 'hero' && !heroPortrait
            ? Math.round(sourceFrame.cutWidth * 0.7)
            : sourceFrame.cutWidth;
        const cropHeight = kind === 'hero' && !heroPortrait
            ? Math.round(sourceFrame.cutHeight * 0.7)
            : sourceFrame.cutHeight;
        const padding = kind === 'hero' ? 0 : Math.round(size * 0.08);

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

}

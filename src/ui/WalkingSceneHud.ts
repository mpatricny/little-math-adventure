import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { ManaSystem } from '../systems/ManaSystem';
import { PreparationSystem } from '../systems/PreparationSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import {
    getPlayerAttackDamageMultipliers,
    getPlayerAttackProblemCount,
} from '../systems/CombatAttackSystem';
import type { ItemDefinition, PetDefinition, PlayerState } from '../types';
import { getPetAttackPower } from '../systems/CatacombPetProgress';
import {
    CharacterBookLayout,
    CharacterBookOverlay,
    CharacterBookPlayerView,
} from './CharacterBookOverlay';
import { TownHud } from './TownHud';
import { TownResourceHud } from './TownResourceHud';
import { PauseMenu, PauseMenuLayout } from './PauseMenu';

type HostLayout = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
};

export type WalkingSceneHudOptions = {
    onMenu?: () => void;
};

/**
 * Shared production HUD for every walkable, non-combat scene.
 *
 * WalkingHudOverlay in scenes.json is the single editor-owned layout. Runtime
 * hides those preview hosts, composes the dynamic HUD from the real save state,
 * and keeps the same positions in towns, forest rooms and story locations.
 */
export class WalkingSceneHud {
    private readonly scene: Phaser.Scene;
    private readonly options: WalkingSceneHudOptions;
    private readonly sceneBuilder: SceneBuilder;
    private readonly hud: TownHud;
    private readonly resources: TownResourceHud;
    private readonly characterBook: CharacterBookOverlay;
    private readonly menuOverlay: PauseMenu;
    private activePlayer = 0;
    private destroyed = false;

    constructor(scene: Phaser.Scene, options: WalkingSceneHudOptions = {}) {
        this.scene = scene;
        this.options = options;
        this.sceneBuilder = new SceneBuilder(scene);
        this.sceneBuilder.buildScene('WalkingHudOverlay');

        const previewIds = [
            'menuHudHost',
            'playerAHudHost',
            'playerBHudHost',
            'resourceHudHost',
            'walkingMenuOverlayHost',
            'walkingMenuPanelHost',
            'walkingMenuTitleHost',
            'walkingMenuResumeHost',
            'walkingMenuFullscreenHost',
            'walkingMenuQuitHost',
            ...this.getCharacterBookHostIds(),
        ];
        previewIds.forEach((id) => {
            const host = this.sceneBuilder.get(id) as
                | (Phaser.GameObjects.GameObject & {
                    setVisible(visible: boolean): Phaser.GameObjects.GameObject;
                })
                | undefined;
            host?.setVisible(false);
        });

        this.menuOverlay = new PauseMenu(scene, undefined, {
            variant: 'medieval',
            showFullscreen: true,
            title: 'MENU',
            resumeLabel: 'ZPĚT DO HRY',
            quitLabel: 'ZPĚT DO MENU',
            onQuitToMenu: () => this.returnToMenu(),
            layout: this.createMenuLayout(),
        });

        this.hud = new TownHud(
            scene,
            {
                menu: this.getHost('menuHudHost', { x: 58, y: 58, depth: 180 }),
                playerA: this.getHost('playerAHudHost', { x: 245, y: 65, depth: 180 }),
                playerB: this.getHost('playerBHudHost', { x: 550, y: 65, depth: 180 }),
            },
            {
                onMenu: () => this.menuOverlay.show(),
                onHero: (playerIndex) => this.openBook(playerIndex),
                onPet: (playerIndex) => this.openBook(playerIndex),
            }
        );
        this.resources = new TownResourceHud(
            scene,
            this.getHost('resourceHudHost', {
                x: 1140,
                y: 56,
                depth: 180,
                width: 258,
                height: 74,
            })
        );
        this.characterBook = new CharacterBookOverlay(
            scene,
            this.createCharacterBookLayout(),
            {
                onClose: () => undefined,
                onPlayerTab: (playerIndex) => {
                    this.activePlayer = playerIndex;
                    this.hud.setActivePlayer(playerIndex);
                },
            }
        );

        this.refresh();
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    refresh(): void {
        if (this.destroyed) return;
        const gameState = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance();
        const coopMode = coop.isCoopActive();

        let playerA: CharacterBookPlayerView;
        let playerB: CharacterBookPlayerView;
        if (coopMode) {
            coop.activatePlayerA();
            playerA = this.createPlayerView(gameState.getPlayer());
            coop.activatePlayerB();
            playerB = this.createPlayerView(gameState.getPlayer());
            coop.activatePlayerA();
        } else {
            playerA = this.createPlayerView(gameState.getPlayer());
            playerB = { ...playerA };
            this.activePlayer = 0;
        }

        this.hud.setCoopMode(coopMode);
        this.hud.setActivePlayer(this.activePlayer);
        [playerA, playerB].forEach((view, index) => {
            this.hud.setPlayer(index, {
                heroTexture: view.portraitTexture,
                petTexture: view.petTexture,
                healthRatio: view.maxHp > 0 ? view.hp / view.maxHp : 0,
            });
        });
        this.characterBook.setState(
            [playerA, playerB],
            this.activePlayer,
            coopMode
        );

        const resourcePlayer = gameState.getPlayer();
        this.resources.setValues(
            ManaSystem.getMana(resourcePlayer),
            ProgressionSystem.getTotalCoinValue(resourcePlayer.coins)
        );
    }

    openBook(playerIndex = 0): void {
        const coopMode = CoopSessionManager.getInstance().isCoopActive();
        if (playerIndex === 1 && !coopMode) return;
        this.activePlayer = playerIndex;
        this.refresh();
        this.characterBook.open(playerIndex);
    }

    closeBook(): boolean {
        if (!this.characterBook.isOpen()) return false;
        this.characterBook.close();
        return true;
    }

    isBookOpen(): boolean {
        return this.characterBook.isOpen();
    }

    isMenuOpen(): boolean {
        return this.menuOverlay.isPaused();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.hud.destroy();
        this.resources.destroy();
        this.characterBook.destroy();
        this.menuOverlay.destroy();
    }

    private createPlayerView(player: PlayerState): CharacterBookPlayerView {
        const items = (
            this.scene.cache.json.get('items') as ItemDefinition[] | undefined
        ) ?? [];
        const pets = (
            this.scene.cache.json.get('pets') as PetDefinition[] | undefined
        ) ?? [];
        const sword = player.equippedWeapon
            ? items.find((item) => item.id === player.equippedWeapon) ?? null
            : null;
        const shield = player.equippedShield
            ? items.find((item) => item.id === player.equippedShield) ?? null
            : null;
        const pet = player.activePet
            ? pets.find((candidate) => candidate.id === player.activePet) ?? null
            : null;
        const preparation = PreparationSystem.getState(player);
        const attackCount = getPlayerAttackProblemCount(player.attack);
        const attackDamage = getPlayerAttackDamageMultipliers(
            player.attack,
            attackCount
        );

        return {
            name: player.name || (
                player.characterType === 'boy_knight' ? 'Rytíř' : 'Rytířka'
            ),
            level: player.level,
            hp: player.hp,
            maxHp: player.maxHp,
            portraitTexture: player.characterType === 'boy_knight'
                ? 'town-hud-hero-portrait'
                : 'town-hud-heroine-portrait',
            swordFrame: sword?.iconFrame ?? null,
            swordBonus: sword?.damageMultiplier ?? 0,
            shieldFrame: shield?.iconFrame ?? null,
            shieldBlock: shield?.blockPower ?? shield?.blockAttempts ?? shield?.defenseBonus ?? 0,
            attackCount,
            attacks: [
                attackDamage[0] ?? 0,
                attackDamage[1] ?? 0,
                attackDamage[2] ?? 0,
            ],
            potionCount: player.potions,
            petName: pet?.name ?? 'Bez mazlíčka',
            petTexture: pet?.spriteKey ?? null,
            petAttack: pet ? getPetAttackPower(pet, player) : 0,
            preparationKind: preparation.kind
                ?? (player.equippedShield && !player.equippedWeapon ? 'shield' : 'sword'),
            preparationCharges: preparation.charges,
        };
    }

    private createCharacterBookLayout(): CharacterBookLayout {
        return {
            book: this.getHost('characterBookHost', { x: 640, y: 370, depth: 600 }),
            hero: this.getHost('characterBookHeroHost', { x: 425, y: 192, depth: 602 }),
            heroName: this.getHost('characterBookNameHost', { x: 423, y: 312, depth: 604 }),
            heroLevel: this.getHost('characterBookLevelHost', { x: 423, y: 347, depth: 604 }),
            swordLabel: this.getHost('characterBookSwordLabelHost', { x: 323, y: 382, depth: 604 }),
            sword: this.getHost('characterBookSwordHost', { x: 323, y: 448, depth: 602 }),
            swordValue: this.getHost('characterBookSwordValueHost', { x: 323, y: 519, depth: 604 }),
            shieldLabel: this.getHost('characterBookShieldLabelHost', { x: 513, y: 382, depth: 604 }),
            shield: this.getHost('characterBookShieldHost', { x: 513, y: 448, depth: 602 }),
            shieldValue: this.getHost('characterBookShieldValueHost', { x: 513, y: 519, depth: 604 }),
            title: this.getHost('characterBookTitleHost', { x: 867, y: 114, depth: 604 }),
            hpHeart: this.getHost('characterBookHpHeartHost', { x: 283, y: 589, depth: 602 }),
            hpBar: this.getHost('characterBookHpBarHost', {
                x: 455,
                y: 590,
                depth: 602,
                width: 255,
                height: 48,
            }),
            hpValue: this.getHost('characterBookHpValueHost', { x: 455, y: 590, depth: 604 }),
            closeHover: this.getHost('characterBookCloseHoverHost', {
                x: 1057,
                y: 96,
                depth: 620,
                width: 96,
                height: 96,
            }),
            attacksTitle: this.getHost('characterBookAttacksTitleHost', { x: 868, y: 144, depth: 604 }),
            attacks: [
                this.getHost('characterBookAttack1Host', { x: 758, y: 202, depth: 602 }),
                this.getHost('characterBookAttack2Host', { x: 868, y: 202, depth: 602 }),
                this.getHost('characterBookAttack3Host', { x: 978, y: 202, depth: 602 }),
            ],
            attackValues: [
                this.getHost('characterBookAttack1ValueHost', { x: 758, y: 260, depth: 604 }),
                this.getHost('characterBookAttack2ValueHost', { x: 868, y: 260, depth: 604 }),
                this.getHost('characterBookAttack3ValueHost', { x: 978, y: 260, depth: 604 }),
            ],
            potionLabel: this.getHost('characterBookPotionLabelHost', { x: 795, y: 314, depth: 604 }),
            potion: this.getHost('characterBookPotionHost', { x: 795, y: 372, depth: 602 }),
            potionStatus: this.getHost('characterBookPotionStatusHost', { x: 795, y: 427, depth: 604 }),
            petLabel: this.getHost('characterBookPetLabelHost', { x: 925, y: 318, depth: 604 }),
            pet: this.getHost('characterBookPetHost', { x: 925, y: 375, depth: 602 }),
            petName: this.getHost('characterBookPetNameHost', { x: 925, y: 431, depth: 604 }),
            petValue: this.getHost('characterBookPetValueHost', { x: 925, y: 462, depth: 604 }),
            preparationLabel: this.getHost('characterBookPreparationLabelHost', { x: 871, y: 520, depth: 604 }),
            preparation: this.getHost('characterBookPreparationHost', { x: 871, y: 564, depth: 602 }),
            dividers: [
                this.getHost('characterBookDividerGearHost', {
                    x: 420,
                    y: 366,
                    depth: 601,
                    width: 387,
                    height: 8,
                }),
                this.getHost('characterBookDividerItemsHost', {
                    x: 856,
                    y: 294,
                    depth: 601,
                    width: 384,
                    height: 8,
                }),
                this.getHost('characterBookDividerPreparationHost', {
                    x: 858,
                    y: 494,
                    depth: 601,
                    width: 384,
                    height: 8,
                }),
            ],
            tabs: [
                this.getHost('characterBookTabAHost', { x: 1140, y: 296, depth: 605 }),
                this.getHost('characterBookTabBHost', { x: 1140, y: 424, depth: 605 }),
            ],
        };
    }

    private createMenuLayout(): PauseMenuLayout {
        const getRequiredHost = (
            id: string,
            fallback: { x: number; y: number; depth: number; width: number; height: number },
        ) => {
            const host = this.getHost(id, fallback);
            return {
                x: host.x,
                y: host.y,
                depth: host.depth,
                width: host.width ?? fallback.width,
                height: host.height ?? fallback.height,
            };
        };

        return {
            overlay: getRequiredHost('walkingMenuOverlayHost', {
                x: 640, y: 360, depth: 9998, width: 1280, height: 720,
            }),
            panel: getRequiredHost('walkingMenuPanelHost', {
                x: 640, y: 360, depth: 9999, width: 430, height: 390,
            }),
            title: getRequiredHost('walkingMenuTitleHost', {
                x: 640, y: 215, depth: 10000, width: 320, height: 50,
            }),
            resumeButton: getRequiredHost('walkingMenuResumeHost', {
                x: 640, y: 298, depth: 10000, width: 300, height: 52,
            }),
            fullscreenButton: getRequiredHost('walkingMenuFullscreenHost', {
                x: 640, y: 373, depth: 10000, width: 300, height: 52,
            }),
            tvButton: getRequiredHost('walkingMenuTvHost', {
                x: 640, y: 373, depth: 10000, width: 300, height: 52,
            }),
            quitButton: getRequiredHost('walkingMenuQuitHost', {
                x: 640, y: 448, depth: 10000, width: 300, height: 52,
            }),
        };
    }

    private getHost(id: string, fallback: HostLayout): HostLayout {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id);
        const scaleX = definition?.scaleX ?? definition?.scale ?? 1;
        const scaleY = definition?.scaleY ?? definition?.scale ?? 1;
        return {
            x: host?.x ?? fallback.x,
            y: host?.y ?? fallback.y,
            depth: host?.depth ?? fallback.depth,
            width: definition?.width !== undefined
                ? Math.abs(definition.width * scaleX)
                : fallback.width,
            height: definition?.height !== undefined
                ? Math.abs(definition.height * scaleY)
                : fallback.height,
        };
    }

    private getCharacterBookHostIds(): string[] {
        return [
            'characterBookHost',
            'characterBookHeroHost',
            'characterBookNameHost',
            'characterBookLevelHost',
            'characterBookSwordLabelHost',
            'characterBookSwordHost',
            'characterBookSwordValueHost',
            'characterBookShieldLabelHost',
            'characterBookShieldHost',
            'characterBookShieldValueHost',
            'characterBookTitleHost',
            'characterBookHpHeartHost',
            'characterBookHpBarHost',
            'characterBookHpValueHost',
            'characterBookCloseHoverHost',
            'characterBookDividerGearHost',
            'characterBookDividerItemsHost',
            'characterBookDividerPreparationHost',
            'characterBookAttacksTitleHost',
            'characterBookAttack1Host',
            'characterBookAttack1ValueHost',
            'characterBookAttack2Host',
            'characterBookAttack2ValueHost',
            'characterBookAttack3Host',
            'characterBookAttack3ValueHost',
            'characterBookPotionLabelHost',
            'characterBookPotionHost',
            'characterBookPotionStatusHost',
            'characterBookPetLabelHost',
            'characterBookPetHost',
            'characterBookPetNameHost',
            'characterBookPetValueHost',
            'characterBookPreparationLabelHost',
            'characterBookPreparationHost',
            'characterBookTabAHost',
            'characterBookTabBHost',
        ];
    }

    private returnToMenu(): void {
        if (this.options.onMenu) {
            this.options.onMenu();
            return;
        }
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            coop.endSession();
        } else {
            GameStateManager.getInstance().save();
        }
        this.scene.scene.start('MenuScene');
    }
}

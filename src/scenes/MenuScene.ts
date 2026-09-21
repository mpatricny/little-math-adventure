import { DEV_TOOLS_ENABLED } from '../config/buildVariant';
import { audioSettingsButton } from './AudioSettingsScene';
import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { MasterySystem } from '../systems/MasterySystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { requestLandscapeLock } from '../utils/mobileSetup';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { LocalizationService } from '../systems/LocalizationService';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { TvFullscreenController, TvFullscreenState } from '../remote/TvFullscreenController';
import { createSaveFileInput, downloadSaveBundle, SaveFileReadResult } from '../utils/saveFileTransfer';

type MenuButtonConfig = {
    hostId: string;
    fallbackX?: number;
    fallbackY: number;
    label: string;
    iconTexture: string;
    onClick: () => void;
    width?: number;
    height?: number;
    labelFontSize?: number;
    iconSize?: number;
};

const MENU_BUTTON_WIDTH = 380;
const MENU_BUTTON_HEIGHT = 92;
const MENU_ICON_CENTER_RATIO = 0.145;
const MENU_LABEL_CENTER_RATIO = 0.616;

export class MenuScene extends Phaser.Scene {
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;
    private menuButtons = new Map<string, MedievalActionButton>();
    private continueButton!: MedievalActionButton;
    private newGameButton!: MedievalActionButton;
    private coopButton!: MedievalActionButton;
    private exportSavesButton!: MedievalActionButton;
    private importSavesButton!: MedievalActionButton;
    private fullscreenButton!: MedievalActionButton;
    private transferNotice!: Phaser.GameObjects.Container;
    private transferNoticeText!: Phaser.GameObjects.Text;
    private transferNoticeTimer: Phaser.Time.TimerEvent | null = null;
    private saveFileInput: HTMLInputElement | null = null;
    private fullscreen!: TvFullscreenController;
    private unsubscribeFullscreen: (() => void) | null = null;

    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        // Safety: always end co-op session when returning to menu
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            coop.endSession();
        }
        if (GameStateManager.getInstance().endPreview()) MasterySystem.destroyInstance();

        // Run migration for old save format (only affects first run after update)
        SaveSystem.migrateOldSave();

        this.sceneBuilder = new SceneBuilder(this);

        const onContinue = () => {
            // Go to save slot selection
            this.scene.start('MenuNewScene');
        };

        const onNewGame = () => {
            // Find first empty slot
            const firstEmptySlot = SaveSystem.findFirstEmptySlot();

            if (firstEmptySlot >= 0) {
                // Go directly to character select with the empty slot
                this.scene.start('CharacterSelectNewScene', { slotIndex: firstEmptySlot });
            } else {
                // All slots full - show save slot scene to let user manage slots
                this.scene.start('MenuNewScene');
            }
        };

        const onCoop = () => {
            this.scene.start('CoopSetupScene');
        };

        // Production buttons are layered components created from JSON hosts.
        this.sceneBuilder.registerHandler('onContinue', onContinue);
        this.sceneBuilder.registerHandler('onNewGame', onNewGame);
        this.sceneBuilder.registerHandler('onCoop', onCoop);

        // Build the scene from JSON
        this.sceneBuilder.buildScene('MenuScene');
        this.createTransferNotice();
        this.createFullscreenControl();

        const localization = LocalizationService.getInstance();
        this.continueButton = this.createMenuButton({
            hostId: 'btnContinue',
            fallbackY: 280,
            label: localization.resolve('$ui.buttons.BTN_004'),
            iconTexture: 'menu-icon-continue',
            onClick: onContinue,
        });
        this.newGameButton = this.createMenuButton({
            hostId: 'btnNewGame',
            fallbackY: 390,
            label: localization.resolve('$ui.buttons.BTN_005'),
            iconTexture: 'menu-icon-new-game',
            onClick: onNewGame,
        });
        this.coopButton = this.createMenuButton({
            hostId: 'btnCoop',
            fallbackY: 500,
            label: 'CO-OP',
            iconTexture: 'menu-icon-coop',
            onClick: onCoop,
        });
        if (DEV_TOOLS_ENABLED) this.createDeveloperShortcuts();

        this.createSaveTransferControls();
        audioSettingsButton(this);

        // Handle dynamic state (Continue button visibility and positioning)
        this.applySaveState(SaveSystem.hasSave());

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupTransientControls());

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'MenuScene');

    }

    private createDeveloperShortcuts(): void {
        const onComparisonTest = () => {
            const state = GameStateManager.getInstance();
            state.beginComparisonPreview();
            MasterySystem.destroyInstance();
            this.scene.start('BattleScene', {
                enemyId: 'comparison_training_slime',
                comparisonTest: true,
                returnScene: 'MenuScene',
            });
        };

        const onUnderwaterAdventure = () => {
            this.scene.start('UnderwaterRoomScene', { preview: true, fromSurface: true });
        };

        const onSilverpondBattleMock = () => {
            // The main-menu shortcut is a deterministic showcase entry. Normal
            // Silverpond progression still enters through SilverpondTownMockScene.
            this.scene.start('SilverpondArenaMockScene', {
                arenaLevel: 4,
                wave: 0,
                encounterId: 'silverpond-arena-1-wave-1',
            });
        };

        const onSilverpondFairyReward = () => {
            this.scene.start('SilverpondFairyRewardScene', {
                testMode: true,
                returnScene: 'MenuScene',
            });
        };

        this.createMenuButton({
            hostId: 'btnComparisonTest',
            fallbackX: 1060,
            fallbackY: 440,
            label: 'TEST: POROVNÁVÁNÍ',
            iconTexture: 'menu-icon-test-scene',
            onClick: onComparisonTest,
            width: 350,
            height: 62,
            labelFontSize: 15,
            iconSize: 38,
        });
        this.createMenuButton({
            hostId: 'btnSilverpondFairyReward',
            fallbackX: 1060,
            fallbackY: 510,
            label: 'SILVERPOND: DAR VÍLY',
            iconTexture: 'menu-icon-test-scene',
            onClick: onSilverpondFairyReward,
            width: 350,
            height: 62,
            labelFontSize: 15,
            iconSize: 38,
        });
        this.createMenuButton({
            hostId: 'btnSilverpondBattleMock',
            fallbackX: 1060,
            fallbackY: 580,
            label: 'SILVERPOND: VODNÍ ARÉNA',
            iconTexture: 'menu-icon-test-scene',
            onClick: onSilverpondBattleMock,
            width: 350,
            height: 62,
            labelFontSize: 15,
            iconSize: 38,
        });
        this.createMenuButton({
            hostId: 'btnUnderwaterAdventure',
            fallbackX: 1060,
            fallbackY: 650,
            label: 'PODVODNÍ ŘÍŠE · UKÁZKA',
            iconTexture: 'menu-icon-test-scene',
            onClick: onUnderwaterAdventure,
            width: 350,
            height: 62,
            labelFontSize: 15,
            iconSize: 38,
        });
    }

    private createMenuButton(config: MenuButtonConfig): MedievalActionButton {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(config.hostId);
        const button = new MedievalActionButton(this, {
            name: `${config.hostId}MedievalButton`,
            x: host?.x ?? config.fallbackX ?? 640,
            y: host?.y ?? config.fallbackY,
            depth: host?.depth ?? 30,
            width: config.width ?? MENU_BUTTON_WIDTH,
            height: config.height ?? MENU_BUTTON_HEIGHT,
            label: config.label,
            labelFontSize: config.labelFontSize ?? 20,
            accent: 0x69e6ef,
            frameTexture: 'menu-button-frame',
            normalIcon: { texture: config.iconTexture, tint: 0x69e6ef },
            activeIcon: { texture: config.iconTexture, tint: 0xffffff },
            iconSize: config.iconSize ?? 48,
            iconCenterRatio: MENU_ICON_CENTER_RATIO,
            labelCenterRatio: MENU_LABEL_CENTER_RATIO,
            onClick: config.onClick,
        });
        this.menuButtons.set(config.hostId, button);
        return button;
    }

    private createTransferNotice(): void {
        const host = this.getHostLayout('saveTransferNoticeHost', {
            x: 640, y: 205, width: 720, height: 48, depth: 50,
        });
        this.transferNotice = this.add.container(host.x, host.y)
            .setDepth(host.depth)
            .setVisible(false);
        const panel = this.add.rectangle(0, 0, host.width, host.height, 0x17110d, 0.94)
            .setStrokeStyle(2, 0xd0a14d, 1);
        this.transferNoticeText = this.add.text(0, 0, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#f5dfad',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.transferNotice.add([panel, this.transferNoticeText]);
    }

    private createFullscreenControl(): void {
        const host = this.getHostLayout('btnFullscreenHost', {
            x: 1110, y: 60, width: 270, height: 62, depth: 40,
        });
        this.fullscreen = new TvFullscreenController(document.documentElement);
        this.fullscreenButton = new MedievalActionButton(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            width: host.width,
            height: host.height,
            label: 'CELÁ OBRAZOVKA',
            accent: 0x69e6ef,
            layout: 'text',
            frameTexture: 'menu-button-frame',
            labelOffsetX: host.width * 0.1,
            labelMaxWidth: host.width * 0.62,
            labelFontSize: 16,
            onClick: () => { void this.toggleFullscreen(); },
        });
        this.unsubscribeFullscreen = this.fullscreen.onChange(state => {
            this.updateFullscreenButton(state);
        });
    }

    private createSaveTransferControls(): void {
        const exportHost = this.getHostLayout('btnExportSavesHost', {
            x: 500, y: 625, width: 210, height: 62, depth: 40,
        });
        const importHost = this.getHostLayout('btnImportSavesHost', {
            x: 740, y: 625, width: 210, height: 62, depth: 40,
        });

        this.exportSavesButton = this.createTextButton(exportHost, 'EXPORT SAVŮ', () => this.exportSaves());
        this.importSavesButton = this.createTextButton(importHost, 'IMPORT SAVŮ', () => this.importSaves());
    }

    private createTextButton(
        host: { x: number; y: number; width: number; height: number; depth: number },
        label: string,
        onClick: () => void,
    ): MedievalActionButton {
        return new MedievalActionButton(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            width: host.width,
            height: host.height,
            label,
            accent: 0x69e6ef,
            layout: 'text',
            frameTexture: 'menu-button-frame',
            labelOffsetX: host.width * 0.1,
            labelMaxWidth: host.width * 0.62,
            labelFontSize: 16,
            onClick,
        });
    }

    private applySaveState(hasSave: boolean): void {
        if (hasSave) {
            this.continueButton.setEnabled(true).root.setVisible(true);
            this.moveMenuButtonToHost(this.newGameButton, 'btnNewGame');
            this.moveMenuButtonToHost(this.coopButton, 'btnCoop');
            this.exportSavesButton.setEnabled(true).root.setVisible(true);
            this.moveButtonToHost(this.importSavesButton, 'btnImportSavesHost');
            return;
        }

        this.continueButton.setEnabled(false).root.setVisible(false);
        this.moveMenuButtonToHost(this.newGameButton, 'btnNewGameNoSave');
        this.moveMenuButtonToHost(this.coopButton, 'btnCoopNoSave');
        this.exportSavesButton.setEnabled(false).root.setVisible(false);
        this.moveButtonToHost(this.importSavesButton, 'btnImportSavesOnlyHost');
    }

    private exportSaves(): void {
        const bundle = SaveSystem.exportBundle();
        if (!bundle) {
            this.showNotice('NENÍ CO EXPORTOVAT', '#f0b08f');
            return;
        }

        try {
            downloadSaveBundle(bundle);
            const count = SaveSystem.getUsedSlotCount();
            this.showNotice(`EXPORTOVÁNO: ${count} ${count === 1 ? 'SAVE' : 'SAVŮ'}`, '#bce8a4');
        } catch (error) {
            console.error('[MenuScene] Save export failed:', error);
            this.showNotice('EXPORT SE NEPODAŘIL', '#f0b08f');
        }
    }

    private importSaves(): void {
        this.removeSaveFileInput();
        this.saveFileInput = createSaveFileInput(result => this.finishSaveImport(result));
        document.body.appendChild(this.saveFileInput);
        this.saveFileInput.click();
    }

    private finishSaveImport(fileResult: SaveFileReadResult): void {
        this.removeSaveFileInput();
        if (!fileResult.ok) {
            this.showNotice(fileResult.error.toUpperCase(), '#f0b08f');
            return;
        }

        const importResult = SaveSystem.importBundle(fileResult.contents);
        if (!importResult.ok) {
            this.showNotice(importResult.error.toUpperCase(), '#f0b08f');
            return;
        }

        this.applySaveState(true);
        const count = importResult.importedSlots.length;
        this.showNotice(`IMPORTOVÁNO: ${count} ${count === 1 ? 'SAVE' : 'SAVŮ'}`, '#bce8a4');
    }

    private async toggleFullscreen(): Promise<void> {
        try {
            const changed = await this.fullscreen.toggle();
            if (!changed) {
                this.showNotice('FULLSCREEN PROHLÍŽEČ ODMÍTL — KLEPNI ZNOVU', '#f0b08f');
                return;
            }
            if (this.fullscreen.isFullscreen()) void requestLandscapeLock();
        } catch (error) {
            console.warn('[MenuScene] Fullscreen request failed:', error);
            this.showNotice('FULLSCREEN SE NEPODAŘIL', '#f0b08f');
            this.updateFullscreenButton(this.fullscreen.getState());
        }
    }

    private updateFullscreenButton(state: TvFullscreenState): void {
        if (!this.fullscreenButton) return;
        if (state === 'fullscreen') {
            this.fullscreenButton.setEnabled(true).setLabel('UKONČIT FULLSCREEN', 15);
        } else if (state === 'unsupported') {
            this.fullscreenButton.setLabel('FULLSCREEN NENÍ DOSTUPNÝ', 13).setEnabled(false);
        } else {
            this.fullscreenButton.setEnabled(true).setLabel('CELÁ OBRAZOVKA', 16);
        }
    }

    private showNotice(message: string, color: string): void {
        this.transferNoticeTimer?.remove(false);
        this.transferNoticeText.setText(message).setColor(color);
        this.transferNotice.setVisible(true);
        this.transferNoticeTimer = this.time.delayedCall(3600, () => {
            if (this.transferNotice.active) this.transferNotice.setVisible(false);
        });
    }

    private getHostLayout(
        id: string,
        fallback: { x: number; y: number; width: number; height: number; depth: number },
    ): { x: number; y: number; width: number; height: number; depth: number } {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<typeof fallback> | undefined;
        return {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
    }

    private moveButtonToHost(button: MedievalActionButton, hostId: string): void {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(hostId);
        if (host) button.root.setPosition(host.x, host.y).setDepth(host.depth);
    }

    private removeSaveFileInput(): void {
        this.saveFileInput?.remove();
        this.saveFileInput = null;
    }

    private cleanupTransientControls(): void {
        this.unsubscribeFullscreen?.();
        this.unsubscribeFullscreen = null;
        this.transferNoticeTimer?.remove(false);
        this.transferNoticeTimer = null;
        this.removeSaveFileInput();
    }

    private moveMenuButtonToHost(
        button: MedievalActionButton | undefined,
        hostId: string
    ): void {
        if (!button) return;
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(hostId);
        if (!host) return;
        button.root.setPosition(host.x, host.y).setDepth(host.depth);
    }
}

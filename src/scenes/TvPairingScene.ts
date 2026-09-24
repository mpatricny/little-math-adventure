import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SaveSystem } from '../systems/SaveSystem';
import { RemoteInputService } from '../remote/RemoteInputService';
import { RemoteCommand, RemoteControllerState, RemotePeerStatus } from '../remote/types';
import { TvFullscreenController, TvFullscreenState } from '../remote/TvFullscreenController';
import { SceneBuilder } from '../systems/SceneBuilder';

type TvPairingSceneData = {
    returnScene?: string;
};

export class TvPairingScene extends Phaser.Scene {
    private remote = RemoteInputService.getInstance();
    private sceneBuilder!: SceneBuilder;
    private returnScene: string | null = null;
    private titleText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private roomText!: Phaser.GameObjects.Text;
    private urlText!: Phaser.GameObjects.Text;
    private unsubscribeCommand: (() => void) | null = null;
    private unsubscribePeerStatus: (() => void) | null = null;
    private unsubscribeFullscreen: (() => void) | null = null;
    private controllerCount = 0;
    private fullscreen = new TvFullscreenController();
    private fullscreenButton!: Phaser.GameObjects.Container;
    private fullscreenButtonBg!: Phaser.GameObjects.Rectangle;
    private fullscreenButtonText!: Phaser.GameObjects.Text;
    private fullscreenKeyHandler = (event: KeyboardEvent): void => {
        if ((event.key === 'Enter' || event.keyCode === 13) && !this.fullscreen.isFullscreen()) {
            event.preventDefault();
            void this.toggleFullscreen();
        }
    };
    private escapeKeyHandler = (): void => this.leavePairing();

    constructor() {
        super({ key: 'TvPairingScene' });
    }

    init(data: TvPairingSceneData = {}): void {
        this.returnScene = data.returnScene ?? null;
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('TvPairingScene');
        this.createLayout();
        this.createBackControl();
        this.createFullscreenControl();
        this.publishPairingState();

        this.unsubscribeCommand = this.remote.onCommand((command) => this.handleRemoteCommand(command));
        this.unsubscribePeerStatus = this.remote.onPeerStatus((status) => this.handlePeerStatus(status));
        this.events.once('shutdown', () => this.cleanup());
        this.input.keyboard?.on('keydown-ESC', this.escapeKeyHandler);

        this.connectHost();
    }

    private createLayout(): void {
        const background = this.consumeHost('tvPairingBackgroundHost', {
            x: 640, y: 360, width: 1280, height: 720, depth: 0,
        });
        const panel = this.consumeHost('tvPairingPanelHost', {
            x: 640, y: 360, width: 860, height: 500, depth: 1,
        });
        const title = this.consumeHost('tvPairingTitleHost', {
            x: 640, y: 155, width: 760, height: 60, depth: 2,
        });
        const status = this.consumeHost('tvPairingStatusHost', {
            x: 640, y: 225, width: 760, height: 60, depth: 2,
        });
        const room = this.consumeHost('tvPairingRoomHost', {
            x: 640, y: 315, width: 760, height: 90, depth: 2,
        });
        const url = this.consumeHost('tvPairingUrlHost', {
            x: 640, y: 430, width: 760, height: 80, depth: 2,
        });
        const help = this.consumeHost('tvPairingHelpHost', {
            x: 640, y: 560, width: 780, height: 60, depth: 2,
        });

        this.add.rectangle(background.x, background.y, background.width, background.height, 0x111827)
            .setDepth(background.depth);
        this.add.rectangle(panel.x, panel.y, panel.width, panel.height, 0x172033)
            .setDepth(panel.depth)
            .setStrokeStyle(3, 0xfacc15);

        this.titleText = this.add.text(title.x, title.y, 'Číslokraj TV', {
            resolution: 2,
            fontSize: '42px',
            fontFamily: 'Arial, sans-serif',
            color: '#facc15',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(title.depth);

        this.statusText = this.add.text(status.x, status.y, 'Připojuji TV k lokálnímu relay serveru...', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#e5e7eb',
            align: 'center',
            wordWrap: { width: status.width },
        }).setOrigin(0.5).setDepth(status.depth);

        this.roomText = this.add.text(room.x, room.y, '----', {
            fontSize: '78px',
            fontFamily: 'Arial, sans-serif',
            color: '#facc15',
            fontStyle: 'bold',
            letterSpacing: 10,
        }).setOrigin(0.5).setDepth(room.depth);

        this.urlText = this.add.text(url.x, url.y, '', {
            fontSize: '19px',
            fontFamily: 'Arial, sans-serif',
            color: '#cbd5e1',
            align: 'center',
            wordWrap: { width: url.width },
            lineSpacing: 8,
        }).setOrigin(0.5).setDepth(url.depth);

        this.add.text(help.x, help.y, 'Mobil a TV musí být na stejné Wi-Fi. Pokud se ovladač nepřipojí, zkontroluj lokální IP adresu počítače.', {
            fontSize: '17px',
            fontFamily: 'Arial, sans-serif',
            color: '#94a3b8',
            align: 'center',
            wordWrap: { width: help.width },
        }).setOrigin(0.5).setDepth(help.depth);
    }

    private createBackControl(): void {
        const host = this.consumeHost('tvPairingBackButtonHost', {
            x: 165, y: 52, width: 250, height: 54, depth: 20,
        });
        const button = this.add.container(host.x, host.y).setDepth(host.depth);
        const bg = this.add.rectangle(0, 0, host.width, host.height, 0x3b2a1a)
            .setStrokeStyle(2, 0xc9a84c)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(0, 0, this.returnScene ? 'ZPĚT DO HRY' : 'ZPĚT DO MENU', {
            fontSize: '17px',
            fontFamily: 'Arial, sans-serif',
            color: '#facc15',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        button.add([bg, label]);

        bg.on('pointerover', () => bg.setFillStyle(0x56351d));
        bg.on('pointerout', () => {
            bg.setFillStyle(0x3b2a1a);
            button.setScale(1);
        });
        bg.on('pointerdown', () => button.setScale(0.97));
        bg.on('pointerup', () => {
            button.setScale(1);
            this.leavePairing();
        });
    }

    private createFullscreenControl(): void {
        const host = this.consumeHost('tvPairingFullscreenButtonHost', {
            x: 1090, y: 52, width: 300, height: 54, depth: 20,
        });
        this.fullscreenButton = this.add.container(host.x, host.y).setDepth(host.depth);
        this.fullscreenButtonBg = this.add.rectangle(0, 0, host.width, host.height, 0x3b2a1a)
            .setStrokeStyle(2, 0xc9a84c);
        this.fullscreenButtonText = this.add.text(0, 0, '', {
            fontSize: '17px',
            fontFamily: 'Arial, sans-serif',
            color: '#facc15',
            fontStyle: 'bold',
            align: 'center',
        }).setOrigin(0.5);
        this.fullscreenButton.add([this.fullscreenButtonBg, this.fullscreenButtonText]);

        if (this.fullscreen.getState() !== 'unsupported') {
            this.fullscreenButtonBg
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    this.fullscreenButton.setScale(0.97);
                    void this.toggleFullscreen();
                })
                .on('pointerup', () => this.fullscreenButton.setScale(1))
                .on('pointerout', () => this.fullscreenButton.setScale(1));
            document.addEventListener('keydown', this.fullscreenKeyHandler);
        }

        this.unsubscribeFullscreen = this.fullscreen.onChange((state) => {
            this.updateFullscreenControl(state);
            this.scale.refresh();
        });
    }

    private consumeHost(
        id: string,
        fallback: { x: number; y: number; width: number; height: number; depth: number },
    ): { x: number; y: number; width: number; height: number; depth: number } {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<typeof fallback> | undefined;
        const host = {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
        object?.destroy();
        return host;
    }

    private leavePairing(): void {
        const returnScene = this.returnScene;
        this.returnScene = null;
        if (returnScene) {
            this.scene.resume(returnScene);
            this.scene.stop();
            return;
        }
        this.scene.start('MenuScene');
    }

    private async toggleFullscreen(): Promise<void> {
        try {
            const changed = await this.fullscreen.toggle();
            if (!changed) this.showFullscreenFailure();
        } catch (error) {
            console.warn('[TvPairingScene] Fullscreen request failed', error);
            this.showFullscreenFailure();
        } finally {
            this.fullscreenButton.setScale(1);
        }
    }

    private updateFullscreenControl(state: TvFullscreenState): void {
        if (state === 'fullscreen') {
            this.fullscreenButtonBg.setFillStyle(0x28543a).setStrokeStyle(2, 0x7bc18d);
            this.fullscreenButtonText.setText('CELÁ OBRAZOVKA: ZAPNUTO').setColor('#dcfce7');
            return;
        }

        if (state === 'unsupported') {
            this.fullscreenButtonBg.setFillStyle(0x303030).setStrokeStyle(2, 0x666666);
            this.fullscreenButtonText.setText('FULLSCREEN NENÍ PODPOROVÁN').setColor('#a3a3a3');
            return;
        }

        this.fullscreenButtonBg.setFillStyle(0x3b2a1a).setStrokeStyle(2, 0xc9a84c);
        this.fullscreenButtonText.setText('CELÁ OBRAZOVKA (OK)').setColor('#facc15');
    }

    private showFullscreenFailure(): void {
        this.fullscreenButtonBg.setFillStyle(0x6b3030).setStrokeStyle(2, 0xfca5a5);
        this.fullscreenButtonText.setText('FULLSCREEN SE NEPODAŘIL').setColor('#fee2e2');
        this.time.delayedCall(1800, () => {
            if (this.fullscreenButtonText.active) {
                this.updateFullscreenControl(this.fullscreen.getState());
            }
        });
    }

    private async connectHost(): Promise<void> {
        const existingRoom = this.remote.getRoom();
        const existingControllerUrl = this.remote.getControllerUrl();
        if (existingRoom && existingControllerUrl) {
            this.roomText.setText(existingRoom);
            this.statusText.setText('Ovladač připojen. Spusť tréninkový boj z mobilu.');
            this.urlText.setText(`Adresa ovladače:\n${existingControllerUrl}`);
            this.publishHomeState();
            return;
        }

        try {
            const welcome = await this.remote.startHostSession();
            const controllerUrl = this.remote.getControllerUrl() ?? '';

            this.roomText.setText(welcome.room);
            this.statusText.setText('Otevři ovladač v mobilu a zadej tento kód.');
            this.urlText.setText(`Adresa ovladače:\n${controllerUrl}`);
            this.publishHomeState();
        } catch (error) {
            this.statusText.setText('TV se nepodařilo připojit k relay serveru.');
            this.roomText.setText('ERR');
            this.urlText.setText(error instanceof Error ? error.message : String(error));
            this.publishPairingState();
        }
    }

    private handlePeerStatus(status: RemotePeerStatus): void {
        this.controllerCount = status.controllerCount;
        if (status.controllerCount > 0) {
            this.statusText.setText('Ovladač připojen. Spusť tréninkový boj z mobilu.');
        } else if (this.remote.getRoom()) {
            this.statusText.setText('Otevři ovladač v mobilu a zadej tento kód.');
        }
        this.publishHomeState();
    }

    private handleRemoteCommand(command: RemoteCommand): void {
        if (command.type === 'startTrainingBattle') {
            this.startTrainingBattle();
        }
    }

    private startTrainingBattle(): void {
        this.ensureTrainingProfile();
        this.remote.publishState({
            screen: 'waiting',
            title: 'Startuji boj',
            subtitle: 'Sleduj TV obrazovku.',
        });
        this.scene.start('BattleScene', {
            enemyId: 'slime_tutorial',
            returnScene: 'TvPairingScene',
            returnData: {},
        });
    }

    private ensureTrainingProfile(): void {
        const gameState = GameStateManager.getInstance();
        if (gameState.isSlotLoaded()) return;

        const activeSlot = SaveSystem.getActiveSlot();
        if (activeSlot !== null && gameState.loadSlot(activeSlot)) return;

        const firstEmptySlot = SaveSystem.findFirstEmptySlot();
        if (firstEmptySlot >= 0) {
            gameState.setActiveSlotIndex(firstEmptySlot);
            gameState.reset('girl_knight', 'TV Hrdina', firstEmptySlot);
            return;
        }

        gameState.loadSlot(0);
    }

    private publishPairingState(): void {
        const room = this.remote.getRoom() ?? undefined;
        const controllerUrl = this.remote.getControllerUrl() ?? undefined;
        this.remote.publishState({
            screen: 'pairing',
            title: 'Párování s TV',
            subtitle: 'Čekám na připojení mobilního ovladače.',
            room,
            controllerUrl,
        });
    }

    private publishHomeState(): void {
        const room = this.remote.getRoom();
        if (!room) {
            this.publishPairingState();
            return;
        }

        const subtitle = this.controllerCount > 0
            ? 'Ovladač je připojený. Můžeš spustit testovací souboj.'
            : 'Ovladač zatím není připojený, ale stránka si tento stav načte po připojení.';
        const state: RemoteControllerState = {
            screen: 'home',
            title: 'Číslokraj',
            subtitle,
            actions: [
                {
                    id: 'startTrainingBattle',
                    label: 'Spustit tréninkový boj',
                    command: { type: 'startTrainingBattle' },
                },
            ],
        };
        this.remote.publishState(state);
    }

    private cleanup(): void {
        this.unsubscribeCommand?.();
        this.unsubscribePeerStatus?.();
        this.unsubscribeFullscreen?.();
        this.unsubscribeCommand = null;
        this.unsubscribePeerStatus = null;
        this.unsubscribeFullscreen = null;
        document.removeEventListener('keydown', this.fullscreenKeyHandler);
        this.input.keyboard?.off('keydown-ESC', this.escapeKeyHandler);
    }
}

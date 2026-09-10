import { buildControllerUrl, getRelayUrlFromLocation } from './remoteMode';
import { RemoteRelayClient } from './RemoteRelayClient';
import {
    RemoteCommand,
    RemoteControllerState,
    RemotePeerStatus,
    RemoteWelcome,
} from './types';

type Listener<T> = (payload: T) => void;

export class RemoteInputService {
    private static instance: RemoteInputService | null = null;

    private relay = new RemoteRelayClient();
    private commandListeners = new Set<Listener<RemoteCommand>>();
    private stateListeners = new Set<Listener<RemoteControllerState>>();
    private peerStatusListeners = new Set<Listener<RemotePeerStatus>>();
    private closeListeners = new Set<Listener<void>>();
    private currentState: RemoteControllerState | null = null;
    private controllerUrl: string | null = null;

    private constructor() {
        this.relay.on('command', (command) => this.commandListeners.forEach((listener) => listener(command)));
        this.relay.on('state', (state) => {
            this.currentState = state;
            this.stateListeners.forEach((listener) => listener(state));
        });
        this.relay.on('peerStatus', (status) => this.peerStatusListeners.forEach((listener) => listener(status)));
        this.relay.on('close', () => this.closeListeners.forEach((listener) => listener()));
    }

    static getInstance(): RemoteInputService {
        if (!RemoteInputService.instance) {
            RemoteInputService.instance = new RemoteInputService();
        }
        return RemoteInputService.instance;
    }

    async startHostSession(relayUrl: string = getRelayUrlFromLocation()): Promise<RemoteWelcome> {
        const welcome = await this.relay.connect('host', relayUrl);
        this.controllerUrl = buildControllerUrl(welcome.room, relayUrl);
        return welcome;
    }

    async connectController(room: string, relayUrl: string = getRelayUrlFromLocation()): Promise<RemoteWelcome> {
        return this.relay.connect('controller', relayUrl, room);
    }

    disconnect(): void {
        this.relay.disconnect();
        this.currentState = null;
        this.controllerUrl = null;
    }

    getRoom(): string | null {
        return this.relay.getRoom();
    }

    getControllerUrl(): string | null {
        return this.controllerUrl;
    }

    getCurrentState(): RemoteControllerState | null {
        return this.currentState;
    }

    publishState(state: RemoteControllerState): void {
        this.currentState = state;
        this.relay.sendState(state);
    }

    sendCommand(command: RemoteCommand): void {
        this.relay.sendCommand(command);
    }

    onCommand(listener: Listener<RemoteCommand>): () => void {
        this.commandListeners.add(listener);
        return () => this.commandListeners.delete(listener);
    }

    onState(listener: Listener<RemoteControllerState>): () => void {
        this.stateListeners.add(listener);
        if (this.currentState) listener(this.currentState);
        return () => this.stateListeners.delete(listener);
    }

    onPeerStatus(listener: Listener<RemotePeerStatus>): () => void {
        this.peerStatusListeners.add(listener);
        return () => this.peerStatusListeners.delete(listener);
    }

    onClose(listener: Listener<void>): () => void {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }
}

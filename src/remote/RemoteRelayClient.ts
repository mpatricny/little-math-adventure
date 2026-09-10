import {
    RemoteCommand,
    RemoteControllerState,
    RemotePeerStatus,
    RemoteRelayMessage,
    RemoteRole,
    RemoteWelcome,
} from './types';

type RemoteRelayEventMap = {
    welcome: RemoteWelcome;
    command: RemoteCommand;
    state: RemoteControllerState;
    peerStatus: RemotePeerStatus;
    error: string;
    close: void;
};

type RemoteRelayEventName = keyof RemoteRelayEventMap;
type RemoteRelayListener<K extends RemoteRelayEventName> = (payload: RemoteRelayEventMap[K]) => void;

export class RemoteRelayClient {
    private socket: WebSocket | null = null;
    private listeners: { [K in RemoteRelayEventName]?: Set<RemoteRelayListener<K>> } = {};
    private welcome: RemoteWelcome | null = null;

    connect(role: RemoteRole, relayUrl: string, room?: string): Promise<RemoteWelcome> {
        this.disconnect();

        return new Promise((resolve, reject) => {
            const socket = new WebSocket(relayUrl);
            this.socket = socket;
            let settled = false;

            const cleanupInitialHandlers = () => {
                socket.removeEventListener('error', onInitialError);
            };

            const rejectInitialConnect = (message: string) => {
                if (settled) return;
                settled = true;
                cleanupInitialHandlers();
                reject(new Error(message));
            };

            const onInitialError = () => {
                rejectInitialConnect(`Could not connect to relay at ${relayUrl}`);
            };

            socket.addEventListener('error', onInitialError);

            socket.addEventListener('open', () => {
                this.sendRaw({ kind: 'hello', role, room });
            });

            socket.addEventListener('message', (event) => {
                const message = this.parseMessage(event.data);
                if (!message) return;

                if (message.kind === 'welcome') {
                    settled = true;
                    cleanupInitialHandlers();
                    this.welcome = message;
                    resolve(message);
                    this.emit('welcome', message);
                    return;
                }

                if (message.kind === 'error') {
                    rejectInitialConnect(message.message);
                }

                this.handleMessage(message);
            });

            socket.addEventListener('close', () => {
                rejectInitialConnect(`Relay connection closed before ${role} joined.`);
                this.socket = null;
                this.emit('close', undefined);
            });
        });
    }

    disconnect(): void {
        if (!this.socket) return;
        this.socket.close();
        this.socket = null;
        this.welcome = null;
    }

    getRoom(): string | null {
        return this.welcome?.room ?? null;
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    sendCommand(command: RemoteCommand): void {
        this.sendRaw({ kind: 'command', command });
    }

    sendState(state: RemoteControllerState): void {
        this.sendRaw({ kind: 'state', state });
    }

    on<K extends RemoteRelayEventName>(eventName: K, listener: RemoteRelayListener<K>): () => void {
        const listeners = this.listeners[eventName] ?? new Set<RemoteRelayListener<K>>();
        listeners.add(listener);
        this.listeners[eventName] = listeners as typeof this.listeners[K];

        return () => {
            const currentListeners = this.listeners[eventName];
            currentListeners?.delete(listener as never);
        };
    }

    private handleMessage(message: RemoteRelayMessage): void {
        switch (message.kind) {
            case 'command':
                this.emit('command', message.command);
                break;
            case 'state':
                this.emit('state', message.state);
                break;
            case 'peerStatus':
                this.emit('peerStatus', message.status);
                break;
            case 'error':
                this.emit('error', message.message);
                break;
            case 'hello':
            case 'welcome':
                break;
        }
    }

    private sendRaw(message: RemoteRelayMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(message));
    }

    private parseMessage(data: unknown): RemoteRelayMessage | null {
        if (typeof data !== 'string') return null;

        try {
            return JSON.parse(data) as RemoteRelayMessage;
        } catch {
            return null;
        }
    }

    private emit<K extends RemoteRelayEventName>(eventName: K, payload: RemoteRelayEventMap[K]): void {
        const listeners = this.listeners[eventName];
        if (!listeners) return;
        listeners.forEach((listener) => listener(payload as never));
    }
}

export type RemoteRole = 'host' | 'controller';

export type RemoteCommand =
    | { type: 'startTrainingBattle' }
    | { type: 'attack' }
    | { type: 'answerChoice'; index: 0 | 1 | 2 }
    | { type: 'selectEnemy'; index: number }
    | { type: 'usePotion' }
    | { type: 'continue' }
    | { type: 'back' };

export interface RemoteAction {
    id: RemoteCommand['type'];
    label: string;
    command: RemoteCommand;
    disabled?: boolean;
}

export interface RemoteAnswerChoice {
    index: 0 | 1 | 2;
    label: string;
}

export type RemoteComparisonPrompt = {
    representation: 'size' | 'count' | 'number' | 'expression';
    left: number;
    right: number;
    numberedObjects: boolean;
    crocodileChoices: boolean;
    showReminders: boolean;
    expression?: string;
    arithmeticHint?: number;
} | {
    representation: 'arithmetic';
    leftExpression: string;
    rightExpression: string;
    crocodileChoices: false;
    showReminders: false;
};

export interface RemoteEnemyTarget {
    index: number;
    name: string;
    hp: number;
    maxHp: number;
    selected: boolean;
}

export type RemoteControllerState =
    | {
        screen: 'pairing';
        title: string;
        subtitle?: string;
        room?: string;
        controllerUrl?: string;
    }
    | {
        screen: 'home';
        title: string;
        subtitle?: string;
        actions: RemoteAction[];
    }
    | {
        screen: 'battleTurn';
        title: string;
        subtitle?: string;
        enemies: RemoteEnemyTarget[];
        actions: RemoteAction[];
    }
    | {
        screen: 'math';
        title: string;
        subtitle?: string;
        problem: string;
        choices: RemoteAnswerChoice[];
        comparison?: RemoteComparisonPrompt;
    }
    | {
        screen: 'feedback';
        title: string;
        subtitle?: string;
        actions: RemoteAction[];
    }
    | {
        screen: 'waiting';
        title: string;
        subtitle?: string;
    }
    | {
        screen: 'disconnected';
        title: string;
        subtitle?: string;
    };

export interface RemotePeerStatus {
    hostConnected: boolean;
    controllerCount: number;
}

export interface RemoteWelcome {
    role: RemoteRole;
    room: string;
    clientId: string;
}

export type RemoteRelayMessage =
    | { kind: 'hello'; role: RemoteRole; room?: string }
    | { kind: 'welcome'; role: RemoteRole; room: string; clientId: string }
    | { kind: 'peerStatus'; status: RemotePeerStatus }
    | { kind: 'command'; command: RemoteCommand }
    | { kind: 'state'; state: RemoteControllerState }
    | { kind: 'error'; message: string };

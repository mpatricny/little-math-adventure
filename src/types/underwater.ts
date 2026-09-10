/** Optional, additive save extension. Room/object IDs survive scene-editor edits. */
export interface UnderwaterProgress {
    schemaVersion: 1;
    active: boolean;
    roomId: string;
    entryId: string;
    introSeen: boolean;
    visitedRooms: string[];
    defeatedEncounters: string[];
    openedChests: string[];
    bellNotes: number;
    puzzleAttempts: number;
    assistedPuzzleAttempts?: number;
    restoredMechanisms?: string[];
    mechanismAttempts?: Record<string, { attempts: number; assisted: number }>;
    mechanismStages?: Record<string, number>;
    position?: { roomId: string; x: number };
    restPoint?: { roomId: string; entryId: string };
    descentSeen?: boolean;
    depthCrystalClaimed?: boolean;
    /** Permanent second story crystal; never consumes the spendable crystal inventory. */
    depthCrystalInstalled?: boolean;
    /** Resume at Zyx's ship until the player explicitly leaves it. */
    depthCrystalShipActive?: boolean;
    /** Presentation receipts are separate from progression; interrupted reveals replay safely. */
    litHubSeals?: Array<'shell' | 'current'>;
    revealedPassages?: string[];
}

export interface UnderwaterRoom {
    name: string;
    layout: string;
    background: string;
    exits: Array<{
        id: string;
        host: string;
        label: string;
        target: string;
        entry: string;
        requiresEncounter?: string;
        requiresBell?: boolean;
        requiresShortcut?: boolean;
        requiresMechanism?: string;
        requiresSeals?: boolean;
        descent?: boolean;
        passage?: string;
        oneWay?: boolean;
    }>;
    /** Receiving mouths of one-way currents, not clickable exits. */
    arrivals?: Array<{ id: string; host: string; from: string; passage: string; requiresMechanism: string }>;
    /** Closed architecture for unfinished map destinations; never navigable. */
    plannedExits?: Array<{ id: string; host: string; target: string }>;
    encounter?: { id: string; host: string };
    rest?: { host: string; entry: string; requiresEncounter?: string };
    finale?: { crystalHost: string; guardianHost: string; guardianArrivalHost: string };
    chest?: { id: string; host: string; coins: number; mana: number;
        lock?: 'word' | 'none'; requiresMechanism?: string; requiresEncounter?: string; postal?: boolean };
    puzzle?: { host: string; requiredNotes: number };
    mechanism?: { id: string; host: string; kind: 'current' | 'pump' | 'reverse' | 'routing' | 'light'; mana: number;
        stages?: number; seal?: 'shell' | 'current' };
}

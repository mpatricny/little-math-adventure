import { PlayerState, MathStats, SaveSlotMeta, SaveSlotData } from '../types';
import { gameplayId } from '../telemetry/gameplayData';
import { notifyGameplaySave } from '../telemetry/gameplayBridge';
import { analytics } from '../telemetry/AnalyticsClient';
import { addPlayTimeDays, preservePlayTime, type PlayTimeDays } from './LocalPlayTime';
import { checkpointLocalPlayTime } from './LocalPlayTimeBridge';

// Storage keys
let SAVE_DATA_PREFIX = 'littleMathAdventure_slot_';
let ACTIVE_SLOT_KEY = 'littleMathAdventure_activeSlot';
let OLD_SAVE_KEY = 'littleMathAdventure_saveData';

const MAX_SLOTS = 8;
const SAVE_EXPORT_FORMAT = 'little-math-adventure-save-bundle';
const SAVE_EXPORT_VERSION = 1;

type SaveExportEntry = {
    sourceSlot: number;
    save: SaveSlotData;
};

type SaveExportBundle = {
    format: typeof SAVE_EXPORT_FORMAT;
    version: typeof SAVE_EXPORT_VERSION;
    exportedAt: number;
    activeSlot: number | null;
    saves: SaveExportEntry[];
};

export type SaveBundleImportResult =
    | { ok: true; importedSlots: number[]; activeSlot: number | null }
    | { ok: false; error: string };

export type SaveChange = 'progress' | 'slots';

export class SaveSystem {
    /** Set only after the server has verified this browser's Google session. */
    static useFamilyStorage(familyId: string): void {
        const prefix = `littleMathAdventure_family_${familyId}_`;
        SAVE_DATA_PREFIX = prefix + 'slot_';
        ACTIVE_SLOT_KEY = prefix + 'activeSlot';
        OLD_SAVE_KEY = prefix + 'saveData';
    }

    static restoreFamilySnapshot(slot: number, save: SaveSlotData): void {
        if (!this.isSlotIndex(slot) || !this.isValidSaveData(save)) throw new Error('Invalid family snapshot');
        const existing = localStorage.getItem(SAVE_DATA_PREFIX + slot);
        if (existing !== null && JSON.parse(existing).player?.gameplayProfileId !== save.player.gameplayProfileId)
            throw new Error('Occupied family slot');
        localStorage.setItem(SAVE_DATA_PREFIX + slot, JSON.stringify(save));
    }
    private static changeListeners = new Set<(change: SaveChange) => void>();
    private static writeGuards = new Set<() => boolean>();

    static guardWrites(guard: () => boolean): () => void {
        this.writeGuards.add(guard);
        return () => { this.writeGuards.delete(guard); };
    }

    private static mayWrite(): boolean {
        return [...this.writeGuards].every(guard => guard());
    }

    static observeChanges(listener: (change: SaveChange) => void): () => void {
        this.changeListeners.add(listener);
        return () => { this.changeListeners.delete(listener); };
    }

    private static notifyChanges(change: SaveChange = 'slots'): void {
        for (const listener of this.changeListeners) {
            try { listener(change); } catch (error) { console.warn('[SaveSystem] Save observer failed', error); }
        }
    }

    static isValidSaveData(value: unknown): value is SaveSlotData { return this.isSaveSlotData(value); }

    /**
     * Get metadata for all 8 save slots
     * Returns lightweight data for carousel preview
     */
    static getSlotsMeta(): SaveSlotMeta[] {
        const slots: SaveSlotMeta[] = [];

        for (let i = 0; i < MAX_SLOTS; i++) {
            const slotData = this.load(i);

            if (slotData) {
                slots.push({
                    slotIndex: i,
                    isEmpty: false,
                    characterName: slotData.player.name,
                    characterType: slotData.player.characterType,
                    level: slotData.player.level,
                    totalProblemsSolved: slotData.mathStats.totalAttempts,
                    lastPlayed: slotData.timestamp
                });
            } else {
                slots.push({
                    slotIndex: i,
                    isEmpty: true,
                    characterName: '',
                    characterType: 'girl_knight',
                    level: 0,
                    totalProblemsSolved: 0,
                    lastPlayed: 0
                });
            }
        }

        return slots;
    }

    /**
     * Get metadata for a specific slot
     */
    static getSlotMeta(slotIndex: number): SaveSlotMeta | null {
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            return null;
        }

        const slotData = this.load(slotIndex);

        if (slotData) {
            return {
                slotIndex,
                isEmpty: false,
                characterName: slotData.player.name,
                characterType: slotData.player.characterType,
                level: slotData.player.level,
                totalProblemsSolved: slotData.mathStats.totalAttempts,
                lastPlayed: slotData.timestamp
            };
        }

        return {
            slotIndex,
            isEmpty: true,
            characterName: '',
            characterType: 'girl_knight',
            level: 0,
            totalProblemsSolved: 0,
            lastPlayed: 0
        };
    }

    /**
     * Save game state to a specific slot
     */
    static save(slotIndex: number, player: PlayerState, mathStats: MathStats): void {
        if (!this.mayWrite()) return;
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            console.error(`[SaveSystem] Invalid slot index: ${slotIndex}`);
            return;
        }

        checkpointLocalPlayTime();
        player.gameplayProfileId ??= gameplayId();
        const previousPlayer = this.readSnapshot(slotIndex)?.player;
        preservePlayTime(player, previousPlayer);
        const saveData: SaveSlotData = {
            player,
            mathStats,
            timestamp: Date.now()
        };

        try {
            const key = `${SAVE_DATA_PREFIX}${slotIndex}`;
            localStorage.setItem(key, JSON.stringify(saveData));
            notifyGameplaySave(slotIndex, saveData);
            this.notifyChanges(previousPlayer?.gameplayProfileId === player.gameplayProfileId ? 'progress' : 'slots');
            console.log(`[SaveSystem] Game saved to slot ${slotIndex}`);
        } catch (error) {
            console.error('[SaveSystem] Failed to save:', error);
            analytics()?.emit('save_error',{code:'local_save',scene:analytics()?.contextSnapshot()?.scene??'SaveSystem',fingerprint:'save',count:1});
        }
    }

    /** Atomic host record: pair special-use consumption with combat HP and resume state. */
    static writeFoxAbilityCheckpoint(
        slotIndex: number,
        profileId: string,
        checkpoint: import('../types/foxBattleSession').BattleFoxAbilityCheckpoint,
        expected: import('../types/foxBattleSession').BattleFoxCheckpointToken | null,
        liveSave?: SaveSlotData,
    ): boolean {
        if (!this.mayWrite()) return false;
        const stored = this.readSnapshot(slotIndex);
        if (!stored || !profileId || stored.player.gameplayProfileId !== profileId
            || (liveSave && liveSave.player.gameplayProfileId !== profileId)) return false;
        const previous = stored.player.foxAbilityBattle;
        if (expected ? previous?.battleId !== expected.battleId || previous?.revision !== expected.revision : previous !== undefined) return false;
        if (!Object.values(checkpoint.ledger.owners).some(owner => owner?.profileId === profileId)) return false;
        const source = liveSave ?? stored;
        const player = { ...source.player, foxAbilityBattle: structuredClone(checkpoint) };
        this.save(slotIndex, player, source.mathStats);
        const written = this.readSnapshot(slotIndex);
        if (written?.player.gameplayProfileId !== profileId
            || JSON.stringify(written.player.foxAbilityBattle) !== JSON.stringify(checkpoint)) return false;
        // A later singleton save must retain the newly committed host checkpoint.
        if (liveSave) liveSave.player.foxAbilityBattle = structuredClone(checkpoint);
        return true;
    }

    /** Patch only time on a fresh snapshot; never save the singleton's possibly stale lane stats. */
    static addLocalPlayTime(slotIndex: number, profileId: string, days: PlayTimeDays): boolean {
        if (!this.mayWrite()) return false;
        const save = this.readSnapshot(slotIndex);
        // A slot can be deleted/replaced between samples. Old time must never follow its index.
        if (!save || save.player.gameplayProfileId !== profileId) return true;
        addPlayTimeDays(save.player, days);
        save.timestamp = Date.now();
        try {
            localStorage.setItem(`${SAVE_DATA_PREFIX}${slotIndex}`, JSON.stringify(save));
        } catch (error) {
            console.warn('[SaveSystem] Could not persist local play time', error);
            return false;
        }
        notifyGameplaySave(slotIndex, save);
        this.notifyChanges('progress');
        return true;
    }

    /**
     * Serialize every occupied slot into one portable JSON file.
     * The bundle contains only game save data; browser-specific settings are excluded.
     */
    static exportBundle(): string | null {
        const saves: SaveExportEntry[] = [];

        for (let slotIndex = 0; slotIndex < MAX_SLOTS; slotIndex++) {
            const save = this.load(slotIndex);
            if (save) saves.push({ sourceSlot: slotIndex, save });
        }

        if (saves.length === 0) return null;

        const activeSlot = this.getActiveSlot();
        const bundle: SaveExportBundle = {
            format: SAVE_EXPORT_FORMAT,
            version: SAVE_EXPORT_VERSION,
            exportedAt: Date.now(),
            activeSlot: activeSlot !== null && saves.some(entry => entry.sourceSlot === activeSlot)
                ? activeSlot
                : null,
            saves,
        };

        return JSON.stringify(bundle, null, 2);
    }

    /**
     * Import a portable save bundle without overwriting any local slot.
     * Original slot numbers are preserved when available; conflicts are moved to
     * the first free slots. The operation is rejected before writing if there is
     * not enough space for the complete bundle.
     */
    static importBundle(serializedBundle: string): SaveBundleImportResult {
        if (!this.mayWrite()) return { ok: false, error: 'Nejdřív obnov hru.' };
        let parsed: unknown;
        try {
            parsed = JSON.parse(serializedBundle);
        } catch {
            return { ok: false, error: 'Soubor není platný JSON.' };
        }

        if (!this.isSaveExportBundle(parsed)) {
            return { ok: false, error: 'Neplatná záloha Číslokraje.' };
        }

        const occupiedSlots = new Set(
            this.getSlotsMeta()
                .filter(slot => !slot.isEmpty)
                .map(slot => slot.slotIndex),
        );
        const freeSlots = Array.from({ length: MAX_SLOTS }, (_, slotIndex) => slotIndex)
            .filter(slotIndex => !occupiedSlots.has(slotIndex));

        if (parsed.saves.length > freeSlots.length) {
            return {
                ok: false,
                error: `Pro import je potřeba ${parsed.saves.length} prázdných slotů, volných je ${freeSlots.length}.`,
            };
        }

        const reservedSlots = new Set<number>();
        const assignments = parsed.saves.map(entry => {
            const preferredSlotAvailable = !occupiedSlots.has(entry.sourceSlot)
                && !reservedSlots.has(entry.sourceSlot);
            const targetSlot = preferredSlotAvailable
                ? entry.sourceSlot
                : freeSlots.find(slotIndex => !reservedSlots.has(slotIndex))!;
            reservedSlots.add(targetSlot);
            return { ...entry, targetSlot };
        });

        const writtenSlots: number[] = [];
        try {
            for (const assignment of assignments) {
                localStorage.setItem(
                    `${SAVE_DATA_PREFIX}${assignment.targetSlot}`,
                    JSON.stringify(assignment.save),
                );
                writtenSlots.push(assignment.targetSlot);
            }
        } catch (error) {
            writtenSlots.forEach(slotIndex => localStorage.removeItem(`${SAVE_DATA_PREFIX}${slotIndex}`));
            console.error('[SaveSystem] Failed to import save bundle:', error);
            return { ok: false, error: 'Import se nepodařilo uložit do prohlížeče.' };
        }

        const activeAssignment = parsed.activeSlot === null
            ? null
            : assignments.find(entry => entry.sourceSlot === parsed.activeSlot) ?? null;
        const activeSlot = activeAssignment?.targetSlot ?? assignments[0]?.targetSlot ?? null;
        if (activeSlot !== null) this.setActiveSlot(activeSlot);
        for (const slot of writtenSlots) {
            const save = this.load(slot);
            if (save) {notifyGameplaySave(slot, save);if(save.player.gameplayProfileId)
                analytics()?.emit('profile_imported',{role:'A',origin:'import'},save.player.gameplayProfileId);}
        }

        console.log(`[SaveSystem] Imported ${writtenSlots.length} save slot(s)`);
        this.notifyChanges();
        return { ok: true, importedSlots: writtenSlots, activeSlot };
    }

    /**
     * Load game state from a specific slot
     * Returns null if slot is empty
     */
    static load(slotIndex: number): SaveSlotData | null {
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            console.error(`[SaveSystem] Invalid slot index: ${slotIndex}`);
            return null;
        }

        try {
            const key = `${SAVE_DATA_PREFIX}${slotIndex}`;
            const saveDataStr = localStorage.getItem(key);

            if (!saveDataStr) {
                return null;
            }

            const saveData = JSON.parse(saveDataStr) as SaveSlotData;
            if (saveData.player && !saveData.player.gameplayProfileId) {
                saveData.player.gameplayProfileId = gameplayId();
                try { localStorage.setItem(key, JSON.stringify(saveData)); }
                catch { console.warn('[SaveSystem] Could not persist analytics identity'); }
            }
            console.log(`[SaveSystem] Game loaded from slot ${slotIndex}`);
            return saveData;
        } catch (error) {
            console.error('[SaveSystem] Failed to load:', error);
            return null;
        }
    }

    /** Read-only profile inspection: never hydrates identity, activates or saves a slot. */
    static readSnapshot(slotIndex: number): SaveSlotData | null {
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return null;
        try {
            const stored = localStorage.getItem(`${SAVE_DATA_PREFIX}${slotIndex}`);
            if (!stored) return null;
            const data = JSON.parse(stored) as SaveSlotData;
            return data.player && data.mathStats ? data : null;
        } catch {
            return null;
        }
    }

    /**
     * Delete a specific save slot
     */
    static deleteSlot(slotIndex: number): void {
        if (!this.mayWrite()) return;
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            console.error(`[SaveSystem] Invalid slot index: ${slotIndex}`);
            return;
        }

        try {
            const key = `${SAVE_DATA_PREFIX}${slotIndex}`;
            localStorage.removeItem(key);
            console.log(`[SaveSystem] Slot ${slotIndex} deleted`);

            // If this was the active slot, clear active slot
            const activeSlot = this.getActiveSlot();
            if (activeSlot === slotIndex) {
                this.clearActiveSlot();
            }
            this.notifyChanges();
        } catch (error) {
            console.error('[SaveSystem] Failed to delete slot:', error);
        }
    }

    /**
     * Get the currently active save slot index
     */
    static getActiveSlot(): number | null {
        try {
            const activeStr = localStorage.getItem(ACTIVE_SLOT_KEY);
            if (activeStr === null) {
                return null;
            }
            const activeIndex = parseInt(activeStr, 10);
            if (isNaN(activeIndex) || activeIndex < 0 || activeIndex >= MAX_SLOTS) {
                return null;
            }
            return activeIndex;
        } catch (error) {
            return null;
        }
    }

    /**
     * Set the currently active save slot index
     */
    static setActiveSlot(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            console.error(`[SaveSystem] Invalid slot index: ${slotIndex}`);
            return;
        }

        try {
            localStorage.setItem(ACTIVE_SLOT_KEY, slotIndex.toString());
            console.log(`[SaveSystem] Active slot set to ${slotIndex}`);
        } catch (error) {
            console.error('[SaveSystem] Failed to set active slot:', error);
        }
    }

    /**
     * Clear the active slot tracking
     */
    static clearActiveSlot(): void {
        localStorage.removeItem(ACTIVE_SLOT_KEY);
    }

    /**
     * Check if any save slot has data
     */
    static hasSave(): boolean {
        for (let i = 0; i < MAX_SLOTS; i++) {
            const key = `${SAVE_DATA_PREFIX}${i}`;
            if (localStorage.getItem(key) !== null) {
                return true;
            }
        }
        return false;
    }

    /**
     * Migrate old single-slot save to slot 0
     * Call this once at game startup
     * Returns true if migration occurred
     */
    static migrateOldSave(): boolean {
        try {
            const oldSaveStr = localStorage.getItem(OLD_SAVE_KEY);

            if (!oldSaveStr) {
                return false; // No old save to migrate
            }

            const oldSave = JSON.parse(oldSaveStr);

            // Check if slot 0 is already occupied
            const slot0Key = `${SAVE_DATA_PREFIX}0`;
            if (localStorage.getItem(slot0Key) !== null) {
                console.log('[SaveSystem] Slot 0 already has data, skipping migration');
                // Remove old key anyway since we have newer data
                localStorage.removeItem(OLD_SAVE_KEY);
                return false;
            }

            // Save to slot 0
            const saveData: SaveSlotData = {
                player: oldSave.player,
                mathStats: oldSave.mathStats,
                timestamp: oldSave.timestamp || Date.now()
            };

            localStorage.setItem(slot0Key, JSON.stringify(saveData));

            // Set slot 0 as active
            this.setActiveSlot(0);

            // Remove old key
            localStorage.removeItem(OLD_SAVE_KEY);

            console.log('[SaveSystem] Migrated old save to slot 0');
            this.notifyChanges();
            return true;
        } catch (error) {
            console.error('[SaveSystem] Migration failed:', error);
            return false;
        }
    }

    /**
     * Clear all save data (for testing/debug)
     */
    static clearAll(): void {
        if (!this.mayWrite()) return;
        for (let i = 0; i < MAX_SLOTS; i++) {
            const key = `${SAVE_DATA_PREFIX}${i}`;
            localStorage.removeItem(key);
        }
        localStorage.removeItem(ACTIVE_SLOT_KEY);
        localStorage.removeItem(OLD_SAVE_KEY);
        console.log('[SaveSystem] All save data cleared');
        this.notifyChanges();
    }

    /**
     * Get the number of used save slots
     */
    static getUsedSlotCount(): number {
        let count = 0;
        for (let i = 0; i < MAX_SLOTS; i++) {
            const key = `${SAVE_DATA_PREFIX}${i}`;
            if (localStorage.getItem(key) !== null) {
                count++;
            }
        }
        return count;
    }

    /**
     * Find the first empty slot index
     * Returns -1 if all slots are full
     */
    static findFirstEmptySlot(): number {
        for (let i = 0; i < MAX_SLOTS; i++) {
            const key = `${SAVE_DATA_PREFIX}${i}`;
            if (localStorage.getItem(key) === null) {
                return i;
            }
        }
        return -1;
    }

    private static isSaveExportBundle(value: unknown): value is SaveExportBundle {
        if (!this.isRecord(value)
            || value.format !== SAVE_EXPORT_FORMAT
            || value.version !== SAVE_EXPORT_VERSION
            || !Array.isArray(value.saves)
            || value.saves.length === 0
            || value.saves.length > MAX_SLOTS
            || !(value.activeSlot === null || this.isSlotIndex(value.activeSlot))) {
            return false;
        }

        const sourceSlots = new Set<number>();
        for (const entry of value.saves) {
            if (!this.isRecord(entry)
                || !this.isSlotIndex(entry.sourceSlot)
                || sourceSlots.has(entry.sourceSlot)
                || !this.isSaveSlotData(entry.save)) {
                return false;
            }
            sourceSlots.add(entry.sourceSlot);
        }

        return value.activeSlot === null || sourceSlots.has(value.activeSlot);
    }

    private static isSaveSlotData(value: unknown): value is SaveSlotData {
        if (!this.isRecord(value)
            || !this.isRecord(value.player)
            || !this.isRecord(value.mathStats)
            || !Number.isFinite(value.timestamp)) {
            return false;
        }

        const player = value.player;
        const mathStats = value.mathStats;
        return typeof player.name === 'string'
            && Number.isFinite(player.level)
            && Number.isFinite(player.hp)
            && Number.isFinite(player.maxHp)
            && Number.isFinite(player.attack)
            && Number.isFinite(player.defense)
            && Number.isFinite(mathStats.totalAttempts)
            && Number.isFinite(mathStats.correctAnswers)
            && Array.isArray(mathStats.recentResults)
            && this.isRecord(mathStats.problemStats);
    }

    private static isSlotIndex(value: unknown): value is number {
        return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_SLOTS;
    }

    private static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}

import { PlayerState, MathStats, SaveSlotMeta, SaveSlotData } from '../types';

// Storage keys
const SAVE_DATA_PREFIX = 'littleMathAdventure_slot_';       // Per-slot: slot_0, slot_1...
const ACTIVE_SLOT_KEY = 'littleMathAdventure_activeSlot';
const OLD_SAVE_KEY = 'littleMathAdventure_saveData';        // Legacy single-slot key

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

export class SaveSystem {
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
        if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
            console.error(`[SaveSystem] Invalid slot index: ${slotIndex}`);
            return;
        }

        const saveData: SaveSlotData = {
            player,
            mathStats,
            timestamp: Date.now()
        };

        try {
            const key = `${SAVE_DATA_PREFIX}${slotIndex}`;
            localStorage.setItem(key, JSON.stringify(saveData));
            console.log(`[SaveSystem] Game saved to slot ${slotIndex}`);
        } catch (error) {
            console.error('[SaveSystem] Failed to save:', error);
        }
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
        let parsed: unknown;
        try {
            parsed = JSON.parse(serializedBundle);
        } catch {
            return { ok: false, error: 'Soubor není platný JSON.' };
        }

        if (!this.isSaveExportBundle(parsed)) {
            return { ok: false, error: 'Soubor není platný export Little Math Adventure.' };
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

        console.log(`[SaveSystem] Imported ${writtenSlots.length} save slot(s)`);
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
            console.log(`[SaveSystem] Game loaded from slot ${slotIndex}`);
            return saveData;
        } catch (error) {
            console.error('[SaveSystem] Failed to load:', error);
            return null;
        }
    }

    /**
     * Delete a specific save slot
     */
    static deleteSlot(slotIndex: number): void {
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
        for (let i = 0; i < MAX_SLOTS; i++) {
            const key = `${SAVE_DATA_PREFIX}${i}`;
            localStorage.removeItem(key);
        }
        localStorage.removeItem(ACTIVE_SLOT_KEY);
        localStorage.removeItem(OLD_SAVE_KEY);
        console.log('[SaveSystem] All save data cleared');
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

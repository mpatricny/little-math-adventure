import type { SaveSlotData } from '../types';

let observer: ((slot: number, save: SaveSlotData) => void) | undefined;
export function observeGameplaySaves(listener: typeof observer): void { observer = listener; }
export function notifyGameplaySave(slot: number, save: SaveSlotData): void {
    try { observer?.(slot, save); }
    catch { console.warn('[GameplaySync] Could not queue progress'); }
}

/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import plan from '../../../docs/SILVERPOND_UNDERWATER_PLAN.md?raw';
import layoutsJson from '../../../public/assets/data/scenes.json';
import { UNDERWATER_ROOMS, canUseUnderwaterExit, getUnderwaterProgress } from '../UnderwaterProgressSystem';
import type { PlayerState } from '../../types';

const ids = ['sp_shallows', 'sp_bell_hub', 'sp_reed_garden', 'sp_shell_shrine', 'sp_sunken_canal',
    'sp_current_chamber', 'sp_post_wreck', 'sp_wreck_hold', 'sp_glow_grotto', 'sp_depth_gate', 'sp_lake_heart'];
const layouts = layoutsJson.scenes as Record<string, any>;

describe('underwater map and painted passage contract', () => {
    it('gives each existing room exactly the physical connections in the original map, including incoming currents', () => {
        const counts = new Map<string, number>();
        const graph = plan.split('```mermaid')[1].split('```')[0];
        for (const line of graph.split('\n')) {
            const edge = line.match(/^\s*(T|U\d{2})(?:\[[^\]]+\])?\s+(?:<-->(?:\|[^|]+\|)?|-\.[^\n]*?\.->)\s*(T|U\d{2})/);
            if (!edge) continue;
            for (const id of edge.slice(1)) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        expect(counts.size).toBe(12); // Surface + all eleven planned rooms.
        for (const [roomId, room] of Object.entries(UNDERWATER_ROOMS)) {
            const mapId = `U${String(ids.indexOf(roomId) + 1).padStart(2, '0')}`;
            const connections = [...room.exits, ...(room.arrivals ?? []), ...(room.plannedExits ?? [])];
            expect(connections.length, roomId).toBe(counts.get(mapId));
            expect(new Set(connections.map(c => c.host)).size).toBe(connections.length);
            for (const connection of connections) {
                const host = layouts[room.layout].elements.find((e: any) => e.id === connection.host);
                expect(host, `${roomId}/${connection.host}`).toBeDefined();
                expect(host.x - host.width / 2).toBeGreaterThanOrEqual(0);
                expect(host.x + host.width / 2).toBeLessThanOrEqual(1280);
                expect(host.y - host.height / 2).toBeGreaterThanOrEqual(0);
                expect(host.y + host.height / 2).toBeLessThanOrEqual(720);
            }
        }
    });

    it('only unlocks the matching return current and never turns a receiving mouth or unfinished door into an exit', () => {
        const player = {} as PlayerState;
        for (const roomId of ['sp_shell_shrine', 'sp_current_chamber']) {
            expect(canUseUnderwaterExit(player, roomId, 'bell-shortcut')).toBe(false);
        }
        getUnderwaterProgress(player).restoredMechanisms = ['shrine-memory'];
        expect(canUseUnderwaterExit(player, 'sp_shell_shrine', 'bell-shortcut')).toBe(true);
        expect(canUseUnderwaterExit(player, 'sp_current_chamber', 'bell-shortcut')).toBe(false);
        getUnderwaterProgress(player).restoredMechanisms!.push('chamber-routes');
        expect(canUseUnderwaterExit(player, 'sp_current_chamber', 'bell-shortcut')).toBe(true);
        for (const [roomId, room] of Object.entries(UNDERWATER_ROOMS)) {
            for (const inactive of [...(room.arrivals ?? []), ...(room.plannedExits ?? [])]) {
                expect(canUseUnderwaterExit(player, roomId, inactive.id)).toBe(false);
            }
        }
    });

    it('keeps new return touch areas clear of the machine and enemies', () => {
        for (const name of ['UnderwaterShellShrine', 'UnderwaterCurrentChamber']) {
            const elements = layouts[name].elements;
            const door = elements.find((e: any) => e.id === 'exitReturnHost');
            for (const other of elements.filter((e: any) => /^(mechanism|guardian|guardianEscort|exitLeft)Host$/.test(e.id))) {
                const overlaps = Math.abs(door.x - other.x) < (door.width + other.width) / 2
                    && Math.abs(door.y - other.y) < (door.height + other.height) / 2;
                expect(overlaps, `${name}/${other.id}`).toBe(false);
            }
        }
    });
});

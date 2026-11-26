/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import data from '../../../public/assets/data/scenes.json';
import source from '../../scenes/VictoryScene.ts?raw';
import practiceView from '../../ui/PracticeVictoryView.ts?raw';
import battleView from '../../ui/BattleVictoryView.ts?raw';
import victoryFrame from '../../ui/VictoryFrame.ts?raw';
import theme from '../../ui/UnderwaterTheme.ts?raw';

const elements = data.scenes.VictoryScene.elements;
const box = (id: string) => elements.find(e => e.id === id)!;
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
describe('authored victory layout', () => {
    it('fits the creature, rewards, route and controls within the common frame', () => {
        const frame = box('practiceVictoryFrame');
        const safe = frame.data!.safeContentInset!;
        for (const host of elements.filter(e => e.id.startsWith('battleVictory'))) {
            expect(host.x - host.width / 2, host.id).toBeGreaterThanOrEqual(frame.x - frame.width / 2 + safe.left);
            expect(host.x + host.width / 2, host.id).toBeLessThanOrEqual(frame.x + frame.width / 2 - safe.right);
            expect(host.y - host.height / 2, host.id).toBeGreaterThanOrEqual(frame.y - frame.height / 2 + safe.top);
            expect(host.y + host.height / 2, host.id).toBeLessThanOrEqual(frame.y + frame.height / 2 - safe.bottom);
        }
        for (const row of [
            ['battleVictoryCreature', 'battleVictoryRewards'],
            ['battleVictoryRewardTitle', 'battleVictoryOwnerA', 'battleVictoryOwnerB'],
            ['battleVictoryRewards', 'battleVictoryRoute', 'practiceVictoryContinue'],
        ]) row.forEach((id, i) => row.slice(i + 1).forEach(other =>
            expect(overlaps(box(id), box(other)), id + ' / ' + other).toBe(false)));
        const route = box('battleVictoryRoute');
        const inset = route.data!.safeContentInset!;
        for (const [name, r] of Object.entries(route.data!.regions!)) {
            if (!r) continue;
            expect(Math.abs(r.x) + r.width / 2, name).toBeLessThanOrEqual(route.width / 2 - inset.left);
            expect(Math.abs(r.y) + r.height / 2, name).toBeLessThanOrEqual(route.height / 2 - inset.top);
        }
    });
    it('fits the training receipt inside its own frame and separates its actions and rewards', () => {
        const frame = box('practiceVictoryFrame');
        const { left, right, top, bottom } = frame.data!.safeContentInset!;
        const inside = elements.filter(e => e.id.startsWith('practiceVictory') && e !== frame && e.id !== 'practiceVictoryBody');
        for (const host of inside) {
            expect(host.x - host.width / 2, host.id).toBeGreaterThanOrEqual(frame.x - frame.width / 2 + left);
            expect(host.x + host.width / 2, host.id).toBeLessThanOrEqual(frame.x + frame.width / 2 - right);
            expect(host.y - host.height / 2, host.id).toBeGreaterThanOrEqual(frame.y - frame.height / 2 + top);
            expect(host.y + host.height / 2, host.id).toBeLessThanOrEqual(frame.y + frame.height / 2 - bottom);
        }
        for (const row of [
            ['PortraitA', 'PortraitB', 'Coins', 'Loot1', 'Loot2', 'MoreLoot'],
            ['SpeedTitle', 'TimeChange', 'Before', 'After', 'Mana', 'JourneyTitle', 'Journey', 'Continue'],
        ]) {
            row.forEach((id, i) => row.slice(i + 1).forEach(other => {
                expect(overlaps(box('practiceVictory' + id), box('practiceVictory' + other)), id + ' / ' + other).toBe(false);
            }));
        }
        const rail = box('practiceVictoryJourney');
        const inset = rail.data!.safeContentInset!;
        for (const [name, region] of Object.entries(rail.data!.regions!)) {
            if (!region) continue;
            expect(region.x - region.width / 2, name).toBeGreaterThanOrEqual(-rail.width / 2 + inset.left);
            expect(region.x + region.width / 2, name).toBeLessThanOrEqual(rail.width / 2 - inset.right);
            expect(region.y - region.height / 2, name).toBeGreaterThanOrEqual(-rail.height / 2 + inset.top);
            expect(region.y + region.height / 2, name).toBeLessThanOrEqual(rail.height / 2 - inset.bottom);
        }
    });
    it('preserves complete artwork and uses constructor text resolution', () => {
        expect(source + theme + practiceView + victoryFrame + battleView).not.toMatch(/setDisplaySize\(|setResolution\(/);
        expect(source).toContain("this.builder.buildScene('VictoryScene')");
        expect(source).toContain('if (!this.remoteContinueReady || !this.sys.isActive()) return;');
    });
});

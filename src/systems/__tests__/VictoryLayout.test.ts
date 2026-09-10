/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import data from '../../../public/assets/data/scenes.json';
import source from '../../scenes/VictoryScene.ts?raw';
import theme from '../../ui/UnderwaterTheme.ts?raw';

const elements = data.scenes.VictoryScene.elements;
const box = (id: string) => elements.find(e => e.id === id)!;
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
describe('authored victory layout', () => {
    it('keeps normal and worst-case reward sections inside the safe inset', () => {
        const safe = box('victorySafeHost');
        for (const e of elements.filter(e => !['victoryShadeHost', 'victoryFrameHost', 'victorySafeHost'].includes(e.id))) {
            expect(Math.abs(e.x - safe.x) + e.width / 2, e.id).toBeLessThanOrEqual(safe.width / 2);
            expect(Math.abs(e.y - safe.y) + e.height / 2, e.id).toBeLessThanOrEqual(safe.height / 2);
        }
        const common = ['victoryTitleHost', 'victorySubtitleHost', 'victoryNamesHost', 'victoryCoinsHost',
            'victoryStatusHost', 'victoryContinueHost', 'victoryNextHost', 'victoryPageHost'];
        for (const id of common) expect(overlaps(box(id), box('victorySealHost')), id).toBe(false);
        for (const pet of [true, false]) {
            const ids = [...common, ...(pet ? ['victoryPetTitleHost', 'victoryPetHost', 'victoryPetNameHost'] : []),
                ...[0, 1, 2, 3].flatMap(i => [`victory${pet ? 'Pet' : ''}Crystal${i}Host`, `victory${pet ? 'Pet' : ''}CrystalLabel${i}Host`])];
            for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
                expect(overlaps(box(ids[i]), box(ids[j])), `${ids[i]} / ${ids[j]}`).toBe(false);
        }
    });
    it('preserves complete artwork and uses constructor text resolution', () => {
        expect(source + theme).not.toMatch(/setDisplaySize\(|setResolution\(/);
        expect(source).toContain("this.builder.buildScene('VictoryScene')");
        expect(source).toContain('if (!this.remoteContinueReady) return;');
        expect(source).toContain('Math.ceil(crystals.length / perPage)');
    });
});

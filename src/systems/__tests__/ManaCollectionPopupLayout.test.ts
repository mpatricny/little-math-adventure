import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';
import texturesJson from '../../../public/assets/data/textures.json';

type SceneElement = {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
};

describe('Mana collection popup UI', () => {
    const scene = (scenesJson.scenes as unknown as Record<string, { elements: SceneElement[] }>).ManaCollectionScene;
    const elements = new Map(scene.elements.map(element => [element.id, element]));
    const source = readFileSync(resolve('src/scenes/ManaCollectionScene.ts'), 'utf8');

    it('uses the production mana frame asset', () => {
        const texturePath = (texturesJson.images as Record<string, string>)['mana-popup-frame-v2'];
        expect(texturePath).toBe('ui/mana/popup-v2/mana-popup-frame-v2.png');
        expect(existsSync(resolve('public/assets', texturePath))).toBe(true);
        expect(source).toContain("'mana-popup-frame-v2'");
    });

    it('keeps both popup states editable through scene hosts', () => {
        const requiredHosts = [
            'manaIntroPopupHost',
            'manaIntroTitleHost',
            'manaIntroObjectiveHost',
            'manaIntroDemoHost',
            'manaIntroRewardHost',
            'manaIntroBackHost',
            'manaIntroPlayHost',
            'manaResultsPopupHost',
            'manaResultsTitleHost',
            'manaResultsContinueHost',
            ...['A', 'B', 'solo'].flatMap(id => [
                ...['Card', 'Name', 'CorrectIcon', 'CorrectValue', 'ManaIcon', 'ManaValue'].map(role => `manaResult${id}${role}Host`),
                ...['Title', 'Lives', 'Mana', 'Score', 'Next', 'Gain', 'Button'].map(role => `manaLane${id}${role}Host`),
            ]),
        ];

        requiredHosts.forEach(id => {
            const host = elements.get(id);
            expect(host, `${id} must stay editable in scenes.json`).toBeDefined();
            expect(host?.width, `${id} needs an explicit width`).toBeGreaterThan(0);
            expect(host?.height, `${id} needs an explicit height`).toBeGreaterThan(0);
        });
    });

    it('keeps localized labels out of the bitmap and fits them at runtime', () => {
        expect(source).toContain('fitTextToHost');
        expect(source).toContain('new MedievalActionButton');
        expect(source).not.toContain('const innerPanel = this.add.rectangle');
        expect(source).not.toContain('VISUAL_QA_ONLY');
    });

    it('keeps mana collection free to start', () => {
        expect(source).not.toContain('PLAY_COST');
        expect(source).not.toContain('spendCoins');
        expect(source).not.toContain('NEDOSTATEK MINCÍ');
    });

    it('gives result icons and touch controls ample room', () => {
        for (const id of ['A', 'B', 'solo']) {
            expect(elements.get(`manaResult${id}CorrectIconHost`)?.width).toBeGreaterThanOrEqual(80);
            expect(elements.get(`manaResult${id}ManaIconHost`)?.height).toBeGreaterThanOrEqual(100);
            // 1024px tablet renders the 1280px board at 0.8 scale.
            expect(elements.get(`manaLane${id}ButtonHost`)!.height! * 0.8).toBeGreaterThanOrEqual(44);
        }
    });
});

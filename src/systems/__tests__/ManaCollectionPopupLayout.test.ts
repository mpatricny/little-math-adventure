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
    const scene = (scenesJson.scenes as Record<string, { elements: SceneElement[] }>).ManaCollectionScene;
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
            'manaIntroRulesHost',
            'manaIntroRewardHost',
            'manaIntroBackHost',
            'manaIntroPlayHost',
            'manaResultsPopupHost',
            'manaResultsTitleHost',
            'manaResultsStatsHost',
            'manaResultsContinueHost',
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
        expect(source).toContain('VSTUP ZDARMA');
        expect(source).not.toContain('PLAY_COST');
        expect(source).not.toContain('spendCoins');
        expect(source).not.toContain('NEDOSTATEK MINCÍ');
    });
});

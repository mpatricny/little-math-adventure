import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';
import { TvFullscreenController } from '../../remote/TvFullscreenController';

type JsonObject = Record<string, any>;

const menu = (scenesJson.scenes as JsonObject).MenuScene;
const menuEntries = [...menu.elements, ...menu.ui] as JsonObject[];
const menuById = new Map(menuEntries.map(entry => [entry.id, entry]));

describe('Menu save transfer and fullscreen controls', () => {
    it('keeps every visible control represented by a Scene Editor host', () => {
        expect(menuById.get('btnFullscreenHost')).toMatchObject({
            asset: 'ui.containers.empty', width: 270, height: 62,
        });
        expect(menuById.get('btnExportSavesHost')).toMatchObject({
            asset: 'ui.containers.empty', width: 210, height: 62,
        });
        expect(menuById.get('btnImportSavesHost')).toMatchObject({
            asset: 'ui.containers.empty', width: 210, height: 62,
        });
        expect(menuById.get('btnImportSavesOnlyHost')).toMatchObject({
            asset: 'ui.containers.empty', width: 230, height: 62,
        });
        expect(menuById.get('saveTransferNoticeHost')).toMatchObject({
            asset: 'ui.containers.empty', width: 720, height: 48,
        });
    });

    it('keeps save transfer buttons clear of primary and test controls', () => {
        const overlaps = (a: JsonObject, b: JsonObject, defaultWidth: number, defaultHeight: number) => {
            const overlapsX = Math.abs(a.x - b.x) < ((a.width ?? defaultWidth) + (b.width ?? defaultWidth)) / 2;
            const overlapsY = Math.abs(a.y - b.y) < ((a.height ?? defaultHeight) + (b.height ?? defaultHeight)) / 2;
            return overlapsX && overlapsY;
        };

        const exportButton = menuById.get('btnExportSavesHost')!;
        const importButton = menuById.get('btnImportSavesHost')!;
        const importOnlyButton = menuById.get('btnImportSavesOnlyHost')!;
        expect(overlaps(exportButton, menuById.get('btnCoop')!, 380, 92)).toBe(false);
        expect(overlaps(importButton, menuById.get('btnCoop')!, 380, 92)).toBe(false);
        expect(overlaps(importButton, menuById.get('btnUnderwaterAdventure')!, 350, 62)).toBe(false);
        expect(overlaps(importOnlyButton, menuById.get('btnCoopNoSave')!, 380, 92)).toBe(false);
    });

    it('uses explicit save-file and fullscreen controls instead of a silent first-touch request', () => {
        const menuSource = readFileSync(resolve('src/scenes/MenuScene.ts'), 'utf8');
        const fullscreenSource = readFileSync(resolve('src/remote/TvFullscreenController.ts'), 'utf8');

        expect(menuSource).toContain('SaveSystem.exportBundle()');
        expect(menuSource).toContain('SaveSystem.importBundle(fileResult.contents)');
        expect(menuSource).toContain("getHostLayout('btnFullscreenHost'");
        expect(menuSource).not.toContain("this.input.once('pointerdown'");
        expect(fullscreenSource).toContain("navigationUI: 'hide'");
    });

    it('requests hidden browser navigation UI and reports the real fullscreen state', async () => {
        let receivedOptions: FullscreenOptions | undefined;
        const fakeDocument = {
            fullscreenElement: null as Element | null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        };
        const fakeElement = {
            requestFullscreen: async (options?: FullscreenOptions) => {
                receivedOptions = options;
                fakeDocument.fullscreenElement = fakeElement as unknown as Element;
            },
        };
        const controller = new TvFullscreenController(
            fakeElement as unknown as HTMLElement,
            fakeDocument as unknown as Document,
        );

        await expect(controller.enter()).resolves.toBe(true);
        expect(receivedOptions).toMatchObject({ navigationUI: 'hide' });
        expect(controller.getState()).toBe('fullscreen');
    });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';

type JsonObject = Record<string, any>;

const scenes = scenesJson.scenes as JsonObject;
const battleEntries = [...scenes.BattleScene.elements, ...scenes.BattleScene.ui] as JsonObject[];
const battleById = new Map(battleEntries.map(entry => [entry.id, entry]));
const pairingEntries = [...scenes.TvPairingScene.elements, ...scenes.TvPairingScene.ui] as JsonObject[];
const pairingById = new Map(pairingEntries.map(entry => [entry.id, entry]));
const walkingEntries = [...scenes.WalkingHudOverlay.elements, ...scenes.WalkingHudOverlay.ui] as JsonObject[];
const walkingById = new Map(walkingEntries.map(entry => [entry.id, entry]));

describe('in-game fullscreen and optional TV pairing', () => {
    it('keeps fullscreen inside the battle pause menu instead of beside it', () => {
        expect(battleById.has('battleFullscreenButtonHost')).toBe(false);
        expect(battleById.get('battlePauseFullscreenHost')).toMatchObject({
            asset: 'ui.containers.empty',
            width: 300,
            height: 52,
        });
    });

    it('keeps the expanded battle pause menu editable and non-overlapping', () => {
        const requiredHosts = [
            'battlePauseOverlayHost',
            'battlePausePanelHost',
            'battlePauseTitleHost',
            'battlePauseResumeHost',
            'battlePauseFullscreenHost',
            'battlePauseTvHost',
            'battlePauseQuitHost',
        ];
        requiredHosts.forEach(id => expect(battleById.get(id)?.asset, id).toBe('ui.containers.empty'));

        const resume = battleById.get('battlePauseResumeHost')!;
        const fullscreen = battleById.get('battlePauseFullscreenHost')!;
        const tv = battleById.get('battlePauseTvHost')!;
        const quit = battleById.get('battlePauseQuitHost')!;
        expect(fullscreen.y - resume.y).toBeGreaterThan((fullscreen.height + resume.height) / 2);
        expect(tv.y - fullscreen.y).toBeGreaterThan((tv.height + fullscreen.height) / 2);
        expect(quit.y - tv.y).toBeGreaterThan((quit.height + tv.height) / 2);
    });

    it('opens a menu-or-fullscreen choice from the walking town HUD', () => {
        const walkingHudSource = readFileSync(resolve('src/ui/WalkingSceneHud.ts'), 'utf8');
        [
            'walkingMenuOverlayHost',
            'walkingMenuPanelHost',
            'walkingMenuTitleHost',
            'walkingMenuResumeHost',
            'walkingMenuFullscreenHost',
            'walkingMenuQuitHost',
        ].forEach(id => expect(walkingById.get(id)?.asset, id).toBe('ui.containers.empty'));

        expect(walkingHudSource).toContain('onMenu: () => this.menuOverlay.show()');
        expect(walkingHudSource).toContain("showFullscreen: true");
        expect(walkingHudSource).toContain("quitLabel: 'ZPĚT DO MENU'");
    });

    it('starts TV pairing only from an explicit route or settings action', () => {
        const indexSource = readFileSync(resolve('index.html'), 'utf8');
        const bootSource = readFileSync(resolve('src/scenes/BootScene.ts'), 'utf8');
        const pauseMenuSource = readFileSync(resolve('src/ui/PauseMenu.ts'), 'utf8');

        expect(indexSource).not.toContain('id="boot-status"');
        expect(indexSource).not.toContain('Nacitam Little Math Adventure TV');
        expect(indexSource).toContain('id="boot-error"');
        expect(bootSource).toContain("isTvMode() ? 'TvPairingScene' : 'MenuScene'");
        expect(pauseMenuSource).toContain("'PROPOJIT S TV'");
        expect(pauseMenuSource).toContain("this.scene.scene.launch('TvPairingScene', { returnScene })");
    });

    it('authors every TV pairing screen element as a Scene Editor host', () => {
        [
            'tvPairingBackgroundHost',
            'tvPairingPanelHost',
            'tvPairingTitleHost',
            'tvPairingStatusHost',
            'tvPairingRoomHost',
            'tvPairingUrlHost',
            'tvPairingHelpHost',
            'tvPairingBackButtonHost',
            'tvPairingFullscreenButtonHost',
        ].forEach(id => expect(pairingById.get(id)?.asset, id).toBe('ui.containers.empty'));
    });
});

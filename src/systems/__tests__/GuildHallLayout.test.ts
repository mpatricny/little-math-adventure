import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';
import texturesJson from '../../../public/assets/data/textures.json';
import assetsJson from '../../../public/assets/data/assets.json';

type JsonObject = Record<string, any>;

const guildScene = (scenesJson.scenes as JsonObject).GuildScene;
const guildElements = [...guildScene.elements, ...guildScene.ui] as JsonObject[];
const guildElementsById = new Map(guildElements.map(element => [element.id, element]));

describe('Guild Hall layout contract', () => {
    it('keeps every main interaction editable through a scenes.json host', () => {
        const requiredHosts = [
            'zyxGuide',
            'nextExamProgressHost',
            'challengePanelHost',
            'challengeActionHost',
            'manaSpringHost',
            'manaSpringLabelHost',
            'catacombDoorHost',
            'catacombLabelHost',
            'learningButtonHost',
            'dailyProgressButtonHost',
            'learningMapOverlayHost',
            'dailyProgressOverlayHost',
            'coopSwitchHost',
            'toastHost',
            'backButton',
        ];

        requiredHosts.forEach(id => {
            expect(guildElementsById.has(id), `${id} must stay editable in scenes.json`).toBe(true);
        });
    });

    it('keeps the user-tuned Zyx and exam-progress positions shared by both guilds', () => {
        expect(guildElementsById.get('zyxGuide')).toMatchObject({
            x: 270,
            y: 529,
            scaleX: 0.53,
            scaleY: 0.53,
        });
        expect(guildElementsById.get('zyxGuide')).not.toHaveProperty('scale');
        expect(guildElementsById.get('nextExamProgressHost')).toMatchObject({
            x: 232,
            y: 282,
        });

        const silverpondSource = readFileSync(resolve('src/scenes/SilverpondGuildMockScene.ts'), 'utf8');
        expect(silverpondSource).toContain("layoutSceneKey: 'GuildScene'");
    });

    it('does not expose the removed per-problem mana collection UI', () => {
        expect(guildElementsById.has('collectButton')).toBe(false);
        expect(guildElementsById.has('resultsTable')).toBe(false);
        expect(guildElementsById.has('listPanel')).toBe(false);

        const guildSource = readFileSync(resolve('src/scenes/GuildScene.ts'), 'utf8');
        const mathEngineSource = readFileSync(resolve('src/systems/MathEngine.ts'), 'utf8');
        const manaLaneSource = readFileSync(resolve('src/ui/ManaPlayerLane.ts'), 'utf8');
        const manaSceneSource = readFileSync(resolve('src/scenes/ManaCollectionScene.ts'), 'utf8');
        expect(guildSource).not.toContain('collectAllMana');
        expect(guildSource).not.toContain('manaCollected');
        expect(mathEngineSource).not.toContain('getCollectableMana');
        expect(mathEngineSource).not.toContain('collectAllMana');
        expect(manaLaneSource).not.toContain('problem.stats.manaCollected');
        expect(manaLaneSource).not.toContain('manaEarnedThreshold');
        expect(manaLaneSource).not.toContain('collectManaForProblem');
        expect(manaSceneSource).not.toContain('Mana ze studijních cílů');
    });

    it('presents the mana spring as a free minigame', () => {
        const guildSource = readFileSync(resolve('src/ui/GuildHallUI.ts'), 'utf8');
        const manaSceneSource = readFileSync(resolve('src/scenes/ManaCollectionScene.ts'), 'utf8');

        expect(guildSource).toContain('MINIHRA · ZDARMA');
        expect(guildSource).not.toContain('MANA_COLLECTION_PLAY_COST');
        expect(guildSource).not.toContain('NEDOSTATEK MINCÍ');
        expect(manaSceneSource).not.toContain('spendCoins');
        expect(manaSceneSource).not.toContain('PLAY_COST');
    });

    it('registers existing 1280x720 backgrounds for both towns', () => {
        const images = texturesJson.images as JsonObject;
        const backgroundKeys = [
            'interior-guild',
            'silverpond-guild-interior-mock-bg',
        ];

        backgroundKeys.forEach(key => {
            expect(images[key], key).toBeDefined();
            expect(existsSync(resolve('public/assets', images[key]))).toBe(true);
        });

        expect(guildElementsById.get('interior')).toMatchObject({
            width: 1280,
            height: 720,
        });
    });

    it('connects the Silverpond guild door to the themed scene', () => {
        const townSource = readFileSync(resolve('src/scenes/SilverpondTownMockScene.ts'), 'utf8');
        expect(townSource).toContain("destinationScene: 'SilverpondGuildMockScene'");
    });

    it('uses the learning-map and daily-progress entry points instead of the exam list', () => {
        const guildSource = readFileSync(resolve('src/ui/GuildHallUI.ts'), 'utf8');
        const sceneSource = readFileSync(resolve('src/scenes/GuildScene.ts'), 'utf8');
        expect(guildSource).toContain("label: 'MAPA UČENÍ'");
        expect(guildSource).toContain("label: 'DENNÍ POKROK'");
        expect(guildSource).toContain("frameTexture: 'guild-nav-frame-v2'");
        expect(guildSource).toContain("normalIcon: { texture: 'guild-map-normal-v2' }");
        expect(guildSource).toContain("normalIcon: { texture: 'guild-daily-normal-v2' }");
        expect(guildSource).toContain('dailyProgressButtonHost');
        expect(guildSource).not.toContain('onShowExams');
        expect(sceneSource).toContain('DailyProgressOverlay');
        expect(sceneSource).not.toContain('new ExamsOverlay');
    });

    it('uses mastery exam data for progress and states count-only medal rules', () => {
        const hallSource = readFileSync(resolve('src/ui/GuildHallUI.ts'), 'utf8');
        const examSource = readFileSync(resolve('src/scenes/GuildScene.ts'), 'utf8');

        expect(hallSource).toContain('getNextSubAtomExamProgress');
        expect(hallSource).not.toContain('getMasteryPercentage');
        expect(hallSource).not.toContain('Stříbro/zlato: správně do');
        expect(examSource).toContain('medaile podle počtu správných odpovědí');
        expect(examSource).toContain('BRONZ\\n${config.bronzeThreshold}+ SPRÁVNĚ');
        expect(examSource).toContain('STŘÍBRO\\n${config.silverThreshold}+ SPRÁVNĚ');
        expect(examSource).toContain('ZLATO\\n${config.goldThreshold}+ SPRÁVNĚ');
        expect(examSource).not.toContain('+ DO ${config.timePerItem} S');
    });

    it('keeps guild navigation art undistorted, inside the viewport, and non-overlapping', () => {
        const images = texturesJson.images as JsonObject;
        const framePath = resolve('public/assets', images['guild-nav-frame-v2']);
        const framePng = readFileSync(framePath);
        const frameWidth = framePng.readUInt32BE(16);
        const frameHeight = framePng.readUInt32BE(20);
        const frameAspect = frameWidth / frameHeight;

        const learning = guildElementsById.get('learningButtonHost');
        const daily = guildElementsById.get('dailyProgressButtonHost');
        const coop = guildElementsById.get('coopSwitchHost');
        if (!learning || !daily || !coop) throw new Error('Guild navigation hosts are missing');

        expect(Math.abs(learning.width / learning.height - frameAspect)).toBeLessThan(0.05);
        expect(Math.abs(daily.width / daily.height - frameAspect)).toBeLessThan(0.05);
        expect(learning.x + learning.width / 2).toBeLessThanOrEqual(daily.x - daily.width / 2);
        expect(daily.x + daily.width / 2).toBeLessThanOrEqual(coop.x - coop.width / 2);
        expect(learning.y + learning.height / 2).toBeLessThanOrEqual(720);
        expect(daily.y + daily.height / 2).toBeLessThanOrEqual(720);

        [
            'guild-nav-frame-v2',
            'guild-map-normal-v2',
            'guild-map-active-v2',
            'guild-daily-normal-v2',
            'guild-daily-active-v2',
        ].forEach(textureKey => {
            expect(existsSync(resolve('public/assets', images[textureKey])), textureKey).toBe(true);
        });

        const buttonSource = readFileSync(resolve('src/ui/MedievalActionButton.ts'), 'utf8');
        expect(buttonSource).toContain('fitLabelToBounds');
        expect(buttonSource).toContain('labelMaxWidth');
        expect(buttonSource).toContain('labelMaxHeight');
    });

    it('uses Zyx and environmental light hovers instead of outlined hit areas', () => {
        const guildSource = readFileSync(resolve('src/ui/GuildHallUI.ts'), 'utf8');
        expect((assetsJson.characters as JsonObject).npcs.zyx).toMatchObject({
            type: 'animatedSprite',
            defaultTexture: 'spritesheet-zyx-transparent2-sheet',
        });
        expect(guildElementsById.get('zyxGuide')?.asset).toBe('characters.npcs.zyx');
        expect(guildSource).not.toContain('const labelBg');
        expect(guildSource).toContain('MedievalActionButton');
        expect(guildSource).toContain('createEnvironmentalCaption');

        const springInteraction = guildSource.slice(
            guildSource.indexOf('private createManaSpringInteraction'),
            guildSource.indexOf('private getManaSpringAccess'),
        );
        const catacombInteraction = guildSource.slice(
            guildSource.indexOf('private createCatacombInteraction'),
            guildSource.indexOf('private createEnvironmentalCaption'),
        );
        expect(springInteraction).not.toContain('strokeRoundedRect');
        expect(catacombInteraction).not.toContain('strokeRoundedRect');
        expect(springInteraction).not.toContain('new MedievalActionButton');
        expect(catacombInteraction).not.toContain('new MedievalActionButton');
    });

    it('keeps the complete challenge UI inside the painted black board inset', () => {
        const board = guildElementsById.get('challengePanelHost');
        const action = guildElementsById.get('challengeActionHost');
        if (!board || !action) throw new Error('Guild board hosts are missing');
        expect(board).toMatchObject({ x: 658, y: 328, width: 256, height: 196 });

        const boardBounds = {
            left: board.x - board.width / 2,
            right: board.x + board.width / 2,
            top: board.y - board.height / 2,
            bottom: board.y + board.height / 2,
        };
        expect(boardBounds.left).toBeGreaterThanOrEqual(524);
        expect(boardBounds.right).toBeLessThanOrEqual(792);
        expect(boardBounds.top).toBeGreaterThanOrEqual(228);
        expect(boardBounds.bottom).toBeLessThanOrEqual(428);

        expect(action.x - action.width / 2).toBeGreaterThanOrEqual(boardBounds.left);
        expect(action.x + action.width / 2).toBeLessThanOrEqual(boardBounds.right);
        expect(action.y - action.height / 2).toBeGreaterThanOrEqual(boardBounds.top);
        expect(action.y + action.height / 2).toBeLessThanOrEqual(boardBounds.bottom);
    });
});

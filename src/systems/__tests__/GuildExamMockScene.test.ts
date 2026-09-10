import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';

type JsonObject = Record<string, any>;

const scenes = scenesJson.scenes as JsonObject;
const mockScene = scenes.GuildExamMockScene;
const mockEntries = [...mockScene.elements, ...mockScene.ui] as JsonObject[];
const mockById = new Map(mockEntries.map(entry => [entry.id, entry]));
const menuEntries = [...scenes.MenuScene.elements, ...scenes.MenuScene.ui] as JsonObject[];
const menuById = new Map(menuEntries.map(entry => [entry.id, entry]));

describe('Guild exam standalone mock', () => {
    it('keeps its editor layout while the retired shortcut hosts the underwater playtest', () => {
        expect(mockById.get('guildExamMockBackground')?.asset)
            .toBe('environments.interiors.guild-interior');
        expect(menuById.get('btnUnderwaterAdventure')).toMatchObject({
            asset: 'ui.containers.empty',
            width: 350,
            height: 62,
        });

        [
            'overviewOverlay',
            'trialOverlay',
            'feedbackOverlay',
            'resultsOverlay',
            'trialBoardHost',
            'trialHeaderHost',
            'trialProgressHost',
            'trialProblemHost',
            'answerButton1',
            'answerButton2',
            'answerButton3',
            'trialOverviewActionHost',
            'trialFeedbackActionHost',
            'trialResultsActionHost',
        ].forEach(id => expect(mockById.has(id), `${id} must be editable`).toBe(true));
    });

    it('keeps the shortcut clear of the three primary menu buttons', () => {
        const shortcut = menuById.get('btnUnderwaterAdventure');
        ['btnContinue', 'btnNewGame', 'btnCoop'].forEach(id => {
            const primary = menuById.get(id);
            const primaryWidth = 380;
            const primaryHeight = 92;
            const overlapsX = Math.abs(shortcut.x - primary.x) < (shortcut.width + primaryWidth) / 2;
            const overlapsY = Math.abs(shortcut.y - primary.y) < (shortcut.height + primaryHeight) / 2;
            expect(overlapsX && overlapsY, `${id} overlaps the mock shortcut`).toBe(false);
        });
    });

    it('uses only local mock state and no profile, mastery or save systems', () => {
        const source = readFileSync(resolve('src/scenes/GuildExamMockScene.ts'), 'utf8');
        expect(source).toContain("super({ key: 'GuildExamMockScene' })");
        expect(source).toContain("buildScene('GuildExamMockScene')");
        expect(source).toContain('createGuildExamBoard');
        expect(source).toContain('new MedievalActionButton');
        expect(source).not.toContain('GameStateManager');
        expect(source).not.toContain('MasterySystem');
        expect(source).not.toContain('SaveSystem');
        expect(source).not.toContain('localStorage');
    });

    it('uses the production count-only medal thresholds', () => {
        const source = readFileSync(resolve('src/scenes/GuildExamMockScene.ts'), 'utf8');

        expect(source).toContain('const MOCK_EXAM_CONFIG = EXAM_CONFIGS.sub_atom');
        expect(source).toContain('${MOCK_EXAM_CONFIG.bronzeThreshold}+ SPRÁVNĚ');
        expect(source).toContain('${MOCK_EXAM_CONFIG.silverThreshold}+ SPRÁVNĚ');
        expect(source).toContain('${MOCK_EXAM_CONFIG.goldThreshold}+ SPRÁVNĚ');
        expect(source).not.toContain("correct === 8 ? 'gold'");
    });

    it('keeps the legacy scene registered but routes the menu to the underwater playtest', () => {
        const mainSource = readFileSync(resolve('src/main.ts'), 'utf8');
        const menuSource = readFileSync(resolve('src/scenes/MenuScene.ts'), 'utf8');
        expect(mainSource).toContain("import { GuildExamMockScene } from './scenes/GuildExamMockScene'");
        expect(mainSource).toContain('GuildScene, GuildExamMockScene, SilverpondGuildMockScene');
        expect(menuSource).not.toContain("this.scene.start('GuildExamMockScene')");
        expect(menuSource).toContain("this.scene.start('UnderwaterRoomScene', { preview: true, fromSurface: true })");
        expect(menuSource).toContain("iconTexture: 'menu-icon-test-scene'");
    });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';

type JsonObject = Record<string, any>;

const guildScene = (scenesJson.scenes as JsonObject).GuildScene;
const entries = [...guildScene.elements, ...guildScene.ui] as JsonObject[];
const byId = new Map(entries.map(entry => [entry.id, entry]));

describe('Guild exam medieval layout', () => {
    it('keeps every phase and major visual region editable in scenes.json', () => {
        const requiredHosts = [
            'trialOverlay',
            'overviewOverlay',
            'feedbackOverlay',
            'resultsOverlay',
            'trialBoardHost',
            'trialHeaderHost',
            'trialProgressHost',
            'trialProblemHost',
            'answerButton1',
            'answerButton2',
            'answerButton3',
            'trialHintHost',
            'trialMedalsHost',
            'trialOverviewActionHost',
            'trialCancelHost',
            'trialFeedbackHeaderHost',
            'trialFeedbackVisualHost',
            'trialFeedbackActionHost',
            'trialResultsHeaderHost',
            'trialResultsScoreHost',
            'trialResultsGridHost',
            'trialRewardHost',
            'trialResultMessageHost',
            'trialResultsActionHost',
        ];

        requiredHosts.forEach(id => {
            expect(byId.has(id), `${id} must stay editable in scenes.json`).toBe(true);
        });
    });

    it('replaces the legacy timer and flat answer definitions', () => {
        ['timerFrame', 'timerBar', 'trialTitle', 'scoreText', 'progressDots'].forEach(id => {
            expect(byId.has(id)).toBe(false);
        });

        ['answerButton1', 'answerButton2', 'answerButton3'].forEach(id => {
            expect(byId.get(id)?.asset).toBe('ui.containers.empty');
        });
    });

    it('keeps the three answer controls inside the board and non-overlapping', () => {
        const board = byId.get('trialBoardHost');
        const answers = ['answerButton1', 'answerButton2', 'answerButton3']
            .map(id => byId.get(id));

        answers.forEach(answer => {
            expect(answer.x - answer.width / 2).toBeGreaterThanOrEqual(board.x - board.width / 2);
            expect(answer.x + answer.width / 2).toBeLessThanOrEqual(board.x + board.width / 2);
            expect(answer.y - answer.height / 2).toBeGreaterThanOrEqual(board.y - board.height / 2);
            expect(answer.y + answer.height / 2).toBeLessThanOrEqual(board.y + board.height / 2);
        });
        for (let index = 1; index < answers.length; index++) {
            const previous = answers[index - 1];
            const current = answers[index];
            expect(previous.x + previous.width / 2).toBeLessThanOrEqual(current.x - current.width / 2);
        }
    });

    it('uses the shared medieval button and the Guild exam theme', () => {
        const sceneSource = readFileSync(resolve('src/scenes/GuildScene.ts'), 'utf8');
        const themeSource = readFileSync(resolve('src/ui/GuildExamTheme.ts'), 'utf8');

        expect(sceneSource).toContain("frameTexture: 'guild-nav-frame-v2'");
        expect(sceneSource).toContain('new MedievalActionButton');
        expect(sceneSource).toContain('createGuildExamBoard');
        expect(sceneSource).toContain('getLocalHost');
        expect(themeSource).toContain('dark oak, steel, parchment and crystal');
        expect(themeSource).not.toContain("fontFamily: 'Arial");
    });
});

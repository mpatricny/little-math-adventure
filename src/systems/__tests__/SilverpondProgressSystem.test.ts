import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';
import type { PlayerState } from '../../types';
import {
    getPlayerResumeScene,
    shouldBackfillLakeFairyReward,
} from '../SilverpondProgressSystem';

function player(options: {
    unlocked?: boolean;
    completedIntro?: boolean;
    scale?: boolean;
    completedArenaLevels?: number[];
} = {}): PlayerState {
    return {
        storyProgress: options.unlocked === undefined
            ? undefined
            : {
                hasUnlockedSilverpond: options.unlocked,
                hasCompletedIntro: options.completedIntro,
                hasWaterBreathingScale: options.scale ?? false,
            },
        arena: {
            completedArenaLevels: options.completedArenaLevels ?? [],
        },
    } as PlayerState;
}

describe('Silverpond production playthrough', () => {
    it('resumes in Silverpond only after the region has been reached', () => {
        expect(getPlayerResumeScene(player())).toBe('TownScene');
        expect(getPlayerResumeScene(player({ unlocked: false }))).toBe('TownScene');
        expect(getPlayerResumeScene(player({ unlocked: true }))).toBe('SilverpondTownMockScene');
    });

    it('resumes an explicitly unfinished intro at the crash site', () => {
        expect(getPlayerResumeScene(player({ unlocked: false, completedIntro: false })))
            .toBe('CrashSiteScene');
        expect(getPlayerResumeScene(player({ unlocked: false, completedIntro: true })))
            .toBe('TownScene');
    });

    it('backfills the fairy scale for compatible completed saves', () => {
        expect(shouldBackfillLakeFairyReward(player({
            unlocked: true,
            completedArenaLevels: [1, 2, 3, 4, 5, 6],
        }))).toBe(true);
        expect(shouldBackfillLakeFairyReward(player({
            unlocked: true,
            scale: true,
            completedArenaLevels: [1, 2, 3, 4, 5, 6],
        }))).toBe(false);
        expect(shouldBackfillLakeFairyReward(player({
            unlocked: false,
            completedArenaLevels: [1, 2, 3, 4, 5, 6],
        }))).toBe(false);
        expect(shouldBackfillLakeFairyReward(player({
            unlocked: true,
            completedArenaLevels: [1, 2, 3],
        }))).toBe(false);
    });

    it('keeps every Silverpond story anchor editable in scenes.json', () => {
        const guild = (scenesJson.scenes as Record<string, any>).GuildScene;
        const reward = (scenesJson.scenes as Record<string, any>).SilverpondFairyRewardScene;
        const menu = (scenesJson.scenes as Record<string, any>).MenuScene;
        const guildIds = new Set([...guild.elements, ...guild.ui].map((entry: any) => entry.id));
        const rewardIds = new Set([...reward.elements, ...reward.ui].map((entry: any) => entry.id));
        const menuIds = new Set([...menu.elements, ...menu.ui].map((entry: any) => entry.id));

        [
            'silverpondQuestMarkerHost',
            'silverpondQuestZyxHitHost',
            'silverpondQuestOverlayHost',
            'silverpondQuestDialogHost',
            'silverpondQuestSymbolHost',
            'silverpondQuestTextHost',
            'silverpondQuestButtonHost',
        ].forEach(id => expect(guildIds.has(id), `${id} is missing`).toBe(true));
        [
            'fairyRewardBackground',
            'fairyRewardFairy',
            'fairyRewardPlayerHost',
            'fairyRewardOverlayHost',
            'fairyRewardDialogHost',
            'fairyRewardPortraitHost',
            'fairyRewardSymbolHost',
            'fairyRewardTextHost',
            'fairyRewardButtonHost',
            'fairyRewardTitleHost',
            'fairyRewardQuestHost',
        ].forEach(id => expect(rewardIds.has(id), `${id} is missing`).toBe(true));
        expect(menuIds.has('btnSilverpondFairyReward')).toBe(true);
        expect(reward.elements.find((entry: any) => entry.id === 'fairyRewardBackground')?.asset)
            .toBe('library.image.silverpond-fairy-reward');
    });

    it('uses generated production art and exposes the reward from the menu', () => {
        const rewardSource = readFileSync(
            resolve('src/scenes/SilverpondFairyRewardScene.ts'),
            'utf8',
        );
        const menuSource = readFileSync(resolve('src/scenes/MenuScene.ts'), 'utf8');

        expect(rewardSource).toContain("'silverpond-lake-fairy-idle'");
        expect(rewardSource).toContain("'silverpond-lake-fairy-give'");
        expect(rewardSource).toContain("'silverpond-fairy-reward-frame'");
        expect(rewardSource).toContain("'silverpond-water-breathing-scale'");
        expect(rewardSource).not.toContain('.add.graphics(');
        expect(rewardSource).not.toContain('drawFairy(');
        expect(rewardSource).not.toContain('drawScale(');

        expect(menuSource).toContain("this.scene.start('SilverpondFairyRewardScene'");
        expect(menuSource).toContain("label: 'SILVERPOND: DAR VÍLY'");
    });

    it('promotes every Silverpond building and its water arena to persistent play', () => {
        const files = [
            'SilverpondShopMockScene.ts',
            'SilverpondPythiaWorkshopMockScene.ts',
            'SilverpondCrystalForgeMockScene.ts',
            'SilverpondGuildMockScene.ts',
            'SilverpondArenaMockScene.ts',
        ];
        files.forEach(file => {
            const source = readFileSync(resolve('src/scenes', file), 'utf8');
            expect(source).toContain('persistChanges: true');
            expect(source).not.toContain('persistChanges: false');
        });

        const arena = readFileSync(resolve('src/scenes/SilverpondArenaMockScene.ts'), 'utf8');
        expect(arena).toContain("arenaStory: 'silverpond-lake-fairy'");
        expect(arena).toContain("cityId: 'silverpond'");
    });
});

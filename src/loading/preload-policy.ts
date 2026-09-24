/** Forecasts, not progression gates. Only registered scenes are considered. */
const opening = ['MenuNewScene', 'CharacterSelectNewScene', 'BandSelectScene', 'TownScene', 'ArenaScene', 'BattleScene', 'VictoryScene'];
const town = ['ArenaScene', 'BattleScene', 'VictoryScene', 'ShopScene', 'GuildScene', 'ManaCollectionScene', 'CatacombTrialScene', 'CrystalForgeScene', 'PythiaWorkshopScene', 'TavernScene'];
const forest = ['ForestAdventureStartScene', 'ForestRoomScene', 'BattleScene', 'ForestRiddleScene', 'LetterLockPuzzleScene', 'SpinLockPuzzleScene', 'ForestCampScene', 'GuardianLairScene', 'ForestCrystalRewardScene'];
const lake = ['SilverpondTownMockScene', 'SilverpondArenaMockScene', 'BattleScene', 'UnderwaterDescentScene', 'UnderwaterRoomScene'];

export function upcomingScenes(current: string, available: Iterable<string>): string[] {
    const allowed = new Set(available);
    const nearest = /Menu|SaveSlot|CharacterSelect|BandSelect|CoopSetup|TvPairing/.test(current) ? opening
        : /Silverpond|Underwater/.test(current) ? lake
        : /Forest|Guardian|LetterLock|SpinLock/.test(current) ? forest
        : current === 'ArenaScene' ? ['BattleScene', 'VictoryScene', 'TownScene', ...town]
        : current === 'BattleScene' ? ['VictoryScene', 'ArenaScene', 'TownScene', ...forest]
        : town;
    return [...new Set([...nearest, ...town, ...forest, 'ZyxRocketInterludeScene', 'ZyxCrystalMachineScene', ...lake])]
        .filter(key => key !== current && allowed.has(key));
}

export function orderedDownloads(current: string, scenes: string[], sceneFiles: Record<string, string[]>, all: string[]): string[] {
    return [...new Set([...(sceneFiles[current] ?? []), ...scenes.flatMap(key => sceneFiles[key] ?? []), ...all])];
}

export const SPECULATIVE_TEXTURE_BYTES = 64 * 1024 * 1024;

/** No speculative image decoding while a child is solving a timed/measured task. */
export function canPrepareTextures(scene: string): boolean {
    return !/Battle|Trial|Puzzle|Riddle|ManaCollection/.test(scene);
}

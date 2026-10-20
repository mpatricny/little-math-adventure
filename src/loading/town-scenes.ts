/** Buildings reachable from each town, prepared together before its doors open. */
export const townBuildings: Record<string, readonly string[]> = {
    TownScene: ['ShopScene', 'PythiaWorkshopScene', 'CrystalForgeScene', 'GuildScene', 'ArenaScene', 'TavernScene'],
    SilverpondTownMockScene: ['SilverpondShopMockScene', 'SilverpondPythiaWorkshopMockScene',
        'SilverpondCrystalForgeMockScene', 'SilverpondGuildMockScene', 'SilverpondArenaMockScene'],
};

export function townForScene(scene: string, homeTown = 'TownScene'): string {
    if (/Silverpond|Underwater/.test(scene)) return 'SilverpondTownMockScene';
    if (/Menu|SaveSlot|CharacterSelect|BandSelect|CoopSetup|TvPairing|Battle|Victory/.test(scene)) return homeTown;
    return 'TownScene';
}

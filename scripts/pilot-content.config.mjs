/** Pilot scope is explicit; source data stays complete for the Scene Editor/dev game. */
export const PILOT_SCENE_KEYS = Object.freeze([
  'BootScene', 'AssetLoaderScene', 'AudioSettingsScene', 'MenuScene', 'MenuNewScene',
  'SaveSlotScene', 'CharacterSelectScene', 'CharacterSelectNewScene', 'BandSelectScene',
  'TownScene', 'BattleScene', 'ArenaScene', 'VictoryScene', 'WitchHutScene',
  'PythiaWorkshopScene', 'ShopScene', 'GuildScene', 'TavernScene',
  'CrystalForgeScene', 'GuardianLairScene', 'ForestCrystalRewardScene',
  'ZyxRocketInterludeScene', 'ZyxCrystalMachineScene', 'ForestAdventureStartScene',
  'ForestMapScene', 'ForestPuzzleScene', 'ForestRoomScene', 'LetterLockPuzzleScene',
  'SpinLockPuzzleScene', 'ForestCampScene', 'ForestRiddleScene', 'ComicScene',
  'CrashSiteScene', 'CatacombOverviewScene', 'CatacombTrialScene', 'FoxLessonScene', 'ManaCollectionScene', 'CoopSetupScene',
  'TvPairingScene',
  'SilverpondTownMockScene', 'SilverpondFairyRewardScene', 'SilverpondArenaMockScene',
  'SilverpondPythiaWorkshopMockScene', 'SilverpondShopMockScene', 'SilverpondGuildMockScene',
  'SilverpondCrystalForgeMockScene', 'UnderwaterDescentScene', 'UnderwaterRoomScene',
]);

export const PILOT_LAYOUT_KEYS = Object.freeze([
  ...PILOT_SCENE_KEYS, 'WalkingHudOverlay', 'LearningMapOverlay', 'LearningPanelLayout', 'DailyProgressLayout', 'PlayersHubLayout', 'AudioControlHosts', 'AncientForestScene',
  'CatacombProgressOverlay', 'PracticeChoiceOverlay', 'MathBoardArtLayout', 'MathBoardComparisonLayout',
  'ComparisonFeedbackLayout', 'PictureDialogOverlay', 'RendererRecoveryOverlay', 'SceneLoadingOverlay',
  'UnderwaterChestReward', 'UnderwaterRevelation', 'UnderwaterGlowGrotto', 'UnderwaterDepthGate',
  'UnderwaterLakeHeart', 'UnderwaterLight', 'UnderwaterDescent', 'UnderwaterBossHud',
  'UnderwaterShallows', 'UnderwaterBellHub', 'UnderwaterReedGarden', 'UnderwaterSunkenCanal',
  'UnderwaterCurrents', 'UnderwaterPump', 'UnderwaterOverlay', 'UnderwaterFlow',
  'UnderwaterPostWreck', 'UnderwaterWreckHold', 'UnderwaterCipher', 'UnderwaterShellShrine',
  'UnderwaterCurrentChamber', 'UnderwaterReverse', 'UnderwaterReverseSplit', 'UnderwaterRouting',
  'UnderwaterHandsOn',
]);

// This production scene retains its historical filename; do not discard every "Mock" file.
export const PILOT_SCENE_SOURCE_OVERRIDES = Object.freeze({
  GuardianLairScene: 'GuardianLairMockScene',
});

export const PILOT_DATA_FILES = Object.freeze([
  'underwater-rooms.json', 'underwater-puzzles.json',
  'characters.json', 'npcs.json', 'items.json', 'pets.json', 'transmutation.json',
  'forest-journey.json', 'forest-rooms.json', 'forest-puzzles.json', 'ui-layouts.json',
  'ui-text-presets.json', 'localization/index.json', 'localization/cs.json',
  'localization/en.json', 'puzzles/tuning.json', 'puzzles/words.json',
]);

// Browser screenshots used by the lightweight landing page are published without
// becoming runtime dependencies of the Phaser game.
export const PILOT_LANDING_FILES = Object.freeze([
  'assets/images/screenshots/landing-menu.webp',
  'assets/images/screenshots/landing-shop.webp',
  'assets/images/screenshots/landing-river-puzzle.webp',
  'assets/images/screenshots/landing-arena-comparison.webp',
]);

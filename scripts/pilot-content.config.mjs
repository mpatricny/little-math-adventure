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
  'CrashSiteScene', 'CatacombTrialScene', 'ManaCollectionScene', 'CoopSetupScene',
  'TvPairingScene',
]);

export const PILOT_LAYOUT_KEYS = Object.freeze([
  ...PILOT_SCENE_KEYS, 'WalkingHudOverlay', 'LearningMapOverlay', 'AudioControlHosts', 'AncientForestScene',
]);

// This production scene retains its historical filename; do not discard every "Mock" file.
export const PILOT_SCENE_SOURCE_OVERRIDES = Object.freeze({
  GuardianLairScene: 'GuardianLairMockScene',
});

export const EXCLUDED_SOURCE_PREFIXES = Object.freeze([
  'Underwater', 'Silverpond', 'DepthCrystal',
]);

// VictoryScene reuses this button/theme outside Silverpond. A historical filename is
// not chapter ownership; its frames and stable icon states remain real pilot dependencies.
export const SHARED_RUNTIME_SOURCE_FILES = Object.freeze(['src/ui/UnderwaterTheme.ts']);
export const SHARED_CHAPTER_TEXTURE_KEYS = Object.freeze([
  'silverpond-fairy-title-frame', 'silverpond-fairy-reward-frame',
]);

export const EXCLUDED_MUSIC_KEYS = Object.freeze(['m08_silverpond', 'm09_underwater']);
export const EXCLUDED_AUDIO_PREFIXES = Object.freeze([
  'water.', 'vo.water.', 'vo.silverpond.', 'vo.descent.',
]);
export const EXCLUDED_AUDIO_KEYS = Object.freeze(['amb.lake', 'amb.underwater']);

// Explicit regional texture namespaces apply only to incidental references in shared code.
// A texture reached through retained scene/catalog data is always retained, even if renamed
// or shared across chapters. Files are selected by the dependency graph, never by filename.
export const OPTIONAL_CHAPTER_TEXTURE_PREFIXES = Object.freeze(['underwater-', 'silverpond-']);

export const PILOT_DATA_FILES = Object.freeze([
  'characters.json', 'npcs.json', 'items.json', 'pets.json', 'transmutation.json',
  'forest-journey.json', 'forest-rooms.json', 'forest-puzzles.json', 'ui-layouts.json',
  'ui-text-presets.json', 'localization/index.json', 'localization/cs.json',
  'localization/en.json', 'puzzles/tuning.json', 'puzzles/words.json',
]);

// Browser screenshots used by the lightweight landing page are published without
// becoming runtime dependencies of the Phaser game.
export const PILOT_LANDING_FILES = Object.freeze([
  'assets/images/screenshots/landing-menu.webp',
  'assets/images/screenshots/landing-town.webp',
  'assets/images/screenshots/landing-forest.webp',
]);

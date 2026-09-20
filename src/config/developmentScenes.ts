/** Scene classes are separate entry chunks so pilot never imports the next chapter. */
import { AudioSettingsScene } from '../scenes/AudioSettingsScene';
import { BootScene, AssetLoaderScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { MenuNewScene } from '../scenes/MenuNewScene';
import { SaveSlotScene } from '../scenes/SaveSlotScene';
import { CharacterSelectScene } from '../scenes/CharacterSelectScene';
import { CharacterSelectNewScene } from '../scenes/CharacterSelectNewScene';
import { TownScene } from '../scenes/TownScene';
import { BattleScene } from '../scenes/BattleScene';
import { ArenaScene } from '../scenes/ArenaScene';
import { SilverpondArenaMockScene } from '../scenes/SilverpondArenaMockScene';
import { VictoryScene } from '../scenes/VictoryScene';
import { WitchHutScene } from '../scenes/WitchHutScene';
import { PythiaWorkshopScene } from '../scenes/PythiaWorkshopScene';
import { SilverpondPythiaWorkshopMockScene } from '../scenes/SilverpondPythiaWorkshopMockScene';
import { ShopScene } from '../scenes/ShopScene';
import { SilverpondShopMockScene } from '../scenes/SilverpondShopMockScene';
import { SilverpondGuildMockScene } from '../scenes/SilverpondGuildMockScene';
import { GuildScene } from '../scenes/GuildScene';
import { GuildExamMockScene } from '../scenes/GuildExamMockScene';
import { TavernScene } from '../scenes/TavernScene';
import { CrystalForgeScene } from '../scenes/CrystalForgeScene';
import { SilverpondCrystalForgeMockScene } from '../scenes/SilverpondCrystalForgeMockScene';
import { MathBoardDebugScene } from '../scenes/MathBoardDebugScene';
import { TestingTownScene } from '../scenes/TestingTownScene';
import { TestingWitchHutScene } from '../scenes/TestingWitchHutScene';
import { AssetFactoryTestScene } from '../scenes/AssetFactoryTestScene';
import { GuardianLairMockScene, GuardianLairScene } from '../scenes/GuardianLairMockScene';
import { SilverpondTownMockScene } from '../scenes/SilverpondTownMockScene';
import { SilverpondFairyRewardScene } from '../scenes/SilverpondFairyRewardScene';
import { ArenaUiMockScene } from '../scenes/ArenaUiMockScene';
import { BattleUiMockScene } from '../scenes/BattleUiMockScene';
import { ForestCrystalRewardScene } from '../scenes/ForestCrystalRewardScene';
import { ZyxRocketInterludeScene } from '../scenes/ZyxRocketInterludeScene';
import { ZyxCrystalMachineScene } from '../scenes/ZyxCrystalMachineScene';
import { ForestAdventureStartScene } from '../scenes/ForestAdventureStartScene';
import { ForestMapScene } from '../scenes/ForestMapScene';
import { ForestPuzzleScene } from '../scenes/ForestPuzzleScene';
import { ForestRoomScene } from '../scenes/ForestRoomScene';
import { LetterLockPuzzleScene } from '../scenes/LetterLockPuzzleScene';
import { SpinLockPuzzleScene } from '../scenes/SpinLockPuzzleScene';
import { ForestCampScene } from '../scenes/ForestCampScene';
import { ForestRiddleScene } from '../scenes/ForestRiddleScene';
import { ComicScene } from '../scenes/ComicScene';
import { CrashSiteScene } from '../scenes/CrashSiteScene';
import { BandSelectScene } from '../scenes/BandSelectScene';
import { CatacombTrialScene } from '../scenes/CatacombTrialScene';
import { ManaCollectionScene } from '../scenes/ManaCollectionScene';
import { CoopSetupScene } from '../scenes/CoopSetupScene';
import { TvPairingScene } from '../scenes/TvPairingScene';
import { UnderwaterRoomScene } from '../scenes/UnderwaterRoomScene';
import { UnderwaterDescentScene } from '../scenes/UnderwaterDescentScene';

export const GAME_SCENES = [
    BootScene,
    AudioSettingsScene,
    UnderwaterRoomScene,
    UnderwaterDescentScene,
    AssetLoaderScene,
    MenuScene,
    MenuNewScene,
    SaveSlotScene,
    CharacterSelectScene,
    CharacterSelectNewScene,
    BandSelectScene,
    TownScene,
    TestingTownScene,
    TestingWitchHutScene,
    BattleScene,
    ArenaScene,
    SilverpondArenaMockScene,
    VictoryScene,
    WitchHutScene,
    PythiaWorkshopScene,
    SilverpondPythiaWorkshopMockScene,
    ShopScene,
    SilverpondShopMockScene,
    GuildScene,
    GuildExamMockScene,
    SilverpondGuildMockScene,
    TavernScene,
    CrystalForgeScene,
    SilverpondCrystalForgeMockScene,
    MathBoardDebugScene,
    AssetFactoryTestScene,
    GuardianLairScene,
    GuardianLairMockScene,
    SilverpondTownMockScene,
    SilverpondFairyRewardScene,
    ArenaUiMockScene,
    BattleUiMockScene,
    ForestCrystalRewardScene,
    ZyxRocketInterludeScene,
    ZyxCrystalMachineScene,
    ForestAdventureStartScene,
    ForestMapScene,
    ForestPuzzleScene,
    ForestRoomScene,
    LetterLockPuzzleScene,
    SpinLockPuzzleScene,
    ForestCampScene,
    ForestRiddleScene,
    ComicScene,
    CrashSiteScene,
    CatacombTrialScene,
    ManaCollectionScene,
    CoopSetupScene,
    TvPairingScene,
];

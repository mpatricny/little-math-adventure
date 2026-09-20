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
import { VictoryScene } from '../scenes/VictoryScene';
import { WitchHutScene } from '../scenes/WitchHutScene';
import { PythiaWorkshopScene } from '../scenes/PythiaWorkshopScene';
import { ShopScene } from '../scenes/ShopScene';
import { GuildScene } from '../scenes/GuildScene';
import { TavernScene } from '../scenes/TavernScene';
import { CrystalForgeScene } from '../scenes/CrystalForgeScene';
import { GuardianLairScene } from '../scenes/GuardianLairMockScene';
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

export const GAME_SCENES = [
    BootScene,
    AudioSettingsScene,
    AssetLoaderScene,
    MenuScene,
    MenuNewScene,
    SaveSlotScene,
    CharacterSelectScene,
    CharacterSelectNewScene,
    BandSelectScene,
    TownScene,
    BattleScene,
    ArenaScene,
    VictoryScene,
    WitchHutScene,
    PythiaWorkshopScene,
    ShopScene,
    GuildScene,
    TavernScene,
    CrystalForgeScene,
    GuardianLairScene,
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

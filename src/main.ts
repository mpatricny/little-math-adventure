import Phaser from 'phaser';
import { BootScene, AssetLoaderScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MenuNewScene } from './scenes/MenuNewScene';
import { SaveSlotScene } from './scenes/SaveSlotScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { CharacterSelectNewScene } from './scenes/CharacterSelectNewScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { ArenaScene } from './scenes/ArenaScene';
import { VictoryScene } from './scenes/VictoryScene';
import { WitchHutScene } from './scenes/WitchHutScene';
import { PythiaWorkshopScene } from './scenes/PythiaWorkshopScene';
import { ShopScene } from './scenes/ShopScene';
import { GuildScene } from './scenes/GuildScene';
import { TavernScene } from './scenes/TavernScene';
import { CrystalForgeScene } from './scenes/CrystalForgeScene';
import { MathBoardDebugScene } from './scenes/MathBoardDebugScene';
import { TestingTownScene } from './scenes/TestingTownScene';
import { TestingWitchHutScene } from './scenes/TestingWitchHutScene';
import { AssetFactoryTestScene } from './scenes/AssetFactoryTestScene';
import { ForestAdventureStartScene } from './scenes/ForestAdventureStartScene';
import { ForestMapScene } from './scenes/ForestMapScene';
import { ForestPuzzleScene } from './scenes/ForestPuzzleScene';
import { ForestRoomScene } from './scenes/ForestRoomScene';
import { LetterLockPuzzleScene } from './scenes/LetterLockPuzzleScene';
import { SpinLockPuzzleScene } from './scenes/SpinLockPuzzleScene';
import { ForestCampScene } from './scenes/ForestCampScene';
import { ForestRiddleScene } from './scenes/ForestRiddleScene';
import { ComicScene } from './scenes/ComicScene';
import { CrashSiteScene } from './scenes/CrashSiteScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#2d2d2d',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
        antialias: true,
        roundPixels: false,
        transparent: false,
        powerPreference: 'high-performance',
    },
    dom: {
        createContainer: true
    },
    scene: [BootScene, AssetLoaderScene, MenuScene, MenuNewScene, SaveSlotScene, CharacterSelectScene, CharacterSelectNewScene, TownScene, TestingTownScene, TestingWitchHutScene, BattleScene, ArenaScene, VictoryScene, WitchHutScene, PythiaWorkshopScene, ShopScene, GuildScene, TavernScene, CrystalForgeScene, MathBoardDebugScene, AssetFactoryTestScene, ForestAdventureStartScene, ForestMapScene, ForestPuzzleScene, ForestRoomScene, LetterLockPuzzleScene, SpinLockPuzzleScene, ForestCampScene, ForestRiddleScene, ComicScene, CrashSiteScene],
};

new Phaser.Game(config);

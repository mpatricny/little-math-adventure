import Phaser from 'phaser';
import { BootScene, AssetLoaderScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { SaveSlotScene } from './scenes/SaveSlotScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { ArenaScene } from './scenes/ArenaScene';
import { VictoryScene } from './scenes/VictoryScene';
import { WitchHutScene } from './scenes/WitchHutScene';
import { ShopScene } from './scenes/ShopScene';
import { GuildScene } from './scenes/GuildScene';
import { TavernScene } from './scenes/TavernScene';
import { MathBoardDebugScene } from './scenes/MathBoardDebugScene';
import { TestingTownScene } from './scenes/TestingTownScene';
import { TestingWitchHutScene } from './scenes/TestingWitchHutScene';
import { AssetFactoryTestScene } from './scenes/AssetFactoryTestScene';

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
    scene: [BootScene, AssetLoaderScene, MenuScene, SaveSlotScene, CharacterSelectScene, TownScene, TestingTownScene, TestingWitchHutScene, BattleScene, ArenaScene, VictoryScene, WitchHutScene, ShopScene, GuildScene, TavernScene, MathBoardDebugScene, AssetFactoryTestScene],
};

new Phaser.Game(config);

import Phaser from 'phaser';
import { BootScene, AssetLoaderScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { ArenaScene } from './scenes/ArenaScene';
import { VictoryScene } from './scenes/VictoryScene';
import { WitchHutScene } from './scenes/WitchHutScene';
import { ShopScene } from './scenes/ShopScene';
import { GuildScene } from './scenes/GuildScene';
import { TavernScene } from './scenes/TavernScene';
import { MathBoardDebugScene } from './scenes/MathBoardDebugScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,  // WebGL with Canvas fallback
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#2d2d2d',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, AssetLoaderScene, MenuScene, TownScene, BattleScene, ArenaScene, VictoryScene, WitchHutScene, ShopScene, GuildScene, TavernScene, MathBoardDebugScene],
};

new Phaser.Game(config);

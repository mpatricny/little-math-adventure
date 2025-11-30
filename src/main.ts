import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { VictoryScene } from './scenes/VictoryScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,  // WebGL with Canvas fallback
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#2d2d2d',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuScene, TownScene, BattleScene, VictoryScene],
};

new Phaser.Game(config);

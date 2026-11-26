import type Phaser from 'phaser';
import type { VictoryData } from '../scenes/VictoryScene';
import type { ScenesFile } from '../types/scenes';
import { UNDERWATER_ROOMS } from '../systems/UnderwaterProgressSystem';
import { uiTemplateLoader } from '../systems/UiTemplateLoader';

export interface VictoryDestination {
    heading: string;
    place: string;
    texture?: string;
}

/** Describe the scene that Dál actually opens, using the same room art as exploration. */
export function victoryDestination(scene: Phaser.Scene, data: VictoryData): VictoryDestination {
    const roomId = String(data.returnData?.roomId ?? '');
    switch (data.returnScene) {
        case 'ForestRoomScene':
        case 'ForestRiddleScene': {
            const room = scene.cache.json.get('forestRooms')?.rooms[roomId];
            let texture = room?.background;
            if (data.returnScene === 'ForestRiddleScene') {
                const layout = (scene.cache.json.get('scenes') as ScenesFile).scenes.ForestRiddleScene;
                const id = layout?.ui?.find(element => element.asset === room?.background)?.uiElement?.templateId;
                if (id) texture = uiTemplateLoader.get(id)?.layers.find(layer => layer.name === 'bg')?.imageAssetId;
            }
            return { heading: 'Zpět do lesa', place: room?.nameCs ?? 'Les', texture: texture ?? data.battleBackground ?? undefined };
        }
        case 'UnderwaterRoomScene': {
            const room = UNDERWATER_ROOMS[roomId];
            return { heading: 'Pod hladinou', place: room?.name ?? 'Jezero', texture: room?.background ?? data.battleBackground ?? undefined };
        }
        case 'ForestMapScene':
            return { heading: 'Zpět na mapu', place: 'Lesní cesta', texture: 'guild-map-normal-v2' };
        case 'CrashSiteScene':
            return { heading: 'Zpět k lodi', place: 'Zyxova loď', texture: 'crash-site-background' };
        case 'TownScene':
            return { heading: 'Zpět do města', place: 'Mathoria', texture: 'bg-town' };
        case 'SilverpondTownMockScene':
            return { heading: 'Zpět do města', place: 'Silverpond', texture: 'silverpond-town-hub-mock-bg' };
        case 'SilverpondFairyRewardScene':
            return { heading: 'Za vílou', place: 'Jezerní víla', texture: 'silverpond-fairy-static' };
        case 'ForestCrystalRewardScene':
            return { heading: 'Lesní krystal', place: 'Krystal', texture: 'forest-crystal-story' };
        case 'MenuScene':
            return { heading: 'Zpět do menu', place: 'Menu', texture: 'bg-menu-mathoria' };
        case 'TvPairingScene':
            return { heading: 'Zpět k TV', place: 'Televize' };
        default:
            return { heading: 'Další cesta', place: '', texture: data.battleBackground ?? 'enamel-continue-normal' };
    }
}

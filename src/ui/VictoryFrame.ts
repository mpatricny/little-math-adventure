import type Phaser from 'phaser';
import type { VictoryData } from '../scenes/VictoryScene';
import type { VictoryDestination } from '../loading/victory-destination';
import type { SceneBuilder } from '../systems/SceneBuilder';
import { PracticeChoiceControl, practiceArt, practiceLabel, type PracticeChoiceRegion as Box } from './PracticeChoiceControl';
import { waterHost } from './SceneLayoutHost';

export function victoryHost(builder: SceneBuilder, id: string) {
    return { ...waterHost(builder, id), regions: builder.getElementDef(id)?.data?.regions as Record<string, Box> };
}

export function victoryArrow(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, region: Box, direction = 1): void {
    const w = Math.min(region.width * .42, region.height * 1.1);
    const h = region.height * .3;
    parent.add(scene.add.graphics().setPosition(region.x, region.y).setScale(direction, 1).lineStyle(3.3, 0xffdda1)
        .lineBetween(-w, 0, w, 0).lineBetween(w - h, -h, w, 0).lineBetween(w - h, h, w, 0));
}

export function isWaterVictory(data: VictoryData): boolean {
    return data.returnScene === 'UnderwaterRoomScene' || data.arenaCity === 'silverpond';
}

export function createVictoryFrame(scene: Phaser.Scene, builder: SceneBuilder, data: VictoryData, destination: VictoryDestination, onContinue: () => void) {
    const shade = victoryHost(builder, 'victoryShadeHost');
    const backdrop = data.battleBackground ?? (data.returnScene === 'UnderwaterRoomScene' ? destination.texture : undefined);
    if (backdrop && scene.textures.exists(backdrop)) {
        const bg = scene.add.image(shade.x, shade.y, backdrop).setDepth(shade.depth - 1);
        bg.setScale(Math.max(shade.width / bg.width, shade.height / bg.height));
    }
    scene.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x071521, .54).setDepth(shade.depth);
    const frame = victoryHost(builder, 'practiceVictoryFrame');
    practiceArt(scene, 'practice-choice-panel-v1', frame).setDepth(frame.depth);
    const title = victoryHost(builder, 'practiceVictoryTitle');
    const plaque = isWaterVictory(data) ? 'silverpond-fairy-title-frame' : 'practice-choice-plaque-v1';
    practiceArt(scene, plaque, title).setDepth(title.depth);
    const safe = { ...title, width: title.width * .73, height: title.height * .5 };
    practiceLabel(scene, data.arenaCompleted ? 'Aréna hotová!' : 'Výhra!', safe, data.arenaCompleted ? 33 : 38)
        .setName('victoryHeading').setData('waterTextBox', safe).setDepth(title.depth + 1);
    const action = victoryHost(builder, 'practiceVictoryContinue');
    const forward = new PracticeChoiceControl(scene, action, 'victoryContinueHost', plaque, 'Dál', null, onContinue);
    victoryArrow(scene, forward.surface, action.regions.arrow);
    forward.setEnabled(false);
    return forward;
}

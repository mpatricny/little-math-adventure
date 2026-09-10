/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import data from '../../../public/assets/data/scenes.json';
import ui from '../../ui/UnderwaterUI.ts?raw';
import scene from '../../scenes/UnderwaterRoomScene.ts?raw';
import theme from '../../ui/UnderwaterTheme.ts?raw';
import bell from '../../ui/UnderwaterBellPuzzle.ts?raw';
import chest from '../../ui/UnderwaterWordChest.ts?raw';
import current from '../../ui/UnderwaterCurrentPuzzle.ts?raw';
import pump from '../../ui/UnderwaterPumpPuzzle.ts?raw';
import wheel from '../../ui/UnderwaterSpinWheel.ts?raw';
import reverse from '../../ui/UnderwaterReversePuzzle.ts?raw';
import routing from '../../ui/UnderwaterRoutingPuzzle.ts?raw';
import surface from '../../ui/UnderwaterPuzzleSurface.ts?raw';

type Box = { id: string; x: number; y: number; width: number; height: number };
const elements = data.scenes.UnderwaterOverlay.elements;
const box = (id: string) => elements.find(e => e.id === id)!;
const inside = (a: Box, b: Box) => Math.abs(a.x - b.x) + a.width / 2 <= b.width / 2
    && Math.abs(a.y - b.y) + a.height / 2 <= b.height / 2;
const overlaps = (a: Box, b: Box) => Math.abs(a.x - b.x) < (a.width + b.width) / 2
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2;

describe('underwater authored visual layout', () => {
    for (const [name, ids] of Object.entries({
        dialog: ['modalTitleHost', 'modalPortraitHost', 'modalTextHost', 'modalNextHost', 'modalCloseHost'],
        puzzle: ['modalTitleHost', 'puzzleInstructionHost', 'puzzleEquationHost', 'puzzleNotesHost',
            'puzzleChoice0Host', 'puzzleChoice1Host', 'puzzleChoice2Host', 'puzzleFeedbackHost', 'modalNextHost', 'modalCloseHost'],
    })) it(`${name}: content is inside the artwork's safe inset and does not overlap`, () => {
        for (const id of ids) expect(inside(box(id), box('modalSafeAreaHost')), id).toBe(true);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
            expect(overlaps(box(ids[i]), box(ids[j])), `${ids[i]} / ${ids[j]}`).toBe(false);
    });

    it('prevents stretched chapter artwork and the old wood/dialog frame from returning', () => {
        expect(ui + scene + theme + bell + chest + current + pump + wheel + reverse + routing + surface).not.toMatch(/setDisplaySize\(/);
        expect(ui + theme).not.toMatch(/MedievalActionButton|zyx-dialog-frame-story|prep-frame/);
        expect(ui + theme + bell + chest + current + pump + wheel + reverse + routing + surface).not.toMatch(/setResolution\(/);
        expect(theme).toContain('silverpond-fairy-title-frame');
        expect(ui).toContain('silverpond-fairy-reward-frame');
    });

    it('keeps room touch targets distinct and inside the viewport', () => {
        for (const room of [data.scenes.UnderwaterShallows, data.scenes.UnderwaterBellHub, data.scenes.UnderwaterReedGarden, data.scenes.UnderwaterSunkenCanal,
            data.scenes.UnderwaterShellShrine, data.scenes.UnderwaterCurrentChamber]) {
            const controls = room.elements.filter(e => /^(exit|restHost$|bellAction|branch)/.test(e.id));
            for (const control of controls) {
                expect(inside(control, { id: 'viewport', x: 640, y: 360, width: 1280, height: 720 })).toBe(true);
                expect(control.height).toBeGreaterThanOrEqual(70);
            }
            for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++)
                expect(overlaps(controls[i], controls[j])).toBe(false);
        }
    });

    for (const [name, ids] of Object.entries({
        UnderwaterReverse: data.scenes.UnderwaterReverse.elements.map(e => e.id),
        UnderwaterReverseSplit: data.scenes.UnderwaterReverseSplit.elements.map(e => e.id),
        UnderwaterRouting: data.scenes.UnderwaterRouting.elements.map(e => e.id),
        UnderwaterCurrents: data.scenes.UnderwaterCurrents.elements.map(e => e.id),
        UnderwaterPump: data.scenes.UnderwaterPump.elements.map(e => e.id),
        UnderwaterFlow: ['iconCloseHost', 'iconFlowHintHost', 'flowHintHost', 'flowProgressHost', 'puzzleSolverHost',
            'flowStartHost', 'flowStep0Host', 'flowStep1Host', 'flowCard0Host', 'flowCard1Host', 'flowCard2Host', 'flowCard3Host'],
        UnderwaterCipher: ['iconCloseHost', 'cipherHintHost', 'cipherClue0Host', 'cipherClue1Host', 'cipherClue2Host', 'cipherClue3Host', 'cipherClue4Host',
            'wordWheel0Host', 'wordWheel1Host', 'wordWheel2Host', 'wordWheel3Host', 'wordWheel4Host', 'iconUnlockHost', 'iconClueHost'],
    })) it(`${name}: controls stay inside the safe frame without overlaps`, () => {
        const controls = ids.map(id => (data.scenes as unknown as Record<string, { elements: Box[] }>)[name].elements.find(e => e.id === id)!);
        for (const control of controls) expect(inside(control, box('modalSafeAreaHost')), control.id).toBe(true);
        for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++)
            expect(overlaps(controls[i], controls[j]), `${controls[i].id} / ${controls[j].id}`).toBe(false);
    });
});

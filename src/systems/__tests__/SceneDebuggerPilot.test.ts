import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../../config/buildVariant', () => ({ DEV_TOOLS_ENABLED: false }));
vi.mock('../SceneLayoutLoader', () => ({ SceneLayoutLoader: {} }));
vi.mock('../UiTemplateLoader', () => ({ uiTemplateLoader: {} }));
vi.mock('../../ui/DebugPoolDisplay', () => ({ DebugPoolDisplay: vi.fn() }));

import { SceneDebugger } from '../SceneDebugger';
import { DebugPoolDisplay } from '../../ui/DebugPoolDisplay';

describe('pilot scene debugger', () => {
    it('never captures input, creates UI, or touches a registered game object', () => {
        const keyboardOn = vi.fn();
        const eventOn = vi.fn();
        const createContainer = vi.fn();
        const scene = {
            input: { keyboard: { on: keyboardOn } },
            events: { on: eventOn },
            add: { container: createContainer },
        } as unknown as Phaser.Scene;
        const object = new Proxy({}, {
            get() { throw new Error('Pilot debugger must not inspect or mutate game objects'); },
        }) as Phaser.GameObjects.GameObject;

        const debuggerInstance = new SceneDebugger(scene, 'BattleScene');
        debuggerInstance.register('hero', object);
        debuggerInstance.setBattleCallbacks(vi.fn(), vi.fn());
        debuggerInstance.applyConfig({ hero: { x: 1, y: 2, scale: 3 } });
        debuggerInstance.loadSavedLayout();
        debuggerInstance.loadFromSceneLayouts();
        debuggerInstance.exportToClipboard();

        expect(keyboardOn).not.toHaveBeenCalled();
        expect(eventOn).not.toHaveBeenCalled();
        expect(createContainer).not.toHaveBeenCalled();
        expect(DebugPoolDisplay).not.toHaveBeenCalled();
        expect(debuggerInstance.getCurrentLayoutState()).toEqual({});
    });
});

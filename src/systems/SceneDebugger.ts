import Phaser from 'phaser';
import { SceneLayoutLoader } from './SceneLayoutLoader';
import { SceneLayoutsFile, ElementDef } from '../types/layout';

/**
 * Configuration for a debug element's position and scale
 */
export interface DebugElementConfig {
    x: number;
    y: number;
    scale: number;
    width?: number;
    height?: number;
    depth?: number;
}

/**
 * Registered debug element with its initial state
 */
interface DebugElement {
    id: string;
    object: Phaser.GameObjects.GameObject;
    initial: DebugElementConfig;
}

/**
 * Universal Scene Debugger
 *
 * A reusable debug system that can be added to any Phaser scene.
 * Allows moving, scaling, and resizing scene elements with keyboard controls.
 *
 * Usage:
 * ```typescript
 * create(): void {
 *     // ... create your game objects ...
 *
 *     this.debugger = new SceneDebugger(this, 'MyScene');
 *     this.debugger.register('hero', this.hero);
 *     this.debugger.register('enemy', this.enemy);
 *
 *     // For battle scenes:
 *     this.debugger.setBattleCallbacks(
 *         () => this.instantWin(),
 *         () => this.fullHeal()
 *     );
 * }
 * ```
 *
 * Controls:
 * - D: Toggle debug mode
 * - TAB: Cycle through elements
 * - Arrow keys: Move element (5px)
 * - P/L: Scale up/down (0.01)
 * - W/Q: Width up/down (10px) - in non-battle scenes
 * - E/R: Height up/down (10px)
 * - Z/X: Depth up/down (1)
 * - S: Save to JSON file
 * - W: Instant win (battle scenes only)
 * - H: Full heal (battle scenes only)
 */
export class SceneDebugger {
    private scene: Phaser.Scene;
    private sceneName: string;
    private elements: DebugElement[] = [];
    private selectedIndex: number = 0;
    private isActive: boolean = false;

    // UI elements
    private overlay!: Phaser.GameObjects.Container;
    private infoText!: Phaser.GameObjects.Text;
    private selectionBox!: Phaser.GameObjects.Rectangle;

    // Battle-specific callbacks
    private onInstantWin?: () => void;
    private onHeal?: () => void;
    private isBattleScene: boolean = false;

    // Key objects for update loop
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};

    constructor(scene: Phaser.Scene, sceneName: string) {
        this.scene = scene;
        this.sceneName = sceneName;
        this.setupKeyboard();
        this.createOverlay();

        // Hook into scene's update
        this.scene.events.on('update', this.update, this);
        this.scene.events.on('shutdown', this.destroy, this);
    }

    /**
     * Register a game object for debug manipulation
     */
    register(id: string, object: Phaser.GameObjects.GameObject): void {
        const config = this.getElementConfig(object);
        this.elements.push({
            id,
            object,
            initial: { ...config }
        });
    }

    /**
     * Set battle-specific callbacks for instant win and heal
     */
    setBattleCallbacks(onWin: () => void, onHeal: () => void): void {
        this.onInstantWin = onWin;
        this.onHeal = onHeal;
        this.isBattleScene = true;
    }

    /**
     * Apply saved debug values from a config object
     */
    applyConfig(config: Record<string, DebugElementConfig>): void {
        for (const el of this.elements) {
            if (config[el.id]) {
                this.applyElementConfig(el.object, config[el.id]);
            }
        }
    }

    /**
     * Load and apply saved values from localStorage for this scene
     */
    loadSavedLayout(): void {
        try {
            const saved = localStorage.getItem('debugLayout');
            if (saved) {
                const allSceneData = JSON.parse(saved);
                if (allSceneData[this.sceneName]) {
                    this.applyConfig(allSceneData[this.sceneName]);
                    console.log(`[Debug] Loaded saved layout for ${this.sceneName}`);
                }
            }
        } catch (e) {
            console.warn('Failed to load debug layout:', e);
        }
    }

    private setupKeyboard(): void {
        const keyboard = this.scene.input.keyboard!;

        this.cursors = keyboard.createCursorKeys();

        // Setup individual keys
        this.keys = {
            D: keyboard.addKey('D'),
            TAB: keyboard.addKey('TAB'),
            S: keyboard.addKey('S'),
            C: keyboard.addKey('C'),  // Export to clipboard
            P: keyboard.addKey('P'),
            L: keyboard.addKey('L'),
            W: keyboard.addKey('W'),
            Q: keyboard.addKey('Q'),
            E: keyboard.addKey('E'),
            R: keyboard.addKey('R'),
            Z: keyboard.addKey('Z'),
            X: keyboard.addKey('X'),
            H: keyboard.addKey('H'),
        };

        // Toggle debug mode
        keyboard.on('keydown-D', () => {
            this.toggle();
        });

        // Cycle selection
        keyboard.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            if (this.isActive) {
                this.cycleSelection();
            }
        });

        // Save
        keyboard.on('keydown-S', () => {
            if (this.isActive) {
                this.saveToFile();
            }
        });

        // Export to clipboard (for scene-layouts.json format)
        keyboard.on('keydown-C', () => {
            if (this.isActive) {
                this.exportToClipboard();
            }
        });

        // Battle shortcuts
        keyboard.on('keydown-W', () => {
            if (this.isActive && this.isBattleScene && this.onInstantWin) {
                this.onInstantWin();
            }
        });

        keyboard.on('keydown-H', () => {
            if (this.isActive && this.onHeal) {
                this.onHeal();
            }
        });
    }

    private createOverlay(): void {
        this.overlay = this.scene.add.container(0, 0);
        this.overlay.setDepth(10000);
        this.overlay.setScrollFactor(0);
        this.overlay.setVisible(false);

        // Background panel
        const bg = this.scene.add.rectangle(10, 10, 280, 200, 0x000000, 0.85)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0x00ff00);
        this.overlay.add(bg);

        // Info text
        this.infoText = this.scene.add.text(20, 20, '', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#00ff00',
            lineSpacing: 4
        });
        this.overlay.add(this.infoText);

        // Selection box (will be positioned on selected element)
        this.selectionBox = this.scene.add.rectangle(0, 0, 100, 100)
            .setStrokeStyle(3, 0xff0000)
            .setFillStyle(0xff0000, 0.1)
            .setDepth(9999);
        this.selectionBox.setVisible(false);
    }

    private toggle(): void {
        this.isActive = !this.isActive;
        this.overlay.setVisible(this.isActive);
        this.selectionBox.setVisible(this.isActive && this.elements.length > 0);

        if (this.isActive) {
            this.updateDisplay();
            this.highlightSelected();
        }
    }

    private cycleSelection(): void {
        if (this.elements.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % this.elements.length;
        this.updateDisplay();
        this.highlightSelected();
    }

    private update(): void {
        if (!this.isActive || this.elements.length === 0) return;

        const element = this.elements[this.selectedIndex];
        const config = this.getElementConfig(element.object);

        let changed = false;
        const moveStep = 5;
        const scaleStep = 0.01;
        const sizeStep = 10;

        // Movement
        if (Phaser.Input.Keyboard.JustDown(this.cursors.up!)) {
            this.setElementY(element.object, config.y - moveStep);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.down!)) {
            this.setElementY(element.object, config.y + moveStep);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left!)) {
            this.setElementX(element.object, config.x - moveStep);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.right!)) {
            this.setElementX(element.object, config.x + moveStep);
            changed = true;
        }

        // Scale
        if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
            this.setElementScale(element.object, config.scale + scaleStep);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.L)) {
            this.setElementScale(element.object, Math.max(0.01, config.scale - scaleStep));
            changed = true;
        }

        // Width/Height (only in non-battle scenes, as W is used for instant win)
        if (!this.isBattleScene) {
            if (Phaser.Input.Keyboard.JustDown(this.keys.W) && config.width !== undefined) {
                this.setElementWidth(element.object, config.width + sizeStep);
                changed = true;
            }
            if (Phaser.Input.Keyboard.JustDown(this.keys.Q) && config.width !== undefined) {
                this.setElementWidth(element.object, Math.max(10, config.width - sizeStep));
                changed = true;
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.E) && config.height !== undefined) {
            this.setElementHeight(element.object, config.height + sizeStep);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.R) && config.height !== undefined) {
            this.setElementHeight(element.object, Math.max(10, config.height - sizeStep));
            changed = true;
        }

        // Depth
        if (Phaser.Input.Keyboard.JustDown(this.keys.Z)) {
            this.setElementDepth(element.object, (config.depth || 0) + 1);
            changed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.X)) {
            this.setElementDepth(element.object, Math.max(0, (config.depth || 0) - 1));
            changed = true;
        }

        if (changed) {
            this.updateDisplay();
            this.highlightSelected();
        }
    }

    private updateDisplay(): void {
        if (this.elements.length === 0) {
            this.infoText.setText('No elements registered');
            return;
        }

        const element = this.elements[this.selectedIndex];
        const config = this.getElementConfig(element.object);

        const lines = [
            `DEBUG - ${this.sceneName}`,
            `────────────────────────`,
            `Element: ${element.id.toUpperCase()}`,
            `  (TAB to cycle ${this.selectedIndex + 1}/${this.elements.length})`,
            ``,
            `x: ${config.x.toFixed(0)}   y: ${config.y.toFixed(0)}`,
            `scale: ${config.scale.toFixed(3)}`,
        ];

        if (config.width !== undefined) {
            lines.push(`width: ${config.width.toFixed(0)}   height: ${config.height?.toFixed(0) || 'N/A'}`);
        }

        lines.push(`depth: ${config.depth || 0}`);
        lines.push(``);
        lines.push(`Controls:`);
        lines.push(`  ←↑↓→: Move   P/L: Scale`);

        if (!this.isBattleScene) {
            lines.push(`  W/Q: Width   E/R: Height`);
        }

        lines.push(`  Z/X: Depth`);
        lines.push(`  S: Save   C: Clipboard`);

        if (this.isBattleScene) {
            lines.push(`  W: Win   H: Heal`);
        }

        this.infoText.setText(lines.join('\n'));
    }

    private highlightSelected(): void {
        if (this.elements.length === 0) {
            this.selectionBox.setVisible(false);
            return;
        }

        const element = this.elements[this.selectedIndex];
        const obj = element.object as any;

        // Get bounds
        let x = obj.x || 0;
        let y = obj.y || 0;
        let width = 50;
        let height = 50;

        if (obj.displayWidth) {
            width = obj.displayWidth;
            height = obj.displayHeight;
        } else if (obj.width) {
            width = obj.width;
            height = obj.height;
        }

        // Adjust for origin
        const originX = obj.originX ?? 0.5;
        const originY = obj.originY ?? 0.5;

        this.selectionBox.setPosition(x, y);
        this.selectionBox.setSize(width, height);
        this.selectionBox.setOrigin(originX, originY);
        this.selectionBox.setVisible(true);
    }

    private getElementConfig(obj: Phaser.GameObjects.GameObject): DebugElementConfig {
        const gameObj = obj as any;

        const config: DebugElementConfig = {
            x: gameObj.x || 0,
            y: gameObj.y || 0,
            scale: gameObj.scaleX || gameObj.scale || 1,
            depth: gameObj.depth || 0,
        };

        // Always include width/height for objects that have displayWidth/displayHeight
        // This allows editing size in debug mode for any object that supports setDisplaySize
        if (gameObj.displayWidth !== undefined && gameObj.displayHeight !== undefined) {
            config.width = gameObj.displayWidth;
            config.height = gameObj.displayHeight;
        }

        return config;
    }

    private applyElementConfig(obj: Phaser.GameObjects.GameObject, config: DebugElementConfig): void {
        const gameObj = obj as any;

        if (config.x !== undefined) gameObj.x = config.x;
        if (config.y !== undefined) gameObj.y = config.y;
        if (config.scale !== undefined) gameObj.setScale?.(config.scale);
        if (config.depth !== undefined) gameObj.setDepth?.(config.depth);
        if (config.width !== undefined && config.height !== undefined) {
            gameObj.setDisplaySize?.(config.width, config.height);
        }
    }

    private setElementX(obj: Phaser.GameObjects.GameObject, value: number): void {
        (obj as any).x = value;
    }

    private setElementY(obj: Phaser.GameObjects.GameObject, value: number): void {
        (obj as any).y = value;
    }

    private setElementScale(obj: Phaser.GameObjects.GameObject, value: number): void {
        const gameObj = obj as any;
        if (gameObj.setScale) {
            gameObj.setScale(value);
        }
    }

    private setElementWidth(obj: Phaser.GameObjects.GameObject, value: number): void {
        const gameObj = obj as any;
        if (gameObj.setDisplaySize) {
            gameObj.setDisplaySize(value, gameObj.displayHeight);
        }
    }

    private setElementHeight(obj: Phaser.GameObjects.GameObject, value: number): void {
        const gameObj = obj as any;
        if (gameObj.setDisplaySize) {
            gameObj.setDisplaySize(gameObj.displayWidth, value);
        }
    }

    private setElementDepth(obj: Phaser.GameObjects.GameObject, value: number): void {
        const gameObj = obj as any;
        if (gameObj.setDepth) {
            gameObj.setDepth(value);
        }
    }

    private saveToFile(): void {
        // Collect all element configs
        const data: Record<string, DebugElementConfig> = {};
        for (const el of this.elements) {
            data[el.id] = this.getElementConfig(el.object);
        }

        // Load existing saved values from localStorage
        let allSceneData: Record<string, Record<string, DebugElementConfig>> = {};
        try {
            const saved = localStorage.getItem('debugLayout');
            if (saved) {
                allSceneData = JSON.parse(saved);
            }
        } catch (e) {
            // Ignore parse errors
        }

        // Update with current scene data
        allSceneData[this.sceneName] = data;

        // Save to localStorage (backup)
        localStorage.setItem('debugLayout', JSON.stringify(allSceneData));

        // POST to dev server to save to file
        fetch('/__save-debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allSceneData, null, 2)
        }).then(response => {
            if (response.ok) {
                console.log('✅ Saved to public/assets/data/debug-layout.json');
            } else {
                console.warn('⚠️ Failed to save to file (dev server might not be running)');
            }
        }).catch(() => {
            console.warn('⚠️ Could not reach dev server - values saved to localStorage only');
        });

        // Also log to console as backup
        console.log('\n// --- ' + this.sceneName + ' Layout Values ---');
        console.log(JSON.stringify(data, null, 2));

        // Show confirmation flash
        this.showSaveConfirmation();
    }

    private showSaveConfirmation(message?: string): void {
        const flash = this.scene.add.text(400, 300, message ?? `${this.sceneName} saved to debug-layout.json`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#00ff00',
            backgroundColor: '#000000',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setDepth(20000).setScrollFactor(0);

        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            y: flash.y - 30,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => flash.destroy()
        });
    }

    /**
     * Load values from scene-layouts.json and apply them to registered elements
     * Call this after registering all elements
     */
    loadFromSceneLayouts(): void {
        const layoutsFile = this.scene.cache.json.get(SceneLayoutLoader.CACHE_KEY) as SceneLayoutsFile | undefined;
        if (!layoutsFile?.scenes?.[this.sceneName]) {
            console.warn(`[SceneDebugger] No layout found for ${this.sceneName} in scene-layouts.json`);
            return;
        }

        const sceneLayout = layoutsFile.scenes[this.sceneName];

        for (const el of this.elements) {
            const elementDef = sceneLayout.elements.find(e => e.id === el.id);
            if (elementDef) {
                this.applyElementConfig(el.object, {
                    x: elementDef.x,
                    y: elementDef.y,
                    scale: elementDef.scale ?? 1,
                    depth: elementDef.depth,
                    width: elementDef.width,
                    height: elementDef.height,
                });
                console.log(`[SceneDebugger] Applied layout for ${el.id}`);
            }
        }
    }

    /**
     * Export current element states to clipboard in scene-layouts.json format
     * This makes it easy to update the JSON file with debugged values
     */
    exportToClipboard(): void {
        const elements: Partial<ElementDef>[] = [];

        for (const el of this.elements) {
            const config = this.getElementConfig(el.object);
            const obj = el.object as any;

            // Build element definition
            const elementDef: Partial<ElementDef> = {
                id: el.id,
                x: Math.round(config.x),
                y: Math.round(config.y),
                scale: Math.round(config.scale * 1000) / 1000, // 3 decimal places
                depth: config.depth ?? 0,
            };

            // Add optional properties if present
            if (config.width !== undefined && config.height !== undefined) {
                elementDef.width = Math.round(config.width);
                elementDef.height = Math.round(config.height);
            }

            // Try to get origin
            if (obj.originX !== undefined && obj.originY !== undefined) {
                elementDef.origin = [obj.originX, obj.originY];
            }

            elements.push(elementDef);
        }

        const output = {
            scene: this.sceneName,
            elements,
            _note: 'Copy these values to scene-layouts.json',
        };

        const jsonStr = JSON.stringify(output, null, 2);

        // Copy to clipboard
        navigator.clipboard.writeText(jsonStr).then(() => {
            console.log('📋 Layout copied to clipboard!');
            console.log(jsonStr);
            this.showSaveConfirmation('📋 Layout copied to clipboard!');
        }).catch(err => {
            console.warn('Failed to copy to clipboard:', err);
            console.log('Manual copy:\n', jsonStr);
        });
    }

    /**
     * Get current layout state for all registered elements
     */
    getCurrentLayoutState(): Record<string, DebugElementConfig> {
        const state: Record<string, DebugElementConfig> = {};
        for (const el of this.elements) {
            state[el.id] = this.getElementConfig(el.object);
        }
        return state;
    }

    private destroy(): void {
        // Remove keyboard event listeners
        const keyboard = this.scene.input.keyboard;
        if (keyboard) {
            keyboard.off('keydown-D');
            keyboard.off('keydown-TAB');
            keyboard.off('keydown-S');
            keyboard.off('keydown-C');
            keyboard.off('keydown-W');
            keyboard.off('keydown-H');

            // Remove key captures (added via addKey)
            keyboard.removeCapture(['D', 'TAB', 'S', 'C', 'P', 'L', 'W', 'Q', 'E', 'R', 'Z', 'X', 'H']);
        }

        this.scene.events.off('update', this.update, this);
        this.scene.events.off('shutdown', this.destroy, this);

        if (this.overlay) {
            this.overlay.destroy();
        }
        if (this.selectionBox) {
            this.selectionBox.destroy();
        }
    }
}

import Phaser from 'phaser';
import { AssetFactory } from './AssetFactory';
import { ScenesFile, SceneDef } from '../types/scenes';
import { SceneLayoutsFile, SpawnPoints, SpawnPoint, EnemyCount } from '../types/layout';
import { UiElementBuilder } from './UiElementBuilder';

export class SceneBuilder {
    private scene: Phaser.Scene;
    private factory: AssetFactory;
    private elements: Map<string, Phaser.GameObjects.GameObject> = new Map();
    private eventHandlers: Map<string, Function> = new Map();
    private zones: Map<string, { x: number; y: number; width?: number; height?: number }> = new Map();
    private zoneOverrides: Map<string, { x: number; y: number }> = new Map();
    private layoutOverrides: Map<string, {
        x: number;
        y: number;
        width?: number;
        height?: number;
        scale?: number;
        scaleX?: number;
        scaleY?: number;
        depth?: number;
        origin?: [number, number];
    }> = new Map();

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.factory = new AssetFactory(scene);
    }

    /**
     * Register event handlers that can be referenced in JSON
     */
    registerHandler(name: string, handler: Function): void {
        this.eventHandlers.set(name, handler);
    }

    /**
     * Build all elements for a scene
     */
    buildScene(sceneName?: string): void {
        const actualSceneName = sceneName ?? (this.scene as any).scene.key;
        const scenesData = this.scene.cache.json.get('scenes') as ScenesFile;
        const sceneDef = scenesData.scenes[actualSceneName];

        if (!sceneDef) {
            console.error(`Scene definition not found: ${actualSceneName}`);
            return;
        }

        // Load position overrides from scene-layouts.json (used by scene editor)
        this.loadLayoutOverrides(actualSceneName);

        // Create elements
        if (sceneDef.elements) {
            sceneDef.elements.forEach(element => {
                let obj: Phaser.GameObjects.GameObject;

                // Check if element uses a UI template
                if (element.uiElement?.templateId) {
                    const builder = new UiElementBuilder(this.scene);
                    // Get layout override to check for origin and position overrides
                    const layoutOverride = this.layoutOverrides.get(element.id);
                    const posX = layoutOverride?.x ?? element.x;
                    const posY = layoutOverride?.y ?? element.y;
                    const origin: [number, number] = layoutOverride?.origin ?? element.origin ?? [0.5, 0.5];

                    const uiObj = builder.buildFromTemplate(
                        element.uiElement.templateId,
                        posX,
                        posY,
                        origin
                    );
                    if (uiObj) {
                        // Apply additional layout overrides (position/origin already applied)
                        if (element.depth !== undefined) uiObj.setDepth(element.depth);
                        if (layoutOverride?.depth !== undefined) uiObj.setDepth(layoutOverride.depth);
                        if (element.visible === false) uiObj.setVisible(false);
                        if (layoutOverride?.visible === false) uiObj.setVisible(false);
                        if (element.alpha !== undefined) uiObj.setAlpha(element.alpha);
                        if (layoutOverride?.alpha !== undefined) uiObj.setAlpha(layoutOverride.alpha);
                        obj = uiObj;
                    } else {
                        // Fallback to regular creation if template not found
                        obj = this.factory.create(element.asset, element);
                    }
                } else {
                    obj = this.factory.create(element.asset, element);
                }

                this.elements.set(element.id, obj);

                // Apply position overrides from scene-layouts.json
                this.applyLayoutOverrides(element.id, obj);

                // Bind events
                if (element.events) {
                    this.bindEvents(obj, element.events);
                }

                // Handle automatic actions from asset definition
                const action = obj.getData('action');
                if (action && (!element.events || !element.events.click)) {
                    this.bindAction(obj, action);
                }
            });
        }

        // Process zones for spawn points
        if (sceneDef.zones) {
            sceneDef.zones.forEach(zoneDef => {
                // Zones can reference a zone asset or have inline coords
                if (zoneDef.x !== undefined && zoneDef.y !== undefined) {
                    this.zones.set(zoneDef.id, {
                        x: zoneDef.x,
                        y: zoneDef.y,
                        width: zoneDef.width,
                        height: zoneDef.height
                    });
                }
            });
        }

        // Create UI elements
        if (sceneDef.ui) {
            sceneDef.ui.forEach(element => {
                let obj: Phaser.GameObjects.GameObject;

                // Check if element uses a UI template
                if (element.uiElement?.templateId) {
                    const builder = new UiElementBuilder(this.scene);
                    // Get layout override to check for origin and position overrides
                    const layoutOverride = this.layoutOverrides.get(element.id);
                    const posX = layoutOverride?.x ?? element.x;
                    const posY = layoutOverride?.y ?? element.y;
                    const origin: [number, number] = layoutOverride?.origin ?? element.origin ?? [0.5, 0.5];

                    const uiObj = builder.buildFromTemplate(
                        element.uiElement.templateId,
                        posX,
                        posY,
                        origin
                    );
                    if (uiObj) {
                        // Apply additional layout overrides (position/origin already applied)
                        if (element.depth !== undefined) uiObj.setDepth(element.depth);
                        if (layoutOverride?.depth !== undefined) uiObj.setDepth(layoutOverride.depth);
                        if (element.visible === false) uiObj.setVisible(false);
                        if (layoutOverride?.visible === false) uiObj.setVisible(false);
                        if (element.alpha !== undefined) uiObj.setAlpha(element.alpha);
                        if (layoutOverride?.alpha !== undefined) uiObj.setAlpha(layoutOverride.alpha);
                        obj = uiObj;
                    } else {
                        // Fallback to regular creation if template not found
                        obj = this.factory.create(element.asset, element);
                    }
                } else {
                    obj = this.factory.create(element.asset, element);
                }

                this.elements.set(element.id, obj);

                // Apply position overrides from scene-layouts.json
                this.applyLayoutOverrides(element.id, obj);

                if (element.events) {
                    this.bindEvents(obj, element.events);
                }
            });
        }
    }

    /**
     * Get a created element by ID
     */
    get<T extends Phaser.GameObjects.GameObject>(id: string): T | undefined {
        return this.elements.get(id) as T;
    }

    /**
     * Get a zone by ID (for spawn points)
     * Checks scene-layouts.json overrides first (hotspots or elements), then falls back to zones from scenes.json
     */
    getZone(id: string): { x: number; y: number; width?: number; height?: number } | undefined {
        // Check if there's an override from scene-layouts.json hotspots (spawn type)
        const hotspotOverride = this.zoneOverrides.get(id);
        if (hotspotOverride) {
            return hotspotOverride;
        }

        // Also check element overrides - zones from scenes.json may be saved as elements in scene-layouts.json
        const elementOverride = this.layoutOverrides.get(id);
        if (elementOverride) {
            return {
                x: elementOverride.x,
                y: elementOverride.y
            };
        }

        return this.zones.get(id);
    }

    /**
     * Bind a click handler to an element after buildScene().
     * This properly handles finding the interactive target for containers (buttons).
     * Use this when you need to attach a handler that wasn't defined in scenes.json.
     */
    bindClick(id: string, handler: () => void): boolean {
        const obj = this.elements.get(id);
        if (!obj) {
            console.warn(`Element not found for bindClick: ${id}`);
            return false;
        }

        const target = this.getInteractiveTarget(obj);
        if (target) {
            target.on('pointerdown', handler);
            return true;
        } else {
            console.warn(`No interactive target found for: ${id}`);
            return false;
        }
    }

    /**
     * Bind automatic action
     */
    private bindAction(obj: Phaser.GameObjects.GameObject, actionString: string): void {
        if (actionString.includes(':')) {
            const [actionType, actionParam] = actionString.split(':');
            if (actionType === 'enterScene') {
                const target = this.getInteractiveTarget(obj);
                if (target) {
                    target.on('pointerdown', () => {
                        this.scene.scene.start(actionParam);
                    });
                }
            }
        }
    }

    /**
     * Bind events from JSON to registered handlers
     */
    private bindEvents(obj: Phaser.GameObjects.GameObject, events: Record<string, string>): void {
        for (const [eventName, handlerName] of Object.entries(events)) {
            // Handle special "action" syntax like "enterScene:ShopScene"
            if (handlerName.includes(':')) {
                this.bindAction(obj, handlerName);
                continue;
            }

            const handler = this.eventHandlers.get(handlerName);
            if (handler) {
                if (eventName === 'click') {
                    // For containers (like buttons), find the interactive child
                    const target = this.getInteractiveTarget(obj);
                    if (target) {
                        target.on('pointerdown', () => handler());
                    } else {
                        console.warn(`No interactive target found for ${obj.getData('id')}`);
                    }
                } else {
                    obj.on(eventName, handler);
                }
            } else {
                console.warn(`Handler not found: ${handlerName} for event ${eventName}`);
            }
        }
    }

    /**
     * Get the interactive target for an object.
     * For containers, returns the first interactive child (usually the background).
     * For other objects, makes them interactive and returns them.
     */
    private getInteractiveTarget(obj: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject | null {
        if (obj instanceof Phaser.GameObjects.Container) {
            // Find the first interactive child (usually the background rectangle)
            const children = obj.list as Phaser.GameObjects.GameObject[];
            for (const child of children) {
                if ((child as any).input) {
                    return child;
                }
            }
            // If no interactive child found, make the first child interactive
            if (children.length > 0 && (children[0] as any).setInteractive) {
                (children[0] as any).setInteractive({ useHandCursor: true });
                return children[0];
            }
            return null;
        }

        // For non-containers, make interactive and return
        if ((obj as any).setInteractive) {
            (obj as any).setInteractive({ useHandCursor: true });
        }
        return obj;
    }

    /**
     * Load position overrides from scene-layouts.json
     * This allows the scene editor to override positions defined in scenes.json
     */
    private loadLayoutOverrides(sceneName: string): void {
        const layoutsFile = this.scene.cache.json.get('sceneLayouts') as SceneLayoutsFile | undefined;
        if (!layoutsFile?.scenes?.[sceneName]) {
            return; // No overrides for this scene
        }

        const sceneLayout = layoutsFile.scenes[sceneName];

        // Index elements by ID for quick lookup
        for (const element of sceneLayout.elements || []) {
            this.layoutOverrides.set(element.id, {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                scale: element.scale,
                scaleX: element.scaleX,
                scaleY: element.scaleY,
                depth: element.depth,
                origin: element.origin
            });
        }

        // Index hotspots that are spawn points - these override zone positions
        for (const hotspot of sceneLayout.hotspots || []) {
            if (hotspot.type === 'spawn' && hotspot.bounds && hotspot.bounds.length >= 2) {
                // Spawn hotspots use bounds[0], bounds[1] as x, y
                this.zoneOverrides.set(hotspot.id, {
                    x: hotspot.bounds[0],
                    y: hotspot.bounds[1]
                });
            }
        }
    }

    /**
     * Apply layout overrides to a created game object
     *
     * Size priority: width/height (via setDisplaySize) takes precedence over scale.
     * This allows the scene editor to control display dimensions directly.
     */
    applyLayoutOverrides(id: string, obj: Phaser.GameObjects.GameObject): void {
        const override = this.layoutOverrides.get(id);
        if (!override) {
            return;
        }

        // Apply origin FIRST (before position) - origin affects how x,y is interpreted
        if (override.origin && (obj as any).setOrigin) {
            (obj as any).setOrigin(override.origin[0], override.origin[1]);
        }

        // Apply position
        if ((obj as any).x !== undefined) (obj as any).x = override.x;
        if ((obj as any).y !== undefined) (obj as any).y = override.y;

        // Apply size: width/height takes precedence over scale
        // This prevents scale from overwriting setDisplaySize set by AssetFactory
        if (override.width !== undefined && override.height !== undefined) {
            // Use setDisplaySize for explicit dimensions
            if ((obj as any).setDisplaySize) {
                (obj as any).setDisplaySize(override.width, override.height);
            }
        } else if ((obj as any).setScale) {
            // Only apply scale if width/height are NOT specified
            if (override.scaleX !== undefined && override.scaleY !== undefined) {
                (obj as any).setScale(override.scaleX, override.scaleY);
            } else if (override.scale !== undefined) {
                (obj as any).setScale(override.scale);
            }
        }

        if (override.depth !== undefined && (obj as any).setDepth) {
            (obj as any).setDepth(override.depth);
        }
    }

    /**
     * Check if layout overrides exist for an element
     */
    hasLayoutOverride(id: string): boolean {
        return this.layoutOverrides.has(id);
    }

    /**
     * Get layout override for an element
     */
    getLayoutOverride(id: string): {
        x: number;
        y: number;
        width?: number;
        height?: number;
        scale?: number;
        scaleX?: number;
        scaleY?: number;
        depth?: number;
        origin?: [number, number];
    } | undefined {
        return this.layoutOverrides.get(id);
    }

    /**
     * Get spawn points for battle scenes (BattleScene, ArenaScene)
     * Returns player, pet, and enemy positions for the specified enemy count
     *
     * @param sceneName - The scene to get spawn points for (defaults to current scene)
     * @param enemyCount - Number of enemies (1, 2, or 3)
     * @returns Spawn points object with player, pet, and enemies array
     */
    getSpawnPoints(sceneName?: string, enemyCount: number = 1): {
        player: SpawnPoint;
        pet: SpawnPoint;
        enemies: SpawnPoint[];
    } | null {
        const actualSceneName = sceneName ?? (this.scene as any).scene.key;
        const layoutsFile = this.scene.cache.json.get('sceneLayouts') as SceneLayoutsFile | undefined;

        if (!layoutsFile?.scenes?.[actualSceneName]?.spawnPoints) {
            return null;
        }

        const spawnPoints = layoutsFile.scenes[actualSceneName].spawnPoints!;
        const enemyCountKey = String(Math.min(3, Math.max(1, enemyCount))) as EnemyCount;

        return {
            player: { ...spawnPoints.player },
            pet: { ...spawnPoints.pet },
            enemies: spawnPoints.enemies[enemyCountKey]?.map(e => ({ ...e })) || []
        };
    }

    /**
     * Get all spawn points configuration for a scene
     * Use this when you need access to all enemy count configurations
     */
    getAllSpawnPoints(sceneName?: string): SpawnPoints | null {
        const actualSceneName = sceneName ?? (this.scene as any).scene.key;
        const layoutsFile = this.scene.cache.json.get('sceneLayouts') as SceneLayoutsFile | undefined;

        if (!layoutsFile?.scenes?.[actualSceneName]?.spawnPoints) {
            return null;
        }

        return layoutsFile.scenes[actualSceneName].spawnPoints!;
    }
}

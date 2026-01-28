import Phaser from 'phaser';
import { AssetFactory } from './AssetFactory';
import { ScenesFile, SceneDef, SpawnPoints, SpawnPoint, EnemyCount } from '../types/scenes';
import { UiElementBuilder } from './UiElementBuilder';

export class SceneBuilder {
    private scene: Phaser.Scene;
    private factory: AssetFactory;
    private elements: Map<string, Phaser.GameObjects.GameObject> = new Map();
    private eventHandlers: Map<string, Function> = new Map();
    private zones: Map<string, { x: number; y: number; width?: number; height?: number }> = new Map();
    private currentSceneDef: SceneDef | null = null;

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

        // Store scene definition for later access (e.g., getSpawnPoints)
        this.currentSceneDef = sceneDef;

        // Create elements
        if (sceneDef.elements) {
            sceneDef.elements.forEach(element => {
                let obj: Phaser.GameObjects.GameObject;

                // Check if element uses a UI template
                if (element.uiElement?.templateId) {
                    const builder = new UiElementBuilder(this.scene);
                    const origin: [number, number] = element.origin ?? [0.5, 0.5];

                    const uiObj = builder.buildFromTemplate(
                        element.uiElement.templateId,
                        element.x,
                        element.y,
                        origin,
                        element.uiElement.textOverrides
                    );
                    if (uiObj) {
                        if (element.depth !== undefined) uiObj.setDepth(element.depth);
                        if (element.visible === false) uiObj.setVisible(false);
                        if (element.alpha !== undefined) uiObj.setAlpha(element.alpha);
                        // Apply scale (with flip support via negative scale)
                        let scaleX = element.scale ?? element.scaleX ?? 1;
                        let scaleY = element.scale ?? element.scaleY ?? 1;
                        if (element.flipX) scaleX = -Math.abs(scaleX);
                        if (element.flipY) scaleY = -Math.abs(scaleY);
                        if (scaleX !== 1 || scaleY !== 1) uiObj.setScale(scaleX, scaleY);
                        // Apply rotation
                        if (element.rotation !== undefined) uiObj.setAngle(element.rotation);
                        obj = uiObj;
                    } else {
                        // Fallback to regular creation if template not found
                        obj = this.factory.create(element.asset, element);
                    }
                } else {
                    obj = this.factory.create(element.asset, element);
                }

                this.elements.set(element.id, obj);

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
                    const origin: [number, number] = element.origin ?? [0.5, 0.5];

                    const uiObj = builder.buildFromTemplate(
                        element.uiElement.templateId,
                        element.x,
                        element.y,
                        origin,
                        element.uiElement.textOverrides
                    );
                    if (uiObj) {
                        if (element.depth !== undefined) uiObj.setDepth(element.depth);
                        if (element.visible === false) uiObj.setVisible(false);
                        if (element.alpha !== undefined) uiObj.setAlpha(element.alpha);
                        // Apply scale (with flip support via negative scale)
                        let scaleX = element.scale ?? element.scaleX ?? 1;
                        let scaleY = element.scale ?? element.scaleY ?? 1;
                        if (element.flipX) scaleX = -Math.abs(scaleX);
                        if (element.flipY) scaleY = -Math.abs(scaleY);
                        if (scaleX !== 1 || scaleY !== 1) uiObj.setScale(scaleX, scaleY);
                        // Apply rotation
                        if (element.rotation !== undefined) uiObj.setAngle(element.rotation);
                        obj = uiObj;
                    } else {
                        // Fallback to regular creation if template not found
                        obj = this.factory.create(element.asset, element);
                    }
                } else {
                    obj = this.factory.create(element.asset, element);
                }

                this.elements.set(element.id, obj);

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
     * Get element definition from scenes.json by ID
     * This allows runtime code to access element properties (x, y, depth, scale, etc.)
     *
     * @deprecated Use get() to access created game objects instead when possible.
     * This method is provided for backward compatibility with code that used getLayoutOverride()
     */
    getElementDef(id: string): {
        x: number;
        y: number;
        width?: number;
        height?: number;
        scale?: number;
        scaleX?: number;
        scaleY?: number;
        depth?: number;
        origin?: [number, number];
        alpha?: number;
        visible?: boolean;
    } | undefined {
        if (!this.currentSceneDef) return undefined;

        // Search in elements
        const element = this.currentSceneDef.elements?.find(e => e.id === id);
        if (element) {
            return {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                scale: element.scale,
                scaleX: element.scaleX,
                scaleY: element.scaleY,
                depth: element.depth,
                origin: element.origin,
                alpha: element.alpha,
                visible: element.visible,
            };
        }

        // Search in UI
        const uiElement = this.currentSceneDef.ui?.find(e => e.id === id);
        if (uiElement) {
            return {
                x: uiElement.x,
                y: uiElement.y,
                width: uiElement.width,
                height: uiElement.height,
                scale: uiElement.scale,
                scaleX: uiElement.scaleX,
                scaleY: uiElement.scaleY,
                depth: uiElement.depth,
                origin: uiElement.origin,
                alpha: uiElement.alpha,
                visible: uiElement.visible,
            };
        }

        return undefined;
    }

    /**
     * @deprecated Use getElementDef() instead. This alias is provided for backward compatibility.
     */
    getLayoutOverride(id: string) {
        return this.getElementDef(id);
    }

    /**
     * Get a zone by ID (for spawn points)
     */
    getZone(id: string): { x: number; y: number; width?: number; height?: number } | undefined {
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
     * Get spawn points for battle scenes (BattleScene, ArenaScene)
     * Returns player, pet, and enemy positions for the specified enemy count
     *
     * Spawn points are now stored directly in scenes.json
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
        const scenesFile = this.scene.cache.json.get('scenes') as ScenesFile;
        const sceneDef = scenesFile?.scenes?.[actualSceneName];

        if (!sceneDef?.spawnPoints) {
            return null;
        }

        const spawnPoints = sceneDef.spawnPoints;
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
     *
     * Spawn points are now stored directly in scenes.json
     */
    getAllSpawnPoints(sceneName?: string): SpawnPoints | null {
        const actualSceneName = sceneName ?? (this.scene as any).scene.key;
        const scenesFile = this.scene.cache.json.get('scenes') as ScenesFile;
        const sceneDef = scenesFile?.scenes?.[actualSceneName];

        if (!sceneDef?.spawnPoints) {
            return null;
        }

        return sceneDef.spawnPoints;
    }
}

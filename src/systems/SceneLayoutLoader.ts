import Phaser from 'phaser';
import {
    ElementDef,
    HotspotDef,
    SceneLayoutDef,
    SceneLayoutsFile,
    TemplateDef,
    LayoutElement,
} from '../types/layout';

/**
 * SceneLayoutLoader
 *
 * Loads scene layouts from the centralized scene-layouts.json file
 * and creates Phaser game objects based on the definitions.
 *
 * Usage:
 * ```typescript
 * class TownScene extends Phaser.Scene {
 *     private layoutLoader!: SceneLayoutLoader;
 *
 *     create() {
 *         this.layoutLoader = new SceneLayoutLoader(this, 'TownScene');
 *         this.layoutLoader.createAllElements();
 *
 *         // Get specific element for dynamic manipulation
 *         const knight = this.layoutLoader.getElement<Phaser.GameObjects.Sprite>('knight');
 *     }
 * }
 * ```
 */
export class SceneLayoutLoader {
    private scene: Phaser.Scene;
    private sceneName: string;
    private layout: SceneLayoutDef | null = null;
    private elements: Map<string, LayoutElement> = new Map();
    private hotspots: Map<string, Phaser.GameObjects.Zone> = new Map();

    /** Cache key for scene layouts JSON */
    static readonly CACHE_KEY = 'sceneLayouts';

    constructor(scene: Phaser.Scene, sceneName: string) {
        this.scene = scene;
        this.sceneName = sceneName;
        this.loadLayout();
    }

    /**
     * Load layout definition from Phaser cache
     */
    private loadLayout(): void {
        const layoutsFile = this.scene.cache.json.get(
            SceneLayoutLoader.CACHE_KEY
        ) as SceneLayoutsFile | undefined;

        if (!layoutsFile) {
            console.warn(
                `[SceneLayoutLoader] No layouts file found in cache (key: ${SceneLayoutLoader.CACHE_KEY})`
            );
            return;
        }

        this.layout = layoutsFile.scenes[this.sceneName] ?? null;

        if (!this.layout) {
            console.warn(
                `[SceneLayoutLoader] No layout found for scene: ${this.sceneName}`
            );
        }
    }

    /**
     * Check if layout was loaded successfully
     */
    hasLayout(): boolean {
        return this.layout !== null;
    }

    /**
     * Get the raw layout definition
     */
    getLayoutDef(): SceneLayoutDef | null {
        return this.layout;
    }

    /**
     * Create all static elements defined in the layout
     */
    createAllElements(): void {
        if (!this.layout) return;

        for (const elementDef of this.layout.elements) {
            this.createElement(elementDef);
        }
    }

    /**
     * Create all hotspots defined in the layout
     */
    createAllHotspots(
        onTrigger?: (hotspot: HotspotDef) => void
    ): void {
        if (!this.layout) return;

        for (const hotspotDef of this.layout.hotspots) {
            this.createHotspot(hotspotDef, onTrigger);
        }
    }

    /**
     * Create a single element from definition
     */
    createElement(def: ElementDef): Phaser.GameObjects.GameObject | null {
        let gameObject: Phaser.GameObjects.GameObject | null = null;

        switch (def.type) {
            case 'image':
                gameObject = this.createImage(def);
                break;
            case 'sprite':
                gameObject = this.createSprite(def);
                break;
            case 'tileSprite':
                gameObject = this.createTileSprite(def);
                break;
            case 'text':
                gameObject = this.createText(def);
                break;
            case 'container':
                gameObject = this.createContainer(def);
                break;
            case 'zone':
                gameObject = this.createZone(def);
                break;
            case 'graphics':
                gameObject = this.createGraphics(def);
                break;
            default:
                console.warn(
                    `[SceneLayoutLoader] Unknown element type: ${def.type}`
                );
                return null;
        }

        if (gameObject) {
            this.elements.set(def.id, { def, gameObject });
        }

        return gameObject;
    }

    /**
     * Create an image game object
     */
    private createImage(def: ElementDef): Phaser.GameObjects.Image {
        const image = this.scene.add
            .image(def.x, def.y, def.asset!)
            .setOrigin(...def.origin)
            .setDepth(def.depth);

        if (def.scale !== undefined) {
            image.setScale(def.scale);
        }
        if (def.visible === false) {
            image.setVisible(false);
        }
        if (def.flipX) {
            image.setFlipX(true);
        }
        if (def.flipY) {
            image.setFlipY(true);
        }
        if (def.alpha !== undefined) {
            image.setAlpha(def.alpha);
        }
        if (def.scrollFactor !== undefined) {
            if (Array.isArray(def.scrollFactor)) {
                image.setScrollFactor(def.scrollFactor[0], def.scrollFactor[1]);
            } else {
                image.setScrollFactor(def.scrollFactor);
            }
        }
        if (def.interactive) {
            const opts = typeof def.interactive === 'object'
                ? { useHandCursor: def.interactive.useHandCursor }
                : {};
            image.setInteractive(opts);
        }

        return image;
    }

    /**
     * Create a sprite game object
     */
    private createSprite(def: ElementDef): Phaser.GameObjects.Sprite {
        const sprite = this.scene.add
            .sprite(def.x, def.y, def.asset!)
            .setOrigin(...def.origin)
            .setDepth(def.depth);

        if (def.scale !== undefined) {
            sprite.setScale(def.scale);
        }
        if (def.visible === false) {
            sprite.setVisible(false);
        }
        if (def.flipX) {
            sprite.setFlipX(true);
        }
        if (def.flipY) {
            sprite.setFlipY(true);
        }
        if (def.alpha !== undefined) {
            sprite.setAlpha(def.alpha);
        }
        if (def.scrollFactor !== undefined) {
            if (Array.isArray(def.scrollFactor)) {
                sprite.setScrollFactor(def.scrollFactor[0], def.scrollFactor[1]);
            } else {
                sprite.setScrollFactor(def.scrollFactor);
            }
        }
        if (def.initialAnimation) {
            sprite.play(def.initialAnimation);
        }
        if (def.interactive) {
            const opts = typeof def.interactive === 'object'
                ? { useHandCursor: def.interactive.useHandCursor }
                : {};
            sprite.setInteractive(opts);
        }

        return sprite;
    }

    /**
     * Create a tile sprite game object
     */
    private createTileSprite(def: ElementDef): Phaser.GameObjects.TileSprite {
        const tileSprite = this.scene.add
            .tileSprite(
                def.x,
                def.y,
                def.width ?? 100,
                def.height ?? 100,
                def.asset!
            )
            .setOrigin(...def.origin)
            .setDepth(def.depth);

        if (def.scale !== undefined) {
            tileSprite.setScale(def.scale);
        }
        if (def.visible === false) {
            tileSprite.setVisible(false);
        }
        if (def.alpha !== undefined) {
            tileSprite.setAlpha(def.alpha);
        }
        if (def.scrollFactor !== undefined) {
            if (Array.isArray(def.scrollFactor)) {
                tileSprite.setScrollFactor(def.scrollFactor[0], def.scrollFactor[1]);
            } else {
                tileSprite.setScrollFactor(def.scrollFactor);
            }
        }
        if (def.tileScale) {
            tileSprite.setTileScale(def.tileScale[0], def.tileScale[1]);
        }

        return tileSprite;
    }

    /**
     * Create a text game object
     */
    private createText(def: ElementDef): Phaser.GameObjects.Text {
        const textConfig = def.text ?? { content: '', style: {} };

        const text = this.scene.add
            .text(def.x, def.y, textConfig.content, textConfig.style)
            .setOrigin(...def.origin)
            .setDepth(def.depth);

        if (def.scale !== undefined) {
            text.setScale(def.scale);
        }
        if (def.visible === false) {
            text.setVisible(false);
        }

        return text;
    }

    /**
     * Create a container game object
     */
    private createContainer(def: ElementDef): Phaser.GameObjects.Container {
        const container = this.scene.add
            .container(def.x, def.y)
            .setDepth(def.depth);

        if (def.scale !== undefined) {
            container.setScale(def.scale);
        }
        if (def.visible === false) {
            container.setVisible(false);
        }

        // Note: Children are added separately by the scene
        // since they may need custom initialization

        return container;
    }

    /**
     * Create a zone game object
     */
    private createZone(def: ElementDef): Phaser.GameObjects.Zone {
        const zone = this.scene.add
            .zone(def.x, def.y, def.width ?? 100, def.height ?? 100)
            .setOrigin(...def.origin);

        // Zones don't have depth in the same way, but we can set it
        (zone as any).depth = def.depth;

        return zone;
    }

    /**
     * Create a graphics game object
     */
    private createGraphics(def: ElementDef): Phaser.GameObjects.Graphics {
        const graphics = this.scene.add.graphics();
        graphics.setDepth(def.depth);

        if (!def.graphics) return graphics;

        const { shape, fill, alpha, stroke, size } = def.graphics;

        // Set fill style
        if (fill !== undefined) {
            graphics.fillStyle(fill, alpha ?? 1);
        }

        // Set stroke style
        if (stroke) {
            graphics.lineStyle(stroke.width, stroke.color);
        }

        // Draw shape
        switch (shape) {
            case 'rect':
                if (fill !== undefined) {
                    graphics.fillRect(def.x, def.y, size[0], size[1]);
                }
                if (stroke) {
                    graphics.strokeRect(def.x, def.y, size[0], size[1]);
                }
                break;
            case 'circle':
                if (fill !== undefined) {
                    graphics.fillCircle(def.x, def.y, size[0]);
                }
                if (stroke) {
                    graphics.strokeCircle(def.x, def.y, size[0]);
                }
                break;
            case 'roundedRect':
                if (fill !== undefined) {
                    graphics.fillRoundedRect(
                        def.x,
                        def.y,
                        size[0],
                        size[1],
                        size[2] ?? 10
                    );
                }
                if (stroke) {
                    graphics.strokeRoundedRect(
                        def.x,
                        def.y,
                        size[0],
                        size[1],
                        size[2] ?? 10
                    );
                }
                break;
        }

        if (def.visible === false) {
            graphics.setVisible(false);
        }

        return graphics;
    }

    /**
     * Create a hotspot zone
     */
    createHotspot(
        def: HotspotDef,
        onTrigger?: (hotspot: HotspotDef) => void
    ): Phaser.GameObjects.Zone | null {
        let zone: Phaser.GameObjects.Zone;

        switch (def.shape) {
            case 'rect': {
                const [x, y, w, h] = def.bounds;
                zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
                break;
            }
            case 'circle': {
                const [cx, cy, r] = def.bounds;
                zone = this.scene.add.zone(cx, cy, r * 2, r * 2);
                // Note: For accurate circle detection, use custom hit test
                break;
            }
            case 'polygon': {
                // For polygons, calculate bounding box
                const points = def.bounds;
                let minX = Infinity,
                    minY = Infinity,
                    maxX = -Infinity,
                    maxY = -Infinity;
                for (let i = 0; i < points.length; i += 2) {
                    minX = Math.min(minX, points[i]);
                    maxX = Math.max(maxX, points[i]);
                    minY = Math.min(minY, points[i + 1]);
                    maxY = Math.max(maxY, points[i + 1]);
                }
                const w = maxX - minX;
                const h = maxY - minY;
                zone = this.scene.add.zone(minX + w / 2, minY + h / 2, w, h);
                // Store polygon points for accurate hit testing
                zone.setData('polygonPoints', points);
                break;
            }
            default:
                console.warn(`[SceneLayoutLoader] Unknown hotspot shape: ${def.shape}`);
                return null;
        }

        zone.setInteractive();
        zone.setData('hotspot', def);

        if (def.depth !== undefined) {
            (zone as any).depth = def.depth;
        }

        if (def.active === false) {
            zone.disableInteractive();
        }

        // Setup trigger handler
        if (def.type === 'trigger' && onTrigger) {
            zone.on('pointerdown', () => onTrigger(def));
        }

        this.hotspots.set(def.id, zone);

        return zone;
    }

    /**
     * Create elements from a template
     */
    createFromTemplate(
        templateId: string,
        count?: number,
        overrides?: Partial<ElementDef>[]
    ): Phaser.GameObjects.GameObject[] {
        if (!this.layout?.templates) {
            console.warn(`[SceneLayoutLoader] No templates defined for ${this.sceneName}`);
            return [];
        }

        const template = this.layout.templates[templateId];
        if (!template) {
            console.warn(`[SceneLayoutLoader] Template not found: ${templateId}`);
            return [];
        }

        const objects: Phaser.GameObjects.GameObject[] = [];
        const positions = this.getTemplatePositions(template, count);

        positions.forEach((pos, index) => {
            const elementDef: ElementDef = {
                ...template.element,
                id: `${templateId}${index}`,
                x: pos[0],
                y: pos[1],
                origin: template.element.origin ?? [0.5, 0.5],
                depth: template.element.depth ?? 0,
                editable: template.element.editable ?? true,
                ...(overrides?.[index] ?? {}),
            } as ElementDef;

            const obj = this.createElement(elementDef);
            if (obj) {
                objects.push(obj);
            }
        });

        return objects;
    }

    /**
     * Calculate positions based on template generation strategy
     */
    private getTemplatePositions(
        template: TemplateDef,
        count?: number
    ): [number, number][] {
        const gen = template.generation;

        switch (gen.type) {
            case 'single':
                return [[template.element.x ?? 0, template.element.y ?? 0]];

            case 'positions':
                return count !== undefined
                    ? gen.points.slice(0, count)
                    : gen.points;

            case 'grid': {
                const positions: [number, number][] = [];
                const baseX = template.element.x ?? 0;
                const baseY = template.element.y ?? 0;
                const [spacingX, spacingY] = gen.spacing;

                for (let row = 0; row < gen.rows; row++) {
                    for (let col = 0; col < gen.cols; col++) {
                        positions.push([
                            baseX + col * spacingX,
                            baseY + row * spacingY,
                        ]);
                    }
                }
                return count !== undefined
                    ? positions.slice(0, count)
                    : positions;
            }

            case 'dynamic':
                // Dynamic positions must be provided via overrides
                return [];

            default:
                return [];
        }
    }

    /**
     * Get a created element by ID
     */
    getElement<T extends Phaser.GameObjects.GameObject>(id: string): T | null {
        const element = this.elements.get(id);
        return (element?.gameObject as T) ?? null;
    }

    /**
     * Get element definition by ID (from created elements)
     */
    getElementDef(id: string): ElementDef | null {
        return this.elements.get(id)?.def ?? null;
    }

    /**
     * Get raw element definition by ID directly from layout (no need to create first)
     */
    getRawElementDef(id: string): ElementDef | null {
        if (!this.layout) return null;
        return this.layout.elements.find(e => e.id === id) ?? null;
    }

    /**
     * Get raw hotspot definition by ID directly from layout
     */
    getRawHotspotDef(id: string): HotspotDef | null {
        if (!this.layout) return null;
        return this.layout.hotspots.find(h => h.id === id) ?? null;
    }

    /**
     * Get a hotspot zone by ID
     */
    getHotspot(id: string): Phaser.GameObjects.Zone | null {
        return this.hotspots.get(id) ?? null;
    }

    /**
     * Get all created elements
     */
    getAllElements(): Map<string, LayoutElement> {
        return this.elements;
    }

    /**
     * Get all hotspots
     */
    getAllHotspots(): Map<string, Phaser.GameObjects.Zone> {
        return this.hotspots;
    }

    /**
     * Get viewport dimensions from layout
     */
    getViewport(): { width: number; height: number } {
        return this.layout?.viewport ?? { width: 1280, height: 720 };
    }

    /**
     * Update element position (for runtime changes)
     */
    updateElementPosition(id: string, x: number, y: number): void {
        const element = this.elements.get(id);
        if (element) {
            (element.gameObject as any).x = x;
            (element.gameObject as any).y = y;
        }
    }

    /**
     * Export current element states (for SceneDebugger integration)
     */
    exportCurrentState(): Record<string, { x: number; y: number; scale: number; depth: number }> {
        const state: Record<string, { x: number; y: number; scale: number; depth: number }> = {};

        for (const [id, element] of this.elements) {
            const obj = element.gameObject as any;
            state[id] = {
                x: obj.x ?? 0,
                y: obj.y ?? 0,
                scale: obj.scaleX ?? obj.scale ?? 1,
                depth: obj.depth ?? 0,
            };
        }

        return state;
    }

    /**
     * Destroy all created elements
     */
    destroy(): void {
        for (const [, element] of this.elements) {
            element.gameObject.destroy();
        }
        for (const [, zone] of this.hotspots) {
            zone.destroy();
        }
        this.elements.clear();
        this.hotspots.clear();
    }
}

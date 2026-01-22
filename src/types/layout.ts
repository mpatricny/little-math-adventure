/**
 * Scene Layout Type Definitions
 *
 * These types define the structure of scene-layouts.json,
 * which serves as the single source of truth for all scene layouts.
 */

/**
 * Supported element types in scene layouts
 */
export type ElementType =
    | 'image'
    | 'sprite'
    | 'tileSprite'
    | 'container'
    | 'zone'
    | 'text'
    | 'graphics'
    | 'nineslice'
    | 'uiElement';

/**
 * Definition for a single scene element
 */
export interface ElementDef {
    /** Unique identifier for the element */
    id: string;

    /** Type of Phaser game object to create */
    type: ElementType;

    /** Asset key (as registered in BootScene) */
    asset?: string;

    /** Spritesheet configuration (for sprite/tileSprite) */
    spritesheet?: {
        frameWidth: number;
        frameHeight: number;
    };

    /** X position */
    x: number;

    /** Y position */
    y: number;

    /** Uniform scale (default: 1) */
    scale?: number;

    /** Non-uniform scale X (takes precedence over scale) */
    scaleX?: number;

    /** Non-uniform scale Y (takes precedence over scale) */
    scaleY?: number;

    /** Display width (for tileSprite, graphics) */
    width?: number;

    /** Display height (for tileSprite, graphics) */
    height?: number;

    /** Origin point [originX, originY] (default: [0.5, 0.5]) */
    origin: [number, number];

    /** Depth/z-index for rendering order */
    depth: number;

    /** Whether this element can be edited in debug mode */
    editable: boolean;

    /** Visibility (default: true) */
    visible?: boolean;

    /** Animation keys this element can play */
    animations?: string[];

    /** Text configuration (for type: 'text') */
    text?: {
        content: string;
        style: {
            fontSize?: string;
            fontFamily?: string;
            color?: string;
            align?: string;
            backgroundColor?: string;
            padding?: { x?: number; y?: number };
        };
    };

    /** Graphics configuration (for type: 'graphics') */
    graphics?: {
        shape: 'rect' | 'circle' | 'roundedRect';
        fill?: number;
        alpha?: number;
        stroke?: {
            color: number;
            width: number;
        };
        size: number[]; // [w, h] or [radius] or [w, h, cornerRadius]
    };

    /** Child element IDs (for type: 'container') */
    children?: string[];

    /** Initial animation to play */
    initialAnimation?: string;

    /** Flip X (default: false) */
    flipX?: boolean;

    /** Flip Y (default: false) */
    flipY?: boolean;

    /** Alpha/opacity (0-1, default: 1) */
    alpha?: number;

    /** Scroll factor for parallax (default: 1) */
    scrollFactor?: number | [number, number];

    /** Tile scale for tileSprite */
    tileScale?: [number, number];

    /** Interactive settings */
    interactive?: boolean | {
        useHandCursor?: boolean;
        hitArea?: 'rect' | 'circle';
    };

    /** UI Element template reference (for type: 'uiElement') */
    uiElement?: {
        templateId: string;
    };
}

/**
 * Hotspot types for interactive areas
 */
export type HotspotType = 'trigger' | 'spawn' | 'dropZone' | 'navigation';

/**
 * Hotspot shape types
 */
export type HotspotShape = 'rect' | 'circle' | 'polygon';

/**
 * Definition for an interactive hotspot/zone
 */
export interface HotspotDef {
    /** Unique identifier */
    id: string;

    /** Type of hotspot */
    type: HotspotType;

    /** Shape of the hotspot area */
    shape: HotspotShape;

    /**
     * Bounds array depending on shape:
     * - rect: [x, y, width, height]
     * - circle: [centerX, centerY, radius]
     * - polygon: [x1, y1, x2, y2, x3, y3, ...]
     */
    bounds: number[];

    /** Action to execute (e.g., "enterScene:WitchHutScene") */
    action?: string;

    /** Additional data for the hotspot */
    data?: Record<string, unknown>;

    /** Depth/z-index */
    depth?: number;

    /** Whether hotspot is active (default: true) */
    active?: boolean;
}

/**
 * Template generation strategies
 */
export type GenerationType =
    | { type: 'single' }
    | { type: 'grid'; rows: number; cols: number; spacing: [number, number] }
    | { type: 'positions'; points: [number, number][] }
    | { type: 'dynamic' }; // Runtime code decides

/**
 * Template for dynamically created elements
 */
export interface TemplateDef {
    /** Base element definition (without id, x, y - these are generated) */
    element: Omit<ElementDef, 'id' | 'x' | 'y'> & { x?: number; y?: number };

    /** How instances are generated */
    generation: GenerationType;
}

/**
 * Spawn point position
 */
export interface SpawnPoint {
    x: number;
    y: number;
}

/**
 * Enemy count key type
 */
export type EnemyCount = '1' | '2' | '3';

/**
 * Spawn points configuration for battle scenes
 */
export interface SpawnPoints {
    /** Player spawn position */
    player: SpawnPoint;

    /** Pet spawn position */
    pet: SpawnPoint;

    /** Enemy spawn positions for different enemy counts */
    enemies: Record<EnemyCount, SpawnPoint[]>;
}

/**
 * Complete scene layout definition
 */
export interface SceneLayoutDef {
    /** Viewport dimensions */
    viewport: {
        width: number;
        height: number;
    };

    /** Static elements created at scene start */
    elements: ElementDef[];

    /** Interactive hotspots/zones */
    hotspots: HotspotDef[];

    /** Templates for dynamically created elements */
    templates?: Record<string, TemplateDef>;

    /** Spawn points for battle scenes (BattleScene, ArenaScene) */
    spawnPoints?: SpawnPoints;
}

/**
 * Root structure of scene-layouts.json
 */
export interface SceneLayoutsFile {
    /** File format version */
    version: string;

    /** All scene layouts keyed by scene name */
    scenes: Record<string, SceneLayoutDef>;
}

/**
 * Runtime element reference (element + its game object)
 */
export interface LayoutElement {
    def: ElementDef;
    gameObject: Phaser.GameObjects.GameObject;
}

import Phaser from 'phaser';

// Base asset types
export type AssetType =
    | 'image'
    | 'sprite'
    | 'animatedSprite'
    | 'staticImage'
    | 'interactiveImage'
    | 'tileSprite'
    | 'text'
    | 'button'
    | 'progressBar'
    | 'panel'
    | 'container'
    | 'zone'
    | 'trigger'
    | 'spriteItem'
    | 'draggableSprite'
    | 'tweenEffect'
    | 'tintEffect'
    | 'playerSpawn'
    | 'enemySpawn'
    | 'npcSpawn'
    | 'dropZone'
    | 'itemSpawn'
    | 'nineSlice';

// Nine-slice config (from nine-slices.json)
export interface NineSliceConfig {
    texture: string;
    name: string;        // Human-readable asset name
    path: string;        // Texture path (library:originals/...)
    leftWidth: number;
    rightWidth: number;
    topHeight: number;
    bottomHeight: number;
}

// Nine-slices manifest file
export interface NineSlicesFile {
    version: string;
    configs: Record<string, NineSliceConfig>;
}

// Texture definition (raw file reference)
export interface TextureDef {
    path: string;
    frameWidth?: number;
    frameHeight?: number;
}

// Animation definition
export interface AnimationDef {
    texture: string;
    frames: { start: number; end: number };
    frameRate: number;
    repeat: number;
}

// Base asset definition
export interface BaseAssetDef {
    type: AssetType;
    category?: string;
    origin?: [number, number];
    scale?: number | { [variant: string]: number };
    depth?: number;
    visible?: boolean;
    alpha?: number;
}

// Specific asset types
export interface SpriteAssetDef extends BaseAssetDef {
    type: 'sprite' | 'animatedSprite';
    defaultTexture: string;
    animations?: Record<string, string>;
    defaultAnimation?: string;
    nameKey?: string;
    hurtEffect?: {
        tint: string;
        duration: number;
    };
}

export interface ImageAssetDef extends BaseAssetDef {
    type: 'image' | 'staticImage' | 'interactiveImage';
    texture: string;
    displaySize?: [number, number];
    interactive?: { useHandCursor: boolean };
    hoverEffect?: {
        scaleMultiplier?: number;
        tint?: string;
    };
    action?: string;
    labelKey?: string;
}

export interface TileSpriteAssetDef extends BaseAssetDef {
    type: 'tileSprite';
    texture: string;
    tileScale?: [number, number];
    scrollFactor?: number;
    width?: number;
    height?: number;
}

export interface ButtonAssetDef extends BaseAssetDef {
    type: 'button';
    width: number;
    height: number;
    textKey?: string;
    style: {
        fill: string;
        hoverFill?: string;
        pressedFill?: string;
        stroke?: { color: string; width: number };
    };
    textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

export interface ProgressBarAssetDef extends BaseAssetDef {
    type: 'progressBar';
    width: number;
    height: number;
    style: {
        background: string;
    };
    fillColors: {
        high: string;
        medium: string;
        low: string;
    };
    thresholds: {
        medium: number;
        low: number;
    };
    showText?: boolean;
    textFormat?: string;
    textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
    attachTo?: string;
    offset?: [number, number];
}

export interface PanelAssetDef extends BaseAssetDef {
    type: 'panel';
    fill: string;
    alpha?: number;
    stroke?: {
        color: string;
        width: number;
    };
}

export interface TextAssetDef extends BaseAssetDef {
    type: 'text';
    style: Phaser.Types.GameObjects.Text.TextStyle;
    floatAnimation?: {
        y: number;
        duration: number;
        ease: string;
    };
    animation?: {
        type: string;
        y?: number;
        duration?: number;
    };
    hoverColor?: string;
}

export interface ContainerAssetDef extends BaseAssetDef {
    type: 'container';
    components: Array<{
        type: 'circle' | 'text';
        radius?: number;
        fill?: string;
        stroke?: { color: string; width: number };
        content?: string;
        style?: Phaser.Types.GameObjects.Text.TextStyle;
        offsetY?: number;
    }>;
    pulseAnimation?: {
        y: number;
        scale: number;
        duration: number;
    };
}

export interface ItemAssetDef extends BaseAssetDef {
    type: 'spriteItem' | 'draggableSprite';
    texture: string;
    variants: Record<string, {
        frame: number;
        nameKey: string;
        value?: number;
    }>;
    draggable?: boolean;
}

export interface EffectAssetDef {
    type: 'tweenEffect' | 'tintEffect';
    props?: Record<string, any>;
    duration: number;
    ease?: string;
    yoyo?: boolean;
    repeat?: number;
    tint?: string;
}

export interface ZoneDef extends BaseAssetDef {
    type: 'playerSpawn' | 'enemySpawn' | 'npcSpawn' | 'dropZone' | 'itemSpawn' | 'trigger';
    character?: string;
    scaleVariant?: string;
    point?: [number, number];
    points?: [number, number][];
    facing?: 'left' | 'right';
    maxEnemies?: number;
    shape?: 'rect';
    bounds?: [number, number, number, number];
    accepts?: string[];
    onDrop?: string;
    item?: string;
    spawnPattern?: string;
    action?: string;
}

export type AssetDef =
    | SpriteAssetDef
    | ImageAssetDef
    | TileSpriteAssetDef
    | ButtonAssetDef
    | ProgressBarAssetDef
    | PanelAssetDef
    | TextAssetDef
    | ContainerAssetDef
    | ItemAssetDef
    | EffectAssetDef
    | ZoneDef;

// File structures
export interface TexturesFile {
    version: string;
    spritesheets: Record<string, TextureDef>;
    images: Record<string, string>;
}

export interface AnimationsFile {
    version: string;
    [category: string]: any; // Recursive structure for categories
}

export interface AssetsFile {
    version: string;
    characters?: Record<string, any>;
    environments?: Record<string, any>;
    ui?: Record<string, any>;
    items?: Record<string, any>;
    effects?: Record<string, any>;
    zones?: Record<string, any>;
}

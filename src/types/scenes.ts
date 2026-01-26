// Scene element placement
export interface SceneElement {
    id: string;
    asset: string;  // References key in assets.json (e.g., "environments.backgrounds.town")
    x: number;
    y: number;

    // Optional overrides
    width?: number;
    height?: number;
    depth?: number;
    alpha?: number;
    scale?: number;
    texture?: string;  // Override default texture
    text?: string;     // Override text content/key
    fontSize?: string; // Override font size
    color?: string;    // Override color
    visible?: boolean;

    // Event bindings
    events?: Record<string, string>;  // eventName -> handlerName

    // Data
    data?: Record<string, unknown>;

    // UI element template reference (for building with UiElementBuilder)
    uiElement?: {
        templateId: string;
    };
}

export interface SceneZone {
    id: string;
    zone?: string; // References key in assets.json (e.g., "zones.spawns.player-spawn-town")
    // Inline coordinates (alternative to zone reference)
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export interface SceneDef {
    viewport: { width: number; height: number };
    elements: SceneElement[];
    zones?: SceneZone[];
    ui?: SceneElement[];
}

export interface ScenesFile {
    scenes: Record<string, SceneDef>;
}

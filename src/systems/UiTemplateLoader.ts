/**
 * UiTemplateLoader - Loads UI element templates from JSON
 * Decoupled from effect application for isolation
 */

export interface LayerVisualConfig {
  scale?: { x: number; y: number };
  brightness?: number;
  opacity?: number;
  offset?: { x: number; y: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number };
  glow?: { color: string; blur: number; intensity: number };
  tint?: { color: string; amount: number };
}

export interface LayerStateConfig {
  normal?: LayerVisualConfig;
  hover?: LayerVisualConfig;
  pressed?: LayerVisualConfig;
}

export interface TemplateEffectConfig {
  defaults: LayerStateConfig;
  animation?: {
    toHover: { duration: number; easing: string };
    toPressed: { duration: number; easing: string };
    toNormal: { duration: number; easing: string };
  };
}

export interface UiElementLayer {
  id: string;
  name: string;
  order: number;
  sourceType: 'image' | 'color' | 'nineSlice';
  imageAssetId?: string;
  imagePath?: string;
  nineSliceConfigId?: string;  // Reference to nine-slice config in nine-slices.json
  bounds: { x: number; y: number; w: number; h: number };
  states?: LayerStateConfig;
  flipX?: boolean;
  flipY?: boolean;
  rotation?: number;  // Rotation in degrees
}

export interface TextStyleConfig {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadowBlur?: number;
}

export interface TextAreaConfig {
  id: string;
  name: string;
  bounds: { x: number; y: number; w: number; h: number };
  fontFamily: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  fitMode: 'shrinkToFit' | 'wrap' | 'truncate' | 'overflow';
  defaultText: string;
  textStyle: TextStyleConfig;
  parentLayerId?: string;  // Optional: layer whose effects this text inherits
}

export interface UiElementTemplate {
  id: string;
  name: string;
  size: { x: number; y: number; w: number; h: number };
  layers: UiElementLayer[];
  textAreas?: TextAreaConfig[];
  effects?: TemplateEffectConfig;
}

export class UiTemplateLoader {
  private templates: Map<string, UiElementTemplate> = new Map();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const response = await fetch('/assets/data/ui-element-templates.json');
      const data = await response.json();
      (data.templates || []).forEach((t: UiElementTemplate) => {
        this.templates.set(t.id, t);
      });
      this.loaded = true;
      console.log(`[UiTemplateLoader] Loaded ${this.templates.size} templates`);
    } catch (e) {
      console.error('[UiTemplateLoader] Failed to load templates:', e);
    }
  }

  get(id: string): UiElementTemplate | undefined {
    return this.templates.get(id);
  }

  has(id: string): boolean {
    return this.templates.has(id);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reload templates from disk (useful for hot-reload during development)
   * Clears the cache and re-fetches the JSON file
   */
  async reload(): Promise<void> {
    this.templates.clear();
    this.loaded = false;
    await this.load();
    console.log('[UiTemplateLoader] Templates reloaded');
  }
}

// Singleton instance
export const uiTemplateLoader = new UiTemplateLoader();

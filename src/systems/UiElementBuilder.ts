import Phaser from 'phaser';
import { uiTemplateLoader, type UiElementTemplate, type UiElementLayer, type LayerVisualConfig, type TemplateEffectConfig } from './UiTemplateLoader';
import { uiEffectSystem, type BaseProps } from './UiEffectSystem';
import type { NineSlicesFile } from '../types/assets';
import { LocalizationService } from './LocalizationService';

/**
 * Animation timing configuration
 */
interface AnimationTiming {
  duration: number;
  easing: string;
}

/**
 * UiElementBuilder - Creates Phaser game objects from UI templates
 * Integrates template loading and effect application
 */
export class UiElementBuilder {
  constructor(private scene: Phaser.Scene) {}

  /**
   * Build a UI element from template with hover/press effects
   * @param templateId - The template ID to build
   * @param x - X position (where the origin point should be placed)
   * @param y - Y position (where the origin point should be placed)
   * @param origin - Origin point [0-1, 0-1], defaults to [0.5, 0.5] (center)
   * @param textOverrides - Optional text overrides by textAreaId
   */
  buildFromTemplate(
    templateId: string,
    x: number,
    y: number,
    origin: [number, number] = [0.5, 0.5],
    textOverrides?: Record<string, string>
  ): Phaser.GameObjects.Container | null {
    const template = uiTemplateLoader.get(templateId);
    if (!template) {
      console.warn(`[UiElementBuilder] Template not found: ${templateId}`);
      return null;
    }

    // Create container at position
    const container = this.scene.add.container(x, y);

    // Build layers (images) - element creation is separate from effects
    // Pass origin so layers can be offset correctly
    this.buildLayers(container, template, origin);

    // Build text areas
    if (template.textAreas && template.textAreas.length > 0) {
      this.buildTextAreas(container, template, origin, textOverrides);
    }

    // Store base props for effect system
    const baseProps: BaseProps = {
      x, y,
      scaleX: 1,
      scaleY: 1,
      alpha: 1
    };
    container.setData('baseProps', baseProps);
    container.setData('templateId', templateId);
    container.setData('origin', origin);

    // Setup interactivity with effects - decoupled
    const effectConfig = template.effects?.defaults;
    if (effectConfig) {
      this.setupInteractivity(container, effectConfig, template.effects?.animation, template.layers);
    }

    return container;
  }

  private buildLayers(
    container: Phaser.GameObjects.Container,
    template: UiElementTemplate,
    origin: [number, number]
  ): void {
    // Calculate origin offset - layers need to be shifted so the origin point
    // of the element is at the container's (0, 0) position
    const originOffsetX = -origin[0] * template.size.w;
    const originOffsetY = -origin[1] * template.size.h;

    // Sort layers by order
    const sortedLayers = [...template.layers].sort((a, b) => a.order - b.order);

    // Store layer references for per-layer effects
    const layerObjects = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice>();

    for (const layer of sortedLayers) {
      // Apply origin offset to layer position
      const layerX = (layer.bounds?.x ?? 0) + originOffsetX;
      const layerY = (layer.bounds?.y ?? 0) + originOffsetY;
      const layerW = layer.bounds?.w ?? 100;
      const layerH = layer.bounds?.h ?? 100;

      if (layer.sourceType === 'image' && layer.imageAssetId) {
        try {
          const img = this.scene.add.image(
            layerX,
            layerY,
            layer.imageAssetId
          );
          img.setOrigin(0, 0);

          // Use scale instead of setDisplaySize for better texture quality
          // setDisplaySize can cause quality degradation on high-res textures
          if (layer.bounds?.w && layer.bounds?.h) {
            const textureWidth = img.width;
            const textureHeight = img.height;
            if (textureWidth > 0 && textureHeight > 0) {
              const scaleX = layer.bounds.w / textureWidth;
              const scaleY = layer.bounds.h / textureHeight;
              img.setScale(scaleX, scaleY);
            }
          }

          // Apply flip and rotation
          if (layer.flipX) img.setFlipX(true);
          if (layer.flipY) img.setFlipY(true);
          if (layer.rotation) img.setAngle(layer.rotation);

          // Store layer reference for per-layer effects
          img.setData('layerId', layer.id);
          img.setData('layerConfig', layer);
          layerObjects.set(layer.id, img);

          container.add(img);
        } catch (e) {
          console.warn(`[UiElementBuilder] Failed to create image layer ${layer.id}:`, e);
        }
      } else if (layer.sourceType === 'nineSlice' && layer.nineSliceConfigId) {
        try {
          const nineSliceObj = this.createNineSliceLayer(layer, layerX, layerY, layerW, layerH);
          if (nineSliceObj) {
            // Apply rotation (NineSlice doesn't support flip)
            if (layer.rotation) nineSliceObj.setAngle(layer.rotation);
            if (layer.flipX || layer.flipY) {
              console.warn(`[UiElementBuilder] NineSlice layer ${layer.id} doesn't support flip`);
            }

            // Store layer reference for per-layer effects
            nineSliceObj.setData('layerId', layer.id);
            nineSliceObj.setData('layerConfig', layer);
            layerObjects.set(layer.id, nineSliceObj);

            container.add(nineSliceObj);
          }
        } catch (e) {
          console.warn(`[UiElementBuilder] Failed to create nineSlice layer ${layer.id}:`, e);
        }
      }
    }

    // Store layer references and configs on container for effect system
    container.setData('layerObjects', layerObjects);
    container.setData('layers', template.layers);

    // Set container size (no interactivity - only layers with effects are interactive)
    container.setSize(template.size.w, template.size.h);
  }

  /**
   * Build text areas for a template
   */
  private buildTextAreas(
    container: Phaser.GameObjects.Container,
    template: UiElementTemplate,
    origin: [number, number],
    textOverrides?: Record<string, string>
  ): void {
    if (!template.textAreas) return;

    const originOffsetX = -origin[0] * template.size.w;
    const originOffsetY = -origin[1] * template.size.h;
    const localization = LocalizationService.getInstance();

    // Store text objects for parent layer binding
    const textObjects = new Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }>();

    for (const textArea of template.textAreas) {
      // Get text: override > defaultText
      let rawText = textOverrides?.[textArea.id] ?? textArea.defaultText;

      // Resolve translation keys (text starting with $)
      const displayText = localization.resolve(rawText);

      // Build Phaser text style
      const style: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: textArea.fontFamily || 'Arial',
        fontSize: `${textArea.fontSize || 16}px`,
        color: textArea.textStyle?.fill || '#ffffff',
        align: textArea.textAlign || 'center',
      };

      // Add stroke if defined
      if (textArea.textStyle?.stroke && textArea.textStyle.strokeWidth) {
        style.stroke = textArea.textStyle.stroke;
        style.strokeThickness = textArea.textStyle.strokeWidth;
      }

      // Add shadow if defined
      if (textArea.textStyle?.shadowBlur && textArea.textStyle.shadowBlur > 0) {
        style.shadow = {
          offsetX: 0,
          offsetY: 0,
          color: '#000000',
          blur: textArea.textStyle.shadowBlur,
          fill: true
        };
      }

      // Create text object
      const textX = textArea.bounds.x + originOffsetX;
      const textY = textArea.bounds.y + originOffsetY;
      const text = this.scene.add.text(textX, textY, displayText, style);

      // Apply horizontal alignment within bounds
      if (textArea.textAlign === 'center') {
        text.setOrigin(0.5, 0);
        text.setX(textX + textArea.bounds.w / 2);
      } else if (textArea.textAlign === 'right') {
        text.setOrigin(1, 0);
        text.setX(textX + textArea.bounds.w);
      } else {
        text.setOrigin(0, 0);
      }

      // Apply vertical alignment within bounds
      if (textArea.verticalAlign === 'middle') {
        const currentOriginX = text.originX;
        text.setOrigin(currentOriginX, 0.5);
        text.setY(textY + textArea.bounds.h / 2);
      } else if (textArea.verticalAlign === 'bottom') {
        const currentOriginX = text.originX;
        text.setOrigin(currentOriginX, 1);
        text.setY(textY + textArea.bounds.h);
      }

      // Apply fitMode: shrinkToFit scales text to fit within bounds
      if (textArea.fitMode === 'shrinkToFit') {
        const textWidth = text.width;
        const textHeight = text.height;
        const boundsWidth = textArea.bounds.w;
        const boundsHeight = textArea.bounds.h;

        if (textWidth > boundsWidth || textHeight > boundsHeight) {
          const scaleX = boundsWidth / textWidth;
          const scaleY = boundsHeight / textHeight;
          const scale = Math.min(scaleX, scaleY);
          text.setScale(scale);
        }
      } else if (textArea.fitMode === 'wrap') {
        text.setWordWrapWidth(textArea.bounds.w);
      }

      // Store text area id and parent info
      text.setData('textAreaId', textArea.id);
      textObjects.set(textArea.id, {
        text,
        parentLayerId: textArea.parentLayerId ?? null
      });

      container.add(text);
    }

    // Store text objects map on container for effect system
    container.setData('textObjects', textObjects);
  }

  /**
   * Create a nine-slice game object for a layer
   */
  private createNineSliceLayer(
    layer: UiElementLayer,
    x: number,
    y: number,
    width: number,
    height: number
  ): Phaser.GameObjects.NineSlice | null {
    // Get nine-slice configs from registry (loaded in BootScene)
    const nineSlices: NineSlicesFile | undefined = this.scene.registry.get('nineSlices');
    if (!nineSlices?.configs) {
      console.warn(`[UiElementBuilder] Nine-slice configs not loaded in registry`);
      return null;
    }

    // Look up config by nineSliceConfigId
    const config = nineSlices.configs[layer.nineSliceConfigId!];
    if (!config) {
      console.warn(`[UiElementBuilder] No nine-slice config found for: ${layer.nineSliceConfigId}`);
      return null;
    }

    // Check if texture is loaded
    if (!this.scene.textures.exists(config.texture)) {
      console.warn(`[UiElementBuilder] Texture not loaded for nine-slice: ${config.texture} (${config.name})`);
      return null;
    }

    // Create the nine-slice object
    // Phaser.add.nineslice(x, y, texture, frame, width, height, leftWidth, rightWidth, topHeight, bottomHeight)
    const nineSlice = this.scene.add.nineslice(
      x,
      y,
      config.texture,
      undefined,  // frame
      width,
      height,
      config.leftWidth,
      config.rightWidth,
      config.topHeight,
      config.bottomHeight
    );

    nineSlice.setOrigin(0, 0);
    return nineSlice;
  }

  /**
   * Check if a layer has interactive effects (hover or pressed)
   */
  private layerHasInteractiveEffects(
    layer: UiElementLayer,
    templateEffects: { hover?: LayerVisualConfig; pressed?: LayerVisualConfig }
  ): boolean {
    // Layer has its own hover/pressed states?
    const hasLayerEffects = !!(layer.states?.hover || layer.states?.pressed);
    // Template has hover/pressed defaults?
    const hasTemplateEffects = !!(templateEffects.hover || templateEffects.pressed);
    return hasLayerEffects || hasTemplateEffects;
  }

  private setupInteractivity(
    container: Phaser.GameObjects.Container,
    effectConfig: { normal?: LayerVisualConfig; hover?: LayerVisualConfig; pressed?: LayerVisualConfig },
    animation?: TemplateEffectConfig['animation'],
    layers?: UiElementLayer[]
  ): void {
    const layerObjects = container.getData('layerObjects') as Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice> | undefined;
    if (!layerObjects || !layers) return;

    // Only set up interactivity for layers that have hover/pressed effects
    for (const layer of layers) {
      const gameObj = layerObjects.get(layer.id);
      if (!gameObj) continue;

      // Skip layers without interactive effects
      if (!this.layerHasInteractiveEffects(layer, effectConfig)) continue;

      this.setupLayerInteractivity(gameObj, layer, effectConfig, animation, container);
    }
  }

  /**
   * Set up interactivity for a single layer
   * Uses layer.states if defined, falls back to template.effects.defaults
   */
  private setupLayerInteractivity(
    gameObj: Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice,
    layer: UiElementLayer,
    templateEffects: { normal?: LayerVisualConfig; hover?: LayerVisualConfig; pressed?: LayerVisualConfig },
    animation?: TemplateEffectConfig['animation'],
    container?: Phaser.GameObjects.Container
  ): void {
    // Make layer interactive
    gameObj.setInteractive({ useHandCursor: true });

    // Get child text areas that inherit from this layer
    const textObjects = container?.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
    const childTextAreas = this.getChildTextAreas(textObjects, layer.id);

    let isPressed = false;

    gameObj.on('pointerover', () => {
      if (!isPressed) {
        this.applyStateToLayer(gameObj, layer, 'hover', templateEffects, animation?.toHover);
        this.applyStateToTextAreas(childTextAreas, layer, 'hover', templateEffects, animation?.toHover);
      }
    });

    gameObj.on('pointerout', () => {
      isPressed = false;
      // Reset this layer
      const layerBase = this.getLayerBaseProps(gameObj);
      uiEffectSystem.resetToBase(gameObj, layerBase);
      this.applyStateToLayer(gameObj, layer, 'normal', templateEffects, animation?.toNormal);
      this.resetTextAreas(childTextAreas, animation?.toNormal);
    });

    gameObj.on('pointerdown', () => {
      isPressed = true;
      this.applyStateToLayer(gameObj, layer, 'pressed', templateEffects, animation?.toPressed);
      this.applyStateToTextAreas(childTextAreas, layer, 'pressed', templateEffects, animation?.toPressed);
    });

    gameObj.on('pointerup', () => {
      isPressed = false;
      this.applyStateToLayer(gameObj, layer, 'hover', templateEffects, animation?.toHover);
      this.applyStateToTextAreas(childTextAreas, layer, 'hover', templateEffects, animation?.toHover);
    });
  }

  /**
   * Apply state to a single layer
   */
  private applyStateToLayer(
    gameObj: Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice,
    layer: UiElementLayer,
    state: 'normal' | 'hover' | 'pressed',
    templateEffects: { normal?: LayerVisualConfig; hover?: LayerVisualConfig; pressed?: LayerVisualConfig },
    timing?: AnimationTiming
  ): void {
    // Clear postFX before applying new effects to prevent stacking
    // (e.g., brightness adds ColorMatrix which stacks on repeated clicks)
    if ('postFX' in gameObj && (gameObj as any).postFX) {
      (gameObj as any).postFX.clear();
    }
    // Also clear tint to prevent stacking
    if ('clearTint' in gameObj && typeof (gameObj as any).clearTint === 'function') {
      (gameObj as any).clearTint();
    }

    // Get layer-specific effects, fall back to template defaults
    const layerConfig = layer.states?.[state];
    const templateConfig = templateEffects[state];

    // Merge: layer config overrides template config
    const mergedConfig = { ...templateConfig, ...layerConfig };

    // Get base props for this layer
    const layerBase = this.getLayerBaseProps(gameObj);

    if (Object.keys(mergedConfig).length === 0 && state === 'normal') {
      // For normal state with no config, tween back to base
      this.tweenToState(gameObj, {}, layerBase, timing);
    } else if (Object.keys(mergedConfig).length > 0) {
      this.tweenToState(gameObj, mergedConfig, layerBase, timing);
    }
  }

  /**
   * Get base properties for a layer game object
   */
  private getLayerBaseProps(gameObj: Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice): BaseProps {
    // Store base props on first call, reuse thereafter
    let baseProps = gameObj.getData('baseProps') as BaseProps | undefined;
    if (!baseProps) {
      baseProps = {
        x: gameObj.x,
        y: gameObj.y,
        scaleX: gameObj.scaleX,
        scaleY: gameObj.scaleY,
        alpha: gameObj.alpha
      };
      gameObj.setData('baseProps', baseProps);
    }
    return baseProps;
  }

  /**
   * Get text areas that have the specified layer as their parent
   */
  private getChildTextAreas(
    textObjects: Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined,
    layerId: string
  ): { text: Phaser.GameObjects.Text; baseProps: BaseProps }[] {
    if (!textObjects) return [];

    const children: { text: Phaser.GameObjects.Text; baseProps: BaseProps }[] = [];
    for (const [, info] of textObjects) {
      if (info.parentLayerId === layerId) {
        // Store base props on first access
        let baseProps = info.text.getData('baseProps') as BaseProps | undefined;
        if (!baseProps) {
          baseProps = {
            x: info.text.x,
            y: info.text.y,
            scaleX: info.text.scaleX,
            scaleY: info.text.scaleY,
            alpha: info.text.alpha
          };
          info.text.setData('baseProps', baseProps);
        }
        children.push({ text: info.text, baseProps });
      }
    }
    return children;
  }

  /**
   * Apply scale and offset effects to text areas (inheriting from parent layer)
   */
  private applyStateToTextAreas(
    textAreas: { text: Phaser.GameObjects.Text; baseProps: BaseProps }[],
    layer: UiElementLayer,
    state: 'normal' | 'hover' | 'pressed',
    templateEffects: { normal?: LayerVisualConfig; hover?: LayerVisualConfig; pressed?: LayerVisualConfig },
    timing?: AnimationTiming
  ): void {
    if (textAreas.length === 0) return;

    const layerConfig = layer.states?.[state];
    const templateConfig = templateEffects[state];
    const mergedConfig = { ...templateConfig, ...layerConfig };

    const duration = timing?.duration ?? 150;
    const ease = this.mapEasing(timing?.easing ?? 'easeOut');

    // Only apply scale and offset to text (not brightness, tint, glow, etc.)
    for (const { text, baseProps } of textAreas) {
      this.scene.tweens.killTweensOf(text);

      const targetScaleX = baseProps.scaleX * (mergedConfig.scale?.x ?? 1);
      const targetScaleY = baseProps.scaleY * (mergedConfig.scale?.y ?? 1);
      const targetX = baseProps.x + (mergedConfig.offset?.x ?? 0);
      const targetY = baseProps.y + (mergedConfig.offset?.y ?? 0);

      this.scene.tweens.add({
        targets: text,
        scaleX: targetScaleX,
        scaleY: targetScaleY,
        x: targetX,
        y: targetY,
        duration,
        ease
      });
    }
  }

  /**
   * Reset text areas to their base state
   */
  private resetTextAreas(
    textAreas: { text: Phaser.GameObjects.Text; baseProps: BaseProps }[],
    timing?: AnimationTiming
  ): void {
    if (textAreas.length === 0) return;

    const duration = timing?.duration ?? 150;
    const ease = this.mapEasing(timing?.easing ?? 'easeOut');

    for (const { text, baseProps } of textAreas) {
      this.scene.tweens.killTweensOf(text);
      this.scene.tweens.add({
        targets: text,
        scaleX: baseProps.scaleX,
        scaleY: baseProps.scaleY,
        x: baseProps.x,
        y: baseProps.y,
        duration,
        ease
      });
    }
  }

  /**
   * Tween to a visual state with animation
   * Animates scale, position, and opacity. PostFX effects (shadow, glow) are applied instantly.
   */
  private tweenToState(
    obj: Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice,
    config: LayerVisualConfig,
    base: BaseProps,
    timing?: AnimationTiming
  ): void {
    // Default timing if not specified
    const duration = timing?.duration ?? 150;
    const ease = this.mapEasing(timing?.easing ?? 'easeOut');

    // Calculate target values
    const targetScaleX = base.scaleX * (config.scale?.x ?? 1);
    const targetScaleY = base.scaleY * (config.scale?.y ?? 1);
    const targetX = base.x + (config.offset?.x ?? 0);
    const targetY = base.y + (config.offset?.y ?? 0);
    const targetAlpha = base.alpha * (config.opacity ?? 1);

    // Stop any existing tweens on this object to prevent conflicts
    this.scene.tweens.killTweensOf(obj);

    // Animate tweennable properties
    this.scene.tweens.add({
      targets: obj,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      x: targetX,
      y: targetY,
      alpha: targetAlpha,
      duration,
      ease
    });

    // Apply non-tweennable effects immediately (postFX)
    // These need the effect system since they use postFX pipeline
    if (config.shadow || config.glow || config.tint || config.brightness !== undefined) {
      uiEffectSystem.applyEffect(obj, {
        shadow: config.shadow,
        glow: config.glow,
        tint: config.tint,
        brightness: config.brightness
      }, base);
    }
  }

  /**
   * Map common easing names to Phaser easing strings
   */
  private mapEasing(easing: string): string {
    const easingMap: Record<string, string> = {
      'linear': 'Linear',
      'easeIn': 'Power2.easeIn',
      'easeOut': 'Power2.easeOut',
      'easeInOut': 'Power2.easeInOut',
      'easeInQuad': 'Quad.easeIn',
      'easeOutQuad': 'Quad.easeOut',
      'easeInOutQuad': 'Quad.easeInOut',
      'easeInCubic': 'Cubic.easeIn',
      'easeOutCubic': 'Cubic.easeOut',
      'easeInOutCubic': 'Cubic.easeInOut',
      'easeInElastic': 'Elastic.easeIn',
      'easeOutElastic': 'Elastic.easeOut',
      'easeInOutElastic': 'Elastic.easeInOut',
      'easeInBack': 'Back.easeIn',
      'easeOutBack': 'Back.easeOut',
      'easeInOutBack': 'Back.easeInOut',
      'easeInBounce': 'Bounce.easeIn',
      'easeOutBounce': 'Bounce.easeOut',
      'easeInOutBounce': 'Bounce.easeInOut',
    };

    return easingMap[easing] || easing;
  }
}

import Phaser from 'phaser';
import { uiTemplateLoader, type UiElementTemplate, type LayerVisualConfig } from './UiTemplateLoader';
import { uiEffectSystem, type BaseProps } from './UiEffectSystem';

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
   */
  buildFromTemplate(
    templateId: string,
    x: number,
    y: number,
    origin: [number, number] = [0.5, 0.5]
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
      this.setupInteractivity(container, effectConfig, baseProps);
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

    for (const layer of sortedLayers) {
      if (layer.sourceType === 'image' && layer.imageAssetId) {
        try {
          // Apply origin offset to layer position
          const layerX = (layer.bounds?.x ?? 0) + originOffsetX;
          const layerY = (layer.bounds?.y ?? 0) + originOffsetY;

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
          container.add(img);
        } catch (e) {
          console.warn(`[UiElementBuilder] Failed to create layer ${layer.id}:`, e);
        }
      }
    }

    // Set hit area for interactivity - also offset by origin
    container.setSize(template.size.w, template.size.h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(originOffsetX, originOffsetY, template.size.w, template.size.h),
      Phaser.Geom.Rectangle.Contains
    );
  }

  private setupInteractivity(
    container: Phaser.GameObjects.Container,
    effectConfig: { normal?: LayerVisualConfig; hover?: LayerVisualConfig; pressed?: LayerVisualConfig },
    baseProps: BaseProps
  ): void {
    let isPressed = false;

    container.on('pointerover', () => {
      if (!isPressed && effectConfig.hover) {
        uiEffectSystem.applyEffect(container, effectConfig.hover, baseProps);
      }
    });

    container.on('pointerout', () => {
      isPressed = false;
      uiEffectSystem.resetToBase(container, baseProps);
      if (effectConfig.normal) {
        uiEffectSystem.applyEffect(container, effectConfig.normal, baseProps);
      }
    });

    container.on('pointerdown', () => {
      isPressed = true;
      if (effectConfig.pressed) {
        uiEffectSystem.applyEffect(container, effectConfig.pressed, baseProps);
      }
    });

    container.on('pointerup', () => {
      isPressed = false;
      if (effectConfig.hover) {
        uiEffectSystem.applyEffect(container, effectConfig.hover, baseProps);
      }
    });
  }
}

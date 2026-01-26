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
   */
  buildFromTemplate(
    templateId: string,
    x: number,
    y: number
  ): Phaser.GameObjects.Container | null {
    const template = uiTemplateLoader.get(templateId);
    if (!template) {
      console.warn(`[UiElementBuilder] Template not found: ${templateId}`);
      return null;
    }

    // Create container at position
    const container = this.scene.add.container(x, y);

    // Build layers (images) - element creation is separate from effects
    this.buildLayers(container, template);

    // Store base props for effect system
    const baseProps: BaseProps = {
      x, y,
      scaleX: 1,
      scaleY: 1,
      alpha: 1
    };
    container.setData('baseProps', baseProps);
    container.setData('templateId', templateId);

    // Setup interactivity with effects - decoupled
    const effectConfig = template.effects?.defaults;
    if (effectConfig) {
      this.setupInteractivity(container, effectConfig, baseProps);
    }

    return container;
  }

  private buildLayers(
    container: Phaser.GameObjects.Container,
    template: UiElementTemplate
  ): void {
    // Sort layers by order
    const sortedLayers = [...template.layers].sort((a, b) => a.order - b.order);

    for (const layer of sortedLayers) {
      if (layer.sourceType === 'image' && layer.imageAssetId) {
        try {
          const img = this.scene.add.image(
            layer.bounds?.x ?? 0,
            layer.bounds?.y ?? 0,
            layer.imageAssetId
          );
          img.setOrigin(0, 0);
          if (layer.bounds?.w && layer.bounds?.h) {
            img.setDisplaySize(layer.bounds.w, layer.bounds.h);
          }
          container.add(img);
        } catch (e) {
          console.warn(`[UiElementBuilder] Failed to create layer ${layer.id}:`, e);
        }
      }
    }

    // Set hit area for interactivity
    container.setSize(template.size.w, template.size.h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, template.size.w, template.size.h),
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

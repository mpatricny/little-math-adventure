import Phaser from 'phaser';
import type { LayerVisualConfig } from './UiTemplateLoader';

/**
 * Base properties to restore object to original state
 */
export interface BaseProps {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

/**
 * UiEffectSystem - Applies visual effects to Phaser game objects
 * Decoupled from element creation for isolation
 */
export class UiEffectSystem {
  /**
   * Apply visual effects to a game object
   * Call resetToBase() first if changing states
   */
  applyEffect(
    obj: Phaser.GameObjects.Container | Phaser.GameObjects.Image,
    config: LayerVisualConfig,
    base: BaseProps
  ): void {
    try {
      // Scale (multiply with base)
      if (config.scale) {
        obj.setScale(base.scaleX * config.scale.x, base.scaleY * config.scale.y);
      }

      // Opacity (multiply with base)
      if (config.opacity !== undefined) {
        obj.setAlpha(base.alpha * config.opacity);
      }

      // Brightness via tint (1.0 = normal, >1 = brighter, <1 = darker)
      if (config.brightness !== undefined && config.brightness !== 1) {
        this.applyBrightness(obj, config.brightness);
      }

      // Offset (add to base position)
      if (config.offset) {
        obj.setPosition(base.x + config.offset.x, base.y + config.offset.y);
      }
    } catch (e) {
      console.warn('[UiEffectSystem] Failed to apply effect:', e);
    }
  }

  /**
   * Reset object to base state
   */
  resetToBase(
    obj: Phaser.GameObjects.Container | Phaser.GameObjects.Image,
    base: BaseProps
  ): void {
    obj.setPosition(base.x, base.y);
    obj.setScale(base.scaleX, base.scaleY);
    obj.setAlpha(base.alpha);
    this.clearTint(obj);
  }

  private applyBrightness(obj: Phaser.GameObjects.GameObject, brightness: number): void {
    if (!('setTint' in obj) || typeof (obj as any).setTint !== 'function') return;

    if (brightness >= 1) {
      // Brighten: tint toward white (0xffffff)
      // At brightness 1.2, blend 20% toward white
      const blend = Math.min(brightness - 1, 1);
      const v = Math.round(255 * (1 - blend * 0.5) + 255 * blend * 0.5);
      (obj as any).setTint(Phaser.Display.Color.GetColor(v, v, v));
    } else {
      // Darken: reduce RGB values
      const v = Math.round(255 * brightness);
      (obj as any).setTint(Phaser.Display.Color.GetColor(v, v, v));
    }
  }

  private clearTint(obj: Phaser.GameObjects.GameObject): void {
    if ('clearTint' in obj && typeof (obj as any).clearTint === 'function') {
      (obj as any).clearTint();
    }
  }
}

// Singleton
export const uiEffectSystem = new UiEffectSystem();

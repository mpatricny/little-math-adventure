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
 * Shadow configuration
 */
interface ShadowConfig {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

/**
 * Glow configuration
 */
interface GlowConfig {
  color: string;
  blur: number;
  intensity: number;
}

/**
 * Tint configuration
 */
interface TintConfig {
  color: string;
  amount: number;
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
    obj: Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice,
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
      // Only apply brightness if no explicit tint is set
      if (config.brightness !== undefined && config.brightness !== 1 && !config.tint) {
        this.applyBrightness(obj, config.brightness);
      }

      // Offset (add to base position)
      if (config.offset) {
        obj.setPosition(base.x + config.offset.x, base.y + config.offset.y);
      }

      // Shadow effect using postFX (applied to children for containers)
      if (config.shadow) {
        this.applyShadow(obj, config.shadow);
      }

      // Glow effect using postFX (applied to children for containers)
      if (config.glow) {
        this.applyGlow(obj, config.glow);
      }

      // Tint effect (color overlay)
      if (config.tint) {
        this.applyTint(obj, config.tint);
      }
    } catch (e) {
      console.warn('[UiEffectSystem] Failed to apply effect:', e);
    }
  }

  /**
   * Reset object to base state
   */
  resetToBase(
    obj: Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice,
    base: BaseProps
  ): void {
    obj.setPosition(base.x, base.y);
    obj.setScale(base.scaleX, base.scaleY);
    obj.setAlpha(base.alpha);
    this.clearTint(obj);
    this.clearPostFX(obj);
  }

  /**
   * Get all applicable children from an object (for applying effects)
   * For containers, returns immediate children that support effects
   * For other objects, returns the object itself in an array
   */
  private getEffectTargets(obj: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject[] {
    if (obj instanceof Phaser.GameObjects.Container) {
      // Return non-text children (images, nine-slices, sprites)
      return obj.list.filter(child =>
        child instanceof Phaser.GameObjects.Image ||
        child instanceof Phaser.GameObjects.Sprite ||
        child instanceof Phaser.GameObjects.NineSlice
      );
    }
    return [obj];
  }

  /**
   * Apply shadow effect using Phaser's postFX pipeline
   * For containers, applies to each child that supports postFX
   */
  private applyShadow(obj: Phaser.GameObjects.GameObject, shadow: ShadowConfig): void {
    const targets = this.getEffectTargets(obj);
    const color = this.hexToNumber(shadow.color);

    for (const target of targets) {
      if (!('postFX' in target) || !(target as any).postFX) continue;

      const postFX = (target as any).postFX;
      // addShadow(offsetX, offsetY, blur, samples, color, alpha)
      // samples controls shadow quality (higher = smoother but slower)
      postFX.addShadow(
        shadow.offsetX,
        shadow.offsetY,
        shadow.blur * 0.05, // Phaser's blur is much stronger, scale it down
        6, // samples
        color,
        shadow.opacity
      );
    }
  }

  /**
   * Apply glow effect using Phaser's postFX pipeline
   * For containers, applies to each child that supports postFX
   */
  private applyGlow(obj: Phaser.GameObjects.GameObject, glow: GlowConfig): void {
    const targets = this.getEffectTargets(obj);
    const color = this.hexToNumber(glow.color);

    for (const target of targets) {
      if (!('postFX' in target) || !(target as any).postFX) continue;

      const postFX = (target as any).postFX;
      // addGlow(color, outerStrength, innerStrength, knockout)
      // outerStrength: how far the glow extends outward
      // innerStrength: how much glow bleeds inward
      postFX.addGlow(
        color,
        glow.blur * glow.intensity * 0.1, // outer strength
        0, // inner strength
        false // knockout
      );
    }
  }

  /**
   * Apply tint effect (color overlay)
   * amount: 0 = no tint, 1 = full tint color
   * For containers, applies to each child that supports tint
   */
  private applyTint(obj: Phaser.GameObjects.GameObject, tint: TintConfig): void {
    const targets = this.getEffectTargets(obj);
    const tintColor = this.hexToNumber(tint.color);

    for (const target of targets) {
      if (!('setTint' in target) || typeof (target as any).setTint !== 'function') continue;

      if (tint.amount >= 1) {
        // Full tint
        (target as any).setTint(tintColor);
      } else if (tint.amount > 0) {
        // Blend tint with white (0xffffff) based on amount
        // amount=0.5 means 50% tint color, 50% original
        const r = ((tintColor >> 16) & 0xff);
        const g = ((tintColor >> 8) & 0xff);
        const b = (tintColor & 0xff);

        const blendedR = Math.round(255 + (r - 255) * tint.amount);
        const blendedG = Math.round(255 + (g - 255) * tint.amount);
        const blendedB = Math.round(255 + (b - 255) * tint.amount);

        const blendedColor = Phaser.Display.Color.GetColor(blendedR, blendedG, blendedB);
        (target as any).setTint(blendedColor);
      }
    }
  }

  /**
   * Apply brightness effect via tint
   * For containers, applies to each child that supports tint
   */
  private applyBrightness(obj: Phaser.GameObjects.GameObject, brightness: number): void {
    const targets = this.getEffectTargets(obj);

    for (const target of targets) {
      if (!('setTint' in target) || typeof (target as any).setTint !== 'function') continue;

      if (brightness >= 1) {
        // Brighten: tint toward white (0xffffff)
        // At brightness 1.2, blend 20% toward white
        const blend = Math.min(brightness - 1, 1);
        const v = Math.round(255 * (1 - blend * 0.5) + 255 * blend * 0.5);
        (target as any).setTint(Phaser.Display.Color.GetColor(v, v, v));
      } else {
        // Darken: reduce RGB values
        const v = Math.round(255 * brightness);
        (target as any).setTint(Phaser.Display.Color.GetColor(v, v, v));
      }
    }
  }

  /**
   * Clear tint from object and its children
   */
  private clearTint(obj: Phaser.GameObjects.GameObject): void {
    const targets = this.getEffectTargets(obj);

    for (const target of targets) {
      if ('clearTint' in target && typeof (target as any).clearTint === 'function') {
        (target as any).clearTint();
      }
    }
  }

  /**
   * Clear all postFX effects (shadow, glow, etc.) from object and its children
   */
  private clearPostFX(obj: Phaser.GameObjects.GameObject): void {
    const targets = this.getEffectTargets(obj);

    for (const target of targets) {
      if ('postFX' in target && (target as any).postFX) {
        (target as any).postFX.clear();
      }
    }
  }

  /**
   * Convert hex color string to number
   * Supports formats: "#ffffff", "#fff", "ffffff", "fff"
   */
  private hexToNumber(hex: string): number {
    let cleanHex = hex.replace('#', '');

    // Expand shorthand (fff -> ffffff)
    if (cleanHex.length === 3) {
      cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }

    return parseInt(cleanHex, 16);
  }
}

// Singleton
export const uiEffectSystem = new UiEffectSystem();

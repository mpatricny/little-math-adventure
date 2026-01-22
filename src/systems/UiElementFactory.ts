import Phaser from 'phaser';
import {
    UiElementTemplate,
    UiElementTemplatesFile,
    UiElementTemplateLayer,
    UiElementTemplateTextArea,
    UiElementTemplateEffect,
    ExportedNineSliceConfig,
    ExportedNineSliceConfigsFile
} from '../types/assets';

/**
 * Factory for creating UI Element templates as Phaser containers.
 * Templates are defined in ui-element-templates.json and loaded in BootScene.
 */
export class UiElementFactory {
    private scene: Phaser.Scene;
    private templates: Map<string, UiElementTemplate>;
    private nineSliceConfigs: Map<string, ExportedNineSliceConfig>;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.templates = new Map();
        this.nineSliceConfigs = new Map();

        // Load templates from cache
        const templatesData = this.scene.cache.json.get('uiElementTemplates') as UiElementTemplatesFile | undefined;
        if (templatesData?.templates) {
            for (const template of templatesData.templates) {
                this.templates.set(template.id, template);
            }
        }

        // Load nine-slice configs from cache
        const nineSliceData = this.scene.cache.json.get('nineSliceConfigs') as ExportedNineSliceConfigsFile | undefined;
        if (nineSliceData) {
            for (const [configId, config] of Object.entries(nineSliceData)) {
                this.nineSliceConfigs.set(configId, config);
            }
        }
    }

    /**
     * Create a UI Element from a template.
     * @param templateId The template ID from ui-element-templates.json
     * @param x X position for the container
     * @param y Y position for the container
     * @param textOverrides Optional map of textArea.id to override text
     * @returns A Phaser Container containing the rendered template
     */
    create(templateId: string, x: number, y: number, textOverrides?: Record<string, string>): Phaser.GameObjects.Container {
        const template = this.templates.get(templateId);

        if (!template) {
            console.warn(`UiElementFactory: Template not found: ${templateId}`);
            return this.createPlaceholder(templateId, x, y);
        }

        const container = this.scene.add.container(x, y);
        container.setName(templateId);
        container.setData('templateId', templateId);

        // Calculate offset to center content within container
        // This makes the container position be at the center of the template content
        const offsetX = -template.size.w / 2;
        const offsetY = -template.size.h / 2;

        // Sort layers by order (lower order = rendered first = behind)
        const sortedLayers = [...template.layers].sort((a, b) => a.order - b.order);

        // Render each layer
        for (const layer of sortedLayers) {
            if (!layer.visible) continue;

            const layerObject = this.renderLayer(layer, template);
            if (layerObject) {
                layerObject.setAlpha(layer.opacity);
                // Apply centering offset
                layerObject.x += offsetX;
                layerObject.y += offsetY;
                container.add(layerObject);
            }
        }

        // Render text areas (after layers, so text appears on top)
        for (const textArea of template.textAreas) {
            // Check for text override by textArea.id
            const overrideText = textOverrides?.[textArea.id];
            const textObject = this.renderTextArea(textArea, overrideText);
            if (textObject) {
                // Apply centering offset
                textObject.x += offsetX;
                textObject.y += offsetY;
                container.add(textObject);
            }
        }

        // Set container size based on template size for hit area purposes
        container.setSize(template.size.w, template.size.h);

        // Make container interactive if template has hover or pressed effects
        if (this.hasInteractiveEffects(template)) {
            // Set up hit area using template size, centered at container origin
            container.setInteractive(
                new Phaser.Geom.Rectangle(
                    offsetX, // x (offset to center)
                    offsetY, // y (offset to center)
                    template.size.w,
                    template.size.h
                ),
                Phaser.Geom.Rectangle.Contains
            );
            (container.input as Phaser.Types.Input.InteractiveObject).cursor = 'pointer';

            // Set up pointer event handlers for state effects
            this.setupStateEffects(container, template);
        }

        return container;
    }

    /**
     * Set up pointer event handlers for interactive state effects.
     * Handles hover, pressed, and normal state transitions.
     */
    private setupStateEffects(container: Phaser.GameObjects.Container, template: UiElementTemplate): void {
        const { stateEffects } = template;
        let isPressed = false;

        // Store original scale for reverting
        container.setData('originalScaleX', container.scaleX);
        container.setData('originalScaleY', container.scaleY);

        container.on('pointerover', () => {
            if (!isPressed && stateEffects.hover) {
                this.applyEffects(container, stateEffects.hover);
            }
        });

        container.on('pointerout', () => {
            isPressed = false;
            if (stateEffects.normal && stateEffects.normal.length > 0) {
                this.applyEffects(container, stateEffects.normal);
            } else {
                // Revert to original scale
                this.revertToOriginalScale(container);
            }
        });

        container.on('pointerdown', () => {
            isPressed = true;
            if (stateEffects.pressed) {
                this.applyEffects(container, stateEffects.pressed);
            }
        });

        container.on('pointerup', () => {
            isPressed = false;
            // After release, revert to hover if still over, otherwise to normal
            if (stateEffects.hover) {
                this.applyEffects(container, stateEffects.hover);
            } else if (stateEffects.normal && stateEffects.normal.length > 0) {
                this.applyEffects(container, stateEffects.normal);
            } else {
                this.revertToOriginalScale(container);
            }
        });
    }

    /**
     * Apply a list of effects to a container.
     * Supports: scale, offset, brightness
     */
    private applyEffects(container: Phaser.GameObjects.Container, effects: UiElementTemplateEffect[]): void {
        for (const effect of effects) {
            switch (effect.type) {
                case 'scale':
                    this.applyScaleEffect(container, effect);
                    break;
                case 'offset':
                    this.applyOffsetEffect(container, effect);
                    break;
                case 'brightness':
                    this.applyBrightnessEffect(container, effect);
                    break;
                // Shadow effect is complex (requires separate objects), skip for now
                default:
                    // Silently ignore unsupported effect types
                    break;
            }
        }
    }

    /**
     * Apply a scale effect to a container using tweens.
     */
    private applyScaleEffect(container: Phaser.GameObjects.Container, effect: UiElementTemplateEffect): void {
        const scaleX = effect.params?.x ?? 1;
        const scaleY = effect.params?.y ?? 1;
        const duration = effect.duration ?? 150;
        const easing = this.convertEasing(effect.easing);

        // Stop any existing tweens on this container
        this.scene.tweens.killTweensOf(container);

        // Apply scale relative to original scale
        const originalScaleX = container.getData('originalScaleX') ?? 1;
        const originalScaleY = container.getData('originalScaleY') ?? 1;
        const targetScaleX = originalScaleX * scaleX;
        const targetScaleY = originalScaleY * scaleY;

        if (duration > 0) {
            this.scene.tweens.add({
                targets: container,
                scaleX: targetScaleX,
                scaleY: targetScaleY,
                duration,
                ease: easing
            });
        } else {
            container.setScale(targetScaleX, targetScaleY);
        }
    }

    /**
     * Apply an offset effect to a container (moves it from original position).
     */
    private applyOffsetEffect(container: Phaser.GameObjects.Container, effect: UiElementTemplateEffect): void {
        const offsetX = effect.params?.x ?? 0;
        const offsetY = effect.params?.y ?? 0;
        const duration = effect.duration ?? 150;
        const easing = this.convertEasing(effect.easing);

        // Store original position if not already stored
        if (container.getData('originalX') === undefined) {
            container.setData('originalX', container.x);
            container.setData('originalY', container.y);
        }

        const originalX = container.getData('originalX');
        const originalY = container.getData('originalY');
        const targetX = originalX + offsetX;
        const targetY = originalY + offsetY;

        if (duration > 0) {
            this.scene.tweens.add({
                targets: container,
                x: targetX,
                y: targetY,
                duration,
                ease: easing
            });
        } else {
            container.setPosition(targetX, targetY);
        }
    }

    /**
     * Apply a brightness effect to container children using tint.
     * brightness > 1 = lighter, brightness < 1 = darker
     */
    private applyBrightnessEffect(container: Phaser.GameObjects.Container, effect: UiElementTemplateEffect): void {
        const brightness = effect.params?.value ?? 1;

        // Convert brightness to tint color
        // brightness 1 = no tint (0xffffff), >1 = brighter, <1 = darker
        const tintValue = Math.min(255, Math.max(0, Math.floor(brightness * 255)));
        const tint = (tintValue << 16) | (tintValue << 8) | tintValue;

        // Apply tint to all tintable children
        container.list.forEach((child) => {
            if ('setTint' in child && typeof (child as any).setTint === 'function') {
                if (brightness >= 1) {
                    // For brightness >= 1, clear tint (Phaser can't go brighter than original)
                    (child as any).clearTint();
                } else {
                    // For brightness < 1, darken with tint
                    (child as any).setTint(tint);
                }
            }
        });
    }

    /**
     * Revert container to its original state (scale, position, tint).
     */
    private revertToOriginalScale(container: Phaser.GameObjects.Container): void {
        const originalScaleX = container.getData('originalScaleX') ?? 1;
        const originalScaleY = container.getData('originalScaleY') ?? 1;
        const originalX = container.getData('originalX');
        const originalY = container.getData('originalY');

        // Stop any existing tweens
        this.scene.tweens.killTweensOf(container);

        // Revert scale and position
        const tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
            targets: container,
            scaleX: originalScaleX,
            scaleY: originalScaleY,
            duration: 150,
            ease: 'Power2'
        };

        // Add position revert if we have original position stored
        if (originalX !== undefined && originalY !== undefined) {
            tweenConfig.x = originalX;
            tweenConfig.y = originalY;
        }

        this.scene.tweens.add(tweenConfig);

        // Clear tint on all children
        container.list.forEach((child) => {
            if ('clearTint' in child && typeof (child as any).clearTint === 'function') {
                (child as any).clearTint();
            }
        });
    }

    /**
     * Convert template easing string to Phaser easing function name.
     */
    private convertEasing(easing: string): string {
        const easingMap: Record<string, string> = {
            'linear': 'Linear',
            'easeIn': 'Power2.easeIn',
            'easeOut': 'Power2.easeOut',
            'easeInOut': 'Power2.easeInOut',
            'easeOutBack': 'Back.easeOut',
            'easeInBack': 'Back.easeIn'
        };
        return easingMap[easing] || 'Power2';
    }

    /**
     * Render a single layer from the template.
     * Returns Image, Rectangle, or NineSlice - all have setAlpha.
     */
    private renderLayer(
        layer: UiElementTemplateLayer,
        _template: UiElementTemplate
    ): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | Phaser.GameObjects.NineSlice | null {
        switch (layer.sourceType) {
            case 'image':
                return this.renderImageLayer(layer);
            case 'color':
                return this.renderColorLayer(layer);
            case 'nineSlice':
                return this.renderNineSliceLayer(layer);
            default:
                console.warn(`UiElementFactory: Unknown layer sourceType: ${layer.sourceType}`);
                return null;
        }
    }

    /**
     * Render an image layer.
     * Images are positioned within the container based on layer.bounds.
     * The image is centered within its bounds area.
     */
    private renderImageLayer(
        layer: UiElementTemplateLayer
    ): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
        if (!layer.imagePath) {
            console.warn(`UiElementFactory: Image layer missing imagePath: ${layer.name}`);
            return this.renderColorLayer(layer);
        }

        // Build texture key: ui-tpl-{filename} where filename is extracted from path without extension
        const filename = layer.imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || layer.imagePath;
        const textureKey = `ui-tpl-${filename}`;

        // Check if texture exists
        if (!this.scene.textures.exists(textureKey)) {
            console.warn(`UiElementFactory: Texture not found: ${textureKey} for layer: ${layer.name}`);
            // Fall back to color layer
            return this.renderColorLayer(layer);
        }

        // Create image at the center of the bounds
        // Bounds are relative to template origin (0,0)
        const centerX = layer.bounds.x + layer.bounds.w / 2;
        const centerY = layer.bounds.y + layer.bounds.h / 2;

        const image = this.scene.add.image(centerX, centerY, textureKey);
        image.setOrigin(0.5, 0.5);

        // Scale image to fit bounds if needed
        // If the layer bounds differ from image size, scale to fit
        const scaleX = layer.bounds.w / image.width;
        const scaleY = layer.bounds.h / image.height;
        image.setScale(scaleX, scaleY);

        image.setName(layer.id);
        image.setData('layerId', layer.id);
        image.setData('layerName', layer.name);

        return image;
    }

    /**
     * Render a color layer (solid rectangle).
     */
    private renderColorLayer(
        layer: UiElementTemplateLayer
    ): Phaser.GameObjects.Rectangle {
        const color = Phaser.Display.Color.HexStringToColor(layer.color || '#cccccc').color;

        // Create rectangle at the center of the bounds
        const centerX = layer.bounds.x + layer.bounds.w / 2;
        const centerY = layer.bounds.y + layer.bounds.h / 2;

        const rect = this.scene.add.rectangle(
            centerX,
            centerY,
            layer.bounds.w,
            layer.bounds.h,
            color
        );
        rect.setOrigin(0.5, 0.5);

        rect.setName(layer.id);
        rect.setData('layerId', layer.id);
        rect.setData('layerName', layer.name);

        return rect;
    }

    /**
     * Render a nine-slice layer.
     * Nine-slices are scalable images that preserve corner/edge regions when resized.
     */
    private renderNineSliceLayer(
        layer: UiElementTemplateLayer
    ): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle {
        if (!layer.nineSliceConfigId) {
            console.warn(`UiElementFactory: Nine-slice layer missing nineSliceConfigId: ${layer.name}`);
            return this.renderColorLayer(layer);
        }

        const config = this.getNineSliceConfig(layer.nineSliceConfigId);
        if (!config) {
            console.warn(`UiElementFactory: Nine-slice config not found: ${layer.nineSliceConfigId} for layer: ${layer.name}`);
            return this.renderColorLayer(layer);
        }

        // Build texture key from config's originalPath: ui-tpl-{filename}
        const filename = config.originalPath.split('/').pop()?.replace(/\.[^.]+$/, '') || config.originalPath;
        const textureKey = `ui-tpl-${filename}`;

        // Check if texture exists
        if (!this.scene.textures.exists(textureKey)) {
            console.warn(`UiElementFactory: Nine-slice texture not found: ${textureKey} for layer: ${layer.name}`);
            return this.renderColorLayer(layer);
        }

        // Create nine-slice at the center of the bounds
        const centerX = layer.bounds.x + layer.bounds.w / 2;
        const centerY = layer.bounds.y + layer.bounds.h / 2;

        // Phaser NineSlice takes: x, y, texture, frame, width, height, leftWidth, rightWidth, topHeight, bottomHeight
        const nineSlice = this.scene.add.nineslice(
            centerX,
            centerY,
            textureKey,
            undefined, // frame (use entire texture)
            layer.bounds.w,
            layer.bounds.h,
            config.leftInset,
            config.rightInset,
            config.topInset,
            config.bottomInset
        );
        nineSlice.setOrigin(0.5, 0.5);

        nineSlice.setName(layer.id);
        nineSlice.setData('layerId', layer.id);
        nineSlice.setData('layerName', layer.name);
        nineSlice.setData('nineSliceConfigId', layer.nineSliceConfigId);

        return nineSlice;
    }

    /**
     * Render a text area from the template.
     * Text is positioned at the center of the textArea.bounds.
     * @param textArea The text area definition from the template
     * @param overrideText Optional text to use instead of defaultText
     */
    private renderTextArea(
        textArea: UiElementTemplateTextArea,
        overrideText?: string
    ): Phaser.GameObjects.Text {
        // Calculate position based on alignment
        let x: number;
        let y: number;
        let originX: number;
        let originY: number;

        // Horizontal alignment
        switch (textArea.textAlign) {
            case 'left':
                x = textArea.bounds.x;
                originX = 0;
                break;
            case 'right':
                x = textArea.bounds.x + textArea.bounds.w;
                originX = 1;
                break;
            case 'center':
            default:
                x = textArea.bounds.x + textArea.bounds.w / 2;
                originX = 0.5;
                break;
        }

        // Vertical alignment
        switch (textArea.verticalAlign) {
            case 'top':
                y = textArea.bounds.y;
                originY = 0;
                break;
            case 'bottom':
                y = textArea.bounds.y + textArea.bounds.h;
                originY = 1;
                break;
            case 'middle':
            default:
                y = textArea.bounds.y + textArea.bounds.h / 2;
                originY = 0.5;
                break;
        }

        // Build text style from textArea config
        const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: textArea.fontFamily,
            fontSize: `${textArea.fontSize}px`,
            color: textArea.textStyle.fill,
            align: textArea.textAlign
        };

        // Add stroke if defined
        if (textArea.textStyle.stroke && textArea.textStyle.strokeWidth && textArea.textStyle.strokeWidth > 0) {
            textStyle.stroke = textArea.textStyle.stroke;
            textStyle.strokeThickness = textArea.textStyle.strokeWidth;
        }

        // Add shadow if defined
        if (textArea.textStyle.shadowBlur && textArea.textStyle.shadowBlur > 0) {
            textStyle.shadow = {
                offsetX: 0,
                offsetY: 0,
                color: '#000000',
                blur: textArea.textStyle.shadowBlur,
                fill: true
            };
        }

        // Handle word wrap for wrap fitMode
        if (textArea.fitMode === 'wrap') {
            textStyle.wordWrap = {
                width: textArea.bounds.w,
                useAdvancedWrap: true
            };
        }

        // Use override text if provided, otherwise fall back to defaultText
        const displayText = overrideText !== undefined ? overrideText : textArea.defaultText;
        const text = this.scene.add.text(x, y, displayText, textStyle);
        text.setOrigin(originX, originY);

        // Handle shrinkToFit - scale down if text exceeds bounds
        if (textArea.fitMode === 'shrinkToFit') {
            const scaleX = text.width > textArea.bounds.w ? textArea.bounds.w / text.width : 1;
            const scaleY = text.height > textArea.bounds.h ? textArea.bounds.h / text.height : 1;
            const scale = Math.min(scaleX, scaleY);
            if (scale < 1) {
                text.setScale(scale);
            }
        }

        text.setName(textArea.id);
        text.setData('textAreaId', textArea.id);
        text.setData('textAreaName', textArea.name);

        return text;
    }

    /**
     * Create a placeholder for missing templates.
     */
    private createPlaceholder(templateId: string, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(x, y);

        // Red rectangle as background
        const rect = this.scene.add.rectangle(0, 0, 100, 50, 0xff0000, 0.5);
        rect.setOrigin(0.5, 0.5);

        // Error text
        const text = this.scene.add.text(0, 0, `MISSING:\n${templateId.substring(0, 15)}...`, {
            fontSize: '10px',
            color: '#ffffff',
            align: 'center'
        });
        text.setOrigin(0.5, 0.5);

        container.add([rect, text]);
        container.setSize(100, 50);
        container.setName(templateId);
        container.setData('templateId', templateId);
        container.setData('isMissing', true);

        return container;
    }

    /**
     * Get a template by ID.
     */
    getTemplate(templateId: string): UiElementTemplate | undefined {
        return this.templates.get(templateId);
    }

    /**
     * Check if a template exists.
     */
    hasTemplate(templateId: string): boolean {
        return this.templates.has(templateId);
    }

    /**
     * Get a nine-slice config by ID.
     * @param configId The nine-slice config ID from the scene editor export
     * @returns The config or undefined if not found
     */
    getNineSliceConfig(configId: string): ExportedNineSliceConfig | undefined {
        return this.nineSliceConfigs.get(configId);
    }

    /**
     * Check if a template has interactive effects (hover or pressed).
     * If so, the container should be made interactive.
     */
    private hasInteractiveEffects(template: UiElementTemplate): boolean {
        const { stateEffects } = template;
        if (!stateEffects) return false;

        const hasHoverEffects = Array.isArray(stateEffects.hover) && stateEffects.hover.length > 0;
        const hasPressedEffects = Array.isArray(stateEffects.pressed) && stateEffects.pressed.length > 0;

        return hasHoverEffects || hasPressedEffects;
    }
}

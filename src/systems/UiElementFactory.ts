import Phaser from 'phaser';
import {
    UiElementTemplate,
    UiElementTemplatesFile,
    UiElementTemplateLayer
} from '../types/assets';

/**
 * Factory for creating UI Element templates as Phaser containers.
 * Templates are defined in ui-element-templates.json and loaded in BootScene.
 */
export class UiElementFactory {
    private scene: Phaser.Scene;
    private templates: Map<string, UiElementTemplate>;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.templates = new Map();

        // Load templates from cache
        const templatesData = this.scene.cache.json.get('uiElementTemplates') as UiElementTemplatesFile | undefined;
        if (templatesData?.templates) {
            for (const template of templatesData.templates) {
                this.templates.set(template.id, template);
            }
        }
    }

    /**
     * Create a UI Element from a template.
     * @param templateId The template ID from ui-element-templates.json
     * @param x X position for the container
     * @param y Y position for the container
     * @returns A Phaser Container containing the rendered template
     */
    create(templateId: string, x: number, y: number): Phaser.GameObjects.Container {
        const template = this.templates.get(templateId);

        if (!template) {
            console.warn(`UiElementFactory: Template not found: ${templateId}`);
            return this.createPlaceholder(templateId, x, y);
        }

        const container = this.scene.add.container(x, y);
        container.setName(templateId);
        container.setData('templateId', templateId);

        // Sort layers by order (lower order = rendered first = behind)
        const sortedLayers = [...template.layers].sort((a, b) => a.order - b.order);

        // Render each layer
        for (const layer of sortedLayers) {
            if (!layer.visible) continue;

            const layerObject = this.renderLayer(layer, template);
            if (layerObject) {
                layerObject.setAlpha(layer.opacity);
                container.add(layerObject);
            }
        }

        // Set container size based on template size for hit area purposes
        container.setSize(template.size.w, template.size.h);

        return container;
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
                // Nine-slice support will be added in a later story (GUIE-011)
                console.warn(`UiElementFactory: nineSlice layers not yet supported, layer: ${layer.name}`);
                return this.renderColorLayer(layer);
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
}

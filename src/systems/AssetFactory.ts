import Phaser from 'phaser';
import {
    AssetDef,
    SpriteAssetDef,
    ImageAssetDef,
    TileSpriteAssetDef,
    ButtonAssetDef,
    TextAssetDef,
    PanelAssetDef,
    ContainerAssetDef,
    ProgressBarAssetDef
} from '../types/assets';
import { SceneElement } from '../types/scenes';
import { LocalizationService } from './LocalizationService';
import { UiElementFactory } from './UiElementFactory';

export class AssetFactory {
    private scene: Phaser.Scene;
    private assetDefs: Record<string, any>; // Flattened or structured assets
    private localization: LocalizationService;
    private uiElementFactory: UiElementFactory;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.localization = LocalizationService.getInstance();
        this.uiElementFactory = new UiElementFactory(scene);

        // Load assets from cache
        const assetsData = this.scene.cache.json.get('assets');
        this.assetDefs = this.flattenAssets(assetsData);
    }

    /**
     * Flatten the nested assets structure into a map of "category.subcategory.id" -> AssetDef
     */
    private flattenAssets(data: any, prefix = ''): Record<string, AssetDef> {
        let result: Record<string, AssetDef> = {};

        for (const key in data) {
            if (key === 'version') continue;

            const value = data[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (value.type && typeof value.type === 'string') {
                // It's an asset definition
                result[newKey] = value as AssetDef;
            } else if (typeof value === 'object') {
                // Recurse
                const children = this.flattenAssets(value, newKey);
                result = { ...result, ...children };
            }
        }

        return result;
    }

    /**
     * Create a game object from an asset definition
     */
    create(assetKey: string, placement: SceneElement): Phaser.GameObjects.GameObject {
        const assetDef = this.assetDefs[assetKey];
        if (!assetDef) {
            console.warn(`Unknown asset: ${assetKey}`);
            // Return a placeholder
            return this.scene.add.text(placement.x, placement.y, `MISSING: ${assetKey}`, { color: '#ff0000' });
        }

        let obj: Phaser.GameObjects.GameObject;

        switch (assetDef.type) {
            case 'sprite':
            case 'animatedSprite':
                obj = this.createSprite(assetDef as SpriteAssetDef, placement);
                break;
            case 'image':
            case 'staticImage':
            case 'interactiveImage':
                obj = this.createImage(assetDef as ImageAssetDef, placement);
                break;
            case 'tileSprite':
                obj = this.createTileSprite(assetDef as TileSpriteAssetDef, placement);
                break;
            case 'button':
                obj = this.createButton(assetDef as ButtonAssetDef, placement);
                break;
            case 'text':
            case 'ui.label': // Handle category as type if needed, but type field is safer
                obj = this.createText(assetDef as TextAssetDef, placement);
                break;
            case 'panel':
                obj = this.createPanel(assetDef as PanelAssetDef, placement);
                break;
            case 'container':
                obj = this.createContainer(assetDef as ContainerAssetDef, placement);
                break;
            case 'nineSlice':
                obj = this.createNineSlice(assetDef as ImageAssetDef, placement);
                break;
            case 'uiElement':
                obj = this.createUiElement(placement);
                break;
            default:
                console.warn(`Unsupported asset type: ${assetDef.type}`);
                obj = this.scene.add.text(placement.x, placement.y, `TYPE? ${assetDef.type}`, { color: '#ff0000' });
        }

        // Apply common properties
        if (placement.visible !== undefined) (obj as any).setVisible(placement.visible);
        if (placement.alpha !== undefined) (obj as any).setAlpha(placement.alpha);

        // Store ID
        obj.setName(placement.id);
        obj.setData('id', placement.id);
        obj.setData('asset', assetKey);

        return obj;
    }

    private createSprite(def: SpriteAssetDef, placement: SceneElement): Phaser.GameObjects.Sprite {
        const texture = placement.texture || def.defaultTexture;
        const sprite = this.scene.add.sprite(placement.x, placement.y, texture);

        const origin = def.origin || [0.5, 0.5];
        sprite.setOrigin(origin[0], origin[1]);

        let scale = 1;
        if (typeof def.scale === 'number') {
            scale = def.scale;
        } else if (def.scale && typeof def.scale === 'object') {
            scale = def.scale.default || 1;
        }
        if (placement.scale !== undefined) scale = placement.scale;
        sprite.setScale(scale);

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        sprite.setDepth(depth);

        if (def.defaultAnimation) {
            sprite.play(def.animations?.[def.defaultAnimation] || def.defaultAnimation);
        }

        return sprite;
    }

    private createImage(def: ImageAssetDef, placement: SceneElement): Phaser.GameObjects.Image {
        const texture = placement.texture || def.texture;
        const image = this.scene.add.image(placement.x, placement.y, texture);

        const origin = def.origin || [0.5, 0.5];
        image.setOrigin(origin[0], origin[1]);

        let scale = 1;
        if (typeof def.scale === 'number') {
            scale = def.scale;
        } else if (def.scale && typeof def.scale === 'object') {
            scale = def.scale.default || 1;
        }
        if (placement.scale !== undefined) scale = placement.scale;
        image.setScale(scale);

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        image.setDepth(depth);

        if (def.displaySize) {
            image.setDisplaySize(def.displaySize[0], def.displaySize[1]);
        }

        if (placement.width && placement.height) {
            image.setDisplaySize(placement.width, placement.height);
        }

        if (def.action) {
            image.setData('action', def.action);
        }

        if (def.interactive?.useHandCursor) {
            image.setInteractive({ useHandCursor: true });

            if (def.hoverEffect) {
                const baseScale = scale;
                image.on('pointerover', () => {
                    if (def.hoverEffect?.scaleMultiplier) image.setScale(baseScale * def.hoverEffect.scaleMultiplier);
                    if (def.hoverEffect?.tint) image.setTint(Phaser.Display.Color.HexStringToColor(def.hoverEffect.tint).color);
                });
                image.on('pointerout', () => {
                    image.setScale(baseScale);
                    image.clearTint();
                });
            }
        }

        return image;
    }

    private createNineSlice(def: ImageAssetDef, placement: SceneElement): Phaser.GameObjects.NineSlice {
        const texture = placement.texture || def.texture;

        // Get nine-slice config from registry
        const nineSlices = this.scene.registry.get('nineSlices');
        const config = nineSlices?.configs?.[texture];

        if (!config) {
            console.warn(`No nine-slice config for texture: ${texture}, falling back to image`);
            // Fallback to regular image if no nine-slice config
            const image = this.scene.add.image(placement.x, placement.y, texture);
            const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
            image.setDepth(depth);
            return image as unknown as Phaser.GameObjects.NineSlice;
        }

        // Get dimensions (from placement, def, or defaults)
        const width = placement.width ?? (def as any).defaultWidth ?? 100;
        const height = placement.height ?? (def as any).defaultHeight ?? 100;

        // Create nine-slice
        const nineSlice = this.scene.add.nineslice(
            placement.x,
            placement.y,
            texture,
            undefined,  // frame
            width,
            height,
            config.leftWidth,
            config.rightWidth,
            config.topHeight,
            config.bottomHeight
        );

        const origin = def.origin || [0.5, 0.5];
        nineSlice.setOrigin(origin[0], origin[1]);

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        nineSlice.setDepth(depth);

        return nineSlice;
    }

    private createTileSprite(def: TileSpriteAssetDef, placement: SceneElement): Phaser.GameObjects.TileSprite {
        const width = placement.width || def.width || this.scene.scale.width;
        const height = placement.height || def.height || this.scene.scale.height;

        const ts = this.scene.add.tileSprite(placement.x, placement.y, width, height, def.texture);

        const origin = def.origin || [0, 0];
        ts.setOrigin(origin[0], origin[1]);

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        ts.setDepth(depth);

        if (def.scrollFactor !== undefined) ts.setScrollFactor(def.scrollFactor);
        if (def.tileScale) ts.setTileScale(def.tileScale[0], def.tileScale[1]);

        if (placement.alpha !== undefined) ts.setAlpha(placement.alpha);

        return ts;
    }

    private createButton(def: ButtonAssetDef, placement: SceneElement): Phaser.GameObjects.Container {
        const container = this.scene.add.container(placement.x, placement.y);
        const width = placement.width || def.width;
        const height = placement.height || def.height;

        // Background
        const fillColor = Phaser.Display.Color.HexStringToColor(def.style.fill).color;
        const bg = this.scene.add.rectangle(0, 0, width, height, fillColor);
        if (def.style.stroke) {
            bg.setStrokeStyle(def.style.stroke.width, Phaser.Display.Color.HexStringToColor(def.style.stroke.color).color);
        }

        bg.setInteractive({ useHandCursor: true });
        container.add(bg);

        // Text
        const textKey = placement.text || def.textKey;
        if (textKey) {
            const content = this.localization.resolve(textKey);
            const style = { ...def.textStyle, ...placement }; // Merge styles
            // Remove non-style props from placement merge
            delete (style as any).x; delete (style as any).y; delete (style as any).id; delete (style as any).asset;

            const text = this.scene.add.text(0, 0, content, style).setOrigin(0.5);
            container.add(text);
        }

        // Hover effects
        if (def.style.hoverFill) {
            const hoverColor = Phaser.Display.Color.HexStringToColor(def.style.hoverFill).color;
            bg.on('pointerover', () => bg.setFillStyle(hoverColor));
            bg.on('pointerout', () => bg.setFillStyle(fillColor));
        }

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        container.setDepth(depth);

        return container;
    }

    private createText(def: TextAssetDef, placement: SceneElement): Phaser.GameObjects.Text {
        const textKey = placement.text || (def as any).textKey || (def as any).text; // Handle various text fields
        const content = this.localization.resolve(textKey || '???');

        const style = { ...def.style };
        if (placement.fontSize) style.fontSize = placement.fontSize;
        if (placement.color) style.color = placement.color;

        const text = this.scene.add.text(placement.x, placement.y, content, style);

        const origin = def.origin || [0.5, 0.5];
        text.setOrigin(origin[0], origin[1]);

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        text.setDepth(depth);

        // Animations
        if (def.floatAnimation) {
            this.scene.tweens.add({
                targets: text,
                y: text.y + def.floatAnimation.y,
                duration: def.floatAnimation.duration,
                ease: def.floatAnimation.ease,
                yoyo: true,
                repeat: -1
            });
        }

        return text;
    }

    private createPanel(def: PanelAssetDef, placement: SceneElement): Phaser.GameObjects.Rectangle {
        const width = placement.width || this.scene.scale.width;
        const height = placement.height || this.scene.scale.height;
        const color = Phaser.Display.Color.HexStringToColor(def.fill).color;

        const rect = this.scene.add.rectangle(placement.x, placement.y, width, height, color);

        if (def.alpha !== undefined) rect.setAlpha(def.alpha);
        if (placement.alpha !== undefined) rect.setAlpha(placement.alpha);

        if (def.stroke) {
            rect.setStrokeStyle(def.stroke.width, Phaser.Display.Color.HexStringToColor(def.stroke.color).color);
        }

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        rect.setDepth(depth);

        return rect;
    }

    private createContainer(def: ContainerAssetDef, placement: SceneElement): Phaser.GameObjects.Container {
        const container = this.scene.add.container(placement.x, placement.y);

        // Only iterate if components exist (empty containers are valid)
        if (def.components) {
            def.components.forEach(comp => {
                if (comp.type === 'circle') {
                    const color = Phaser.Display.Color.HexStringToColor(comp.fill || '#ffffff').color;
                    const circle = this.scene.add.circle(0, 0, comp.radius, color);
                    if (comp.stroke) {
                        circle.setStrokeStyle(comp.stroke.width, Phaser.Display.Color.HexStringToColor(comp.stroke.color).color);
                    }
                    container.add(circle);
                } else if (comp.type === 'text') {
                    const content = this.localization.resolve(comp.content || '');
                    const text = this.scene.add.text(0, comp.offsetY || 0, content, comp.style || {}).setOrigin(0.5);
                    container.add(text);
                }
            });
        }

        const depth = placement.depth !== undefined ? placement.depth : (def.depth || 0);
        container.setDepth(depth);

        if (def.pulseAnimation) {
            this.scene.tweens.add({
                targets: container,
                y: container.y + def.pulseAnimation.y,
                scaleX: def.pulseAnimation.scale,
                scaleY: def.pulseAnimation.scale,
                duration: def.pulseAnimation.duration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        return container;
    }

    /**
     * Create a UI Element from a template.
     * Templates are defined in ui-element-templates.json.
     */
    private createUiElement(placement: SceneElement): Phaser.GameObjects.Container {
        const templateId = placement.uiElement?.templateId;
        const textOverrides = placement.uiElement?.textOverrides;

        if (!templateId) {
            console.warn(`AssetFactory: uiElement placement missing templateId: ${placement.id}`);
            return this.scene.add.container(placement.x, placement.y);
        }

        const container = this.uiElementFactory.create(templateId, placement.x, placement.y, textOverrides);

        // Apply depth if specified
        if (placement.depth !== undefined) {
            container.setDepth(placement.depth);
        }

        // Apply scale if specified
        if (placement.scale !== undefined) {
            container.setScale(placement.scale);
        }

        // Apply alpha if specified
        if (placement.alpha !== undefined) {
            container.setAlpha(placement.alpha);
        }

        return container;
    }
}

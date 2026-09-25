import { describe, expect, it, vi } from 'vitest';
import type { TexturesFile } from '../../types/assets';

vi.mock('virtual:asset-downloads', () => ({ default: { sceneKeys: {}, scenes: {}, images: {}, all: [] } }));
vi.mock('phaser', () => {
    class ImageFile {
        key: string;
        cache: any;
        constructor(loader: any, config: any) {
            this.key = config.key;
            this.cache = loader.textureManager;
        }
        addToCache() { this.cache.addImage(this.key); }
    }
    class SpriteSheetFile extends ImageFile {
        addToCache() { this.cache.addSpriteSheet(this.key); }
    }
    return { default: { Loader: { FileTypes: { ImageFile, SpriteSheetFile } } } };
});

import { queueTexture } from '../AssetPreparation';

const catalog = {
    images: { shared: 'shared.webp' },
    spritesheets: { creature: { path: 'creature.webp', frameWidth: 32, frameHeight: 32 } },
} as unknown as TexturesFile;

function fixture() {
    const loaded = new Set<string>();
    const add = vi.fn((key: string) => {
        if (loaded.has(key)) throw new Error(`Duplicate texture: ${key}`);
        loaded.add(key);
    });
    const textures = { exists: (key: string) => loaded.has(key), addImage: add, addSpriteSheet: add };
    const scene = () => {
        const files: any[] = [];
        const load = {
            textureManager: textures, addFile: (file: any) => files.push(file),
            image: (key: string) => files.push({ key, addToCache: () => add(key) }),
            spritesheet: (key: string) => files.push({ key, addToCache: () => add(key) }),
        };
        return { files, scene: { textures, load } as any };
    };
    return { loaded, add, scene };
}

describe('shared texture cache during scene transitions', () => {
    for (const key of ['shared', 'creature']) {
        for (const order of [[0, 1], [1, 0]]) {
            it(`${key}: both loaders finish, cache insertion happens once (${order.join(',')})`, () => {
                const f = fixture();
                const loaders = [f.scene(), f.scene()];
                // A background decode and the destination preload may both
                // queue a key before either has finished processing its image.
                loaders.forEach(loader => queueTexture(loader.scene, key, catalog));
                expect(loaders.map(loader => loader.files.length)).toEqual([1, 1]);
                for (const index of order) loaders[index].files[0].addToCache();
                expect(f.add).toHaveBeenCalledExactlyOnceWith(key);
            });
        }
    }

    it('does not enqueue an already loaded or unknown texture', () => {
        const f = fixture(), loader = f.scene();
        f.loaded.add('shared');
        queueTexture(loader.scene, 'shared', catalog);
        queueTexture(loader.scene, 'missing', catalog);
        expect(loader.files).toHaveLength(0);
    });
});

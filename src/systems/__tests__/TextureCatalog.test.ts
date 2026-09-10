import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import texturesJson from '../../../public/assets/data/textures.json';

const sourceExists = (source: string): boolean => {
    const relativePath = source.startsWith('library:')
        ? `public/assets/library/${source.slice('library:'.length)}`
        : `public/assets/${source}`;
    return existsSync(resolve(relativePath));
};

describe('texture catalog', () => {
    it('does not register one key as both an image and a spritesheet', () => {
        const imageKeys = new Set(Object.keys(texturesJson.images));
        const duplicateKeys = Object.keys(texturesJson.spritesheets)
            .filter(key => imageKeys.has(key))
            .sort();

        expect(duplicateKeys).toEqual([]);
    });

    it('references an existing source file for every spritesheet', () => {
        const missingSources = Object.entries(texturesJson.spritesheets)
            .filter(([, definition]) => !sourceExists(definition.path))
            .map(([key]) => key)
            .sort();

        expect(missingSources).toEqual([]);
    });

    it('references an existing source file for every image', () => {
        const missingSources = Object.entries(texturesJson.images)
            .filter(([, definition]) => {
                const source = typeof definition === 'string' ? definition : definition.path;
                return !sourceExists(source);
            })
            .map(([key]) => key)
            .sort();

        expect(missingSources).toEqual([]);
    });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { collectSceneAssets } from './scene-assets.mjs';

const publicUrl = value => new URL(value, 'https://assets.invalid').pathname;
const texturePath = file => publicUrl(`/assets/${file.startsWith('library:') ? `library/${file.slice(8)}` : file}`);

/** The same filtered editor catalogs drive foreground loading, forecasting and offline coverage. */
export async function collectAssetDownloads(root, dataDir) {
    const publicDir = path.resolve(dataDir, '../..');
    const read = name => JSON.parse(readFileSync(path.join(dataDir, name), 'utf8'));
    const textures = read('textures.json'), audio = read('audio.json');
    const keys = collectSceneAssets(root, dataDir);
    const withAudio = collectSceneAssets(root, dataDir, Object.keys(audio.assets));
    const images = {};
    for (const [key, value] of [...Object.entries(textures.images), ...Object.entries(textures.spritesheets)]) {
        const url = texturePath(typeof value === 'string' ? value : value.path);
        const filename = path.join(publicDir, decodeURIComponent(url.slice(1)));
        const meta = await sharp(filename).metadata();
        images[key] = { url, bytes: statSync(filename).size, decodedBytes: (meta.width ?? 0) * (meta.height ?? 0) * 4 };
    }
    const data = [];
    const visit = directory => {
        for (const file of readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, file.name);
            if (file.isDirectory()) visit(absolute);
            else if (file.name.endsWith('.json') && !/debug-layout/.test(file.name)) data.push(publicUrl('/' + path.relative(publicDir, absolute).split(path.sep).join('/')));
        }
    };
    visit(dataDir);
    const soundUrls = [...Object.values(audio.assets), ...Object.values(audio.music)].map(asset => asset.url);
    if (soundUrls.some(url => !url.startsWith('/assets/audio/'))) throw new Error('Offline audio must be a same-origin runtime asset');
    const sounds = soundUrls.map(publicUrl);
    const all = [...new Set([...data.sort(), ...Object.values(images).map(v => v.url), ...sounds])];
    const scenes = Object.fromEntries(Object.entries(keys).map(([key, value]) => [key,
        [...(withAudio[key] ?? []).filter(id => audio.assets[id]).map(id => publicUrl(audio.assets[id].url)), ...value.map(id => images[id].url)]]));
    return { images, sceneKeys: keys, scenes, all };
}

export function assetDownloadsPlugin(root, dataDir) {
    const id = 'virtual:asset-downloads', resolved = '\0' + id;
    let pending;
    return {
        name: 'asset-downloads',
        resolveId(source) { return source === id ? resolved : null; },
        async load(source) {
            if (source !== resolved) return null;
            pending ??= collectAssetDownloads(root, dataDir);
            return `export default ${JSON.stringify(await pending)};`;
        },
        handleHotUpdate(context) {
            if (/\.(ts|json)$/.test(context.file)) {
                pending = undefined;
                const module = context.server.moduleGraph.getModuleById(resolved);
                if (module) context.server.moduleGraph.invalidateModule(module);
            }
        },
    };
}

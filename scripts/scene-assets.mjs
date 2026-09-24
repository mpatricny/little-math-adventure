import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const readJson = filename => JSON.parse(readFileSync(filename, 'utf8'));
function walk(value, visit) {
    if (typeof value === 'string') visit(value);
    else if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') Object.values(value).forEach(child => walk(child, visit));
}
function leaves(value, predicate, prefix = '', output = new Map()) {
    if (!value || typeof value !== 'object') return output;
    if (predicate(value)) output.set(prefix, value);
    else for (const [key, child] of Object.entries(value)) leaves(child, predicate, prefix ? `${prefix}.${key}` : key, output);
    return output;
}

/** Build dependencies from the editor catalogs and each scene's actual imported helpers. */
export function collectSceneAssets(root, dataDir = path.join(root, 'public/assets/data'), extraResourceKeys = []) {
    const load = name => readJson(path.join(dataDir, name));
    const textures = load('textures.json');
    const textureKeys = new Set([...Object.keys(textures.images), ...Object.keys(textures.spritesheets), ...extraResourceKeys]);
    const scenes = load('scenes.json').scenes;
    const layouts = new Map(Object.entries(scenes));
    const assets = leaves(load('assets.json'), item => typeof item.type === 'string');
    const animations = new Map([...leaves(load('animations.json'), item => item.texture && item.frames)]
        .map(([key, value]) => [key.split('.').at(-1), value]));
    const templates = new Map(load('ui-element-templates.json').templates.map(item => [item.id, item]));
    const slices = new Map(Object.entries(load('nine-slices.json').configs));
    const actors = new Map(['enemies.json', 'pets.json', 'characters.json', 'npcs.json']
        .flatMap(name => load(name)).map(actor => [actor.id, actor]));
    const encounters = new Map();
    const indexEncounters = value => {
        if (!value || typeof value !== 'object') return;
        if (value.id) encounters.set(value.id, value);
        Object.values(value).forEach(indexEncounters);
    };
    indexEncounters(load('encounters.json'));
    const sourceCache = new Map();
    function sourceGraph(filename, visited = new Set()) {
        if (visited.has(filename) || !existsSync(filename)) return [];
        visited.add(filename);
        // Debugger string inventories do not describe a scene's runtime dependencies.
        if (filename.startsWith(path.join(root, 'src/types')) || filename.startsWith(path.join(root, 'src/loading')) || /SceneDebugger|DebugOverlay|SceneAssetPlugin|GameStateManager|MasterySystem|ProgressionSystem|SilverpondProgressSystem|JourneySystem|PlacementInitializer/.test(filename)) return [];
        if (filename.endsWith('.json')) {
            const dataName = path.basename(filename);
            if (existsSync(path.join(dataDir, dataName))) return [load(dataName)];
            return [readJson(filename)];
        }
        let parsed = sourceCache.get(filename);
        if (!parsed) {
            const source = readFileSync(filename, 'utf8');
            const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
            const values = [], imports = [], layouts = [];
            const visit = node => {
                // Data passed to a destination scene belongs to that scene's preload.
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
                    && ['start', 'launch', 'switch'].includes(node.expression.name.text)
                    && /\bscene$/.test(node.expression.expression.getText(ast))) return;
                if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
                    const name = node.moduleSpecifier.text;
                    if (name.startsWith('.')) {
                        const base = path.resolve(path.dirname(filename), name);
                        const dependency = [base, `${base}.ts`, path.join(base, 'index.ts')].find(f => existsSync(f) && /\.(ts|json)$/.test(f));
                        if (dependency) imports.push(dependency);
                    }
                }
                if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) values.push(node.text);
                if (ts.isTemplateExpression(node) && node.head.text.length >= 4) {
                    const parts = [node.head.text, ...node.templateSpans.map(span => span.literal.text)];
                    const pattern = new RegExp(`^${parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);
                    for (const key of textureKeys) if (pattern.test(key)) values.push(key);
                }
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
                    && node.expression.name.text === 'buildScene' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
                    layouts.push(node.arguments[0].text);
                }
                ts.forEachChild(node, visit);
            };
            visit(ast);
            parsed = { values, imports, layouts };
            sourceCache.set(filename, parsed);
        }
        return [...parsed.values, ...parsed.layouts.map(key => scenes[key]), ...parsed.imports.flatMap(file => sourceGraph(file, visited))];
    }
    const result = {};
    for (const filename of readdirSync(path.join(root, 'src/scenes')).filter(name => name.endsWith('.ts') && name !== 'BootScene.ts')) {
        const file = path.join(root, 'src/scenes', filename);
        const source = readFileSync(file, 'utf8');
        const classNames = [...source.matchAll(/export class (\w+)/g)].map(match => match[1]);
        for (const sceneKey of classNames) {
            const selected = new Set(), visited = new Set(), queue = [scenes[sceneKey], ...sourceGraph(file)];
            const visit = value => {
                if (visited.has(value)) return;
                visited.add(value);
                if (textureKeys.has(value)) selected.add(value);
                for (const map of [assets, animations, templates, slices, actors, encounters, layouts]) if (map.has(value)) queue.push(map.get(value));
                // An actor's animPrefix also closes all motion aliases and phase animations.
                for (const [name, animation] of animations) if (name.startsWith(`${value}-`)) queue.push(animation);
                if (value.startsWith('assets/data/') && value.endsWith('.json')) {
                    const name = value.slice('assets/data/'.length);
                    if (existsSync(path.join(dataDir, name))) queue.push(load(name));
                }
            };
            while (queue.length) walk(queue.pop(), visit);
            result[sceneKey] = [...selected].sort();
        }
    }
    return result;
}

export function sceneAssetsPlugin(root, dataDir) {
    const publicId = 'virtual:scene-assets';
    const resolvedId = '\0' + publicId;
    return {
        name: 'scene-assets',
        resolveId(id) { return id === publicId ? resolvedId : null; },
        load(id) {
            if (id !== resolvedId) return null;
            return `export default ${JSON.stringify(collectSceneAssets(root, dataDir))};`;
        },
        handleHotUpdate(context) {
            if (/\.(ts|json)$/.test(context.file)) {
                const module = context.server.moduleGraph.getModuleById(resolvedId);
                if (module) context.server.moduleGraph.invalidateModule(module);
            }
        },
    };
}

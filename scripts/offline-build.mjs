import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectAssetDownloads } from './asset-downloads.mjs';
import { installOfflineWorker } from '../src/loading/offline-worker.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

export function createOfflineManifest(outputDir, plan, bundleFiles) {
    const normalize = url => {
        if (!/^\/(?:assets\/|index\.html$|manifest\.json$|sdk\/mesa-sdk\.js$)/.test(url) || /[?#]/.test(url)
            || decodeURIComponent(url).split('/').includes('..')) throw new Error(`Unsafe offline resource ${url}`);
        return new URL(url, 'https://assets.invalid').pathname;
    };
    const html = readFileSync(path.join(outputDir, 'index.html'), 'utf8');
    const entry = normalize('/' + html.match(/<script[^>]+src="([^\"]+\.js)"/)[1].replace(/^\//, ''));
    // Public script tags outside Rollup's graph must survive a real offline reload too.
    const publicScripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1])
        .filter(url=>url==='/sdk/mesa-sdk.js'&&existsSync(path.join(outputDir,url.slice(1))));
    const shell = [...new Set(['/index.html', ...bundleFiles.map(file => '/' + file),...publicScripts].map(normalize))].sort();
    const urls = [...new Set([...shell, ...plan.all, ...(existsSync(path.join(outputDir, 'manifest.json')) ? ['/manifest.json'] : [])].map(normalize))].sort();
    const resources = urls.map(url => {
        const decoded = decodeURIComponent(url);
        const bytes = readFileSync(path.join(outputDir, decoded.slice(1)));
        return { url, bytes: bytes.length, sha256: sha(bytes) };
    });
    return { version: 1, revision: sha(JSON.stringify({ resources, worker: installOfflineWorker.toString() })).slice(0, 24), entry, shell, resources };
}

export function offlineBuildPlugin(root, dataDir) {
    let outputDir, bundleFiles = [];
    return {
        name: 'offline-game', apply: 'build',
        configResolved(config) { outputDir = path.resolve(config.root, config.build.outDir); },
        generateBundle(_options, bundle) {
            // Only the game entry's transitive graph. Landing/admin code is never part of offline play.
            const seen=new Set();
            const visit=file=>{if(seen.has(file))return;seen.add(file);const node=bundle[file];if(!node||node.type!=='chunk')return;
                for(const dependency of [...node.imports,...node.dynamicImports,...(node.viteMetadata?.importedCss??[]),...(node.viteMetadata?.importedAssets??[])])visit(dependency);};
            for(const [file,node]of Object.entries(bundle))if(node.type==='chunk'&&node.facadeModuleId===path.join(root,'index.html'))visit(file);
            bundleFiles=[...seen].filter(file=>file.startsWith('assets/'));
        },
        closeBundle: { order: 'post', sequential: true, async handler() {
            const plan = await collectAssetDownloads(root, dataDir);
            const manifest = createOfflineManifest(outputDir, plan, bundleFiles);
            writeFileSync(path.join(outputDir, 'offline-manifest.json'), JSON.stringify(manifest));
            writeFileSync(path.join(outputDir, 'offline-sw.js'), `/* Generated, version-pinned game assets. */\n(${installOfflineWorker.toString()})(self, ${JSON.stringify(manifest)});\n`);
        } },
    };
}

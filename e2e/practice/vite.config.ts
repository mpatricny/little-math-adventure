import { defineConfig } from 'vite';
import path from 'node:path';
import { sceneAssetsPlugin } from '../../scripts/scene-assets.mjs';
import { assetDownloadsPlugin } from '../../scripts/asset-downloads.mjs';

const root = process.cwd();
const data = path.join(root, 'public/assets/data');

// Module-only browser test: no save sync, API proxy or game boot plugins.
export default defineConfig({
    publicDir: false,
    plugins: [sceneAssetsPlugin(root, data), assetDownloadsPlugin(root, data)],
    optimizeDeps: { entries: [] },
    server: { host: '127.0.0.1', port: 8024, strictPort: true, hmr: false },
});

import { defineConfig } from 'vite';
import path from 'node:path';
import { sceneAssetsPlugin } from '../../scripts/scene-assets.mjs';
import { assetDownloadsPlugin } from '../../scripts/asset-downloads.mjs';

const root = process.cwd();
const data = path.join(root, 'public/assets/data');
// An isolated production game renderer. No API proxy, save-sync endpoint,
// diagnostic writers or repository saves are mounted on this server.
export default defineConfig({
    plugins: [sceneAssetsPlugin(root, data), assetDownloadsPlugin(root, data)],
    optimizeDeps: { entries: ['index.html'] },
    server: { host: '127.0.0.1', port: 8027, strictPort: true, hmr: false },
});

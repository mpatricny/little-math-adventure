import { defineConfig, Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { learningSaveDiagnosticsPlugin } from './scripts/learning-save-diagnostics.mjs';
import { sceneAssetsPlugin } from './scripts/scene-assets.mjs';
import { preparePilotPublic } from './scripts/pilot-content.mjs';

/**
 * Vite plugin that saves debug layout values to a JSON file.
 * When the game POSTs to /__save-debug, it writes to public/assets/data/debug-layout.json
 */
function debugSavePlugin(): Plugin {
    return {
        name: 'debug-save',
        configureServer(server) {
            server.middlewares.use('/__save-debug', (req, res) => {
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', (chunk: Buffer) => body += chunk.toString());
                    req.on('end', () => {
                        try {
                            const filePath = path.resolve('public/assets/data/debug-layout.json');
                            fs.writeFileSync(filePath, body, 'utf-8');
                            console.log('\n📍 Debug layout saved to: public/assets/data/debug-layout.json\n');
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true }));
                        } catch (err) {
                            console.error('Failed to save debug layout:', err);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: String(err) }));
                        }
                    });
                } else {
                    res.writeHead(405);
                    res.end();
                }
            });
        }
    };
}

/**
 * Vite plugin that removes non-game files from the production build.
 * The library/ folder contains Scene Editor database files and thumbnails
 * that are not needed at runtime.
 */
function cleanBuildPlugin(): Plugin {
    let outputDir = path.resolve('dist');
    return {
        name: 'clean-build',
        configResolved(config) {
            outputDir = path.resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            for (const folder of ['incoming', 'previews']) {
                fs.rmSync(path.join(outputDir, 'assets/audio', folder), { recursive: true, force: true });
            }
            const distLibrary = path.join(outputDir, 'assets/library');
            const removals = [
                'assets.db',
                'assets.db-shm',
                'assets.db-wal',
                'thumbnails',
            ];
            for (const name of removals) {
                const target = path.join(distLibrary, name);
                if (fs.existsSync(target)) {
                    fs.rmSync(target, { recursive: true });
                    console.log(`🧹 Removed from build: library/${name}`);
                }
            }
        }
    };
}

/** Static JSON imports and browser fetches must see the same pilot catalog. */
function pilotDataPlugin(rootDir: string, publicDir: string): Plugin {
    const originalDataDir = path.join(rootDir, 'public', 'assets', 'data') + path.sep;
    return {
        name: 'pilot-data',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer || (!source.startsWith('.') && !path.isAbsolute(source))) return null;
            const resolved = path.resolve(path.dirname(importer.split('?')[0]), source);
            if (!resolved.startsWith(originalDataDir)) return null;
            const target = path.join(publicDir, 'assets', 'data', resolved.slice(originalDataDir.length));
            if (!fs.existsSync(target)) throw new Error(`Missing pilot data: ${target}`);
            return target;
        },
    };
}

export default defineConfig(({ mode }) => {
    const isPilot = mode === 'pilot';
    const rootDir = path.resolve(__dirname);
    const pilot = isPilot ? preparePilotPublic(rootDir) : null;
    return {
    define: {
        'import.meta.env.VITE_APP_RELEASE': JSON.stringify(isPilot
            ? JSON.parse(fs.readFileSync(path.join(rootDir, 'wrangler.jsonc'), 'utf8')).vars.APP_RELEASE
            : 'development'),
    },
    publicDir: pilot?.publicDir ?? 'public',
    plugins: [
        ...(pilot ? [pilotDataPlugin(rootDir, pilot.publicDir)] : [debugSavePlugin(), learningSaveDiagnosticsPlugin(rootDir)]),
        cleanBuildPlugin(),
        sceneAssetsPlugin(rootDir, path.join(pilot?.publicDir ?? path.join(rootDir, 'public'), 'assets/data')),
    ],
    esbuild: {
        target: 'es2018',
    },
    build: {
        target: 'es2018',
        outDir: isPilot ? 'dist/pilot' : 'dist/development',
        rollupOptions: {
            input: [
                path.resolve(rootDir, 'index.html'),
                path.resolve(rootDir, 'landing.html'),
            ],
        },
    },
    server: {
        host: '0.0.0.0',
        port: isPilot ? 8002 : 8001,
        strictPort: true,
        hmr: false,  // Disable hot reload - manually refresh when ready
        proxy: {
            '/api': 'http://127.0.0.1:3000',
            '/v1': 'http://127.0.0.1:3000',
        },
    },
    preview: {
        proxy: {
            '/api': 'http://127.0.0.1:3000',
            '/v1': 'http://127.0.0.1:3000',
        },
    },
    clearScreen: false,
    };
});

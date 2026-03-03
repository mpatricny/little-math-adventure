import { defineConfig, Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

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
    return {
        name: 'clean-build',
        closeBundle() {
            const distLibrary = path.resolve('dist/assets/library');
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

export default defineConfig({
    plugins: [debugSavePlugin(), cleanBuildPlugin()],
    server: {
        host: '0.0.0.0',
        port: 8000,
        hmr: false,  // Disable hot reload - manually refresh when ready
    },
    clearScreen: false,
});

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const kinds = new Set(['boot', 'heartbeat', 'error', 'contextlost', 'contextrestored', 'pagehide', 'save_reload']);
const fields = ['at', 'run', 'scene', 'encounter', 'phase', 'turn', 'hidden', 'renderer', 'textureBytes',
    'wasDiscarded', 'navigation', 'message', 'previous'];

/** Development-only device events, independent of account/API availability. No save writes. */
export function deviceDiagnosticsPlugin(root) {
    return {
        name: 'device-diagnostics', apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if ((req.url ?? '').split('?')[0] !== '/__device-diagnostics') return next();
                res.setHeader('Cache-Control', 'no-store');
                const reply = status => { res.statusCode = status; res.end(); };
                try {
                    const origin = req.headers.origin && new URL(req.headers.origin);
                    if (req.method !== 'POST' || !origin || origin.protocol !== 'http:'
                        || origin.host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') return reply(403);
                    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415);
                    let bytes = 0; const chunks = [];
                    for await (const chunk of req) {
                        bytes += chunk.length;
                        if (bytes > 16_384) return reply(413);
                        chunks.push(chunk);
                    }
                    const event = JSON.parse(Buffer.concat(chunks).toString());
                    if (event.version !== 1 || !kinds.has(event.kind) || !Number.isFinite(event.at)
                        || typeof event.run !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(event.run)) return reply(400);
                    const clean = { version: 1, kind: event.kind };
                    for (const key of fields) {
                        const value = event[key];
                        if (typeof value === 'string') clean[key] = value.slice(0, key === 'message' ? 1000 : 300);
                        else if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
                    }
                    // previous is a bounded string containing only the last scene marker.
                    const folder = path.join(root, '.local-saves/development/diagnostics');
                    await mkdir(folder, { recursive: true });
                    const day = new Date().toISOString().slice(0, 10);
                    await appendFile(path.join(folder, `${day}.jsonl`), JSON.stringify(clean) + '\n', { mode: 0o600 });
                    reply(204);
                } catch { reply(400); }
            });
        },
    };
}

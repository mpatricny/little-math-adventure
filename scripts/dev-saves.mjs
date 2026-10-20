import path from 'node:path';
import { DevSaveStore } from './dev-save-store.mjs';
import { devSaveManagePage, devSaveRecoveryPage } from './dev-save-pages.mjs';

function sameOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') return false;
    const origin = request.headers.origin;
    if (!origin) return request.method === 'GET' || request.method === 'HEAD';
    try { const url = new URL(origin); return url.protocol === 'http:' && url.host === request.headers.host; }
    catch { return false; }
}

export function devSavesPlugin(root) {
    const store = new DevSaveStore(path.join(root, '.local-saves/development'));
    return {
        name: 'dev-saves', apply: 'serve',
        config(config) {
            // Preserve Vite's credential deny list and protect every direct/@fs path to local backups.
            return { server: { fs: { deny: [...(config.server?.fs?.deny ?? ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']), '**/.local-saves/**'] } } };
        },
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const pathname = (request.url ?? '').split('?')[0];
                if (!pathname.startsWith('/__dev-saves')) return next();
                response.setHeader('Cache-Control', 'no-store');
                response.setHeader('X-Content-Type-Options', 'nosniff');
                if (!sameOrigin(request)) { response.statusCode = 403; response.end('forbidden_origin'); return; }
                const json = (status, body) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
                try {
                    if (request.method === 'GET' && ['/__dev-saves', '/__dev-saves/', '/__dev-saves/recover'].includes(pathname)) {
                        response.setHeader('Content-Type', 'text/html; charset=utf-8');
                        response.end(pathname.endsWith('/recover') ? devSaveRecoveryPage() : devSaveManagePage()); return;
                    }
                    if (pathname !== '/__dev-saves/api') { json(404, { error: 'not_found' }); return; }
                    if (request.method === 'GET') { json(200, await store.catalog()); return; }
                    if (request.method !== 'POST') { json(405, { error: 'method_not_allowed' }); return; }
                    if (!request.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'json_required' }); return; }
                    let size = 0; const chunks = [];
                    for await (const chunk of request) {
                        size += chunk.length;
                        if (size > 16 * 1024 * 1024) { json(413, { error: 'body_too_large' }); return; }
                        chunks.push(chunk);
                    }
                    let body;
                    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
                    catch { json(400, { error: 'invalid_json' }); return; }
                    if (!body || !['commit', 'archive'].includes(body.mode)) { json(400, { error: 'invalid_mode' }); return; }
                    if (body.mode === 'commit' && !(body.serverId === null || typeof body.serverId === 'string')) { json(400, { error: 'server_id_required' }); return; }
                    const result = body.mode === 'archive'
                        ? await store.archive(body.writes, request.headers.host)
                        : await store.commit(body.writes, request.headers.host, body.serverId);
                    json(result.ok === false ? 409 : 200, result);
                } catch (error) {
                    const invalid = ['invalid_writes', 'invalid_save'].includes(error.message);
                    if (!invalid) console.error('[DevSaves] Save operation failed:', error.message);
                    json(invalid ? 400 : 500, { error: invalid ? error.message : 'storage_unavailable' });
                }
            });
        },
    };
}

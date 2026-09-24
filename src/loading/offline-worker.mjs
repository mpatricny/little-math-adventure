/** Serialized into the build: no imports, secrets, profile data, or dependence on live catalogs. */
export function installOfflineWorker(scope, manifest) {
    const gamePath = new URL(scope.registration.scope).pathname;
    const prefix = 'cislokraj-game-' + encodeURIComponent(gamePath) + '-';
    const cacheName = prefix + manifest.revision;
    const origin = scope.location.origin;
    const entries = new Map(manifest.resources.map(entry => [entry.url, entry]));
    const inFlight = new Map();
    const retryAfter = new Map();
    let order = [...entries.keys()], running, storageError = false, lastStatus = 0;
    const cached = new Set();
    let previous;
    const previousCaches = () => previous ??= scope.caches.keys().then(names => names.filter(name => name.startsWith(prefix) && name !== cacheName));
    const address = url => new URL(url, origin).href;
    const canonical = url => {
        const parsed = new URL(url, origin);
        if (parsed.origin !== origin) return null;
        const path = parsed.pathname.replace(/^\/hra\/assets\//, '/assets/');
        return entries.has(path) ? path : null;
    };
    const hash = async bytes => Array.from(new Uint8Array(await scope.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');

    async function inventory() {
        const cache = await scope.caches.open(cacheName);
        cached.clear();
        for (const request of await cache.keys()) {
            const url = canonical(request.url);
            if (url) cached.add(url);
        }
    }
    function status() {
        return { type: 'ASSET_STATUS', revision: manifest.revision, cached: [...cached],
            completedBytes: [...cached].reduce((sum, url) => sum + entries.get(url).bytes, 0),
            totalBytes: manifest.resources.reduce((sum, entry) => sum + entry.bytes, 0),
            totalFiles: entries.size, ready: cached.size === entries.size && !storageError,
            storageError };
    }
    async function broadcast(force = false) {
        if (!force && Date.now() - lastStatus < 250) return;
        lastStatus = Date.now();
        const value = status();
        for (const client of await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage(value);
    }
    async function resource(url, urgent = false) {
        const cache = await scope.caches.open(cacheName);
        const hit = await cache.match(address(url));
        if (hit) { cached.add(url); return hit; }
        cached.delete(url);
        if (inFlight.has(url)) return (await inFlight.get(url)).clone();
        const pending = (async () => {
            const expected = entries.get(url);
            // Update in the background without downloading unchanged media again.
            for (const name of await previousCaches()) {
                const old = await (await scope.caches.open(name)).match(address(url));
                if (old?.headers.get('X-Cislokraj-Asset-Hash') !== expected.sha256) continue;
                try { await cache.put(address(url), old.clone()); cached.add(url); }
                catch { storageError = true; }
                return old;
            }
            for (const mode of ['force-cache', 'reload']) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 20_000);
                try {
                    // Cloudflare redirects a public /index.html to the marketing root; /hra/ serves the game.
                    const response = await scope.fetch(address(url === '/index.html' ? gamePath : url), { cache: mode, credentials: 'omit', priority: urgent ? 'high' : 'low', redirect: 'error', signal: controller.signal });
                    if (response.status !== 200) {
                        if (mode === 'force-cache') continue; // A cached partial audio response or old error is not a complete file.
                        throw new Error('Asset download failed');
                    }
                    const bytes = await response.arrayBuffer();
                    // Reject stale public JSON, truncated files and HTML fallback responses.
                    if (bytes.byteLength !== expected.bytes || await hash(bytes) !== expected.sha256) {
                        if (mode === 'force-cache') continue;
                        throw new Error('Asset version mismatch');
                    }
                    const headers = new Headers(response.headers);
                    headers.delete('content-encoding');
                    headers.set('content-length', String(bytes.byteLength));
                    headers.set('X-Cislokraj-Asset-Hash', expected.sha256);
                    const stored = new Response(bytes, { status: 200, headers });
                    try {
                        await cache.put(address(url), stored.clone());
                        cached.add(url);
                    } catch (error) {
                        storageError = true; // Never delete player IndexedDB/localStorage to make space.
                    }
                    void broadcast();
                    return stored;
                } finally { clearTimeout(timeout); }
            }
            throw new Error('Asset unavailable');
        })();
        inFlight.set(url, pending);
        try { return (await pending).clone(); }
        finally { inFlight.delete(url); }
    }

    async function rangeResponse(response, range) {
        if (!range) return response;
        const body = await response.arrayBuffer(), size = body.byteLength;
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = 0, end = size - 1;
        if (match && (match[1] || match[2])) {
            if (!match[1]) start = Math.max(0, size - Number(match[2]));
            else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        } else start = size;
        if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        const headers = new Headers(response.headers);
        headers.delete('content-encoding');
        headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
        headers.set('Content-Length', String(end - start + 1));
        headers.set('Accept-Ranges', 'bytes');
        return new Response(body.slice(start, end + 1), { status: 206, headers });
    }

    function drain() {
        if (running) return running;
        running = (async () => {
            await inventory();
            async function lane() {
                while (!storageError) {
                    const next = order.find(url => !cached.has(url) && !inFlight.has(url) && (retryAfter.get(url) ?? 0) <= Date.now());
                    if (!next) return;
                    // Reserve before resource() awaits CacheStorage, so the other lane cannot select it.
                    retryAfter.set(next, Date.now() + 30_000);
                    try { await resource(next); retryAfter.delete(next); }
                    catch { retryAfter.set(next, Date.now() + 30_000); }
                }
            }
            await Promise.all([lane(), lane()]);
            await broadcast(true);
        })().finally(() => { running = undefined; });
        return running;
    }

    scope.addEventListener('install', event => {
        // First install is small. An update must be COMPLETE before it may replace an offline-ready version.
        event.waitUntil((async () => {
            const updating = (await previousCaches()).length > 0;
            const pending = [...new Set([...manifest.shell, ...(updating ? entries.keys() : [])])];
            let failed = false, failure;
            const lane = async () => {
                while (pending.length && !failed) {
                    try { await resource(pending.shift(), true); }
                    catch (error) { failed = true; failure = error; }
                }
            };
            await Promise.all([lane(), lane()]);
            if (failed) throw failure;
            if (storageError) throw new Error('Offline shell could not be stored');
        })().catch(async error => { await scope.caches.delete(cacheName); throw error; }));
        // Deliberately no skipWaiting: never replace the version beneath a running game.
    });
    scope.addEventListener('activate', event => event.waitUntil((async () => {
        // Activation waits for old controlled tabs to close. Touch only our own asset caches.
        for (const name of await scope.caches.keys()) if (name.startsWith(prefix) && name !== cacheName) await scope.caches.delete(name);
        await scope.clients.claim();
    })()));
    scope.addEventListener('fetch', event => {
        const request = event.request;
        if (request.method !== 'GET') return;
        const url = new URL(request.url);
        if (url.origin !== origin) return;
        if (url.pathname === '/offline-manifest.json') {
            event.respondWith(Promise.resolve(Response.json(manifest))); return;
        }
        const target = request.mode === 'navigate' && url.pathname === gamePath ? '/index.html' : canonical(url.href);
        if (!target) return; // Auth, API, saves, external URLs, editor endpoints: always network only.
        event.respondWith(resource(target, true).then(response => rangeResponse(response, request.headers.get('range'))));
    });
    scope.addEventListener('message', event => {
        if (!event.source?.url || new URL(event.source.url).origin !== origin) return;
        const data = event.data;
        if (!data || data.revision !== manifest.revision) return;
        if (data.type === 'ASSET_PRIORITIZE') {
            const priority = Array.isArray(data.urls) ? data.urls.map(canonical).filter(Boolean) : [];
            order = [...new Set([...priority, ...order])];
            if (data.online) retryAfter.clear();
            event.waitUntil(drain());
        } else if (data.type === 'ASSET_STATUS') {
            event.waitUntil(inventory().then(() => { event.ports?.[0]?.postMessage(status()); }));
        }
    });
}

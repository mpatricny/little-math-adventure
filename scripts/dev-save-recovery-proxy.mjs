import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

/** Only the game's old HTTP origin and its save-recovery endpoints can pass through. */
export function createSaveRecoveryProxy({ hostname, port = 8004, oldOrigin, target = 'http://127.0.0.1:8001' }) {
    const old = new URL(oldOrigin), upstream = new URL(target);
    if (old.protocol !== 'http:' || upstream.protocol !== 'http:') throw new Error('Only local HTTP recovery is supported');
    const allowedPaths = new Set(['/__dev-saves/recover', '/__dev-saves/api']);
    const server = http.createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.url === '/proxy.pac' && request.method === 'GET') {
            response.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
            response.end(`function FindProxyForURL(url, host) { return url.indexOf(${JSON.stringify(old.origin + '/')}) === 0 ? ${JSON.stringify(`PROXY ${hostname}:${server.address().port}`)} : 'DIRECT'; }`);
            return;
        }
        let destination;
        try { destination = new URL(request.url); } catch { response.writeHead(403); response.end(); return; }
        if (destination.origin !== old.origin || !['GET', 'POST'].includes(request.method)) {
            response.writeHead(403); response.end(); return;
        }
        if (destination.pathname === '/' && request.method === 'GET') {
            response.writeHead(302, { Location: '/__dev-saves/recover' }); response.end(); return;
        }
        if (!allowedPaths.has(destination.pathname)) { response.writeHead(403); response.end(); return; }
        const headers = { ...request.headers, host: old.host };
        for (const key of ['cookie', 'authorization', 'proxy-authorization', 'proxy-connection']) delete headers[key];
        const forwarded = http.request({ hostname: upstream.hostname, port: upstream.port || 80,
            path: destination.pathname + destination.search, method: request.method, headers, timeout: 10000 }, incoming => {
            const responseHeaders = { ...incoming.headers }; delete responseHeaders['set-cookie'];
            response.writeHead(incoming.statusCode, responseHeaders); incoming.pipe(response);
        });
        forwarded.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
        forwarded.on('timeout', () => forwarded.destroy());
        request.on('aborted', () => forwarded.destroy());
        request.pipe(forwarded);
    });
    server.on('connect', (_request, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
    return { server, listen: () => new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, hostname, () => resolve({
            proxy: `${hostname}:${server.address().port}`,
            pacUrl: `http://${hostname}:${server.address().port}/proxy.pac`,
            recoveryUrl: `${old.origin}/__dev-saves/recover`,
        }));
    }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, args) => {
        if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), args[index + 1]]); return pairs;
    }, []));
    const hostname = options.listen ?? networkInterfaces().en0?.find(address => address.family === 'IPv4')?.address;
    if (!hostname || !options['old-origin']) throw new Error('Use --listen <current LAN IP> --old-origin <old game URL>');
    const proxy = createSaveRecoveryProxy({ hostname, port: Number(options.port ?? 8004), oldOrigin: options['old-origin'], target: options.target });
    console.log(JSON.stringify(await proxy.listen()));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => proxy.server.close(() => process.exit(0)));
}

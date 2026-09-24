export interface OfflineStatus {
    type: 'ASSET_STATUS'; revision: string; cached: string[];
    totalBytes: number; completedBytes: number; totalFiles: number; ready: boolean; storageError: boolean;
}

/** Register only for built games, after interaction. Never install a worker over Vite's live source. */
export class OfflineClient {
    private revision?: string;
    private registration?: ServiceWorkerRegistration;
    private urls: string[] = [];
    private disposed = false;
    private timer?: ReturnType<typeof setInterval>;
    private readonly onMessage = (event: MessageEvent) => {
        if (event.source !== navigator.serviceWorker.controller || event.data?.revision !== this.revision || event.data?.type !== 'ASSET_STATUS') return;
        this.receive(event.data);
    };
    private readonly controllerChanged = () => { void this.connect(); };
    private readonly online = () => { this.prioritize(this.urls, true); };

    constructor(private readonly receive: (status: OfflineStatus) => void, private readonly controlled: () => void) {}

    async start(): Promise<void> {
        if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
        try {
            const manifest = await fetch('/offline-manifest.json', { cache: 'no-cache' }).then(response => response.json());
            // A deploy during this page's startup must not make a newer worker cache old running code.
            if (!Array.from(document.scripts).some(script => script.src && new URL(script.src).pathname === manifest.entry)) return;
            this.revision = manifest.revision;
            if (this.disposed) return;
            const scope = location.pathname.startsWith('/hra/') ? '/hra/' : '/';
            this.registration = await navigator.serviceWorker.register('/offline-sw.js', { scope, updateViaCache: 'none' });
            if (this.disposed) return;
            navigator.serviceWorker.addEventListener('message', this.onMessage);
            navigator.serviceWorker.addEventListener('controllerchange', this.controllerChanged);
            window.addEventListener('online', this.online);
            // A newly installed version waits until all old game tabs close. No reload/skipWaiting here.
            void navigator.serviceWorker.ready.then(() => this.connect());
            this.timer = setInterval(() => { if (!document.hidden) void this.connect(); }, 10_000);
            await this.connect();
        } catch { /* Normal online loading and the bounded HTTP prefetch queue stay available. */ }
    }

    prioritize(urls: string[], online = false): void {
        this.urls = urls;
        if (!this.revision || this.disposed || document.hidden) return;
        navigator.serviceWorker.controller?.postMessage({ type: 'ASSET_PRIORITIZE', revision: this.revision, urls, online });
    }

    private async connect(): Promise<void> {
        if (this.disposed || !this.registration || !this.revision || !navigator.serviceWorker.controller) return;
        const controller = navigator.serviceWorker.controller;
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); channel.port2.close(); }, 3000);
        channel.port1.onmessage = event => {
            clearTimeout(timer); channel.port1.close(); channel.port2.close();
            if (this.disposed || event.data?.revision !== this.revision || event.data?.type !== 'ASSET_STATUS') return;
            this.controlled();
            this.receive(event.data);
            if (!event.data.ready && !event.data.storageError) this.prioritize(this.urls);
        };
        controller.postMessage({ type: 'ASSET_STATUS', revision: this.revision }, [channel.port2]);
    }

    destroy(): void {
        this.disposed = true; clearInterval(this.timer);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('message', this.onMessage);
            navigator.serviceWorker.removeEventListener('controllerchange', this.controllerChanged);
        }
        window.removeEventListener('online', this.online);
    }
}

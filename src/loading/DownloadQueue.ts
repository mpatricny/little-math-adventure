/** Small, reprioritisable fallback for HTTP LAN/dev and browsers without service workers. */
export class DownloadQueue {
    readonly completed = new Set<string>();
    private order: string[] = [];
    private active = new Map<string, AbortController>();
    private retryAfter = new Map<string, number>();
    private stopped = true;
    private timer?: ReturnType<typeof setTimeout>;

    constructor(private readonly fetcher: typeof fetch, private readonly onComplete: (url: string) => void, private readonly concurrency = 2) {}

    prioritize(urls: string[]): void {
        this.order = [...new Set([...urls, ...this.order])];
        this.pump();
    }
    start(): void { this.stopped = false; this.pump(); }
    stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
        this.active.forEach(controller => controller.abort());
    }
    wake(): void { this.retryAfter.clear(); this.pump(); }

    private pump(): void {
        if (this.stopped) return;
        clearTimeout(this.timer);
        while (this.active.size < this.concurrency) {
            const url = this.order.find(item => !this.completed.has(item) && !this.active.has(item) && (this.retryAfter.get(item) ?? 0) <= Date.now());
            if (!url) break;
            const controller = new AbortController();
            this.active.set(url, controller);
            const timeout = setTimeout(() => controller.abort(), 20_000);
            const fetcher = this.fetcher;
            void fetcher(url, { cache: 'force-cache', credentials: 'omit', priority: 'low', signal: controller.signal }).then(async response => {
                if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('Asset unavailable');
                await response.arrayBuffer(); // Drain the body; headers alone are not a completed download.
                if (controller.signal.aborted) return;
                this.completed.add(url);
                this.onComplete(url);
            }).catch(() => { this.retryAfter.set(url, Date.now() + 30_000); }).finally(() => {
                clearTimeout(timeout);
                this.active.delete(url);
                this.pump();
            });
        }
        if (this.order.some(url => !this.completed.has(url))) this.timer = setTimeout(() => this.pump(), 1000);
    }
}

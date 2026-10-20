import type Phaser from 'phaser';

const markerKey = 'littleMathAdventure_deviceMarker_v1';

/** Small local-dev breadcrumbs survive a browser restart without altering gameplay saves. */
export function startDeviceDiagnostics(game: Phaser.Game): () => void {
    const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let previous: string | undefined;
    try { previous = sessionStorage.getItem(markerKey) ?? undefined; } catch { /* Storage is optional. */ }
    const snapshot = () => {
        const scene = game.scene.getScenes(true).find(scene => scene.sys.settings.key === 'BattleScene')
            ?? game.scene.getScenes(true).at(-1);
        const battle = scene as Phaser.Scene & { encounterId?: string; battleState?: { phase: string; turnCount: number } };
        const sources = new Set<Phaser.Textures.TextureSource>();
        let textureBytes = 0;
        for (const texture of Object.values(game.textures.list)) for (const source of texture.source) {
            if (sources.has(source)) continue;
            sources.add(source); textureBytes += source.width * source.height * 4;
        }
        return { run, at: Date.now(), scene: scene?.sys.settings.key ?? 'BootScene',
            encounter: battle?.encounterId, phase: battle?.battleState?.phase, turn: battle?.battleState?.turnCount,
            renderer: game.renderer?.type, textureBytes, hidden: document.hidden };
    };
    const record = (kind: string, extra: Record<string, unknown> = {}) => {
        try {
            const event = { version: 1, ...snapshot(), kind, ...extra };
            const { run, at, scene, encounter, phase, turn } = event;
            try { sessionStorage.setItem(markerKey, JSON.stringify({ run, at, scene, encounter, phase, turn })); } catch { /* Still send the event. */ }
            void fetch('/__device-diagnostics', { method: 'POST', credentials: 'same-origin', keepalive: true,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
                signal: AbortSignal.timeout(3000) }).catch(() => {});
        } catch { /* Diagnostics must never interrupt a battle, even if storage is full. */ }
    };
    const onError = (event: ErrorEvent) => record('error', { message: String(event.error?.stack ?? event.message).slice(0, 1000) });
    const onRejection = (event: PromiseRejectionEvent) => record('error', { message: String(event.reason?.stack ?? event.reason).slice(0, 1000) });
    const onLost = () => record('contextlost');
    const onRestored = () => record('contextrestored');
    const onHide = () => record('pagehide');
    const onSaveReload = () => record('save_reload');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('cislokraj-save-reload', onSaveReload);
    game.canvas.addEventListener('webglcontextlost', onLost);
    game.canvas.addEventListener('webglcontextrestored', onRestored);
    const timer = setInterval(() => { if (!document.hidden) record('heartbeat'); }, 30_000);
    record('boot', { previous, wasDiscarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true,
        navigation: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type });
    return () => {
        clearInterval(timer);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('cislokraj-save-reload', onSaveReload);
        game.canvas.removeEventListener('webglcontextlost', onLost);
        game.canvas.removeEventListener('webglcontextrestored', onRestored);
    };
}

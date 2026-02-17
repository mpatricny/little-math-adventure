export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function requestFullscreen(): void {
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
    }
}

export function setupMobile(): void {
    // Try orientation lock (requires fullscreen on most browsers; fails silently)
    if ((screen.orientation as any)?.lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
    }

    // Portrait warning overlay (CSS, hidden by default)
    createPortraitOverlay();
    const checkOrientation = () => {
        const overlay = document.getElementById('portrait-overlay');
        if (overlay) {
            overlay.style.display = (window.innerHeight > window.innerWidth) ? 'flex' : 'none';
        }
    };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();

    // Prevent long-press context menu — ONLY on touch devices
    if (isTouchDevice()) {
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }
}

function createPortraitOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'portrait-overlay';
    overlay.style.cssText = `
        display: none; position: fixed; inset: 0;
        background: #1a1a2e; z-index: 99999;
        justify-content: center; align-items: center; flex-direction: column;
        color: white; font-family: Arial, sans-serif;
    `;
    overlay.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">&#x1f504;</div>
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Otoc zarizeni</div>
        <div style="font-size: 16px; color: #aaa;">Hra funguje pouze na sirku</div>
    `;
    document.body.appendChild(overlay);
}

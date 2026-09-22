export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export async function requestLandscapeLock(): Promise<boolean> {
    const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: 'landscape') => Promise<void>;
    };
    if (!orientation?.lock) return false;

    try {
        await orientation.lock('landscape');
        return true;
    } catch {
        return false;
    }
}

export function setupMobile(): void {
    // Try orientation lock (requires fullscreen on most browsers; fails silently)
    void requestLandscapeLock();

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
        document.addEventListener('contextmenu', (e) => {
            // Native text fields need their selection/paste menu on phones.
            if (e.target instanceof Element && e.target.closest('input, textarea')) return;
            e.preventDefault();
        });
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

import Phaser from 'phaser';
import { suspendGame } from './gameSuspension';

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

/** Stop battle clocks while the portrait cover or another app hides play. */
export function setupMobilePause(game: Phaser.Game): void {
    let releasePause: (() => void) | undefined;
    let ready = false;
    let pageHidden = false;
    const refresh = () => {
        if (!ready) return;
        const covered = window.innerHeight > window.innerWidth || document.hidden || pageHidden;
        if (covered && !releasePause) releasePause = suspendGame(game);
        else if (!covered && releasePause) {
            const release = releasePause;
            releasePause = undefined;
            release();
        }
    };
    const onReady = () => { ready = true; refresh(); };
    const onPageHide = () => { pageHidden = true; refresh(); };
    const onPageShow = () => { pageHidden = false; refresh(); };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', refresh);
    game.events.once(Phaser.Core.Events.DESTROY, () => {
        ready = false;
        game.events.off(Phaser.Core.Events.READY, onReady);
        window.removeEventListener('resize', refresh);
        window.removeEventListener('orientationchange', refresh);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        document.removeEventListener('visibilitychange', refresh);
    });
    if (game.isRunning) onReady();
    else game.events.once(Phaser.Core.Events.READY, onReady);
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

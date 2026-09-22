import Phaser from 'phaser';
import { getGoogleSession, signOutGoogle, startGoogleSignIn, type GoogleSessionState } from '../auth/googleAuth';
import googleMark from './assets/google-g.png';
import signOutMark from './assets/sign-out.svg';
import fontLicense from './assets/GoogleSans-OFL.txt?url';
import './GameAccountControl.css';

/** Optional account access; local play and saves never depend on the identity server. */
export class GameAccountControl {
    readonly element: Phaser.GameObjects.DOMElement;
    private readonly root = document.createElement('section');
    private readonly button = document.createElement('button');
    private readonly label = document.createElement('span');
    private readonly mark = document.createElement('img');
    private readonly status = document.createElement('span');
    private readonly retry = document.createElement('button');
    private readonly requestController = new AbortController();
    private session: GoogleSessionState = 'unavailable';
    private busy = false;
    private disposed = false;

    constructor(scene: Phaser.Scene, host: { x: number; y: number; width: number; height: number; depth: number }) {
        this.root.className = 'game-account';
        this.root.dataset.fontLicense = fontLicense;
        this.root.setAttribute('aria-label', 'Google účet');
        this.root.style.width = `${host.width}px`;
        this.root.style.height = `${host.height}px`;

        this.button.type = 'button';
        this.button.className = 'game-account__button';
        this.button.dataset.googleSignIn = '';
        this.mark.src = googleMark;
        this.mark.alt = '';
        this.mark.width = 24;
        this.mark.height = 24;
        this.button.append(this.mark, this.label);

        const statusRow = document.createElement('div');
        statusRow.className = 'game-account__status';
        this.status.setAttribute('role', 'status');
        this.retry.type = 'button';
        this.retry.className = 'game-account__retry';
        this.retry.textContent = '↻';
        this.retry.setAttribute('aria-label', 'Zkusit přihlášení znovu');
        this.retry.hidden = true;
        statusRow.append(this.status, this.retry);
        this.root.append(this.button, statusRow);

        this.element = scene.add.dom(host.x, host.y, this.root).setDepth(host.depth);
        this.button.addEventListener('click', () => { void this.activate(); });
        this.retry.addEventListener('click', () => { void this.refresh(); });
        window.addEventListener('focus', this.onFocus);
        window.addEventListener('online', this.onFocus);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
        void this.refresh();
    }

    private readonly onFocus = () => { if (!this.busy) void this.refresh(); };

    private render(message = ''): void {
        if (this.disposed) return;
        this.root.dataset.authState = this.busy ? 'loading' : this.session;
        this.button.disabled = this.busy || this.session === 'unavailable';
        this.mark.src = this.session === 'authenticated' ? signOutMark : googleMark;
        this.label.textContent = this.session === 'authenticated' ? 'Odhlásit' : 'Pokračovat přes Google';
        this.status.textContent = message || (this.busy ? '…'
            : this.session === 'authenticated' ? '✓ Přihlášeno'
                : this.session === 'unavailable' ? 'Není dostupné' : '');
        this.retry.hidden = this.busy || this.session !== 'unavailable';
        this.retry.disabled = this.busy;
    }

    private async refresh(): Promise<void> {
        if (this.busy || this.disposed) return;
        this.busy = true;
        this.render();
        try {
            this.session = await getGoogleSession(this.requestController.signal);
        } catch {
            this.session = 'unavailable';
        } finally {
            this.busy = false;
            const failedCallback = new URLSearchParams(window.location.search).has('auth_error');
            this.render(failedCallback && this.session === 'anonymous' ? 'Zkusit znovu' : '');
        }
    }

    private async activate(): Promise<void> {
        if (this.busy || this.disposed || this.session === 'unavailable') return;
        this.busy = true;
        this.render();
        try {
            if (this.session === 'authenticated') {
                await signOutGoogle(this.requestController.signal);
                this.session = 'anonymous';
                this.busy = false;
                this.render();
                return;
            }
            const url = await startGoogleSignIn('/hra/', this.requestController.signal);
            if (!this.disposed) window.location.assign(url);
        } catch {
            this.busy = false;
            // Failed sign-out must retain the authenticated state. Never claim success locally.
            this.render('Zkusit znovu');
        }
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.requestController.abort();
        window.removeEventListener('focus', this.onFocus);
        window.removeEventListener('online', this.onFocus);
        this.root.remove();
        this.element.destroy();
    }
}

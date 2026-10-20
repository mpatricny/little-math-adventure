import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';

/** The loading UI has no image dependencies of its own. */
export class SceneLoadingScreen {
    private readonly root = document.createElement('div');
    private readonly fill = document.createElement('div');
    private readonly retry = document.createElement('button');
    private readonly caption = document.createElement('div');
    private readonly hosts: Phaser.GameObjects.GameObject[] = [];
    private readonly onProgress = (value: number) => {
        // Audio may start using the same loader after the image batch fails.
        // It must not hide the retry control for that failed image.
        if (!this.root.dataset.failed) this.progress(value);
    };
    private readonly builder: SceneBuilder;

    constructor(private readonly scene: Phaser.Scene) {
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('SceneLoadingOverlay');
        const ids = ['loadingPanelHost', 'loadingSafeHost', 'loadingMotionHost', 'loadingTrackHost', 'loadingLabelHost'];
        this.hosts = ids.map(id => this.builder.get(id)).filter((host): host is Phaser.GameObjects.GameObject => !!host);
        const panel = this.builder.getElementDef('loadingPanelHost')!;
        this.root.className = 'scene-loading';
        this.root.dataset.scene = scene.sys.settings.key;
        this.root.setAttribute('role', 'status');
        this.root.setAttribute('aria-label', 'Načítání');
        this.root.style.cssText = `position:absolute;inset:0;width:1280px;height:720px;background:#071c24;pointer-events:auto;z-index:${panel.depth};`;
        const style = document.createElement('style');
        style.textContent = `
            .scene-loading *{box-sizing:border-box}
            .scene-loading .loading-motion{display:grid;place-items:center}
            .scene-loading .loading-ring{position:absolute;inset:0;border:7px solid #20495b;border-top-color:#a5e9ed;border-right-color:#5bb6c4;border-radius:50%;animation:scene-loading-spin 1.6s linear infinite}
            .scene-loading .loading-gem{width:48px;height:60px;clip-path:polygon(50% 0,100% 30%,83% 80%,50% 100%,17% 80%,0 30%);background:linear-gradient(115deg,#d6f9ed 0 30%,#79cbda 31% 65%,#34768d 66%);filter:drop-shadow(0 0 8px #8bc9db)}
            .scene-loading[data-failed] .loading-motion{visibility:hidden}
            .scene-loading button{padding:0;border:0;border-radius:50%;background:transparent;color:#fff2ca;cursor:pointer}
            .scene-loading button span{display:grid;place-items:center;width:100%;height:100%;border:3px solid #b89d65;border-radius:50%;background:#123344;font:90px Arial,sans-serif;transition:transform .12s}
            .scene-loading button:hover span{transform:translateY(-3px)}
            .scene-loading button:active span{transform:translateY(1px)}
            .scene-loading button:focus-visible{outline:3px solid #ffe8ac;outline-offset:5px}
            @keyframes scene-loading-spin{to{transform:rotate(360deg)}}
            @media(prefers-reduced-motion:reduce){.scene-loading .loading-ring{animation-duration:4s}}
        `;
        const frame = document.createElement('div');
        frame.style.cssText = 'background:linear-gradient(#123344,#0c2735);border:3px solid #b89d65;border-radius:32px;box-shadow:0 8px 36px #0008,inset 0 0 30px #061722;';
        this.place(frame, 'loadingPanelHost');
        const motion = document.createElement('div');
        motion.className = 'loading-motion';
        motion.setAttribute('aria-hidden', 'true');
        for (const className of ['loading-ring', 'loading-gem']) {
            const shape = document.createElement('div'); shape.className = className; motion.append(shape);
        }
        this.place(motion, 'loadingMotionHost');
        const track = document.createElement('div');
        track.className = 'loading-track';
        track.style.cssText = 'padding:5px;border:2px solid #8e805e;background:#061722;border-radius:18px;';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', 'Načítání');
        track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
        this.place(track, 'loadingTrackHost');
        this.fill.style.cssText = 'width:0;height:100%;border-radius:12px;background:linear-gradient(#b3e9e2,#4b9eb5);transition:width .1s linear;';
        track.append(this.fill);
        this.caption.style.cssText = 'display:grid;place-items:center;font:bold 30px Georgia,serif;color:#fff2ca;';
        this.place(this.caption, 'loadingLabelHost');
        this.retry.type = 'button'; this.retry.hidden = true;
        this.retry.setAttribute('aria-label', 'Zkusit znovu');
        const icon = document.createElement('span'); icon.textContent = '↻';
        this.retry.append(icon); this.place(this.retry, 'loadingMotionHost');
        this.root.append(style, frame, motion, track, this.caption, this.retry);
        // Phaser scales its HTML layer together with the canvas, including
        // tablet rotation and fullscreen on the game container.
        scene.game.domContainer.append(this.root);
        scene.load.on(Phaser.Loader.Events.PROGRESS, this.onProgress);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.progress(0);
    }

    private place(element: HTMLElement, id: string): void {
        const host = this.builder.getElementDef(id)!;
        element.style.cssText += `position:absolute;left:${host.x}px;top:${host.y}px;width:${host.width}px;height:${host.height}px;transform:translate(-50%,-50%);z-index:${host.depth};`;
    }

    progress(value: number): void {
        delete this.root.dataset.failed;
        this.retry.hidden = true;
        this.caption.textContent = 'Načítání';
        const percent = Math.round(100 * Math.max(0, Math.min(1, value)));
        this.fill.style.width = `${percent}%`;
        this.fill.parentElement?.setAttribute('aria-valuenow', String(percent));
    }

    failed(retry: () => void): void {
        this.root.dataset.failed = 'true';
        this.caption.textContent = 'Znovu';
        this.retry.hidden = false;
        this.retry.onclick = retry;
    }

    destroy(): void {
        this.scene.load.off(Phaser.Loader.Events.PROGRESS, this.onProgress);
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.root.remove();
        this.hosts.forEach(host => { if (host.scene) host.destroy(); });
    }
}

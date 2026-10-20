import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { suspendGame } from './gameSuspension';

/** Keep recovery outside WebGL, which cannot draw its own error controls. */
export function setupRendererRecovery(game: Phaser.Game): void {
    let lost = false;
    let disposed = false;
    let releasePause: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let overlay: HTMLDivElement | undefined;
    let hosts: Phaser.GameObjects.GameObject[] = [];
    let renderer: Phaser.Renderer.WebGL.WebGLRenderer | undefined;

    const removeOverlay = () => {
        clearTimeout(timer); timer = undefined;
        overlay?.remove(); overlay = undefined;
        hosts.forEach(host => host.destroy()); hosts = [];
    };
    const showRecovery = () => {
        if (!lost || disposed || overlay) return;
        const scene = game.scene.getScenes(true).find(scene => scene.cache.json.has('scenes'));
        let builder: SceneBuilder | undefined;
        if (scene) {
            builder = new SceneBuilder(scene);
            // These are empty editor hosts: creating them needs no GPU resources.
            builder.buildScene('RendererRecoveryOverlay');
            hosts = ['recoveryPanelHost', 'recoverySafeHost', 'recoveryActionHost', 'recoveryLabelHost']
                .map(id => builder!.get(id)).filter((host): host is Phaser.GameObjects.GameObject => !!host);
        }
        const panel = builder?.getElementDef('recoveryPanelHost')
            ?? { x: 640, y: 360, width: 660, height: 400, depth: 100000 };
        const action = builder?.getElementDef('recoveryActionHost')
            ?? { x: 640, y: 340, width: 200, height: 200, depth: 100001 };
        const label = builder?.getElementDef('recoveryLabelHost')
            ?? { x: 640, y: 485, width: 420, height: 50, depth: 100001 };
        overlay = document.createElement('div');
        overlay.id = 'renderer-recovery';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Obnovit hru');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = `position:fixed;inset:0;background:#071c24;z-index:${panel.depth};touch-action:manipulation;`;
        const stage = document.createElement('div');
        stage.style.cssText = 'position:absolute;left:50%;top:50%;width:1280px;height:720px;transform-origin:center;';
        const place = (element: HTMLElement, host: typeof panel) => {
            element.style.cssText += `position:absolute;left:${host.x}px;top:${host.y}px;width:${host.width}px;height:${host.height}px;transform:translate(-50%,-50%);z-index:${host.depth};box-sizing:border-box;`;
        };
        const frame = document.createElement('div');
        frame.style.cssText = 'background:#123344;border:3px solid #b89d65;border-radius:32px;box-shadow:0 8px 36px #0008,inset 0 0 30px #061722;';
        place(frame, panel);
        const button = document.createElement('button');
        button.type = 'button'; button.setAttribute('aria-label', 'Obnovit hru');
        button.style.cssText = 'padding:0;border:0;background:transparent;cursor:pointer;';
        place(button, action);
        const surface = document.createElement('span');
        surface.className = 'recovery-surface';
        surface.style.cssText = 'display:grid;place-items:center;position:relative;width:100%;height:100%;transition:transform .12s;';
        const art = document.createElement('img');
        const texture = scene?.cache.json.get('textures')?.images['enamel-control-socket'] ?? 'ui/enamel/control-socket.webp';
        art.src = `/assets/${texture}`; art.alt = ''; art.draggable = false;
        art.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
        const icon = document.createElement('span');
        icon.textContent = '↻'; icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = 'position:relative;font:110px Arial,sans-serif;line-height:1;color:#fff2ca;text-shadow:0 2px 3px #041821;pointer-events:none;';
        surface.append(art, icon); button.append(surface);
        const caption = document.createElement('div');
        caption.textContent = 'Znovu';
        caption.style.cssText = 'display:grid;place-items:center;font:bold 36px Georgia,serif;color:#fff2ca;';
        place(caption, label);
        const style = document.createElement('style');
        style.textContent = '#renderer-recovery button:focus{outline:none}#renderer-recovery button:focus-visible{outline:3px solid #ffe8ac;outline-offset:4px;border-radius:50%}#renderer-recovery button:hover .recovery-surface{transform:translateY(-3px)}#renderer-recovery button:active .recovery-surface{transform:translateY(1px)}#renderer-recovery button:disabled .recovery-surface{opacity:.55}';
        stage.append(frame, button, caption); overlay.append(style, stage);
        mount();
        button.onclick = () => {
            button.disabled = true;
            const url = new URL(window.location.href);
            url.searchParams.set('renderer', 'canvas');
            // Same origin and save slots; never clear or rewrite a save during recovery.
            window.location.replace(url.href);
        };
        const fit = () => {
            const viewport = window.visualViewport;
            const scale = Math.min((viewport?.width ?? innerWidth) / 1280, (viewport?.height ?? innerHeight) / 720);
            stage.style.transform = `translate(-50%,-50%) scale(${scale})`;
        };
        fit();
        button.focus({ preventScroll: true });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Tab') { event.preventDefault(); button.focus({ preventScroll: true }); }
        });
        overlay.addEventListener('recovery-resize', fit);
    };
    const mount = () => {
        if (!overlay) return;
        const fullscreen = document.fullscreenElement;
        const parent = fullscreen instanceof HTMLElement && !(fullscreen instanceof HTMLCanvasElement) ? fullscreen : document.body;
        if (overlay.parentElement !== parent) parent.append(overlay);
        // Canvas cannot display HTML children. Leave fullscreen so its independent
        // recovery control remains usable even when only the canvas was fullscreen.
        if (fullscreen instanceof HTMLCanvasElement) void document.exitFullscreen().catch(() => {});
    };
    const resize = () => { mount(); overlay?.dispatchEvent(new Event('recovery-resize')); };
    const onLost = () => {
        if (lost || disposed) return;
        lost = true;
        releasePause = suspendGame(game);
        timer = setTimeout(showRecovery, 500);
    };
    const onRestored = () => {
        if (!lost || disposed) return;
        lost = false;
        removeOverlay();
        releasePause?.(); releasePause = undefined;
    };
    const install = () => {
        if (disposed || game.renderer?.type !== Phaser.WEBGL) return;
        renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
        renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
    };
    const dispose = () => {
        disposed = true; removeOverlay();
        renderer?.off(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
        renderer?.off(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
        game.events.off(Phaser.Core.Events.READY, install);
        window.removeEventListener('resize', resize);
        document.removeEventListener('fullscreenchange', resize);
        window.visualViewport?.removeEventListener('resize', resize);
    };
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    game.events.once(Phaser.Core.Events.DESTROY, dispose);
    if (game.renderer) install();
    else game.events.once(Phaser.Core.Events.READY, install);
}

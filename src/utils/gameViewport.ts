import Phaser from 'phaser';

/** Keep canvas, native inputs and pointer coordinates in one viewport. */
export function setupGameViewport(game: Phaser.Game): void {
    const container = document.getElementById('game-container');
    if (!container) return;

    const viewport = window.visualViewport;
    let frame = 0;
    let editingSize: { width: number; height: number } | null = null;

    const refreshScale = () => {
        if (!game.isBooted || !game.scale.canvas) return;
        game.scale.getParentBounds();
        game.scale.refresh();
    };

    const update = () => {
        frame = 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        if (width <= 0 || height <= 0) return;

        const input = document.activeElement;
        const editing = input instanceof HTMLInputElement && container.contains(input);
        // On-screen keyboards can resize only visualViewport, leaving innerHeight
        // unchanged. Retain the pre-keyboard scale so the name stays readable;
        // pan BOTH layers just enough to keep the focused field above the keys.
        const gameHeight = editing && editingSize && Math.abs(editingSize.width - width) < 1
            ? Math.max(height, editingSize.height) : height;
        container.style.setProperty('--game-viewport-width', `${width}px`);
        container.style.setProperty('--game-viewport-height', `${gameHeight}px`);
        container.style.setProperty('--game-viewport-left', `${left}px`);
        container.style.setProperty('--game-viewport-top', `${top}px`);
        refreshScale();

        if (editing && gameHeight > height) {
            const bounds = input.getBoundingClientRect();
            const overflow = Math.max(0, bounds.bottom - (top + height - 12));
            if (overflow > 0) {
                container.style.setProperty('--game-viewport-top', `${top - overflow}px`);
                refreshScale();
            }
        }
    };

    const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onFocus = (event: FocusEvent) => {
        if (event.target instanceof HTMLInputElement && container.contains(event.target)) {
            editingSize = {
                width: viewport?.width ?? window.innerWidth,
                height: viewport?.height ?? window.innerHeight,
            };
            schedule();
        }
    };
    const onBlur = () => {
        editingSize = null;
        schedule();
    };

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('fullscreenchange', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    container.addEventListener('focusin', onFocus);
    container.addEventListener('focusout', onBlur);
    game.events.once(Phaser.Core.Events.READY, update);
    game.events.once(Phaser.Core.Events.DESTROY, () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        window.removeEventListener('orientationchange', schedule);
        document.removeEventListener('fullscreenchange', schedule);
        viewport?.removeEventListener('resize', schedule);
        viewport?.removeEventListener('scroll', schedule);
        container.removeEventListener('focusin', onFocus);
        container.removeEventListener('focusout', onBlur);
        game.events.off(Phaser.Core.Events.READY, update);
    });
    update();
}

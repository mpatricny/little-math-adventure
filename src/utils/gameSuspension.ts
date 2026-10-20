import type Phaser from 'phaser';

interface Suspension {
    owners: Set<object>;
    wasPaused: boolean;
    inputWasEnabled: boolean;
}

const suspensions = new WeakMap<Phaser.Game, Suspension>();

/** A covered screen and a lost renderer can overlap; only their last owner resumes play. */
export function suspendGame(game: Phaser.Game): () => void {
    let state = suspensions.get(game);
    if (!state) {
        state = { owners: new Set(), wasPaused: game.isPaused, inputWasEnabled: game.input.enabled };
        suspensions.set(game, state);
    }
    const suspension = state;
    const owner = {};
    suspension.owners.add(owner);
    game.input.enabled = false;
    if (!game.isPaused) game.pause();

    return () => {
        if (!suspension.owners.delete(owner) || suspension.owners.size) return;
        suspensions.delete(game);
        game.input.enabled = suspension.inputWasEnabled;
        if (!suspension.wasPaused) game.resume();
    };
}

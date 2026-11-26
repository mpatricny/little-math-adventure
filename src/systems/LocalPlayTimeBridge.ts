// Lightweight bridge keeps save/context lifecycle hooks independent of the runtime singleton.
let checkpoint: (() => void) | undefined;

export function observeLocalPlayTime(listener: () => void): () => void {
    checkpoint = listener;
    return () => { if (checkpoint === listener) checkpoint = undefined; };
}

export function checkpointLocalPlayTime(): void { checkpoint?.(); }

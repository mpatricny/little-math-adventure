type Observation = { proxy: Record<string, unknown>; changed?: () => void };
const observations = new WeakMap<object, Observation>();

/** Persist data mutations directly: modal controls can consume Phaser's pointer events. */
export function observePuzzleViewState(state: Record<string, unknown>, changed?: () => void): Record<string, unknown> {
    const existing = observations.get(state);
    if (existing) { if (changed) existing.changed = changed; return existing.proxy; }
    const observation: Observation = { proxy: state, changed };
    const proxies = new WeakMap<object, object>();
    const originals = new WeakMap<object, object>();
    const wrap = (value: unknown): unknown => {
        if (!value || typeof value !== 'object') return value;
        const existingProxy = proxies.get(value);
        if (existingProxy) return existingProxy;
        const proxy = new Proxy(value, {
            get: (target, key) => wrap(Reflect.get(target, key)),
            set: (target, key, next) => {
                const previous = Reflect.get(target, key);
                const plain = next && typeof next === 'object' ? originals.get(next) ?? next : next;
                const result = Reflect.set(target, key, plain);
                if (result && previous !== next) observation.changed?.();
                return result;
            },
            deleteProperty: (target, key) => {
                const existed = Reflect.has(target, key);
                const result = Reflect.deleteProperty(target, key);
                if (result && existed) observation.changed?.();
                return result;
            },
        });
        proxies.set(value, proxy); proxies.set(proxy, proxy); originals.set(proxy, value);
        return proxy;
    };
    observation.proxy = wrap(state) as Record<string, unknown>;
    observations.set(state, observation); observations.set(observation.proxy, observation);
    return observation.proxy;
}

export function stopObservingPuzzleViewState(state: Record<string, unknown>): void {
    const observation = observations.get(state);
    if (observation) observation.changed = undefined;
}

/** Bind only serializable interaction fields. Phaser objects and animation phases never enter saves. */
export function bindPuzzleViewState(target: object, state: Record<string, unknown> | undefined, keys: string[]): void {
    if (!state) return;
    for (const key of keys) {
        const initial = Reflect.get(target, key);
        const stored = state[key];
        const compatible = Array.isArray(initial) ? Array.isArray(stored) && stored.length === initial.length
            : initial === null ? stored === null || typeof stored === 'number' : typeof stored === typeof initial;
        if (!compatible) state[key] = initial;
        Object.defineProperty(target, key, { configurable: true, get: () => state[key], set: value => { state[key] = value; } });
    }
}

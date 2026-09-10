import manifest from '../../public/assets/data/audio.json';
import { AudioSettings, AUDIO_SETTINGS_KEY, readAudioSettings } from './AudioSettings';

type Asset = { url: string; kind: string; gain: number; duration: number; text?: string };
type Music = { url: string; gain: number; crossfade: number; loopStart?: number; loopEnd?: number };
type Sound = { id: string; source: AudioBufferSourceNode; gain: GainNode; owner: object; kind: string; stop: () => void };
type Deck = { id: string; audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; level: number; target: number; stopAtZero: boolean };
const assets: Record<string, Asset> = manifest.assets;
const music: Record<string, Music> = manifest.music;

/** One mixer per game page, also used by remote commands on the TV host. */
export class AudioDirector {
    settings: AudioSettings = readAudioSettings({ getItem: key => localStorage.getItem(key) });
    private context: AudioContext | null = null;
    private buffers = new Map<string, Promise<AudioBuffer | null>>();
    private sounds = new Set<Sound>();
    private decks: Deck[] = [];
    private musicId: string | null = null;
    private ambientId: string | null = null;
    private ambientOwner: object = {};
    private ambientGeneration = 0;
    private voiceGeneration = 0;
    private ownerGenerations = new WeakMap<object, number>();
    private lastEffect = new Map<string, number>();
    private spoken = new Set<string>();
    private pausedOwners = new Set<object>();
    private destroyed = false;
    private timer: ReturnType<typeof setInterval>;
    private debugEvents: { id: string; type: string; time: number }[] = [];
    private voiceCount = 0;
    private onVisibility = () => { this.refreshPause(); };
    private onGesture = () => { void this.unlock(); };

    constructor() {
        document.addEventListener('pointerdown', this.onGesture, true);
        document.addEventListener('keydown', this.onGesture, true);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.timer = setInterval(() => this.tick(), 50);
    }
    private event(id: string, type: string): void {
        this.debugEvents.push({ id, type, time: performance.now() });
        if (this.debugEvents.length > 120) this.debugEvents.shift();
    }
    snapshot() { return { music: this.musicId, ambience: this.ambientId, settings: { ...this.settings },
        unlocked: this.context?.state === 'running', voiceCount: this.voiceCount, activeSounds: this.sounds.size,
        decks: this.decks.map(d => ({ id: d.id, time: d.audio.currentTime, volume: d.gain.gain.value, paused: d.audio.paused })), events: [...this.debugEvents] }; }
    async unlock(): Promise<void> {
        if (this.destroyed) return;
        try {
            this.context ??= new AudioContext();
            if (!document.hidden && !this.pausedOwners.size) await this.context.resume();
            if (this.musicId && !this.decks.some(d => d.id === this.musicId && !d.stopAtZero)) this.startDeck(this.musicId);
            for (const deck of this.decks) if (!this.paused) void deck.audio.play().catch(() => {});
            if (this.ambientId && ![...this.sounds].some(s => s.kind === 'ambience')) this.setAmbience(this.ambientId, true);
        } catch { /* Audio is optional; retry on the next real user gesture. */ }
    }
    private get paused() { return document.hidden || this.pausedOwners.size > 0; }
    setPaused(owner: object, paused: boolean): void {
        if (paused) this.pausedOwners.add(owner); else this.pausedOwners.delete(owner);
        this.refreshPause();
    }
    private refreshPause(): void {
        if (this.paused) {
            void this.context?.suspend().catch(() => {});
            this.decks.forEach(d => d.audio.pause());
        } else if (this.context) { void this.unlock(); }
    }
    setVolume(channel: keyof AudioSettings, value: number): void {
        if (!Number.isFinite(value)) return;
        this.settings[channel] = Math.max(0, Math.min(1, value));
        try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
        if (channel === 'voice' && value === 0) this.stopVoice();
        for (const sound of this.sounds) if (sound.kind === 'sfx' && this.settings.effects === 0) sound.stop();
        for (const sound of this.sounds) {
            if ((channel === 'voice' && sound.kind === 'voice') || (channel === 'effects' && sound.kind === 'sfx')) {
                sound.gain.gain.setTargetAtTime(assets[sound.id].gain * this.settings[channel], this.context!.currentTime, 0.04);
            }
        }
        this.tick();
        if (channel === 'effects' && value > 0 && this.ambientId && ![...this.sounds].some(s => s.kind === 'ambience')) this.setAmbience(this.ambientId, true);
    }
    private async buffer(id: string): Promise<AudioBuffer | null> {
        if (!this.context || !assets[id]) return null;
        if (!this.buffers.has(id)) {
            const context = this.context;
            const controller = new AbortController();
            let timeout: ReturnType<typeof setTimeout>;
            const unavailable = new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller.abort(); reject(new Error('audio timeout')); }, 8000);
            });
            const decode = fetch(assets[id].url, { signal: controller.signal }).then(r => {
                if (!r.ok) throw new Error('missing audio'); return r.arrayBuffer();
            }).then(b => context.decodeAudioData(b));
            this.buffers.set(id, Promise.race([decode, unavailable]).catch(() => {
                this.buffers.delete(id); this.event(id, 'unavailable'); return null;
            }).finally(() => clearTimeout(timeout)));
        }
        return this.buffers.get(id)!;
    }
    preload(ids: string[]): void { ids.forEach(id => { void this.buffer(id); }); }
    async effect(id: string, owner: object): Promise<void> {
        if (!this.context || this.paused || !this.settings.effects || !assets[id]) return;
        const now = performance.now();
        if (now - (this.lastEffect.get(id) ?? -Infinity) < (id === 'ui.confirm' ? 120 : 80)) return;
        this.lastEffect.set(id, now);
        const generation = this.ownerGenerations.get(owner) ?? 0;
        const buffer = await this.buffer(id);
        if (!buffer || this.destroyed || this.paused || !this.settings.effects || generation !== (this.ownerGenerations.get(owner) ?? 0)) return;
        const effects = [...this.sounds].filter(s => s.kind === 'sfx');
        if (effects.length >= 8) effects[0].stop();
        this.startSound(id, buffer, owner, false);
    }
    /** New speech replaces current/pending speech, including when pages are skipped quickly. */
    async speak(id: string, owner: object, onceKey?: string): Promise<void> {
        if (!assets[id] || !this.context || !this.settings.voice || this.paused || (onceKey && this.spoken.has(onceKey))) return;
        this.stopVoice();
        const token = this.voiceGeneration, generation = this.ownerGenerations.get(owner) ?? 0;
        const buffer = await this.buffer(id);
        if (!buffer || this.destroyed || token !== this.voiceGeneration || generation !== (this.ownerGenerations.get(owner) ?? 0) || !this.settings.voice || this.paused) return;
        if (onceKey) this.spoken.add(onceKey);
        return new Promise(resolve => { this.startSound(id, buffer, owner, false, resolve); });
    }
    stopVoice(): void {
        this.voiceGeneration++;
        [...this.sounds].filter(s => s.kind === 'voice').forEach(s => s.stop());
    }
    cancel(owner: object): void {
        this.ownerGenerations.set(owner, (this.ownerGenerations.get(owner) ?? 0) + 1);
        [...this.sounds].filter(s => s.owner === owner).forEach(s => s.stop());
        this.pausedOwners.delete(owner);
        this.refreshPause();
    }
    private startSound(id: string, buffer: AudioBuffer, owner: object, loop: boolean, done?: () => void): void {
        if (!this.context || this.destroyed) { done?.(); return; }
        const asset = assets[id], source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; source.loop = loop;
        const channel = asset.kind === 'voice' ? this.settings.voice : this.settings.effects;
        gain.gain.value = asset.gain * channel;
        source.connect(gain); gain.connect(this.context.destination);
        let ended = false;
        const cleanup = () => {
            if (ended) return; ended = true; this.sounds.delete(sound);
            source.disconnect(); gain.disconnect();
            if (asset.kind === 'voice') this.voiceCount--;
            done?.();
        };
        const sound: Sound = { id, source, gain, owner, kind: asset.kind, stop: () => { try { source.stop(); } catch {} cleanup(); } };
        this.sounds.add(sound); if (asset.kind === 'voice') this.voiceCount++;
        source.onended = cleanup; source.start(); this.event(id, asset.kind);
    }
    setAmbience(id: string | null, force = false): void {
        if (id === this.ambientId && !force) return;
        this.ambientId = id; const token = ++this.ambientGeneration;
        [...this.sounds].filter(s => s.kind === 'ambience').forEach(s => s.stop());
        if (!id || !this.settings.effects || !this.context) return;
        void this.buffer(id).then(buffer => {
            if (buffer && token === this.ambientGeneration && this.settings.effects && !this.destroyed) this.startSound(id, buffer, this.ambientOwner, true);
        });
    }
    setMusic(id: string | null): void {
        if (id === this.musicId) return;
        this.musicId = id;
        for (const deck of this.decks) { deck.target = 0; deck.stopAtZero = true; }
        if (id && music[id] && this.context) this.startDeck(id);
    }
    private startDeck(id: string): void {
        if (!this.context || this.destroyed) return;
        const audio = new Audio(music[id].url);
        audio.preload = 'auto';
        const source = this.context.createMediaElementSource(audio), gain = this.context.createGain();
        gain.gain.value = 0; source.connect(gain); gain.connect(this.context.destination);
        if (music[id].loopStart) audio.currentTime = music[id].loopStart!;
        const deck: Deck = { id, audio, source, gain, level: 0, target: 1, stopAtZero: false };
        this.decks.push(deck);
        if (!this.paused) void audio.play().catch(() => {});
        this.event(id, 'music');
    }
    private tick(): void {
        if (this.destroyed || this.paused) return;
        for (const deck of [...this.decks]) {
            const track = music[deck.id];
            // Overlap the end with the start rather than leaving an encoder-padding gap.
            if (!deck.stopAtZero && deck.id === this.musicId && Number.isFinite(deck.audio.duration)
                && deck.audio.currentTime >= (track.loopEnd ?? deck.audio.duration) - track.crossfade) {
                deck.target = 0; deck.stopAtZero = true; this.startDeck(deck.id);
            }
            const step = 0.05 / track.crossfade;
            deck.level += Math.max(-step, Math.min(step, deck.target - deck.level));
            const wanted = deck.level * track.gain * this.settings.music * (this.voiceCount ? 0.25 : 1);
            deck.gain.gain.value += (wanted - deck.gain.gain.value) * 0.22;
            if (!this.settings.music) deck.gain.gain.value = 0;
            if (deck.stopAtZero && deck.level <= 0) {
                deck.audio.pause(); deck.audio.removeAttribute('src'); deck.audio.load();
                deck.source.disconnect(); deck.gain.disconnect();
                this.decks = this.decks.filter(d => d !== deck);
            }
        }
        for (const sound of this.sounds) {
            if (sound.kind !== 'ambience') continue;
            sound.gain.gain.setTargetAtTime((assets[this.ambientId!]?.gain ?? 0) * this.settings.effects * (this.voiceCount ? 0.4 : 1), this.context!.currentTime, 0.2);
        }
    }
    destroy(): void {
        this.destroyed = true; this.voiceGeneration++; this.ambientGeneration++;
        clearInterval(this.timer); [...this.sounds].forEach(s => s.stop());
        this.decks.forEach(d => { d.audio.pause(); d.audio.removeAttribute('src'); d.audio.load(); d.source.disconnect(); d.gain.disconnect(); });
        this.decks = [];
        document.removeEventListener('pointerdown', this.onGesture, true);
        document.removeEventListener('keydown', this.onGesture, true);
        document.removeEventListener('visibilitychange', this.onVisibility);
        void this.context?.close();
    }
}

let director: AudioDirector | undefined;
export function gameAudio(): AudioDirector { return director ??= new AudioDirector(); }
export function destroyGameAudio(): void { director?.destroy(); director = undefined; }
export const sfx = (owner: object, id: string): void => { void gameAudio().effect(id, owner); };
export const voice = (owner: object, id: string, once = false): void => { void gameAudio().speak(id, owner, once ? id : undefined); };

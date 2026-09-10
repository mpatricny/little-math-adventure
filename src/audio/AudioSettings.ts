export interface AudioSettings { music: number; voice: number; effects: number }
export const AUDIO_SETTINGS_KEY = 'littleMathAdventure_audio_v1';
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { music: 0.65, voice: 1, effects: 0.8 };
export function readAudioSettings(storage: Pick<Storage, 'getItem'>): AudioSettings {
    try {
        const raw = JSON.parse(storage.getItem(AUDIO_SETTINGS_KEY) ?? '{}');
        const value = (key: keyof AudioSettings, legacy: string): number =>
            typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.max(0, Math.min(1, raw[key]))
                : raw[legacy] === false ? 0 : DEFAULT_AUDIO_SETTINGS[key];
        return { music: value('music', 'musicEnabled'), voice: value('voice', 'soundEnabled'), effects: value('effects', 'soundEnabled') };
    } catch { return { ...DEFAULT_AUDIO_SETTINGS }; }
}

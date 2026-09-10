import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, readAudioSettings } from '../AudioSettings';
describe('audio preferences survive unavailable or old storage', () => {
    it('uses defaults on malformed, null or inaccessible storage', () => {
        for (const raw of ['{', 'null', '{}']) expect(readAudioSettings({ getItem: () => raw })).toEqual(DEFAULT_AUDIO_SETTINGS);
        expect(readAudioSettings({ getItem: () => { throw new Error('private mode'); } })).toEqual(DEFAULT_AUDIO_SETTINGS);
    });
    it('clamps saved volumes and preserves the old explicit off setting', () => {
        expect(readAudioSettings({ getItem: () => '{"music":4,"voice":-1,"effects":0.25}' })).toEqual({ music: 1, voice: 0, effects: .25 });
        expect(readAudioSettings({ getItem: () => '{"musicEnabled":false,"soundEnabled":false}' })).toEqual({ music: 0, voice: 0, effects: 0 });
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../DownloadQueue';
import { upcomingScenes, orderedDownloads, canPrepareTextures } from '../preload-policy';

afterEach(() => vi.useRealTimers());
describe('scene forecast', () => {
    const available = ['MenuScene', 'TownScene', 'ArenaScene', 'BattleScene', 'VictoryScene', 'CharacterSelectNewScene', 'BandSelectScene', 'ForestRoomScene'];
    it('prepares the first battle from menu/town, not only on arena entry', () => {
        expect(upcomingScenes('MenuScene', available)).toEqual(['CharacterSelectNewScene', 'BandSelectScene', 'TownScene', 'ArenaScene', 'BattleScene', 'VictoryScene', 'ForestRoomScene']);
        expect(upcomingScenes('TownScene', available).slice(0, 3)).toEqual(['ArenaScene', 'BattleScene', 'VictoryScene']);
        expect(upcomingScenes('ArenaScene', available)[0]).toBe('BattleScene');
    });
    it('does not fetch excluded chapters or decode speculative images during solving', () => {
        expect(upcomingScenes('TownScene', available)).not.toContain('UnderwaterRoomScene');
        expect(canPrepareTextures('BattleScene')).toBe(false);
        expect(canPrepareTextures('CatacombTrialScene')).toBe(false);
        expect(canPrepareTextures('TownScene')).toBe(true);
    });
    it('current/near scenes win and shared URLs are deduplicated', () => {
        expect(orderedDownloads('town', ['arena'], {town:['a','b'],arena:['b','c']}, ['d','a'])).toEqual(['a','b','c','d']);
    });
});

describe('bounded fallback download queue', () => {
    it('does nothing until interaction, bounds parallelism and promotes the next destination', async () => {
        vi.useFakeTimers();
        const pending = new Map<string, (response: Response) => void>();
        const fetcher = vi.fn((url: string) => new Promise<Response>(resolve => pending.set(url, resolve)));
        const completed = vi.fn();
        const q = new DownloadQueue(fetcher as unknown as typeof fetch, completed);
        q.prioritize(['a','b','c','d']); expect(fetcher).not.toHaveBeenCalled();
        q.start(); expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['a','b']);
        q.prioritize(['d']);
        pending.get('a')!(new Response('image'));
        await vi.advanceTimersByTimeAsync(1);
        expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['a','b','d']);
        expect(completed).toHaveBeenCalledWith('a'); q.stop();
    });
    it('retries failures after backoff and never records HTML fallbacks as assets', async () => {
        vi.useFakeTimers();
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('<html/>',{headers:{'content-type':'text/html'}})).mockResolvedValue(new Response('image'));
        const q = new DownloadQueue(fetcher, vi.fn()); q.prioritize(['asset']); q.start();
        await vi.advanceTimersByTimeAsync(10);
        expect(q.completed.size).toBe(0); expect(fetcher).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(q.completed.has('asset')).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2); q.stop();
    });
});

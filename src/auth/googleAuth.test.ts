import { describe, expect, it, vi } from 'vitest';
import { getGoogleSession, signOutGoogle, startGoogleSignIn } from './googleAuth';

const reply = (status: number, body: unknown) => vi.fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('Google account access from the game', () => {
    it('distinguishes signed-out, signed-in and unavailable sessions without treating errors as a user', async () => {
        await expect(getGoogleSession(undefined, reply(401, {}))).resolves.toBe('anonymous');
        await expect(getGoogleSession(undefined, reply(200, { authenticated: true, accountId: 'account-1' })))
            .resolves.toBe('authenticated');
        for (const status of [404, 500, 503]) {
            await expect(getGoogleSession(undefined, reply(status, {}))).resolves.toBe('unavailable');
        }
        await expect(getGoogleSession(undefined, reply(200, {}))).resolves.toBe('unavailable');
    });

    it('starts one cookie-backed Google flow and returns directly to the game', async () => {
        const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state';
        const fetcher = reply(200, { url: googleUrl });
        await expect(startGoogleSignIn('/hra/', undefined, fetcher)).resolves.toBe(googleUrl);
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [path, init] = fetcher.mock.calls[0];
        expect(path).toBe('/api/auth/sign-in/social');
        expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
        expect(JSON.parse(init!.body as string)).toEqual({
            provider: 'google', callbackURL: '/hra/', errorCallbackURL: '/hra/?auth_error=google',
        });
    });

    it('rejects malformed or non-Google redirect destinations and untrusted callback paths', async () => {
        for (const url of ['javascript:alert(1)', 'https://example.com', 'https://accounts.google.com.example.com/',
            'https://accounts.google.com@evil.example/', 'http://accounts.google.com/',
            'https://accounts.google.com:444/', 'https://user@accounts.google.com/', undefined]) {
            await expect(startGoogleSignIn('/hra/', undefined, reply(200, { url }))).rejects.toThrow();
        }
        const fetcher = reply(200, { url: 'https://accounts.google.com/' });
        await startGoogleSignIn('//evil.example/', undefined, fetcher);
        expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).callbackURL).toBe('/');
        await expect(startGoogleSignIn('/hra/', undefined, reply(503, {}))).rejects.toThrow();
    });

    it('sends sign-out to the server and never reports a failed sign-out as successful', async () => {
        const fetcher = reply(200, { success: true });
        await expect(signOutGoogle(undefined, fetcher)).resolves.toBeUndefined();
        expect(fetcher).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({
            method: 'POST', credentials: 'include', body: '{}',
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }));
        await expect(signOutGoogle(undefined, reply(500, {}))).rejects.toThrow();
    });

    it('cancels stale requests when leaving the menu', async () => {
        const controller = new AbortController();
        const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        const pending = getGoogleSession(controller.signal, fetcher);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort();
        await rejected;
    });

    it('stops waiting when an identity server never responds', async () => {
        vi.useFakeTimers();
        try {
            const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
                init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            }));
            const pending = getGoogleSession(undefined, fetcher);
            const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
            await vi.advanceTimersByTimeAsync(8000);
            await rejected;
        } finally { vi.useRealTimers(); }
    });
});

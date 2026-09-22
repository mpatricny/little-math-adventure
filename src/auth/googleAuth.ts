export type GoogleSessionState = 'anonymous' | 'authenticated' | 'unavailable';

type Fetcher = typeof fetch;

async function request(path: string, init: RequestInit, fetcher: Fetcher): Promise<Response> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 8000);
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    try {
        return await fetcher(path, {
            ...init,
            credentials: 'include',
            headers: { Accept: 'application/json', ...init.headers },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', abort);
    }
}

export async function getGoogleSession(signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<GoogleSessionState> {
    const response = await request('/v1/me', { signal }, fetcher);
    if (response.status === 401) return 'anonymous';
    if (!response.ok) return 'unavailable';
    const body = await response.json();
    return body.authenticated === true && typeof body.accountId === 'string' && body.accountId.length > 0
        ? 'authenticated'
        : 'unavailable';
}

export async function startGoogleSignIn(
    returnPath: string,
    signal?: AbortSignal,
    fetcher: Fetcher = fetch,
): Promise<string> {
    // Only return to a document on this origin. Never carry arbitrary URL/query input into OAuth.
    const callbackURL = returnPath === '/hra/' ? '/hra/' : '/';
    const response = await request('/api/auth/sign-in/social', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: 'google',
            callbackURL,
            errorCallbackURL: `${callbackURL}?auth_error=google`,
        }),
    }, fetcher);
    if (!response.ok) throw new Error('Google sign-in unavailable');
    const body = await response.json();
    const authorizationUrl = new URL(body.url);
    if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'accounts.google.com'
        || authorizationUrl.username || authorizationUrl.password || authorizationUrl.port) {
        throw new Error('Unexpected Google authorization URL');
    }
    return authorizationUrl.href;
}

export async function signOutGoogle(signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<void> {
    const response = await request('/api/auth/sign-out', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    }, fetcher);
    if (!response.ok) throw new Error('Sign out failed');
}

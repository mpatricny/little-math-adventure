export function isControllerMode(): boolean {
    return window.location.pathname === '/controller'
        || window.location.pathname.startsWith('/controller/');
}

export function isTvMode(): boolean {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname === '/tv'
        || window.location.pathname.startsWith('/tv/')
        || params.get('tv') === '1';
}

export function getRelayUrlFromLocation(): string {
    const params = new URLSearchParams(window.location.search);
    const explicitRelay = params.get('relay');
    if (explicitRelay) return explicitRelay;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:8787`;
}

export function getRoomFromLocation(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
}

export function buildControllerUrl(room: string, relayUrl: string): string {
    const url = new URL('/controller', window.location.origin);
    url.searchParams.set('room', room);
    url.searchParams.set('relay', relayUrl);
    return url.toString();
}

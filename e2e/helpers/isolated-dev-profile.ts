import type { Page } from 'playwright/test';

const isolated = new WeakSet<Page>();
const requestAudits = new WeakMap<Page, { observed: Set<string>; intercepted: Set<string> }>();

/** Paths and methods only: never expose profile bodies, headers or credentials. */
export function isolatedDevProfileAudit(page: Page): { observed: string[]; intercepted: string[] } {
    const audit = requestAudits.get(page);
    if (!audit) throw new Error('Profile isolation was not installed before boot');
    return { observed: [...audit.observed].sort(), intercepted: [...audit.intercepted].sort() };
}

/** Fixture boot must never read or upload the repository's shared real saves. */
export async function isolateDevProfile(page: Page): Promise<void> {
    if (isolated.has(page)) return;
    isolated.add(page);
    const audit = { observed: new Set<string>(), intercepted: new Set<string>() };
    requestAudits.set(page, audit);
    const requestPath = (request: { url(): string; method(): string }) => `${request.method()} ${new URL(request.url()).pathname}`;
    page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (/^\/v1\//.test(path) || /^\/__(?:dev-saves\/api|save-debug|learning-diagnostics|device-diagnostics)(?:\/|$)/.test(path)) {
            audit.observed.add(requestPath(request));
        }
    });
    const records = new Map<string, any>();
    // Vite proxies /v1 to the real local backend. Keep the complete API namespace
    // inside this browser context, including independently evolving telemetry.
    await page.route(/^https?:\/\/[^/]+\/v1\//, route => {
        audit.intercepted.add(requestPath(route.request()));
        const path = new URL(route.request().url()).pathname;
        if (path === '/v1/me') return route.fulfill({ status: 200, json: { authenticated: false } });
        if (path === '/v1/analytics/config') return route.fulfill({ status: 200, json: { enabled: false } });
        return route.fulfill({ status: 503, json: { isolated: true, error: 'No backend in game fixture' } });
    });
    await page.route(/\/__dev-saves\/api(?:[/?]|$)/, async route => {
        audit.intercepted.add(requestPath(route.request()));
        const request=route.request();
        if (request.method()==='POST') {
            const body=request.postDataJSON();
            if (body.mode==='commit') for (const write of body.writes??[]) {
                const profileId=write.save.player.gameplayProfileId;
                records.set(profileId,{profileId,sourceSlot:write.sourceSlot,save:write.save,
                    revision:(records.get(profileId)?.revision??0)+1,receivedAt:Date.now()});
            }
        }
        await route.fulfill({status:200,json:{version:1,serverId:'isolated-e2e-profile',records:[...records.values()]}});
    });
    await page.route(/\/__(?:save-debug|learning-diagnostics|device-diagnostics)(?:[/?]|$)/,
        route=>{
            audit.intercepted.add(requestPath(route.request()));
            return route.fulfill({status:200,json:{ok:true,isolated:true}});
        });
}

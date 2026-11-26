import { test, expect } from '../arena/helpers/arena-harness';
import { isolateDevProfile } from '../helpers/isolated-dev-profile';

test('profile statistics can describe a table, mark a test and revoke it without native randomUUID', async ({ page }) => {
    await isolateDevProfile(page);
    await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }));
    const meta = { environment: 'dev', excluded: { tests: 0, adults: 0, conflicts: 0 }, warnings: [] };
    const report = (data: unknown) => ({ meta, data });
    const entry = { id: 'marker', target_type: 'profile', target_id: 'sample', label: 'test', action: 'set', reason: 'Zkouška' };
    const mutations: string[] = [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    await page.route('**/v1/admin/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname.slice('/v1/admin/'.length);
        if (request.method() === 'POST') {
            expect(path).toBe(mutations.length === 0 ? 'annotations' : 'annotations/marker/revoke');
            expect(request.headers()['x-csrf-token']).toBe('fixture-token');
            const body = request.postDataJSON();
            expect(body.mutationId).toMatch(uuid);
            expect(mutations).not.toContain(body.mutationId);
            mutations.push(body.mutationId);
            return route.fulfill({ json: { id: 'marker' } });
        }
        switch (path) {
            case 'bootstrap': return route.fulfill({ json: { csrfToken: 'fixture-token' } });
            case 'players/sample': return route.fulfill({ json: report({ name: 'Test' }) });
            case 'attempts': return route.fulfill({ json: report({ items: [], total: 0 }) });
            case 'data-quality': return route.fulfill({ json: report({ coverage: [], issues: [], ingest: [] }) });
            case 'annotations': {
                const items: Array<typeof entry & { reverts_id?: string }> = mutations.length > 0 ? [entry] : [];
                if (mutations.length === 2) items.push({ ...entry, id: 'undo', action: 'revoke', reverts_id: entry.id });
                return route.fulfill({ json: report({ items }) });
            }
            default: throw new Error('Unexpected admin route: ' + path);
        }
    });

    await page.goto('/admin/players/sample?tab=answers');
    await expect(page.getByRole('table')).toHaveAccessibleDescription(/První volby/);
    await page.getByRole('button', { name: 'Označit test / dospělý' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Důvod' }).fill(entry.reason);
    await dialog.getByRole('button', { name: 'Uložit' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('link', { name: 'Stav dat' }).click();
    page.once('dialog', prompt => prompt.accept('Zpět'));
    const revoke = page.getByRole('button', { name: 'Odvolat', exact: true });
    await revoke.click();
    await expect(page.getByText('Odvoláno', { exact: true }).first()).toBeVisible();
    expect(mutations).toHaveLength(2);
});

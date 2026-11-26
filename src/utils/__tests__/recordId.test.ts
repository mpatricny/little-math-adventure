import { afterEach, expect, it, vi } from 'vitest';
import { createRecordId } from '../recordId';

afterEach(() => vi.unstubAllGlobals());

it('uses the native UUID when available', () => {
    const id = 'f2702109-60ed-44e8-8e8c-0c6f6bbf8990';
    vi.stubGlobal('crypto', { randomUUID: () => id });
    expect(createRecordId()).toBe(id);
});

it('uses all 16 random bytes on LAN HTTP and sets the UUID version and variant', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => 0xf0 + index);
    vi.stubGlobal('crypto', { getRandomValues: (target: Uint8Array) => target.set(bytes) });
    expect(createRecordId()).toBe('f0f1f2f3-f4f5-46f7-b8f9-fafbfcfdfeff');
});

it('can still generate a local record ID without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createRecordId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

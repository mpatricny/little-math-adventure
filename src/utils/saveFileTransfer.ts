const MAX_SAVE_FILE_BYTES = 10 * 1024 * 1024;

export type SaveFileReadResult =
    | { ok: true; contents: string }
    | { ok: false; error: string };

export function downloadSaveBundle(contents: string): void {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cislokraj-postup-${date}.json`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createSaveFileInput(
    onRead: (result: SaveFileReadResult) => void,
): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > MAX_SAVE_FILE_BYTES) {
            onRead({ ok: false, error: 'Soubor je příliš velký.' });
            return;
        }

        try {
            onRead({ ok: true, contents: await file.text() });
        } catch {
            onRead({ ok: false, error: 'Soubor se nepodařilo přečíst.' });
        }
    }, { once: true });

    return input;
}

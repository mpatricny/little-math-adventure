// Read-only source analysis. Save level/loop metadata; never rewrite the Suno originals.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const manifestPath = 'public/assets/data/audio.json';
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const checks = [];
try {
    for (const [id, track] of Object.entries(manifest.music)) {
        const bytes = (await fs.readFile(`public${track.url}`)).toString('base64');
        const result = await page.evaluate(async bytes => {
            const context = new OfflineAudioContext(1, 1, 44100);
            const buffer = await context.decodeAudioData(Uint8Array.from(atob(bytes), c => c.charCodeAt(0)).buffer);
            let peak = 0, squares = 0, first = buffer.length, last = 0;
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const data = buffer.getChannelData(ch);
                for (let i = 0; i < data.length; i++) {
                    const v = Math.abs(data[i]); peak = Math.max(peak, v); squares += v * v;
                    if (v > 0.001) { first = Math.min(first, i); last = Math.max(last, i); }
                }
            }
            return { duration: buffer.duration, peak, rms: Math.sqrt(squares / buffer.length / buffer.numberOfChannels),
                channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate,
                loopStart: Math.max(0, first / buffer.sampleRate - 0.03), loopEnd: Math.min(buffer.duration, last / buffer.sampleRate + 0.03) };
        }, bytes);
        if (result.rms < 0.0001 || result.duration < 8) throw new Error(`Invalid music: ${id}`);
        checks.push({ id, ...result });
        Object.assign(track, { duration: result.duration, loopStart: result.loopStart, loopEnd: result.loopEnd });
    }
} finally { await browser.close(); }
// A conservative RMS-based balance, not a LUFS mastering pass.
const median = checks.map(c => c.rms).sort((a, b) => a - b)[Math.floor(checks.length / 2)];
for (const check of checks) manifest.music[check.id].gain = +Math.max(0.15, Math.min(0.38, 0.27 * median / check.rms)).toFixed(3);
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile('docs/audio/music-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), method: 'Chromium WebAudio decode, RMS gain balance, silence-only boundaries; 2 s runtime crossfade is not a beat-matched loop', tracks: checks }, null, 2) + '\n');
console.log(JSON.stringify(checks));

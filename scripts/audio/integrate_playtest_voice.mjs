// Offline decoding and headroom normalization. This does not approve pronunciation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'docs/audio/elevenlabs-generated.json');
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const manifestPath = path.join(root, 'public/assets/data/audio.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
    const page = await browser.newPage();
    for (const asset of report.assets.filter(asset => asset.phase === 'playtest')) {
        const base64 = (await fs.readFile(path.join(root, asset.file))).toString('base64');
        const check = await page.evaluate(async base64 => {
            const context = new OfflineAudioContext(1, 1, 44100);
            const source = await context.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer);
            const samples = source.getChannelData(0);
            let peak = 0, squares = 0;
            for (const value of samples) { peak = Math.max(peak, Math.abs(value)); squares += value * value; }
            const gain = Math.min(1, 0.7 / Math.max(0.0001, peak));
            const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
            const str = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
            str(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
            view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
            view.setUint32(24, source.sampleRate, true); view.setUint32(28, source.sampleRate * 2, true);
            view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples.length * 2, true);
            const fade = Math.round(source.sampleRate * 0.003);
            for (let i = 0; i < samples.length; i++) {
                const edge = Math.min(1, i / fade, (samples.length - 1 - i) / fade);
                view.setInt16(44 + i * 2, Math.round(samples[i] * gain * edge * 32767), true);
            }
            const bytes = new Uint8Array(buffer); let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            return { wav: btoa(binary), duration: source.duration, peak, gain, rms: Math.sqrt(squares / samples.length) };
        }, base64);
        if (check.rms < 0.0001 || check.duration < 0.3) throw new Error(`Empty voice: ${asset.id}`);
        const url = `/assets/audio/voice/cs/${asset.id}.wav`;
        await fs.writeFile(path.join(root, 'public', url), Buffer.from(check.wav, 'base64'));
        delete check.wav;
        manifest.assets[asset.id] = { url, kind: 'voice', gain: 0.85, duration: check.duration, text: asset.text, voice: asset.role };
        asset.integrated = true;
        checks.push({ id: asset.id, ...check, pronunciationReview: 'pending' });
    }
} finally { await browser.close(); }
// Keep old triggers compatible while removing the inaccurate legacy lines.
manifest.assets['vo.battle.intro'] = { ...manifest.assets['vo.battle.sword'] };
manifest.assets['vo.arena.intro'] = { ...manifest.assets['vo.arena.free'] };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(root, 'docs/audio/playtest-voice-checks.json'), JSON.stringify({ method: 'Offline Web Audio decode; peak normalized to at most 0.7', assets: checks }, null, 2) + '\n');
console.log(JSON.stringify({ voices: checks.length, duration: checks.reduce((sum, item) => sum + item.duration, 0), credits: report.assets.filter(a => a.phase === 'playtest').reduce((sum, a) => sum + Number(a.reported_credit_cost ?? 0), 0) }));

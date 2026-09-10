// Technical decoding/level checks only. This does not approve sound or pronunciation.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'docs/audio/elevenlabs-generated.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const checks = [];
try {
  for (const asset of manifest.assets) {
    const base64 = (await fs.readFile(path.join(root, asset.file))).toString('base64');
    const check = await page.evaluate(async ({ base64, kind }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const context = new OfflineAudioContext(1, 1, 44100);
      const decoded = await context.decodeAudioData(bytes.buffer);
      let peak = 0, squares = 0, nearFullScale = 0;
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch);
        for (const value of data) {
          peak = Math.max(peak, Math.abs(value));
          squares += value * value;
          if (Math.abs(value) >= 0.999) nearFullScale++;
        }
      }
      // Preserve originals. Export PCM previews with headroom, without boosting quiet audio.
      // This cannot repair clipping already present in the source.
      const gain = peak > 0 ? Math.min(1, 0.7 / peak) : 1;
      const channels = decoded.numberOfChannels;
      const wav = new ArrayBuffer(44 + decoded.length * channels * 2);
      const view = new DataView(wav);
      const str = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      str(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
      view.setUint32(24, decoded.sampleRate, true); view.setUint32(28, decoded.sampleRate * channels * 2, true);
      view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, wav.byteLength - 44, true);
      const fade = Math.round(decoded.sampleRate * 0.003);
      for (let i = 0; i < decoded.length; i++) {
        const edge = kind === 'ambience' ? 1 : Math.min(1, i / fade, (decoded.length - 1 - i) / fade);
        for (let ch = 0; ch < channels; ch++) {
          const v = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i] * gain * edge));
          view.setInt16(44 + (i * channels + ch) * 2, Math.round(v * 32767), true);
        }
      }
      const output = new Uint8Array(wav);
      let binary = '';
      for (let i = 0; i < output.length; i += 8192) binary += String.fromCharCode(...output.subarray(i, i + 8192));
      return { wavBase64: btoa(binary), previewGain: gain, durationSeconds: decoded.duration, sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels, peak, rms: Math.sqrt(squares / (decoded.length * decoded.numberOfChannels)), nearFullScaleSamples: nearFullScale };
    }, { base64, kind: asset.kind });
    const previewFile = `public/assets/audio/previews/${asset.kind}/${asset.id}.wav`;
    await fs.mkdir(path.dirname(path.join(root, previewFile)), { recursive: true });
    await fs.writeFile(path.join(root, previewFile), Buffer.from(check.wavBase64, 'base64'));
    delete check.wavBase64;
    checks.push({ id: asset.id, ...check, previewFile, audibleReview: 'pending',
      flags: [...(check.rms < 0.0001 ? ['near_silent'] : []), ...(check.peak >= 0.999 ? ['check_peak_headroom'] : [])] });
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(root, 'docs/audio/technical-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), method: 'Chromium Web Audio decode; not a listening review', assets: checks }, null, 2) + '\n');
console.log(JSON.stringify({ decoded: checks.length, totalSeconds: checks.reduce((sum, c) => sum + c.durationSeconds, 0), flagged: checks.filter(c => c.flags.length).map(c => ({ id: c.id, flags: c.flags })) }));

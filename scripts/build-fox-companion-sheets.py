"""Native video RGB, aligned AutoSprite alpha, one shared transform per appearance.

Only reviewed source windows are exported. Atlas grids never exceed 2048 px.
The old enemy/companion rune-fox asset is intentionally not overwritten.
"""
from pathlib import Path
import importlib.util
import json
import math
import sys
import os
import hashlib
import av
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[1]
VERSION = os.environ.get('FOX_ANIMATION_VERSION', 'v1')
assert VERSION in ('v1', 'v2')
ROOT = PROJECT / f'artifacts/sorceress/fox-companion-{VERSION}'
OUTPUT = PROJECT / f'docs/design-drafts/fox-animation-{VERSION}/assets/sheets'
SIZE, EVERY = 512, 4
spec = importlib.util.spec_from_file_location('validated_key', PROJECT / 'scripts/build-mill-turtle-autosprite3-every4.py')
keyer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(keyer)

def clean_components(alpha):
    labels, _ = ndimage.label(alpha > 8 / 255, structure=np.ones((3, 3)))
    counts = np.bincount(labels.ravel())
    cleaned = alpha.copy()
    cleaned[counts[labels] < 4] = 0
    return cleaned

keyer.remove_tiny_alpha_components = clean_components

def save_atomic(image, destination, **options):
    temporary = destination.with_name('.' + destination.stem + '.tmp' + destination.suffix)
    image.save(temporary, **options)
    temporary.replace(destination)

def versioned_copy(destination):
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()[:10]
    versioned = destination.with_name(destination.stem + '-' + digest + destination.suffix)
    if not versioned.exists(): versioned.write_bytes(destination.read_bytes())
    return versioned

def contact(frames, destination, light):
    side, columns = 256, 4
    color = '#eee9dc' if light else '#102c3c'
    result = Image.new('RGB', (columns * side, math.ceil(len(frames) / columns) * (side + 22)), color)
    for i, frame in enumerate(frames):
        tile = Image.new('RGBA', (side, side), color)
        tile.alpha_composite(frame.resize((side, side), Image.Resampling.LANCZOS))
        x, y = i % columns * side, i // columns * (side + 22)
        result.paste(tile.convert('RGB'), (x, y))
        ImageDraw.Draw(result).text((x + 8, y + side + 3), str(i), fill='#102c3c' if light else 'white')
    result.save(destination)

def process(job, review):
    assert review['approved'], 'Unreviewed video'
    with av.open(str(ROOT / job['localFile'])) as video:
        rate = float(video.streams.video[0].average_rate)
        raw = [frame.to_image().convert('RGB').resize((SIZE, SIZE), Image.Resampling.LANCZOS)
               for frame in video.decode(video=0)]
    assert review['start'] % EVERY == 0 and review['end'] < len(raw)
    meta = job['keyMetadata']
    assert meta['frameW'] == meta['frameH'] == SIZE
    sheet = Image.open(ROOT / job['keyFile']).convert('RGBA')
    assert sheet.size == (meta['cols'] * SIZE, meta['rows'] * SIZE)
    masks = []
    for frame in raw:
        rgb = np.asarray(frame).astype(float)
        masks.append(rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2]) < 55)
    aligned = []
    for i in range(meta['frameCount']):
        x, y = i % meta['cols'] * SIZE, i // meta['cols'] * SIZE
        alpha = np.asarray(sheet.crop((x, y, x + SIZE, y + SIZE)).getchannel('A'))
        mask = alpha > 127
        # Remote extraction may resample 24 Hz video onto a 30 Hz grid.
        expected = i / meta['fps'] * rate
        candidates = [n for n in range(len(raw)) if abs(n - expected) <= 4]
        assert candidates, 'Unexpected remote frame timing'
        scores = [(np.sum(masks[n] & mask) / max(1, np.sum(masks[n] | mask)), -abs(n - expected), n) for n in candidates]
        iou, _, source = max(scores)
        assert iou > .90, f'Alpha geometry mismatch: {job["label"]} key {i}: {iou}'
        aligned.append((source, alpha, round(float(iou), 4)))
    frames, mapping = [], []
    for index in range(review['start'], review['end'] + 1, EVERY):
        match = min(range(len(aligned)), key=lambda n: abs(aligned[n][0] - index))
        source, alpha, iou = aligned[match]
        assert abs(source - index) <= 4, f'Alpha timing mismatch at {index}'
        _, core = keyer.make_hint_and_core(raw[index])
        frames.append(keyer.conservative_key(raw[index], np.maximum(alpha, core)))
        mapping.append({'sourceFrame': index, 'alphaFrame': match, 'alphaSourceFrame': source, 'alphaIoU': iou})
    return frames, {'source': job['localFile'], 'sourceFps': rate, 'sampleEvery': EVERY,
                    'fps': rate / EVERY, 'alphaSource': job['keyFile'], 'mapping': mapping}

def main():
    jobs = json.loads((ROOT / 'jobs.json').read_text())
    reviews = json.loads((ROOT / 'approved-windows.json').read_text())
    ids = sys.argv[1:] or list(jobs)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT.parent.parent / 'manifest.json'
    result = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        'status': 'animation-review', 'source': 'Real imagine-1.5 video; native RGB and aligned AutoSprite alpha',
        'frameWidth': SIZE, 'frameHeight': SIZE, 'forms': {}}
    for id in ids:
        actions = {job['label']: process(job, reviews[f'{id}/{job["label"]}']) for job in jobs[id]['jobs']}
        bounds = [frame.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
                  for frames, _ in actions.values() for frame in frames]
        assert all(bounds)
        left, top = min(b[0] for b in bounds), min(b[1] for b in bounds)
        right, bottom = max(b[2] for b in bounds), max(b[3] for b in bounds)
        assert min(left, top, SIZE - right, SIZE - bottom) > 8, 'Clipped source motion'
        extent = max(right - left, bottom - top) + 48
        crop_left = round((left + right - extent) / 2)
        crop_bottom = bottom + 24
        crop = (crop_left, crop_bottom - extent, crop_left + extent, crop_bottom)
        form = {**result.get('forms', {}).get(id, {}),
                'sourceUnion': [left, top, right, bottom], 'sharedCrop': crop, 'motions': {}}
        if VERSION == 'v2' and id in ('02', '03', '05'):
            form['sourceStill'] = f'assets/fox-{id}-standing.png'
            form['authorDecision'] = 'new-motion-for-review'
        for motion, (frames, info) in actions.items():
            frames = [frame.crop(crop).resize((SIZE, SIZE), Image.Resampling.LANCZOS) for frame in frames]
            name = f'fox-{id}-{motion}'
            columns = min(4, len(frames)); rows = math.ceil(len(frames) / columns)
            assert rows <= 4
            atlas = Image.new('RGBA', (columns * SIZE, rows * SIZE), (0, 0, 0, 0))
            folder = ROOT / f'{name}-frames'; folder.mkdir(exist_ok=True)
            for i, frame in enumerate(frames):
                atlas.alpha_composite(frame, (i % columns * SIZE, i // columns * SIZE))
                frame.save(folder / f'{i:02d}.png')
            destination = OUTPUT / f'{name}.webp'
            save_atomic(atlas, destination, format='WEBP', quality=88, method=6, lossless=False, exact=True)
            runtime_sheet = versioned_copy(destination)
            order = list(range(len(frames)))
            # Author requirement: real forward loops, never ping-pong playback.
            playback = [frames[i] for i in order]
            preview = OUTPUT / f'{name}-preview.webp'
            save_atomic(playback[0], preview, format='WEBP', save_all=True, append_images=playback[1:],
                             duration=round(1000 / info['fps']), loop=0, quality=85, method=2, exact=True)
            contact(frames, ROOT / f'{name}-contact-dark.png', False)
            contact(frames, ROOT / f'{name}-contact-light.png', True)
            runtime_preview = versioned_copy(preview)
            info.update({'sheet': f'assets/sheets/{runtime_sheet.name}', 'preview': f'assets/sheets/{runtime_preview.name}',
                         'columns': columns, 'rows': rows, 'frames': len(frames), 'playback': order,
                         'loop': motion == 'idle', 'direction': 'forward',
                         'width': atlas.width, 'height': atlas.height, 'bytes': destination.stat().st_size})
            form['motions'][motion] = info
            print(name, len(frames), 'frames;', atlas.size, 'bytes', info['bytes'], flush=True)
        result['forms'][id] = form
        temporary_manifest = manifest_path.with_suffix('.tmp.json')
        temporary_manifest.write_text(json.dumps(result, indent=2) + '\n')
        temporary_manifest.replace(manifest_path)

if __name__ == '__main__':
    main()

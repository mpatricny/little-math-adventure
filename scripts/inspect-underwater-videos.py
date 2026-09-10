"""Review-only contact sheets. No production extraction before source approval."""
from pathlib import Path
import av
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'artifacts/sorceress' / ('underwater-friendly-guardian' if '--friendly' in sys.argv else 'underwater-finalists')
for video in sorted(ROOT.glob('*-raw.mp4')):
    capture = av.open(str(video))
    rate = float(capture.streams.video[0].average_rate)
    frames = [f.to_image().convert('RGB') for f in capture.decode(video=0)]
    capture.close()
    # Early action details plus full-clip extremes and ending.
    indices = sorted(set([0, 4, 8, 12, 16, 24, 32, 40, 48, len(frames)//2, len(frames)*3//4, len(frames)-1]))
    indices = [i for i in indices if i < len(frames)]
    contact = Image.new('RGB', (1200, ((len(indices)+3)//4)*320), '#202735')
    for j, i in enumerate(indices):
        tile = frames[i].copy(); tile.thumbnail((300, 290))
        x, y = (j % 4)*300, (j//4)*320
        contact.paste(tile, (x + (300-tile.width)//2, y))
        ImageDraw.Draw(contact).text((x+8,y+295), f'{i} / {i/rate:.2f}s', fill='white')
    contact.save(ROOT / f'{video.stem}-review.png')
    borders = []
    for frame in frames:
        rgb = np.asarray(frame).astype(float)
        subject = (rgb[:,:,1] - np.maximum(rgb[:,:,0],rgb[:,:,2])) < 60
        yy, xx = np.where(subject)
        if len(xx): borders.append(min(xx.min(), yy.min(), rgb.shape[1]-1-xx.max(),rgb.shape[0]-1-yy.max()))
    print(video.name, 'frames', len(frames), 'fps', rate, 'size', frames[0].size, 'min border', min(borders))

"""Render review strips from actual exported animation frames, forward only."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
gallery = root / 'docs/design-drafts/fox-animation-v1'
source = root / 'artifacts/sorceress/fox-companion-v1'
manifest = json.loads((gallery / 'manifest.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf', 20)
for form in sys.argv[1:] or manifest['forms']:
    clips = {}
    for motion, info in manifest['forms'][form]['motions'].items():
        clips[motion] = [Image.open(source / f'fox-{form}-{motion}-frames/{i:02}.png').convert('RGBA').resize((280,280), Image.Resampling.LANCZOS)
                         for i in range(info['frames'])]
    period = max(len(frames) for frames in clips.values())
    frames = []
    for tick in range(period * 2):
        strip = Image.new('RGBA', (840,320), '#102c3c')
        for col, (name,label) in enumerate((('idle','V klidu'),('attack','Útok'),('cast','Schopnost'))):
            clip=clips[name]
            index=tick % len(clip) if name == 'idle' else min(tick % period,len(clip)-1)
            strip.alpha_composite(clip[index],(280*col,0))
            ImageDraw.Draw(strip).text((280*col+140,292),label,font=font,fill='#f4dfad',anchor='mm')
        frames.append(strip)
    target = gallery / f'assets/fox-{form}-motions-review.webp'
    frames[0].save(target,format='WEBP',save_all=True,append_images=frames[1:],duration=167,loop=0,quality=85,method=2)
    print(target.name, flush=True)

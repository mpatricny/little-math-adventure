"""Read-only gates for all production frame geometry, exact alpha and HUD padding."""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image

PROJECT=Path(__file__).resolve().parents[1]
FRIENDLY='--friendly' in sys.argv
ROOT=PROJECT/'artifacts/sorceress'/('underwater-friendly-guardian' if FRIENDLY else 'underwater-finalists')
production=json.loads((ROOT/'production.json').read_text())
enemies=json.loads((PROJECT/'public/assets/data/enemies.json').read_text())
total=0
for slug,creature in production['creatures'].items():
    prefix='depth-guardian-friendly' if FRIENDLY else 'depth-guardian' if slug=='guardian' else 'pearl-jellyfish'
    enemy=None if FRIENDLY else next(e for e in enemies if e['animPrefix']==prefix)
    highest=512
    for action,data in creature['actions'].items():
        sheet=Image.open(PROJECT/data['sheet']).convert('RGBA')
        assert sheet.size==(512*data['frameCount'],512)
        assert data['frameRate']==6 and data['sampleEvery']==4
        for i in range(data['frameCount']):
            frame=Image.open(ROOT/f'{prefix}-{action}-frames'/f'{i:02}.png').convert('RGBA')
            assert frame.size==(512,512)
            original=np.asarray(frame)[:,:,3]
            stored=np.asarray(sheet.crop((i*512,0,(i+1)*512,512)))[:,:,3]
            assert np.array_equal(original,stored), f'Alpha changed: {prefix}/{action}/{i}'
            bounds=frame.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
            assert bounds and min(bounds[0],bounds[1],512-bounds[2],512-bounds[3])>=12, f'Clipped: {prefix}/{action}/{i}'
            highest=min(highest,frame.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()[1])
            total+=1
        print(f'{prefix}/{action}: {data["frameCount"]} frames, exact alpha, safe borders',flush=True)
    if enemy:
        assert enemy['frameTopInset']<=highest, f'HUD intersects motion envelope: {prefix}'
        print(f'{prefix}: HUD inset {enemy["frameTopInset"]}, motion top {highest}',flush=True)
print(f'PASS: {total} normalized production frames')

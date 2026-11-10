"""Read-only geometry, original-alpha and production motion checks."""
from pathlib import Path
import json
import hashlib
import sys
import numpy as np
from PIL import Image

PROJECT=Path(__file__).resolve().parents[1]
ROOT=PROJECT/'artifacts/sorceress/underwater-expansion'
production_bytes=(ROOT/'production.json').read_bytes()
production=json.loads(production_bytes)
enemies=json.loads((PROJECT/'public/assets/data/enemies.json').read_text())
textures=json.loads((PROJECT/'public/assets/data/textures.json').read_text())
assets_only='--assets-only' in sys.argv
total=0;sheet_hashes={}
assert len(production['creatures'])==2
for slug,creature in production['creatures'].items():
    prefix=creature['prefix'];highest=512
    assert set(creature['actions'])=={'idle','attack','defend','defeat'}
    for action,data in creature['actions'].items():
        assert hashlib.sha256((ROOT/data['source']).read_bytes()).hexdigest()==data['sourceSha256']
        sheet=Image.open(PROJECT/data['sheet']).convert('RGBA')
        sheet_hashes[data['sheet']]=hashlib.sha256((PROJECT/data['sheet']).read_bytes()).hexdigest()
        columns=sheet.width//512
        assert sheet.width%512==0 and sheet.height%512==0
        assert columns*sheet.height//512>=data['frameCount']
        # Historical approved strips are immutable review sources, never newly
        # registerable output. Registered art must fit a tablet-safe atlas and
        # preserve the complete decoded RGBA frame from that approved source.
        if assets_only:
            assert max(sheet.size)<=2048,'Production output must use a bounded row-major grid'
        else:
            registered_texture=textures['spritesheets'][f'silverpond-{prefix}-{action}-sheet']
            assert registered_texture['frameCount']==data['frameCount']
            registered_sheet=Image.open(PROJECT/'public/assets'/registered_texture['path']).convert('RGBA')
            assert max(registered_sheet.size)<=2048,'Registered sheet exceeds tablet GPU budget'
            registered_columns=registered_sheet.width//512
        assert data['frameCount']>1 and data['frameRate']==6 and data['sampleEvery']==4
        fingerprints=set()
        for i in range(data['frameCount']):
            frame=Image.open(ROOT/f'{prefix}-{action}-frames'/f'{i:02}.png').convert('RGBA')
            assert frame.size==(512,512)
            original=np.asarray(frame)[:,:,3]
            x,y=i%columns*512,i//columns*512
            stored_frame=np.asarray(sheet.crop((x,y,x+512,y+512)))
            stored=stored_frame[:,:,3]
            assert np.array_equal(original,stored),f'Alpha changed {prefix}/{action}/{i}'
            if not assets_only:
                x,y=i%registered_columns*512,i//registered_columns*512
                registered_frame=np.asarray(registered_sheet.crop((x,y,x+512,y+512)))
                assert np.array_equal(stored_frame,registered_frame),f'Repacked RGBA changed {prefix}/{action}/{i}'
            bounds=frame.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
            assert bounds and min(bounds[0],bounds[1],512-bounds[2],512-bounds[3])>=12,f'Clipped {prefix}/{action}/{i}'
            highest=min(highest,frame.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()[1])
            fingerprints.add(hashlib.sha256(frame.tobytes()).hexdigest());total+=1
        assert len(fingerprints)>1,f'Static fallback {prefix}/{action}'
        print(f'{prefix}/{action}: {data["frameCount"]} video frames, exact alpha, safe borders',flush=True)
    assert creature['frameTopInset']<=highest,f'Intrinsic inset intersects motion envelope {prefix}'
    if not assets_only:
        registered=[e for e in enemies if e['animPrefix']==prefix]
        assert len(registered)==2,f'Expected registered base + elite for {prefix}'
        for enemy in registered:assert enemy['frameTopInset']<=highest,f'HUD intersects motion envelope {prefix}'
print(f'PASS: {total} normalized production video frames')
if '--receipt' in sys.argv:
    # The explicit receipt is consumed only while every approved byte still matches.
    receipt={'mode':'assets-only' if assets_only else 'registered','productionSha256':hashlib.sha256(production_bytes).hexdigest(),
        'sheets':sheet_hashes,'verifiedFrames':total}
    (ROOT/'verification.json').write_text(json.dumps(receipt,indent=2)+'\n')

"""Review source videos only. No production extraction or normalization."""
from pathlib import Path
import json
import math
import hashlib
import av
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'artifacts/sorceress/underwater-expansion'
summary = {}
for source in sorted(ROOT.glob('*-raw.mp4')):
    with av.open(str(source)) as video:
        rate = float(video.streams.video[0].average_rate)
        assert video.streams.video[0].width==video.streams.video[0].height, 'Rejected: source aspect differs from approved square canonical'
        frames = [frame.to_image().convert('RGB') for frame in video.decode(video=0)]
    # Every fourth source frame plus the actual ending, so reviewers see the
    # full action, motion extremes, late drift and any delayed effects.
    indices = sorted(set([*range(0, len(frames), 4), len(frames)-1]))
    side, label, columns = 256, 22, 5
    sheet = Image.new('RGB', (side*columns, math.ceil(len(indices)/columns)*(side+label)), '#202735')
    for i, index in enumerate(indices):
        tile = frames[index].copy(); tile.thumbnail((side,side))
        x, y = i%columns*side, i//columns*(side+label)
        sheet.paste(tile, (x+(side-tile.width)//2, y+(side-tile.height)//2))
        ImageDraw.Draw(sheet).text((x+8,y+side+3), f'{index}: {index/rate:.2f}s', fill='white')
    sheet.save(ROOT / f'{source.stem}-review.png')
    native_side,native_columns=192,7
    native=Image.new('RGB',(native_side*native_columns,math.ceil(len(frames)/native_columns)*(native_side+22)),'#202735')
    for i,frame in enumerate(frames):
        tile=frame.copy();tile.thumbnail((native_side,native_side))
        x,y=i%native_columns*native_side,i//native_columns*(native_side+22)
        native.paste(tile,(x+(native_side-tile.width)//2,y+(native_side-tile.height)//2))
        ImageDraw.Draw(native).text((x+6,y+native_side+3),f'{i}: {i/rate:.3f}s',fill='white')
    native.save(ROOT/f'{source.stem}-all-native-review.png')
    preview = [frames[index].resize((512,512),Image.Resampling.LANCZOS) for index in indices]
    preview[0].save(ROOT/f'{source.stem}-review.webp',format='WEBP',save_all=True,
        append_images=preview[1:],duration=round(4000/rate),loop=0,quality=88,method=6)
    borders = []; changes=[]; initial=None
    for index,frame in enumerate(frames):
        rgb = np.asarray(frame).astype(float)
        subject = rgb[:,:,1] - np.maximum(rgb[:,:,0],rgb[:,:,2]) < 60
        if initial is None:initial=subject
        changes.append(int(np.sum(subject!=initial)))
        yy, xx = np.where(subject)
        if len(xx): borders.append(int(min(xx.min(),yy.min(),rgb.shape[1]-1-xx.max(),rgb.shape[0]-1-yy.max())))
        else:borders.append(min(frame.size)//2)
    extremes={'first':0,'last':len(frames)-1,'extent':int(np.argmin(borders)),'motion':int(np.argmax(changes))}
    for label,index in extremes.items():frames[index].save(ROOT/f'{source.stem}-source-{label}.png')
    summary[source.name] = {'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'frames':len(frames),'fps':rate,
        'size':frames[0].size,'minimumBorder':min(borders),'minimumClearanceFraction':round(min(borders)/min(frames[0].size),4),
        'sourceExtremes':extremes,'contact':f'{source.stem}-review.png','allNativeContact':f'{source.stem}-all-native-review.png','preview':f'{source.stem}-review.webp'}
    print(source.name,summary[source.name],flush=True)
(ROOT/'source-review.json').write_text(json.dumps(summary,indent=2)+'\n')

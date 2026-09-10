"""Approved video RGB + AutoSprite alpha, one transform per creature, never per frame.

The remote extractor advertises a 30 Hz sampling grid for the 24 FPS originals.
Measure its alpha-to-source alignment; keep native Every 4 RGB frames at 6 FPS.
The nearest aligned alpha is only an estimate: protect the current source core
and constrain all edges to that source frame's chroma (the validated V3 profile).
"""
from pathlib import Path
import importlib.util
import json
import math
import sys
import av
import numpy as np
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[1]
FRIENDLY = '--friendly' in sys.argv
ROOT = PROJECT / 'artifacts/sorceress' / ('underwater-friendly-guardian' if FRIENDLY else 'underwater-finalists')
OUTPUT = PROJECT / 'public/assets/sprites/silverpond'
module_spec = importlib.util.spec_from_file_location('validated_key', PROJECT / 'scripts/build-mill-turtle-autosprite3-every4.py')
keyer = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(keyer)
SIZE, EVERY = 512, 4
END = {'idle':48, 'attack':32, 'attack-tide':32, 'attack-crystal':48, 'defend':24, 'defeat':32}
NAMES = {'jellyfish':'pearl-jellyfish', 'guardian':'depth-guardian'}
if FRIENDLY:
    NAMES = {'guardian':'depth-guardian-friendly'}

def contact(frames, name, light):
    side, columns = 256, 4
    color = '#e8e8e4' if light else '#182833'
    result = Image.new('RGB', (columns*side, math.ceil(len(frames)/columns)*(side+24)), color)
    for i, frame in enumerate(frames):
        tile = Image.new('RGBA', (side,side), color)
        tile.alpha_composite(frame.resize((side,side),Image.Resampling.LANCZOS))
        x,y = i%columns*side, i//columns*(side+24)
        result.paste(tile.convert('RGB'),(x,y))
        ImageDraw.Draw(result).text((x+8,y+side+4),str(i),fill='#142630' if light else 'white')
    result.save(ROOT / f'{name}-contact-{"light" if light else "dark"}.png')

def process(job):
    with av.open(str(ROOT/job['localFile'])) as video:
        rate = float(video.streams.video[0].average_rate)
        raw = [f.to_image().convert('RGB').resize((SIZE,SIZE),Image.Resampling.LANCZOS) for f in video.decode(video=0)]
    assert rate == 24 and len(raw) >= END[job['label']]+1
    meta = job['keyMetadata']
    assert meta['frameW'] == meta['frameH'] == SIZE
    sheet = Image.open(ROOT/job['keyFile']).convert('RGBA')
    assert sheet.size == (meta['cols']*SIZE,meta['rows']*SIZE)
    masks = []
    for source in raw:
        rgb = np.asarray(source).astype(float)
        masks.append(rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2]) < 55)
    aligned = []
    for i in range(meta['frameCount']):
        x,y = i%meta['cols']*SIZE, i//meta['cols']*SIZE
        alpha = np.asarray(sheet.crop((x,y,x+SIZE,y+SIZE)).getchannel('A'))
        mask = alpha > 127
        ious = [np.sum(m&mask)/max(1,np.sum(m|mask)) for m in masks]
        index = int(np.argmax(ious))
        assert ious[index] > 0.90, f'Geometry mismatch in {job["label"]} frame {i}'
        aligned.append((index,alpha,round(ious[index],4)))
    frames, mapping = [], []
    for index in range(0,END[job['label']]+1,EVERY):
        match = min(range(len(aligned)),key=lambda i:abs(aligned[i][0]-index))
        alpha_index,model_alpha,iou = aligned[match]
        assert abs(alpha_index-index)<=3, f'Unaligned alpha at source {index}'
        _, core = keyer.make_hint_and_core(raw[index])
        frames.append(keyer.conservative_key(raw[index], np.maximum(model_alpha,core)))
        mapping.append({'sourceFrame':index,'alphaFrame':match,'alphaSourceFrame':alpha_index,'alphaIoU':iou})
    return frames, {'source':job['localFile'],'alphaSource':job['keyFile'],'sourceFps':rate,
        'remoteMetadata':meta,'sampleEvery':EVERY,'frameRate':rate/EVERY,'mapping':mapping}

def main():
    manifest = json.loads((ROOT/'jobs.json').read_text())
    OUTPUT.mkdir(parents=True,exist_ok=True)
    metadata = {'pipeline':'Sorceress imagine-1.5 video RGB + aligned AutoSprite V3 alpha + protected core + conservative local despill',
                'frameWidth':SIZE,'frameHeight':SIZE,'creatures':{}}
    for slug,spec in manifest.items():
        actions = {job['label']:process(job) for job in spec['jobs']}
        bounds = [f.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox()
                  for frames,_ in actions.values() for f in frames]
        assert all(bounds)
        left,top = min(b[0] for b in bounds),min(b[1] for b in bounds)
        right,bottom = max(b[2] for b in bounds),max(b[3] for b in bounds)
        assert min(left,top,SIZE-right,SIZE-bottom)>8, 'Rejected: clipped motion'
        extent = max(right-left,bottom-top)+32
        cx,cy = (left+right)/2,(top+bottom)/2
        crop = (round(cx-extent/2),round(cy-extent/2),round(cx-extent/2)+extent,round(cy-extent/2)+extent)
        creature = {'sourceUnion':[left,top,right,bottom],'sharedCrop':crop,'frameTopInset':SIZE,'actions':{}}
        for label,(frames,info) in actions.items():
            frames = [f.crop(crop).resize((SIZE,SIZE),Image.Resampling.LANCZOS) for f in frames]
            creature['frameTopInset'] = min(creature['frameTopInset'], *(f.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()[1] for f in frames))
            name = f'{NAMES[slug]}-{label}'
            folder = ROOT / f'{name}-frames'; folder.mkdir(exist_ok=True)
            for i,frame in enumerate(frames):
                frame.save(folder/f'{i:02}.png')
            sheet = Image.new('RGBA',(SIZE*len(frames),SIZE),(0,0,0,0))
            for i,frame in enumerate(frames): sheet.alpha_composite(frame,(i*SIZE,0))
            destination = OUTPUT/f'{name}.webp'
            sheet.save(destination,format='WEBP',quality=88,method=6,lossless=False,exact=True)
            playback = frames + frames[-2:0:-1] if label=='idle' else frames
            playback[0].save(ROOT/f'{name}-preview.webp',format='WEBP',save_all=True,
                append_images=playback[1:],duration=167,loop=0,quality=88,method=6,exact=True)
            contact(frames,name,False); contact(frames,name,True)
            info.update({'frameCount':len(frames),'sheet':str(destination.relative_to(PROJECT)),
                'playbackFrames':list(range(len(frames)))+list(range(len(frames)-2,0,-1)) if label=='idle' else list(range(len(frames)))})
            creature['actions'][label]=info
            print(name,len(frames),'frames, shared crop',crop,flush=True)
        metadata['creatures'][slug]=creature
    (ROOT/'production.json').write_text(json.dumps(metadata,indent=2)+'\n')

if __name__=='__main__': main()

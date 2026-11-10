"""Approved original video RGB + aligned AutoSprite alpha; one family transform."""
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import shutil
import sys
import av
import numpy as np
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT/'artifacts/sorceress/underwater-expansion'
OUTPUT = PROJECT/'public/assets/sprites/silverpond'
SIZE, EVERY = 512, 4
SPEC = json.loads((PROJECT/'scripts/underwater-expansion-specs.json').read_text())
module_spec = importlib.util.spec_from_file_location('validated_key',PROJECT/'scripts/build-mill-turtle-autosprite3-every4.py')
keyer = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(keyer)
EDGE_DESPILL='After shared resize: soft G-only despill on translucent edges; exact alpha, R/B and fully opaque RGB preserved'

def finish_edges(frame):
    # Lanczos can reintroduce a little green RGB at fractional-alpha boundaries.
    # Never change the silhouette or the opaque turquoise/blue/gold palette.
    rgba=np.asarray(frame).copy();rgb=rgba[:,:,:3].astype(float);alpha=rgba[:,:,3].astype(float)
    neutral=np.maximum(rgb[:,:,0],rgb[:,:,2])+4
    excess=rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2])
    weight=keyer.smoothstep((248-alpha)/96)*keyer.smoothstep((excess-8)/24)*(alpha>0)
    rgba[:,:,1]=np.rint(rgb[:,:,1]-(rgb[:,:,1]-np.minimum(rgb[:,:,1],neutral))*weight).astype(np.uint8)
    assert np.array_equal(rgba[:,:,3],np.asarray(frame)[:,:,3])
    assert np.array_equal(rgba[alpha==255],np.asarray(frame)[alpha==255])
    return Image.fromarray(rgba)

def contact(frames,name,light):
    side, columns = 256, 4
    color = '#e8e8e4' if light else '#182833'
    sheet = Image.new('RGB',(columns*side,math.ceil(len(frames)/columns)*(side+24)),color)
    for i,frame in enumerate(frames):
        tile=Image.new('RGBA',(side,side),color)
        tile.alpha_composite(frame.resize((side,side),Image.Resampling.LANCZOS))
        x,y=i%columns*side,i//columns*(side+24)
        sheet.paste(tile.convert('RGB'),(x,y))
        ImageDraw.Draw(sheet).text((x+8,y+side+4),str(i),fill='#142630' if light else 'white')
    sheet.save(ROOT/f'{name}-contact-{"light" if light else "dark"}.png')

def align_alpha_frames(raw, sheet, meta):
    """Map the service's 30Hz samples to the native 24Hz source in time order.

    Geometry alone is ambiguous during an exhausted/static hold. A monotonic
    sequence constrained by the two measured clocks avoids reusing one old pose
    for every later alpha sample. The IoU acceptance threshold stays unchanged.
    """
    masks=[]
    for source in raw:
        rgb=np.asarray(source).astype(float)
        masks.append(rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2])<55)
    alpha_frames=[];ious=[]
    for i in range(meta['frameCount']):
        x,y=i%meta['cols']*SIZE,i//meta['cols']*SIZE
        alpha=np.asarray(sheet.crop((x,y,x+SIZE,y+SIZE)).getchannel('A'))
        mask=alpha>127
        alpha_frames.append(alpha)
        ious.append([np.sum(m&mask)/max(1,np.sum(m|mask)) for m in masks])
    # AutoSprite reports its own 30Hz decoded clock, not the video's 24Hz clock.
    assert meta['sampleEvery']==EVERY and meta['sourceFps']>0
    stride=24*EVERY/meta['sourceFps']
    expected=[min(len(raw)-1,1+i*stride) for i in range(meta['frameCount'])]
    score=np.full((meta['frameCount'],len(raw)),np.inf)
    previous=np.full(score.shape,-1,dtype=int)
    for i in range(meta['frameCount']):
        for index in range(len(raw)):
            if abs(index-expected[i])>3 or ious[i][index]<=.90:continue
            cost=1-ious[i][index]+.0005*abs(index-expected[i])
            if i==0:score[i,index]=cost;continue
            choices=range(max(0,index-math.ceil(stride)-2),index)
            best=min(choices,key=lambda n:score[i-1,n],default=-1)
            if best>=0 and np.isfinite(score[i-1,best]):
                score[i,index]=score[i-1,best]+cost;previous[i,index]=best
    index=int(np.argmin(score[-1]));assert np.isfinite(score[-1,index]),'No coherent time/geometry alpha alignment'
    indices=[]
    for i in range(meta['frameCount']-1,-1,-1):
        indices.append(int(index));index=int(previous[i,index])
    indices.reverse()
    assert all(a<b for a,b in zip(indices,indices[1:]))
    return [(index,alpha_frames[i],round(float(ious[i][index]),4)) for i,index in enumerate(indices)]

def process(slug,job,approval):
    path=ROOT/job['localFile']
    assert approval.get('approvedBy') and approval['sha256']==hashlib.sha256(path.read_bytes()).hexdigest(), 'Source bytes not approved'
    # A reviewer chooses a continuous native-frame window, never per-frame crops.
    start,end=approval['startFrame'],approval['endFrame']
    assert start>=0 and end>start and (end-start)%EVERY==0
    with av.open(str(path)) as video:
        rate=float(video.streams.video[0].average_rate)
        assert video.streams.video[0].width==video.streams.video[0].height, 'Rejected: non-square source would stretch artwork'
        raw=[f.to_image().convert('RGB').resize((SIZE,SIZE),Image.Resampling.LANCZOS) for f in video.decode(video=0)]
    assert rate==24 and end<len(raw)
    meta=job['keyMetadata']; assert meta['frameW']==meta['frameH']==SIZE
    sheet=Image.open(ROOT/job['keyFile']).convert('RGBA')
    assert sheet.size==(meta['cols']*SIZE,meta['rows']*SIZE)
    aligned=align_alpha_frames(raw,sheet,meta)
    frames,mapping=[],[]
    for index in range(start,end+1,EVERY):
        match=min(range(len(aligned)),key=lambda i:abs(aligned[i][0]-index))
        alpha_index,model_alpha,iou=aligned[match]
        assert abs(alpha_index-index)<=3, f'Unaligned alpha at source {index}'
        _,core=keyer.make_hint_and_core(raw[index])
        frames.append(keyer.conservative_key(raw[index],np.maximum(model_alpha,core)))
        mapping.append({'sourceFrame':index,'alphaFrame':match,'alphaSourceFrame':alpha_index,'alphaIoU':iou})
    return frames,{'source':job['localFile'],'sourceSha256':approval['sha256'],'approvedBy':approval['approvedBy'],
        'alphaSource':job['keyFile'],'sourceFps':rate,'remoteMetadata':meta,'sampleEvery':EVERY,
        'frameRate':rate/EVERY,'sourceWindow':[start,end],'alphaNativeFrames':[index for index,_,_ in aligned],'mapping':mapping}

def export_motion(prefix,label,frames,info):
    name=f'{prefix}-{label}'
    folder=ROOT/f'{name}-frames';folder.mkdir(exist_ok=True)
    for path in folder.glob('*.png'):path.unlink()
    for i,frame in enumerate(frames):frame.save(folder/f'{i:02}.png')
    columns=min(4,len(frames));rows=math.ceil(len(frames)/columns)
    assert rows*SIZE<=2048,'Split the animation into bounded atlases instead of exceeding tablet GPU limits'
    sheet=Image.new('RGBA',(columns*SIZE,rows*SIZE),(0,0,0,0))
    for i,frame in enumerate(frames):sheet.alpha_composite(frame,(i%columns*SIZE,i//columns*SIZE))
    destination=OUTPUT/f'{name}-gpu2048.webp'
    sheet.save(destination,format='WEBP',quality=88,method=6,lossless=False,exact=True)
    playback=frames+frames[-2:0:-1] if label=='idle' else frames
    playback[0].save(ROOT/f'{name}-preview.webp',format='WEBP',save_all=True,append_images=playback[1:],duration=167,loop=0,quality=88,method=6,exact=True)
    contact(frames,name,False);contact(frames,name,True)
    info.update({'frameCount':len(frames),'sheet':str(destination.relative_to(PROJECT)),'sheetColumns':columns,'sheetRows':rows,
        'playbackFrames':list(range(len(frames)))+list(range(len(frames)-2,0,-1)) if label=='idle' else list(range(len(frames)))})

def refine_existing_edges():
    production=json.loads((ROOT/'production.json').read_text())
    if production.get('edgeDespill')==EDGE_DESPILL:
        print('Edge refinement already applied; no repeated color correction');return
    backup=ROOT/'pre-edge-refinement';backup.mkdir(exist_ok=True)
    if not (backup/'production.json').exists():
        for creature in production['creatures'].values():
            for label in creature['actions']:
                name=f'{creature["prefix"]}-{label}-frames'
                shutil.copytree(ROOT/name,backup/name,dirs_exist_ok=True)
        shutil.copy2(ROOT/'production.json',backup/'production.json')
    for creature in production['creatures'].values():
        for label,info in creature['actions'].items():
            frames=[Image.open(backup/f'{creature["prefix"]}-{label}-frames'/f'{i:02}.png').convert('RGBA') for i in range(info['frameCount'])]
            export_motion(creature['prefix'],label,[finish_edges(frame) for frame in frames],info)
            print(creature['prefix'],label,'edge-only RGB refined; alpha unchanged',flush=True)
    production['edgeDespill']=EDGE_DESPILL
    (ROOT/'production.json').write_text(json.dumps(production,indent=2)+'\n')

def main():
    jobs=json.loads((ROOT/'jobs.json').read_text())
    approvals=json.loads((ROOT/'approvals.json').read_text())
    OUTPUT.mkdir(parents=True,exist_ok=True)
    production={'pipeline':'Sorceress imagine-1.5 original video RGB + aligned AutoSprite V3 alpha + protected core + conservative local despill',
        'frameWidth':SIZE,'frameHeight':SIZE,'edgeDespill':EDGE_DESPILL,'creatures':{}}
    for slug,spec in jobs.items():
        assert {j['label'] for j in spec['jobs']}=={'idle','attack','defend','defeat'}
        actions={j['label']:process(slug,j,approvals['videos'][f'{slug}/{j["label"]}']) for j in spec['jobs']}
        bounds=[f.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox() for frames,_ in actions.values() for f in frames]
        assert all(bounds)
        left,top=min(b[0] for b in bounds),min(b[1] for b in bounds)
        right,bottom=max(b[2] for b in bounds),max(b[3] for b in bounds)
        assert min(left,top,SIZE-right,SIZE-bottom)>8,'Rejected: clipped source motion'
        extent=max(right-left,bottom-top)+32
        cx,cy=(left+right)/2,(top+bottom)/2
        crop=(round(cx-extent/2),round(cy-extent/2),round(cx-extent/2)+extent,round(cy-extent/2)+extent)
        creature={'prefix':SPEC[slug]['prefix'],'sourceUnion':[left,top,right,bottom],'sharedCrop':crop,'frameTopInset':SIZE,'actions':{}}
        for label,(frames,info) in actions.items():
            frames=[finish_edges(f.crop(crop).resize((SIZE,SIZE),Image.Resampling.LANCZOS)) for f in frames]
            creature['frameTopInset']=min(creature['frameTopInset'],*(f.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()[1] for f in frames))
            name=f'{SPEC[slug]["prefix"]}-{label}'
            export_motion(SPEC[slug]['prefix'],label,frames,info)
            creature['actions'][label]=info
            print(name,len(frames),'frames, shared crop',crop,flush=True)
        production['creatures'][slug]=creature
    (ROOT/'production.json').write_text(json.dumps(production,indent=2)+'\n')

if __name__=='__main__':
    if '--refine-existing-edges' in sys.argv:refine_existing_edges()
    else:main()

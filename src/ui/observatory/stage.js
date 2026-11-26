import { observatoryAssets, retainObservatoryAssets } from './assets.js';

// Coordinates in this file use the approved 1440 × 900 illustration. Targets
// supplied by the mural are in normalized world space, including its safe inset.
const WIDTH = 1440, HEIGHT = 900;
const PAINTED_MIRROR = { x: 652, y: 450 };
const FIRST_TARGET = { x: .80, y: .25 };
const PLANET_GOLD = '#ffc268';
const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false };
const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const ease = x => (x = clamp(x), x * x * (3 - 2 * x));
const mix = (a, b, t) => a + (b - a) * t;
const between = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
const world = p => ({ x: clamp(p.x) * WIDTH, y: clamp(p.y) * HEIGHT });
const arcY = x => 179 - 75 * Math.sin(Math.PI * clamp((x - 122) / 726));

function drawActor(ctx, actor, frameIndex) {
  const take = actor.motion;
  if (!take || frameIndex == null) {
    ctx.drawImage(actor.still, ...actor.stillRect);
    return;
  }
  const [w, h] = take.frameSize;
  const capacity = take.columns * take.rows;
  const cell = frameIndex % capacity;
  const sheet = take.sheets[Math.floor(frameIndex / capacity)];
  ctx.drawImage(sheet, (cell % take.columns) * w, Math.floor(cell / take.columns) * h,
    w, h, ...take.worldRect);
}

const blinkRests = [2400, 3350, 2800];
function knightFrame(take, now, still) {
  if (!take) return null;
  const frames = take.clips.idle;
  if (still) return frames[0];
  const duration = frames.length * 1000 / take.fps;
  let phase = now % (duration * blinkRests.length + blinkRests.reduce((sum, wait) => sum + wait, 0));
  for (const wait of blinkRests) {
    if (phase < wait) return frames[0];
    phase -= wait;
    if (phase < duration) return frames[Math.floor(phase * take.fps / 1000)];
    phase -= duration;
  }
  return frames[0];
}

function glow(ctx, x, y, radius, color, opacity) {
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, opacity);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(.3, color + '88');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
  ctx.restore();
}

function ray(ctx, from, to, color, energy) {
  if (energy <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
  for (const [width, alpha, tint] of [[13,.07,color],[6,.23,color],[2.9,.82,color],[1.2,1,'#fff9dd']]) {
    ctx.globalAlpha = energy * alpha;
    ctx.lineWidth = width;
    ctx.strokeStyle = tint; ctx.stroke();
  }
  ctx.restore();
}

// The orbit around the four-point glint is also used on gifted mural stars.
function orbit(ctx, p, radius, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, radius, radius * .36, -.46, 0, 2 * Math.PI);
  ctx.strokeStyle = '#57381c'; ctx.lineWidth = 3.3; ctx.stroke();
  ctx.strokeStyle = '#ffe6a5'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.restore();
}

function planetGift(ctx, planet, mirror, destination, age, still, star) {
  const source = { x: Math.min(planet.x, 827), y: planet.y };
  // At the very edge of the doorway the gift comes from the last visible rim.
  const birth = 150, reflection = 555, launch = 605, contact = 1050;
  const sourceLight = still ? .8 : 1 - ease((age - birth) / 500);
  glow(ctx, source.x, source.y, 68, PLANET_GOLD, sourceLight * .75);
  orbit(ctx, source, 46 + (still ? 0 : ease(age / reflection) * 5), sourceLight);
  if (still) {
    ray(ctx, source, mirror, PLANET_GOLD, .76);
    ray(ctx, mirror, destination, PLANET_GOLD, .76);
    orbit(ctx, destination, 17, 1);
    return;
  }
  const reflected = age >= reflection;
  const from = reflected ? mirror : source;
  const to = reflected ? destination : mirror;
  const elapsed = reflected ? (age - launch) / (contact - launch) : (age - birth) / (reflection - birth);
  const head = between(from, to, ease(elapsed));
  const trail = between(from, to, ease(elapsed - .17));
  ray(ctx, trail, head, PLANET_GOLD, .96);
  const reflectionLight = clamp(1 - Math.abs(age - reflection) / 150);
  glow(ctx, mirror.x, mirror.y, 52, PLANET_GOLD, reflectionLight);
  glow(ctx, head.x, head.y, 29, PLANET_GOLD, .9);
  const size = 39;
  ctx.drawImage(star, head.x-size/2, head.y-size/2, size, size);
  orbit(ctx, head, 21, .98);
}

function shadow(ctx, x, y, radius) {
  ctx.save(); ctx.translate(x,y); ctx.scale(1,.17);
  const g=ctx.createRadialGradient(0,0,0,0,0,radius);
  g.addColorStop(0,'#070a15c9'); g.addColorStop(.58,'#05091585'); g.addColorStop(1,'#04091800');
  ctx.fillStyle=g; ctx.fillRect(-radius,-radius,radius*2,radius*2); ctx.restore();
}

export function createStage(host, surface) {
  const canvas = surface?.canvas ?? document.createElement('canvas');
  const releaseAssets = retainObservatoryAssets();
  const assets = observatoryAssets(), room = assets.room();
  const root = host && document.createElement('div');
  if (root) {
    root.className = 'obs-stage-paint';
    root.setAttribute('aria-hidden','true');
    root.append(canvas);
    void room.then(plate => { if (root.isConnected) root.prepend(plate.cloneNode()); }, () => {});
    host.append(root);
  }
  const ctx=canvas.getContext('2d');
  let lastKnightFrame, lastFoxFrame;
  let lastPlanetPixel, lastHue, wasAnimatingLight=false;
  const orbitPath=new Path2D();
  for (let x=123;x<=848;x+=4) {
    if (x===123) orbitPath.moveTo(x,arcY(x));
    else orbitPath.lineTo(x,arcY(x));
  }
  let t=0, sky=0, dead=false, hydrated=false, paused=false, frame=0, lastTick=0;
  let fox, knight, globe, star;
  let target=world(FIRST_TARGET), start=target, end=target, steerAt=-2000, steerMs=405, primed=false;
  let gestureStart=-Infinity, queuedGesture=null;
  let hue='#ffd57b', release=null, finishState=null, landing=null;
  function resize() {
    if (!host.clientWidth) return;
    const density=Math.min(window.devicePixelRatio||1,1.75);
    canvas.width=Math.min(1728,Math.round(host.clientWidth*density));
    canvas.height=Math.round(canvas.width * HEIGHT/WIDTH);
  }
  const observer = host && new ResizeObserver(resize);
  if (observer) { observer.observe(host); resize(); }
  const ready=Promise.all([room, assets.cast()]).then(([, [p,s,k,f]])=>{
    if (dead) return;
    globe=p; star=s; knight=k; fox=f;
    hydrated=true; lastTick=performance.now(); paint(); frame=requestAnimationFrame(tick);
  });
  function stopRelease() {
    const old=release; release=null;
    if (old) old.resolve(false);
  }
  function aimAt(p, options={}) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (options.color && /^#[0-9a-f]{6}$/i.test(options.color)) hue=options.color;
    // Show the first socket immediately. Later redirections happen when the
    // fox physically works the mirror or the planet sends its own gift.
    if (!primed) { target=world(p); start=end=target; primed=true; }
  }
  function reset() {
    stopRelease(); finishState=null;
    target=world(FIRST_TARGET); start=end=target; steerAt=-2000; primed=false;
    gestureStart=-Infinity; queuedGesture=null;
    sky=0; landing=null; hue='#ffd57b';
  }
  function activate(p, options={}) {
    if (dead) return Promise.resolve(false);
    stopRelease(); aimAt(p,options);
    const assisted=options.assisted===true;
    start=target; end=world(p); steerAt=t; steerMs=405;
    if (assisted) {
      return new Promise(resolve=>{release={resolve,start:t,destination:{...end},assisted:true,duration:reduce.matches?260:1050};});
    }
    const distance=Math.hypot(target.x-end.x,target.y-end.y);
    let alignMs=reduce.matches?0:Math.max(210,Math.min(465,distance*.75+190));
    const take=fox?.motion;
    if (take && !reduce.matches) {
      const gestureDuration=take.clips.aim.length*1000/take.fps;
      const nextStart=Math.max(t,gestureStart+gestureDuration);
      // The next question opens at star contact. The last half of the take
      // can finish while the child thinks; quick taps queue behind that tail.
      if (nextStart>t) queuedGesture=nextStart;
      else gestureStart=nextStart;
      steerAt=nextStart; steerMs=Math.max(1,take.releaseFrame*1000/take.fps);
      alignMs=nextStart-t+steerMs;
    }
    const flightMs=reduce.matches?30:360;
    return new Promise(resolve=>{release={resolve,start:t,destination:{...end},alignMs,flightMs,duration:alignMs+flightMs};});
  }
  function finish(success) {
    stopRelease();
    finishState={success:!!success,at:t,from:{...target}};
  }
  function skyMask() {
    ctx.beginPath(); ctx.moveTo(124,370);ctx.lineTo(124,128);
    ctx.quadraticCurveTo(484,-79,846,128);ctx.lineTo(846,374);ctx.closePath();
  }
  function paintActor(name, actor, pose) {
    function draw(cast) {
      if (name==='fox') { shadow(cast,237,649,83); shadow(cast,450,648,62); }
      drawActor(cast,actor,pose);
    }
    if (surface?.paintActor) surface.paintActor(name,actor.motion?.worldRect ?? actor.stillRect,draw);
    else draw(ctx);
  }
  function animatingLight() {
    return !!release || (landing && t-landing.at < 760) || (finishState && t-finishState.at < 1840);
  }
  function paint() {
    const rm=reduce.matches;
    target=between(start,end,rm?1:ease((t-steerAt)/steerMs));
    const planetX=mix(139,905,sky), planetY=arcY(planetX);
    const lightRemaining=finishState && !finishState.success ? (rm?0:1-clamp((t-finishState.at)/700)) : 1;
    const shutter=clamp((905-planetX)/65)*lightRemaining;
    const planetPos={x:Math.min(845,planetX),y:planetY};
    // The ground plane and sequence origins stay fixed between animation frames.
    if (queuedGesture!==null && t>=queuedGesture) {gestureStart=queuedGesture; queuedGesture=null;}
    const take=fox.motion;
    let foxFrame=null, mirror=PAINTED_MIRROR;
    if (take) {
      const frames=take.clips.aim;
      const step=Math.floor((t-gestureStart)*take.fps/1000);
      foxFrame=frames[rm || step<0 || step>=frames.length?0:step];
      const [x,y]=take.mirrorCenters[foxFrame]; mirror={x,y};
    }
    const knightPose=knightFrame(knight.motion,t,rm);
    const planetPixel=Math.round(planetX*canvas.width/WIDTH);
    const moving=animatingLight();
    const redrawLight=!surface?.paintActor || moving || wasAnimatingLight || planetPixel!==lastPlanetPixel
      || foxFrame!==lastFoxFrame || hue!==lastHue;
    if (redrawLight) {
      ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
      ctx.save();skyMask();ctx.clip();
      ctx.setLineDash([1.6,8.1]);ctx.strokeStyle='#c7e2f67d';ctx.lineCap='round';ctx.lineWidth=1.55;
      ctx.stroke(orbitPath);
      ctx.drawImage(globe,planetX-70,planetY-70,140,140); ctx.restore();
    }
    if (!surface?.paintActor || knightPose!==lastKnightFrame) paintActor('knight',knight,knightPose);
    if (!surface?.paintActor || foxFrame!==lastFoxFrame) paintActor('fox',fox,foxFrame);
    lastKnightFrame=knightPose; lastFoxFrame=foxFrame;
    lastPlanetPixel=planetPixel; lastHue=hue; wasAnimatingLight=moving;
    if (!redrawLight) { surface.painted(t,false); return; }
    const inStart=between(planetPos,mirror,40/Math.max(100,Math.hypot(planetPos.x-mirror.x,planetPos.y-mirror.y)));
    ray(ctx,inStart,mirror,'#b7eaff',shutter*.87);
    const aligning=rm?0:1-ease((t-steerAt)/steerMs);
    const beamEnergy=shutter*(1-.64*aligning);
    ray(ctx,mirror,target,hue,beamEnergy*.82);
    glow(ctx,mirror.x,mirror.y,27,'#ffe7a0',shutter*.89);
    glow(ctx,target.x,target.y,16,hue,beamEnergy*.55);
    if (release?.assisted) {
      planetGift(ctx,planetPos,mirror,release.destination,t-release.start,rm,star);
    } else if (release) {
      const flight=(t-release.start-release.alignMs)/release.flightMs;
      // An accepted answer spends the light already held by the mirror, even
      // when the planet crosses the jamb during the short flight to the star.
      if (flight>=0) {
        const orb=between(mirror,release.destination,ease(flight));
        if (!rm) {
          const tail=between(mirror,release.destination,ease(Math.max(0,flight-.16)));
          ray(ctx,tail,orb,hue,.98);
          glow(ctx,orb.x,orb.y,26,hue,.98);glow(ctx,orb.x,orb.y,8,'#fff9d3',.96);
        }
      }
    }
    if (release && t-release.start>=release.duration) {
      const completed=release; release=null;
      landing={at:t,point:completed.destination,color:completed.assisted ? PLANET_GOLD : hue};
      completed.resolve(true);
    }
    if (landing && !rm) {
      const hit=(t-landing.at)/490;
      if (hit<1) glow(ctx,landing.point.x,landing.point.y,12+hit*32,landing.color,1-hit);
    }
    if (finishState?.success && !rm) {
      const progress=clamp((t-finishState.at-160)/1050), focus={x:467,y:444};
      if (progress>0 && progress<1) {
        const p=between(finishState.from,focus,ease(progress));
        p.y-=Math.sin(progress*Math.PI)*97;
        glow(ctx,p.x,p.y,28,hue,.9);glow(ctx,p.x,p.y,8,'#fff5cb',.95);
      }
      const arrives=(t-finishState.at-1200)/640;
      if (arrives>=0&&arrives<1) glow(ctx,focus.x,focus.y,24+arrives*40,hue,1-arrives);
    }
    surface?.painted(t,true);
  }
  function tick(now) {
    if(dead || !hydrated) return;
    const dt=now-lastTick;
    const fps=surface ? (animatingLight() ? 30 : 12) : 40;
    if (dt>=1000/fps && !paused) {
      // Sample the approved video in real visible time. A slow tablet may skip
      // frames without stretching a star flight or delaying the next question.
      t+=dt; lastTick=now;
      if(canvas.width) paint();
    }
    frame=requestAnimationFrame(tick);
  }
  return {
    ready, room, aimAt, activate, reset, finish,
    setPaused(value) { if (paused!==Boolean(value)) {paused=Boolean(value); lastTick=performance.now();} },
    setSky(fraction) {if(Number.isFinite(fraction)) sky=clamp(fraction);},
    destroy() {
      dead=true; stopRelease(); cancelAnimationFrame(frame); observer?.disconnect(); root?.remove(); releaseAssets();
      fox=knight=globe=star=null;
    },
  };
}

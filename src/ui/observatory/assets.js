import { artUrl, illustration } from './mural.js';

const art = '/assets/ui/catacomb-observatory/';
let shared, holders = 0, releaseTimer;

// The guild and its trials share decoded sources. Each Phaser scene still owns
// its display objects and GPU textures. Drop the sources after leaving this flow.
export function retainObservatoryAssets() {
  clearTimeout(releaseTimer);
  holders++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holders === 0) releaseTimer = setTimeout(() => { shared = undefined; }, 1500);
  };
}

function createAssets() {
  const pending = new Map();
  function once(url, load) {
    if (!pending.has(url)) {
      pending.set(url, load(url).catch(error => { pending.delete(url); throw error; }));
    }
    return pending.get(url);
  }
  const image = url => once(url, async path => {
    const img = new Image();
    img.src = path;
    await img.decode();
    return img;
  });
  async function actor(name, stillFile, stillRect) {
    const dir = art + 'actors/' + name + '/';
    const still = image(dir + stillFile);
    const motion = once(dir + 'motion.json', async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(response.statusText);
      const take = await response.json();
      const sheets = await Promise.all(take.pages.map(page => image(dir + page)));
      return { ...take, sheets };
    }).catch(error => {
      console.warn('Using the painted keyframe for ' + name, error);
      return null;
    });
    const [keyframe, take] = await Promise.all([still, motion]);
    return { still: keyframe, stillRect, motion: take };
  }
  return {
    room: () => image(art + 'stage-room.webp'),
    cast: () => Promise.all([
      image(art + 'stage-planet.webp'), image(artUrl('star-lit')),
      actor('knight', 'canonical-cutout.png', [155,250,180,220]),
      actor('fox', 'canonical-cutout.webp', [31,230,844.8,563.2]),
    ]),
    mural: reward => Promise.all([illustration(reward,true), illustration(reward,false), artUrl('star-sleep'), artUrl('star-lit')].map(image)),
  };
}

export function observatoryAssets() { return shared ??= createAssets(); }

export function warmObservatory(reward) {
  const assets = observatoryAssets();
  // A failed speculative load can be retried by the actual trial.
  void Promise.all([assets.room(), assets.cast(), reward && assets.mural(reward)]).catch(() => {});
}

// Register only the author's accepted base companion. The hostile fox is separate.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const source = 'docs/design-drafts/fox-animation-v1';
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (!manifest.authorApprovedForms?.includes('01')) throw Error('Base motion is not author approved');
const form = manifest.forms['01'];
const prefix = 'companion-fox-01';
const out = 'public/assets/sprites/companions';
fs.mkdirSync(out, { recursive: true });
const textures = {}, animations = {};
for (const [motion, entry] of Object.entries(form.motions)) {
  // Casting stays in the review gallery until special abilities are integrated;
  // registering an unused family member would decode another atlas in battle.
  if (motion === 'cast') continue;
  if (entry.direction !== 'forward' || entry.playback.some((frame, index) => frame !== index)) throw Error('Forward-only playback required');
  if (entry.width > 2048 || entry.height > 2048) throw Error('Atlas exceeds tablet budget');
  const filename = path.basename(entry.sheet).replace('fox-01-', `${prefix}-`);
  fs.copyFileSync(path.join(source, entry.sheet), path.join(out, filename));
  const texture = `${prefix}-${motion}-sheet`;
  textures[texture] = { path: `sprites/companions/${filename}`, frameWidth: 512, frameHeight: 512, frameCount: entry.frames };
  animations[`${prefix}-${motion}`] = { texture, frames: { sequence: entry.playback }, frameRate: entry.fps, repeat: motion === 'idle' ? -1 : 0 };
  // Travel and animation can advance at different rates under tablet load.
  // The return waits for both, so the complete forward motion remains visible.
  if (motion === 'attack') animations[`${prefix}-${motion}`].movement = {
    duration: 700, ease: 'Quad.easeOut', waitForComplete: true,
  };
}
animations[`${prefix}-attack-anim`] = structuredClone(animations[`${prefix}-attack`]);
const portrait = `${prefix}-portrait.webp`;
await sharp(path.join(source, form.motions.idle.sheet)).extract({ left: 0, top: 0, width: 512, height: 512 })
  .resize(192, 192).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(path.join(out, portrait));
// Read current shared JSON immediately before writing; only our keys are changed.
function update(filename, action) {
  const original = fs.readFileSync(filename, 'utf8');
  const value = JSON.parse(original); action(value);
  if (fs.readFileSync(filename, 'utf8') !== original) throw Error('Concurrent edit; retry registration');
  fs.writeFileSync(filename, JSON.stringify(value, null, 4) + '\n');
}
update('public/assets/data/textures.json', data => {
  delete data.spritesheets[`${prefix}-cast-sheet`];
  Object.assign(data.spritesheets, textures);
  data.images[`${prefix}-idle-sheet-portrait`] = `sprites/companions/${portrait}`;
});
update('public/assets/data/animations.json', data => { data.pets[prefix] = animations; });
update('public/assets/data/assets.json', data => {
  data.characters.sprites[prefix] = { type: 'sprite', defaultTexture: `${prefix}-idle-sheet`, origin: [0.5, 0.5], scale: 0.5 };
});
update('public/assets/data/pets.json', data => {
  const pet = data.find(pet => pet.id === 'pet_catacomb_A');
  if (!pet) throw Error('Missing canonical companion');
  pet.spriteKey = `${prefix}-idle-sheet`; pet.animPrefix = prefix;
});
console.log('Accepted base companion registered; enemy assets, stats and player saves unchanged.');

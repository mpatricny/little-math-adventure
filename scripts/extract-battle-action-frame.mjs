import sharp from 'sharp';

// One deterministic structural extraction from the approved battle dock.
// The center artwork is unchanged; the mask removes its obsolete side rails.
const source = 'public/assets/ui/mock/battle-hud/v1/action-dock-frame.png';
const destination = 'public/assets/ui/battle/round-action-frame.png';
const mask = Buffer.from(
    '<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="100" cy="100" r="90" fill="white"/>'
    + '<path d="M100 5 L114 19 L100 33 L86 19 Z M100 165 L114 180 L100 195 L86 180 Z" fill="white"/>'
    + '</svg>',
);
await sharp(source).extract({ left: 284, top: 16, width: 200, height: 200 })
    .composite([{ input: mask, blend: 'dest-in' }]).png().toFile(destination);

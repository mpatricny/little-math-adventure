// The observatory paints video frames and star murals directly onto a Phaser
// canvas. These sources are fetched by URL outside the Phaser texture loader.
const directory = 'assets/ui/catacomb-observatory/';
export const observatoryFiles = [
  'stage-room.webp', 'stage-planet.webp', 'mural-star-sleep.webp', 'mural-star-lit.webp',
  ...['rescue', 'attack', 'shield', 'heal', 'strike'].flatMap(reward =>
    [`mural-${reward}.webp`, `mural-etch-${reward}.webp`]),
  'actors/fox/motion.json', 'actors/fox/canonical-cutout.webp', 'actors/fox/adjust-0.webp', 'actors/fox/adjust-1.webp',
  'actors/knight/motion.json', 'actors/knight/canonical-cutout.png', 'actors/knight/idle-0.webp',
].map(file => directory + file).concat([
  'assets/ui/catacomb-crafted-v3/paw-normal.webp', 'assets/ui/catacomb-crafted-v3/paw-active.webp',
]);

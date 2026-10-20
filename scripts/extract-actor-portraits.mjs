import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Static cards already show frame zero. Keep that exact frame, including its
// transparent padding, instead of decoding every motion frame for one portrait.
const dataDir = 'public/assets/data';
const catalogPath = path.join(dataDir, 'textures.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const actors = ['enemies', 'pets'].flatMap(name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8')));
fs.mkdirSync('public/assets/sprites/portraits', { recursive: true });
for (const key of new Set(actors.map(actor => actor.spriteKey))) {
    const sheet = catalog.spritesheets[key];
    if (!sheet) continue;
    const source = sheet.path.startsWith('library:') ? `library/${sheet.path.slice(8)}` : sheet.path;
    const filename = `sprites/portraits/${key}.webp`;
    await sharp(path.join('public/assets', source))
        .extract({ left: 0, top: 0, width: sheet.frameWidth, height: sheet.frameHeight })
        .webp({ lossless: true, effort: 4 }).toFile(path.join('public/assets', filename));
    catalog.images[`${key}-portrait`] = filename;
}
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 4) + '\n');

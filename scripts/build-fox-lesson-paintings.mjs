import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Optional arguments replace the two source paintings. Each light pass follows
// landmarks on its own painting; the heart and the bolt have distinct paths.
const out = path.resolve('public/assets/ui/catacomb-lessons');
await fs.mkdir(out, { recursive: true });
const width = 384, height = 150, count = 24, columns = 4;
const artworks = {
    heal: {
        line: [[250, 251], [271, 248], [295, 230], [312, 225], [337, 234], [353, 245], [369, 245]],
        color: '#b2ff7b', edge: '#ffdc68', travel: .54,
    },
    strike: {
        line: [[232, 273], [265, 270], [323, 270], [385, 272], [432, 274], [478, 278]],
        color: '#ffba28', edge: '#ffdd73', travel: .40,
    },
};
const clamp = v => Math.max(0, Math.min(1, v));
const glow = (x, y, r, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${opacity}" fill="url(#halo)"/>`;
const star = (x, y, r, opacity = 1) => `<path transform="translate(${x} ${y}) scale(${r})" opacity="${opacity}" fill="#fff9d5" d="M0 -1Q.09 -.12 .72 0Q.08 .08 0 1Q-.1 .12 -.72 0Q-.09 -.09 0 -1Z"/>`;
const point = (line, t) => {
    const segment = clamp(t) * (line.length - 1), index = Math.min(line.length - 2, Math.floor(segment));
    const [a, b] = [line[index], line[index + 1]];
    return a.map((n, axis) => n + (b[axis] - n) * (segment - index));
};
function lightFrame(id, frame) {
    const { line, color, edge, travel } = artworks[id], t = frame / (count - 1);
    const end = line.at(-1), from = line[0], charge = Math.sin(Math.PI * clamp(t / .28));
    const flight = (t - .16) / travel, impact = (t - .16 - travel) / (1 - .16 - travel);
    const parts = [];
    if (charge > .01) {
        parts.push(glow(...from, 6 + charge * 15, charge * .8), star(...from, 2 + charge * 8, charge));
        for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI * .58 + .8, radius = (1 - clamp(t / .28)) * (14 + i * 3);
            parts.push(star(from[0] + radius * Math.cos(angle), from[1] + radius * Math.sin(angle), 2.8, charge));
        }
    }
    if (flight >= 0 && flight <= 1.38) {
        for (let i = 8; i >= 0; i--) {
            const u = flight - i * .048;
            if (u < 0 || u > 1) continue;
            const [x, y] = point(line, u), size = 1 - i / 10;
            parts.push(glow(x, y, 2 + size * 12, .84 * size));
            if (i % 2 === 0) parts.push(star(x, y, 1 + size * 5, .88 * size));
        }
    }
    if (impact >= 0 && impact < 1) {
        const p = impact, alpha = Math.sin(Math.PI * clamp(p * 3)) * (1 - p), fade = Math.sin(Math.PI * p);
        parts.push(glow(...end, 16 + p * 30, .92 * (1 - p)), star(...end, (1 - p) * 15, 1 - p));
        if (id === 'heal') {
            // Leaflike sparks follow the painted healing ribbon. Tiny hearts lift
            // from the girl's wounded wrist only after the light reaches her.
            for (let i = 0; i < 3; i++) {
                const u = (p - i * .11) / .76;
                if (u <= 0 || u >= 1) continue;
                const x = end[0] + (i - 1) * 13 + Math.sin(u * Math.PI * 1.3 + i) * 3;
                const y = end[1] - 3 - u * (21 + i * 5);
                parts.push(`<path transform="translate(${x} ${y}) scale(${.57 + Math.sin(u * Math.PI) * .35})" fill="#edff96" stroke="#8de77e" stroke-width=".7" opacity="${Math.sin(Math.PI * u)}" d="M0 4C-10 -1 -7 -8 -2 -6L0 -4Q5 -10 7 -5Q9 -1 0 4Z"/>`);
            }
        } else {
            for (let i = 0; i < 9; i++) {
                const angle = i * Math.PI * 2 / 9 + .15, radius = 6 + Math.sqrt(p) * (21 + i % 3 * 8);
                const x = end[0] + Math.cos(angle) * radius, y = end[1] + Math.sin(angle) * radius;
                const tail = Math.max(0, radius - 11 * (1 - p));
                parts.push(`<path stroke="${edge}" stroke-width="${2.8 * (1 - p)}" stroke-linecap="round" opacity="${1 - p}" d="M${end[0] + Math.cos(angle) * tail} ${end[1] + Math.sin(angle) * tail}L${x} ${y}"/>`, star(x, y, 1.8 + 2 * fade, fade));
            }
            parts.push(`<ellipse cx="${end[0]}" cy="${end[1]}" rx="${8 + 23 * p}" ry="${10 + 29 * p}" stroke="${color}" fill="none" stroke-width="1.7" opacity="${alpha * .75}"/>`);
        }
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 116.5 600 233"><defs><radialGradient id="halo"><stop stop-color="#fffcea"/><stop offset=".17" stop-color="${edge}" stop-opacity=".96"/><stop offset=".42" stop-color="${color}" stop-opacity=".6"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>${parts.join('')}</svg>`);
}
// Four painted poses share a pivot. Blend only the spell as it blooms at the
// point of contact, keeping the recipient and the rest of the scene still.
const contactSheet = 'docs/design-drafts/shared/catacomb-lessons/contact-keyframes.webp';
for (const [index, id] of Object.keys(artworks).entries()) {
    const input = process.argv[index + 2];
    if (input) {
        const source = await sharp(input).resize(1053, 821, { fit: 'cover' }).png().toBuffer();
        const plate = sharp(source);
        // Give the heroine's hair clearance beneath the title. Only the dark
        // masonry at the top is extended; the actors retain their proportions.
        if (id === 'heal') plate.extract({ left: 0, top: 0, width: 1053, height: 796 })
            .extend({ top: 25, bottom: 0, left: 0, right: 0, extendWith: 'mirror' });
        await plate.webp({ quality: 90, effort: 6 }).toFile(path.join(out, id + '.webp'));
    }
    const size = id === 'heal' ? 57 : 63;
    const keyframes = await Promise.all(Array.from({ length: 4 }, (_, i) => sharp(contactSheet)
        .extract({ left: i * 128, top: index * 128, width: 128, height: 128 }).resize(size, size).png().toBuffer()));
    const [x, y] = artworks[id].line.at(-1);
    const left = Math.round(x * width / 600 - size / 2);
    const top = Math.round((y - 116.5) * height / 233 - size / 2);
    const arrival = .16 + artworks[id].travel;
    const frames = await Promise.all(Array.from({ length: count }, async (_, i) => {
        const light = sharp(lightFrame(id, i));
        const t = (i / (count - 1) - arrival) / (1 - arrival);
        if (t > 0 && t < 1) {
            const pose = t * 3, fade = Math.min(1, t * 12, (1 - t) * 8);
            const contacts = [];
            for (const [k, bitmap] of keyframes.entries()) {
                const opacity = Math.max(0, 1 - Math.abs(pose - k)) * fade;
                if (!opacity) continue;
                const input = await sharp(bitmap).linear([1, 1, 1, opacity], [0, 0, 0, 0]).png().toBuffer();
                contacts.push({ input, left, top });
            }
            light.composite(contacts);
        }
        return { input: await light.png().toBuffer(), left: i % columns * width, top: Math.floor(i / columns) * height };
    }));
    await sharp({ create: { width: columns * width, height: Math.ceil(count / columns) * height, channels: 4, background: '#00000000' } })
        .composite(frames).webp({ lossless: true, effort: 6 }).toFile(path.join(out, id + '-light.webp'));
}

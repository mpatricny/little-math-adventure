import Phaser from 'phaser';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { PracticeChoiceControl, type PracticeChoiceRegion as Box } from '../../../src/ui/PracticeChoiceControl';
import { waterHost } from '../../../src/ui/SceneLayoutHost';
import { captureBattleBody } from '../../../src/ui/BattleActorGeometry';
import type { ScenesFile } from '../../../src/types/scenes';
import type { TexturesFile } from '../../../src/types/assets';
import layout from './scenes.json';
import captures from './examples.json';

type Example = keyof typeof captures;
type Creature = { id: string; name: string; portrait: string };
type Owner = { hero: string; coins: number; mana: number; crystals: {tier: string; value: number}[]; newFriend: string | null; completed: boolean[] };
interface Result {
    foes: Creature[]; wave: number | null; backdrop: string; destination: string; nextWave: number | null;
    nextArena: number | null; nextFoe: {name: string; portrait: string} | null; shares: Owner[];
}
type Region = Box & { depth?: number };
type Group = Phaser.GameObjects.Container;
type Prize = { key: string; text: string; color: string; frame?: number };

const art = {
    panel: 'practice-choice-panel-v1', plaque: 'practice-choice-plaque-v1', rail: 'practice-victory-rail',
    ring: 'catacomb-painted-ring', laurels: 'catacomb-detail-laurels', check: 'enamel-check-normal',
    coin: 'practice-victory-coin', mana: 'mana-icon', gems: 'gemstone-icons', paw: 'fox-journey-paw',
    girl: 'town-hud-heroine-portrait', boy: 'town-hud-hero-portrait', slime: 'green-slime-happy',
    arena: 'arena-building', openLock: 'catacomb-progress-journey-lock-open', forest: 'forest-edge-bg', town: 'bg-town',
};
const gold = '#ffebad';
const params = new URLSearchParams(location.search);
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-case]')];
const wordsButton = document.querySelector<HTMLButtonElement>('#words')!;
const requested = params.get('stav');
let selected: Example = requested && Object.hasOwn(captures, requested) ? requested as Example : 'wave';
let withoutWords = params.has('beze-slov');
let preview: VictoryPreview | undefined;
document.body.classList.toggle('stage-only', params.has('platno'));

function prizes(owner: Owner): Prize[] {
    const entries: Prize[] = [{ key: art.coin, text: '+' + owner.coins, color: gold }];
    if (owner.mana) entries.push({ key: art.mana, text: '+' + owner.mana, color: '#a9edff' });
    for (const { tier, value } of owner.crystals) {
        entries.push({ key: art.gems, frame: tier === 'prism' ? 5 : tier === 'fragment' ? 3 : 1,
            text: String(value), color: '#f4dcff' });
    }
    return entries;
}

function updateToolbar(): void {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.case === selected)));
    wordsButton.setAttribute('aria-pressed', String(withoutWords));
}
buttons.forEach(b => b.addEventListener('click', () => {
    selected = b.dataset.case as Example;
    const url = new URL(location.href); url.searchParams.set('stav', selected); history.replaceState(null, '', url);
    preview?.openExample(); updateToolbar();
}));
wordsButton.addEventListener('click', () => {
    withoutWords = !withoutWords; preview?.applyWords(); updateToolbar();
});
updateToolbar();

class VictoryPreview extends Phaser.Scene {
    private builder!: SceneBuilder;
    private content!: Group;
    private owner = 0;
    private destination = false;
    private forward!: PracticeChoiceControl;
    private enableTimer?: Phaser.Time.TimerEvent;
    private readyAt = 0;
    private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private catalog: TexturesFile, private gameLayout: ScenesFile) { super('NormalVictoryPreview'); }
    private get result(): Result { return captures[selected]; }
    private get player(): Owner { return this.result.shares[this.owner]; }
    private hero(owner = this.player): string { return owner.hero === 'boy_knight' ? art.boy : art.girl; }

    preload(): void {
        this.load.json('assets', '/assets/data/assets.json');
        const keys = new Set<string>(Object.values(art));
        for (const result of Object.values(captures)) {
            keys.add(result.backdrop);
            result.foes.forEach(foe => keys.add(foe.portrait));
            if (result.nextFoe) keys.add(result.nextFoe.portrait);
        }
        for (const key of keys) {
            const sheet = this.catalog.spritesheets[key];
            const path = sheet?.path ?? this.catalog.images[key];
            if (!path) throw new Error('Chybí ilustrace ' + key);
            const url = '/assets/' + path.replace(/^library:/, 'library/');
            if (sheet?.frameWidth && sheet.frameHeight) this.load.spritesheet(key, url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
            else this.load.image(key, url);
        }
    }

    create(): void {
        const sharedIds = ['victoryShadeHost', 'practiceVictoryFrame', 'practiceVictoryTitle', 'practiceVictoryContinue'];
        const shared = this.gameLayout.scenes.VictoryScene.elements!.filter(e => sharedIds.includes(e.id));
        const design = layout.scenes.NormalVictoryPreview;
        this.cache.json.add('scenes', { scenes: { NormalVictoryPreview: { ...design, elements: [...shared, ...design.elements] } } });
        this.builder = new SceneBuilder(this);
        this.builder.buildScene('NormalVictoryPreview');
        this.content = this.add.container();
        this.makeGlow();
        preview = this;
        document.getElementById('loading')?.remove();
        const canvas = this.game.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Náhled výhry');
        canvas.addEventListener('keydown', e => {
            if (e.repeat) return;
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.turnPage(); }
            if (this.result.shares.length > 1 && !this.destination && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault(); this.showPlayer(e.key === 'ArrowLeft' ? 0 : 1);
            }
        });
        this.openExample();
    }

    openExample(): void {
        this.owner = 0; this.destination = false;
        this.readyAt = this.time.now + (this.reduced ? 0 : 750);
        this.renderPage();
    }

    private host(id: string) {
        return { ...waterHost(this.builder, id), regions: this.builder.getElementDef(id)?.data?.regions as Record<string, Box> };
    }

    private image(key: string, b: Region, parent: Group = this.content, frame?: number) {
        const image = this.add.image(b.x, b.y, key, frame).setDepth(b.depth ?? 0);
        image.setScale(Math.min(b.width / image.width, b.height / image.height));
        parent.add(image);
        return image;
    }

    private text(value: string, b: Region, size: number, parent: Group = this.content, color = gold, word = true) {
        const label = this.add.text(b.x, b.y, value, {
            fontFamily: 'Gelasio, Georgia, serif', fontStyle: 'bold', fontSize: size, resolution: 2, color,
            shadow: { offsetY: 2, color: '#0b2031', blur: 2, fill: true },
        }).setOrigin(.5).setDepth(b.depth ?? 0).setData('practiceWord', word).setData('safeRegion', b);
        parent.add(label); return label;
    }

    private group(b: Region): Group {
        const group = this.add.container(b.x, b.y).setDepth(b.depth ?? 0);
        this.content.add(group); return group;
    }

    private creature(key: string, b: Region, parent: Group = this.content): void {
        const sprite = this.add.sprite(0, 0, key).setDepth(b.depth ?? 0);
        const body = captureBattleBody(sprite);
        const scale = .95 * Math.min(b.width / (body.right - body.left), b.height / (body.bottom - body.top));
        sprite.setScale(scale).setPosition(b.x - scale * (body.left + body.right) / 2,
            b.y - scale * (body.top + body.bottom) / 2);
        parent.add(sprite);
    }

    private makeGlow(): void {
        const texture = this.textures.createCanvas('result-glow', 256, 256)!;
        const ctx = texture.context, light = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
        light.addColorStop(0, 'rgba(255,234,157,.36)'); light.addColorStop(.46, 'rgba(91,198,190,.21)');
        light.addColorStop(1, 'rgba(41,135,163,0)');
        ctx.fillStyle = light; ctx.fillRect(0, 0, 256, 256); texture.refresh();
    }

    private renderPage(): void {
        this.enableTimer?.remove();
        this.content.removeAll(true);
        const result = this.result, shade = this.host('victoryShadeHost');
        const returnArt = result.destination === 'ForestRoomScene' ? art.forest : result.destination === 'TownScene' ? art.town : result.backdrop;
        const bg = this.image(this.destination ? returnArt : result.backdrop, { ...shade, depth: shade.depth - 1 });
        bg.setScale(Math.max(shade.width / bg.width, shade.height / bg.height));
        this.content.add(this.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x071521, .54).setDepth(shade.depth));
        this.image(art.panel, this.host('practiceVictoryFrame'));
        const title = this.host('practiceVictoryTitle');
        this.image(art.plaque, title);
        const heading = this.destination ? (result.nextWave !== null ? 'Další kolo' : result.destination === 'TownScene' ? 'Město' : 'Zpět do lesa')
            : result.nextArena ? 'Aréna hotová!' : 'Výhra!';
        this.text(heading, { ...title, depth: title.depth + 1 }, heading.length < 8 ? 38 : 33);
        if (this.destination) this.drawDestination();
        else {
            this.drawCreature(); this.drawRewards(); this.drawRoute();
        }
        const action = this.host('practiceVictoryContinue');
        this.forward = new PracticeChoiceControl(this, action, 'forward', art.plaque,
            this.destination ? 'Zpět' : 'Dál', null, () => this.turnPage());
        const arrow = action.regions.arrow;
        this.arrow(this.forward.surface, arrow, this.destination ? -1 : 1);
        this.content.add(this.forward.root);
        const wait = this.readyAt - this.time.now;
        this.forward.setEnabled(wait <= 0);
        if (wait > 0) {
            this.enableTimer = this.time.delayedCall(wait, () => this.forward.setEnabled(true));
        }
        this.content.sort('depth');
        this.applyWords();
        const canvas = this.game.canvas;
        canvas.dataset.example = selected; canvas.dataset.owner = String(this.owner + 1);
        canvas.dataset.screen = this.destination ? 'destination' : 'victory';
    }

    private drawCreature(): void {
        const foe = this.result.foes[0], pet = this.player.newFriend;
        const pair = !pet && this.result.foes.length > 1;
        this.image('result-glow', this.host('creatureHalo'));
        this.image(art.ring, this.host('creatureRing')).setAlpha(.6);
        this.image(art.laurels, this.host('creatureLaurels'));
        const actor = this.host('creature');
        if (pair) {
            const actors = this.group(actor);
            this.creature(foe.portrait, actor.regions.left, actors);
            this.creature(this.result.foes[1].portrait, actor.regions.right, actors);
        } else if (pet && foe.id === 'slime_green') this.image(art.slime, actor);
        else this.creature(foe.portrait, actor);
        const pairs: Record<string, string> = { slime_green: 'Dva slizové', purple_demon: 'Dva démoni' };
        this.text(pet ?? (pair ? pairs[foe.id] : undefined) ?? foe.name, this.host('creatureName'), 33);
        if (pet) {
            const h = this.host('friend'), group = this.group(h);
            this.image(art.paw, h.regions.paw, group);
            this.text('Nový přítel', h.regions.label, 22, group, '#b9e9d2');
        }
        const seam = this.host('seam');
        this.content.add(this.add.rectangle(seam.x, seam.y, seam.width, seam.height, 0xbd975a, .44).setDepth(seam.depth));
    }

    private drawRewards(): void {
        this.text('Odměna', this.host('rewardTitle'), 36);
        const line = this.host('rewardRule');
        this.content.add(this.add.rectangle(line.x, line.y, line.width, line.height, 0xc6a369, .5).setDepth(line.depth));
        this.result.shares.forEach((p, index) => {
            const solo = this.result.shares.length === 1;
            const b = this.host(solo || index === 1 ? 'ownerB' : 'ownerA');
            const portrait = new PracticeChoiceControl(this, b, 'owner' + index, art.ring, '', null,
                () => this.showPlayer(index), false, 1);
            const picture = this.image(this.hero(p), { x: 0, y: 0, width: b.width * .73, height: b.height * .73 }, portrait.surface);
            if (!solo) {
                const selected = this.owner === index;
                portrait.setSelected(selected);
                if (selected) portrait.surface.add(this.add.graphics().lineStyle(3, 0xffdb7c).strokeCircle(0, 0, b.height * .46)
                    .fillStyle(0xffdb7c).fillTriangle(-b.width * .09, b.height * .43, b.width * .09, b.height * .43, 0, b.height * .52));
                else picture.setAlpha(.68);
                this.badge(portrait.surface, { x: 26, y: 26, width: 28, height: 28 }, String(index + 1), 18);
            }
            portrait.setEnabled(!solo);
            this.content.add(portrait.root);
        });
        const h = this.host('rewards'), group = this.group(h), items = prizes(this.player);
        const weights = items.map(item => item.key === art.gems ? .79 : 1.14);
        const sum = weights.reduce((a, b) => a + b, 0);
        const unit = Math.min(136, h.width / sum);
        let left = -sum * unit / 2;
        items.forEach((item, i) => {
            const width = weights[i] * unit, x = left + width / 2, { picture, value } = h.regions;
            left += width;
            this.image(item.key, { ...picture, x }, group, item.frame);
            this.text(item.text, { ...value, x, width }, item.key === art.gems ? 34 : 43, group, item.color, false);
        });
    }

    private badge(parent: Group, b: Box, label: string, size: number): void {
        const g = this.add.graphics().setPosition(b.x, b.y);
        g.fillStyle(0x142938).fillRoundedRect(-b.width / 2, -b.height / 2, b.width, b.height, b.height / 2)
            .lineStyle(2, 0xd2ab60).strokeRoundedRect(-b.width / 2, -b.height / 2, b.width, b.height, b.height / 2);
        parent.add(g); this.text(label, b, size, parent, gold, false);
    }

    private drawRoute(): void {
        const h = this.host('route'), r = h.regions, g = this.group(h);
        this.image(art.rail, { ...h, x: 0, y: 0 }, g);
        const wave = this.result.wave;
        if (wave === null) {
            this.text('Zpět do lesa', this.host('journeyTitle'), 28);
            this.image(art.ring, r.walker, g);
            this.image(this.hero(), { ...r.walker, width: r.walker.width * .77, height: r.walker.height * .77 }, g);
            this.arrow(g, r.trail, 1);
            this.text('Okraj lesa', r.forestName, 25, g);
            this.image(art.forest, r.woods, g);
            return;
        }
        const marks = this.player.completed;
        const heading = this.result.nextArena ? 'Otevřena aréna ' + this.result.nextArena : 'Kolo ' + (wave + 1) + ' z ' + marks.length;
        this.text(heading, this.host('journeyTitle'), 28);
        if (this.result.nextArena) {
            this.image(art.arena, r.openedLandmark, g);
            this.image(art.openLock, r.openedLock, g);
            this.text(String(this.result.nextArena), r.openedNumber, 22, g, gold, false);
        } else this.image(art.arena, r.landmark, g);
        const d = r.divider;
        g.add(this.add.rectangle(d.x, d.y, d.width, d.height, 0xc39b5c, .68));
        const steps = r.steps, step = (steps.width - steps.height) / Math.max(1, marks.length - 1);
        const x0 = steps.x - step * (marks.length - 1) / 2, y = steps.y, radius = steps.height * .37;
        const line = this.add.graphics().lineStyle(5, 0x3b5362).lineBetween(x0, y, x0 + step * (marks.length - 1), y);
        marks.forEach((done, i) => {
            if (done && i > 0 && marks[i - 1]) line.lineStyle(5, 0xe6b858).lineBetween(x0 + step * (i - 1), y, x0 + step * i, y);
        });
        g.add(line);
        marks.forEach((done, i) => {
            const x = x0 + i * step, now = i === wave, next = i === this.result.nextWave;
            const metal = now ? 0xffdd86 : done ? 0xb98d47 : next ? 0x8bd7e9 : 0x667c89;
            const disk = this.add.graphics().setPosition(x, y).fillStyle(done ? 0x383223 : next ? 0x15394b : 0x102434).fillCircle(0, 0, radius)
                .lineStyle(now ? 4 : 2, metal).strokeCircle(0, 0, radius);
            if (now) disk.lineStyle(1.5, 0xe2b767).strokeCircle(0, 0, radius + 6);
            g.add(disk);
            if (done) this.image(art.check, { x, y, width: radius * 1.54, height: radius * 1.54 }, g);
            else this.text(String(i + 1), { x, y, width: radius * 2, height: radius * 2 }, 26, g, next ? '#b9f1ff' : '#9fb2bf', false);
            if (next && i > 0) this.arrow(g, { x: x - step / 2, y, width: 22, height: 18 }, 1);
            if (now && !this.reduced && this.time.now < this.readyAt) {
                const gleam = this.add.graphics().setPosition(x, y).lineStyle(2, 0xffeab5).strokeCircle(0, 0, radius + 7);
                g.add(gleam);
                const t = this.tweens.add({ targets: gleam, scale: 1.23, alpha: 0, duration: 620, ease: 'Sine.easeOut' });
                gleam.once('destroy', () => t.remove());
            }
        });
    }

    private arrow(parent: Group, b: Box, direction: number): void {
        const width = Math.min(b.width * .42, b.height * 1.1), height = b.height * .3;
        const ink = this.add.graphics().setPosition(b.x, b.y).setScale(direction, 1).lineStyle(3.3, 0xffdda1)
            .lineBetween(-width, 0, width, 0).lineBetween(width - height, -height, width, 0).lineBetween(width - height, height, width, 0);
        parent.add(ink);
    }

    private drawDestination(): void {
        const r = this.result;
        const key = r.nextFoe?.portrait ?? (r.destination === 'TownScene' ? art.arena : this.hero());
        const name = r.nextWave !== null ? 'Kolo ' + (r.nextWave + 1) : r.destination === 'TownScene' ? 'Aréna ' + r.nextArena : 'Okraj lesa';
        if (r.nextFoe) this.creature(key, this.host('destinationSign'));
        else this.image(key, this.host('destinationSign'));
        this.text(name, this.host('destinationName'), 38);
    }

    private showPlayer(index: number): void {
        if (this.owner === index) return;
        this.owner = index; this.renderPage();
    }

    private turnPage(): void {
        if (!this.forward.root.getData('enabled') || this.time.now < this.readyAt) return;
        this.destination = !this.destination; this.renderPage();
    }

    applyWords(): void {
        const visit = (o: Phaser.GameObjects.GameObject) => {
            if (o.getData('practiceWord')) (o as Phaser.GameObjects.Text).setVisible(!withoutWords);
            if (o instanceof Phaser.GameObjects.Container) o.list.forEach(visit);
        };
        this.content.list.forEach(visit);
    }

    inspectLayout() {
        const errors: string[] = [], controls: Record<string, { x: number; y: number; width: number; height: number }> = {};
        const labels: string[] = [];
        const visit = (o: Phaser.GameObjects.GameObject) => {
            if (o instanceof Phaser.GameObjects.Text && o.visible) {
                const b = o.getData('safeRegion');
                if (b && (o.width > b.width + 1 || o.height > b.height + 1)) errors.push(o.text + ' mimo vyhrazené místo');
                if (o.frame.source.resolution !== o.style.resolution) errors.push(o.text + ' rozlišení');
                if (o.getData('practiceWord')) labels.push(o.text);
            }
            if (o instanceof Phaser.GameObjects.Container) {
                if (o.input?.enabled) controls[o.name] = { x: o.x, y: o.y, width: o.width, height: o.height };
                o.list.forEach(visit);
            }
        };
        visit(this.content);
        return { errors, controls, labels, enabled: !!this.forward.root.getData('enabled'),
            renderer: this.game.renderer.type === Phaser.CANVAS ? 'canvas' : 'webgl' };
    }
}

export function inspectPreview() { return preview?.inspectLayout(); }

async function start(): Promise<void> {
    async function json(path: string) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(path + ' ' + response.status);
        return response.json();
    }
    const [catalog, gameLayout] = await Promise.all([json('/assets/data/textures.json'), json('/assets/data/scenes.json'),
        document.fonts.load('700 34px Gelasio')]);
    new Phaser.Game({ type: params.get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO, parent: 'stage',
        width: 1280, height: 720, backgroundColor: '#102535', banner: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true },
        scene: [new VictoryPreview(catalog, gameLayout)] });
}
void start().catch((error: Error) => {
    const loading = document.getElementById('loading'); if (loading) loading.textContent = 'Chyba načítání';
    console.error(error);
});

import Phaser from 'phaser';
import type { VictoryData, VictoryLoot } from '../scenes/VictoryScene';
import { actorPortraitKey } from '../loading/actor-portraits';
import type { SceneBuilder } from '../systems/SceneBuilder';
import type { VictoryDestination } from '../loading/victory-destination';
import { captureBattleBody } from './BattleActorGeometry';
import { PracticeChoiceControl, practiceLabel, type PracticeChoiceRegion as Box } from './PracticeChoiceControl';
import { isWaterVictory, victoryArrow, victoryHost } from './VictoryFrame';

type Group = Phaser.GameObjects.Container;
type Region = Box & { depth?: number };
type Prize = { key: string; value: string; color: string; frame?: number; caption?: boolean };

const gold = '#ffebad';
const ring = 'catacomb-painted-ring';

export class BattleVictoryView {
    private readonly content: Group;
    private readonly loot: VictoryLoot;
    private readonly shared: boolean;
    private readonly coins: number;
    private readonly mana: number;
    private readonly hero: string;

    constructor(private scene: Phaser.Scene, private builder: SceneBuilder, private data: VictoryData,
        private destination: VictoryDestination, private owner: number, selectOwner: (index: number) => void) {
        this.loot = data.personalLoot?.[owner] ?? data;
        // Older co-op receipts only identify the owners of the coins.
        // Present their combined haul once when the other awards cannot be attributed.
        this.shared = !!data.coopMode && !data.personalLoot;
        const coinA = data.goldRewardA ?? data.goldReward, coinB = data.goldRewardB ?? data.goldReward;
        this.coins = this.shared ? coinA + coinB : owner ? coinB : coinA;
        const practice = data.coopMode ? [data.practiceRewardA, data.practiceRewardB] : [data.practiceReward];
        const shown = this.shared ? practice : [practice[owner]];
        this.mana = shown.reduce((sum, reward) => sum + (reward?.mana ?? 0), this.loot.arenaMana ?? 0);
        this.hero = this.portrait(owner);
        const body = victoryHost(builder, 'practiceVictoryBody');
        this.content = scene.add.container(body.x, body.y).setDepth(body.depth).setName('battleVictoryResult').setData('owner', owner);
        this.drawCreature();
        this.label(this.shared ? 'Spolu' : 'Odměna', this.host('RewardTitle'), 36).setName('victoryRewardTitle');
        this.rule(this.host('RewardRule'), .5);
        this.drawOwners(selectOwner);
        const rewards = this.host('Rewards');
        this.drawPrizes(this.group(rewards), 0);
        this.drawRoute();
        this.content.sort('depth');
    }

    destroy(): void { this.content.destroy(); }

    remoteSummary(): string {
        const owner = this.shared ? '①②  ' : this.data.coopMode ? (this.owner ? '②  ' : '①  ') : '';
        const gems = (this.loot.crystalDrops ?? []).map(crystal => '💎 ' + crystal.value);
        return owner + ['🪙 +' + this.coins, ...(this.mana ? ['⚡ +' + this.mana] : []), ...gems].join('   ');
    }

    private host(id: string) { return victoryHost(this.builder, 'battleVictory' + id); }

    private portrait(index: number): string {
        const type = index ? this.data.playerBCharacterType : this.data.playerACharacterType;
        return type === 'boy_knight' ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait';
    }

    private group(region: Region): Group {
        const group = this.scene.add.container(region.x, region.y).setDepth(region.depth ?? 0);
        this.content.add(group);
        return group;
    }

    private art(key: string, region: Region, parent = this.content, frame?: number) {
        const image = this.scene.add.image(region.x, region.y, key, frame).setDepth(region.depth ?? 0);
        image.setScale(Math.min(region.width / image.width, region.height / image.height)).setData('waterArtwork', true);
        parent.add(image);
        return image;
    }

    private label(value: string, region: Region, size: number, parent = this.content, color = gold, word = true) {
        const label = practiceLabel(this.scene, value, region, size).setColor(color).setDepth(region.depth ?? 0)
            .setData('practiceWord', word).setData('waterTextBox', region);
        while ((label.width > region.width || label.height > region.height) && size > 14) label.setFontSize(--size);
        parent.add(label);
        return label;
    }

    private rule(region: Region, alpha: number): void {
        this.content.add(this.scene.add.rectangle(region.x, region.y, region.width, region.height, 0xc6a369, alpha)
            .setDepth(region.depth ?? 0));
    }

    private actor(key: string, region: Region, parent: Group): void {
        const sprite = this.scene.add.sprite(0, 0, actorPortraitKey(this.scene, key)).setDepth(region.depth ?? 0);
        const body = captureBattleBody(sprite);
        const scale = .95 * Math.min(region.width / (body.right - body.left), region.height / (body.bottom - body.top));
        sprite.setScale(scale).setPosition(region.x - scale * (body.left + body.right) / 2,
            region.y - scale * (body.top + body.bottom) / 2).setData('waterArtwork', true);
        parent.add(sprite);
    }

    private drawCreature(): void {
        const texture = 'battle-victory-halo';
        if (!this.scene.textures.exists(texture)) {
            const canvas = this.scene.textures.createCanvas(texture, 256, 256)!;
            const ctx = canvas.context;
            const light = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
            light.addColorStop(0, 'rgba(255,234,157,.36)');
            light.addColorStop(.46, 'rgba(91,198,190,.21)');
            light.addColorStop(1, 'rgba(41,135,163,0)');
            ctx.fillStyle = light;
            ctx.fillRect(0, 0, 256, 256);
            canvas.refresh();
        }
        this.art(texture, this.host('CreatureHalo'));
        this.art(ring, this.host('CreatureRing')).setAlpha(.6);
        this.art('catacomb-detail-laurels', this.host('CreatureLaurels'));
        const region = this.host('Creature');
        const friend = this.loot.unlockedPet;
        const foes = this.data.foes ?? [];
        let name = friend?.name ?? foes[0]?.name ?? this.data.enemyName ?? '';
        if (friend) {
            if (friend.spriteKey === 'slime-sheet') this.art('green-slime-happy', region);
            else this.actor(friend.spriteKey, region, this.content);
            const h = this.host('Friend'), group = this.group(h);
            this.art('fox-journey-paw', h.regions.paw, group);
            this.label('Nový přítel', h.regions.label, 22, group, '#b9e9d2');
        } else if (foes.length > 1) {
            const group = this.group(region);
            const width = region.width / foes.length;
            foes.forEach((foe, index) => {
                const box = foes.length === 2 ? region.regions[index ? 'right' : 'left']
                    : { x: (index - (foes.length - 1) / 2) * width, y: 0, width, height: region.height * .75 };
                this.actor(foe.spriteKey, box, group);
            });
            const pairNames: Record<string, string> = { slime_green: 'Dva slizové', purple_demon: 'Dva démoni' };
            name = foes.length === 2 && foes[0].id === foes[1].id ? pairNames[foes[0].id] ?? 'Soupeři' : 'Soupeři';
        } else {
            const key = foes[0]?.spriteKey ?? this.data.enemySpriteKey;
            if (key) this.actor(key, region, this.content);
            else this.art('enamel-check-normal', region);
        }
        if (name) this.label(name, this.host('CreatureName'), 33).setName('victoryCreatureName');
        this.rule(this.host('Seam'), .44);
    }

    private drawOwners(selectOwner: (index: number) => void): void {
        const coop = this.data.coopMode;
        for (let i = 0; i < (coop ? 2 : 1); i++) {
            const host = this.host(coop && i === 0 ? 'OwnerA' : 'OwnerB');
            const portrait = new PracticeChoiceControl(this.scene, host, 'practiceVictoryOwner' + i, ring, '', null,
                () => selectOwner(i), false, 1);
            const hero = this.art(this.portrait(i), host.regions.picture, portrait.surface);
            if (coop) {
                const selected = !this.shared && i === this.owner;
                portrait.setSelected(selected);
                if (selected) {
                    portrait.surface.add(this.scene.add.graphics().lineStyle(3, 0xffdb7c).strokeCircle(0, 0, host.height * .46)
                        .fillStyle(0xffdb7c).fillTriangle(-7, host.height * .43, 7, host.height * .43, 0, host.height * .52));
                } else if (!this.shared) hero.setAlpha(.68);
                const badge = host.regions.badge;
                portrait.surface.add(this.scene.add.circle(badge.x, badge.y, badge.width / 2, 0x142938).setStrokeStyle(2, 0xd2ab60));
                this.label(String(i + 1), badge, 18, portrait.surface, gold, false);
            }
            portrait.setEnabled(!!coop && (!this.shared || !!this.data.practiceRewardA?.journey || !!this.data.practiceRewardB?.journey));
            this.content.add(portrait.root);
        }
    }

    private drawPrizes(group: Group, page: number): void {
        group.removeAll(true);
        const h = this.host('Rewards'), r = h.regions;
        const prizes: Prize[] = [];
        if (this.coins > 0) prizes.push({ key: 'practice-victory-coin', value: '+' + this.coins, color: gold });
        if (this.mana) prizes.push({ key: 'mana-icon', value: '+' + this.mana, color: '#a9edff' });
        for (const crystal of this.loot.crystalDrops ?? []) {
            prizes.push({ key: 'gemstone-icons', frame: crystal.tier === 'prism' ? 5 : crystal.tier === 'fragment' ? 3 : 1,
                value: String(crystal.value), color: '#f4dcff' });
        }
        if (this.loot.crystalOverflow) prizes.push({ key: 'gemstone-icons', frame: 1, value: 'Na zemi', color: '#f4dcff', caption: true });
        if (!prizes.length) {
            this.art('enamel-check-normal', { ...r.picture, x: 0, y: 0 }, group);
            return;
        }
        const paged = prizes.length > 5;
        const perPage = paged ? 4 : 5;
        const count = Math.ceil(prizes.length / perPage);
        const entries = prizes.slice(page * perPage, (page + 1) * perPage);
        const weights = entries.map(p => p.key === 'gemstone-icons' ? .79 : 1.14);
        const sum = weights.reduce((a, b) => a + b, 0);
        const end = paged ? r.more.x - r.more.width / 2 - 6 : h.width / 2;
        const unit = Math.min(136, (end + h.width / 2) / sum);
        let left = (end - h.width / 2 - sum * unit) / 2;
        entries.forEach((item, i) => {
            const width = unit * weights[i], x = left + width / 2;
            left += width;
            this.art(item.key, { ...r.picture, x, width: Math.min(width, r.picture.width) }, group, item.frame);
            if (item.caption) this.label('↓', { ...r.picture, x: x + width * .28, width: width * .4 }, 28, group, gold, false);
            const size = item.caption ? 19 : item.key === 'gemstone-icons' ? 34 : 43;
            this.label(item.value, { ...r.value, x, width }, size, group, item.color, !!item.caption);
        });
        if (paged) {
            const more = new PracticeChoiceControl(this.scene, { ...r.more, depth: h.depth }, 'victoryNextHost',
                'enamel-control-socket', '', null, () => this.drawPrizes(group, (page + 1) % count));
            this.art('enamel-continue-normal', { x: 0, y: 0, width: r.more.width * .65, height: r.more.height * .65 }, more.surface);
            group.add(more.root);
            this.label((page + 1) + '/' + count, r.page, 22, group, '#b9e1ef', false).setName('victoryPageHost');
        }
    }

    private drawRoute(): void {
        const h = this.host('Route'), r = h.regions, group = this.group(h);
        this.art('practice-victory-rail', { ...h, x: 0, y: 0 }, group);
        const wave = this.data.arenaWave, marks = this.loot.completedWaves;
        if (wave !== undefined && marks?.length) {
            const opened = this.loot.firstArenaCompletion && this.data.nextCityArenaLevel;
            const heading = opened ? 'Otevřena aréna ' + opened : 'Kolo ' + (wave + 1) + ' z ' + marks.length;
            this.label(heading, this.host('JourneyTitle'), 28).setName('victoryRouteTitle');
            const landmark = isWaterVictory(this.data) ? this.data.battleBackground : 'arena-building';
            this.art(landmark ?? 'arena-building', opened ? r.openedLandmark : r.landmark, group);
            if (opened) {
                this.art('catacomb-progress-journey-lock-open', r.openedLock, group);
                this.label(String(opened), r.openedNumber, 22, group, gold, false);
            }
            const d = r.divider;
            group.add(this.scene.add.rectangle(d.x, d.y, d.width, d.height, 0xc39b5c, .68));
            this.drawWaves(group, r.steps, wave, marks);
            return;
        }
        this.label(this.destination.heading, this.host('JourneyTitle'), 28).setName('victoryRouteTitle');
        this.art(isWaterVictory(this.data) ? 'enamel-control-socket' : ring, r.walker, group);
        this.art(this.hero, { ...r.walker, width: r.walker.width * .77, height: r.walker.height * .77 }, group);
        victoryArrow(this.scene, group, r.trail);
        this.label(this.destination.place, r.place, 25, group).setName('victoryPlace');
        const dest = r.destination;
        if (this.data.returnScene === 'TvPairingScene') {
            const w = dest.width * .65, h = dest.height * .66;
            group.add(this.scene.add.graphics().setPosition(dest.x, dest.y).lineStyle(4, 0xbbe5f2)
                .strokeRoundedRect(-w / 2, -h / 2, w, h, 6).lineBetween(0, h / 2, 0, h * .68).lineBetween(-w * .22, h * .68, w * .22, h * .68));
        } else {
            const key = this.destination.texture;
            this.art(key && this.scene.textures.exists(key) ? key : 'guild-map-normal-v2', dest, group).setName('victoryDestinationArt');
        }
    }

    private drawWaves(group: Group, region: Box, wave: number, marks: boolean[]): void {
        const { x, y, width, height } = region;
        const step = marks.length > 1 ? (width - height) / (marks.length - 1) : 0;
        const x0 = x - step * (marks.length - 1) / 2, radius = height * .37;
        const path = this.scene.add.graphics().lineStyle(5, 0x3b5362).lineBetween(x0, y, x0 + step * (marks.length - 1), y);
        group.add(path);
        marks.forEach((done, i) => {
            const cx = x0 + i * step, current = i === wave, next = i === this.data.returnData?.wave;
            if (done && marks[i - 1]) path.lineStyle(5, 0xe6b858).lineBetween(cx - step, y, cx, y);
            const metal = current ? 0xffdd86 : done ? 0xb98d47 : next ? 0x8bd7e9 : 0x667c89;
            const disk = this.scene.add.graphics().setPosition(cx, y).fillStyle(done ? 0x383223 : next ? 0x15394b : 0x102434)
                .fillCircle(0, 0, radius).lineStyle(current ? 4 : 2, metal).strokeCircle(0, 0, radius);
            if (current) disk.lineStyle(1.5, 0xe2b767).strokeCircle(0, 0, radius + 6);
            group.add(disk.setName('victoryWave' + i).setData({ done, current, next }));
            if (done) this.art('enamel-check-normal', { x: cx, y, width: radius * 1.54, height: radius * 1.54 }, group);
            else this.label(String(i + 1), { x: cx, y, width: radius * 2, height: radius * 2 }, 26, group, next ? '#b9f1ff' : '#9fb2bf', false);
            if (next && i !== wave) {
                const direction = Math.sign(i - wave);
                victoryArrow(this.scene, group, { x: cx - direction * step / 2, y, width: 22, height: 18 }, direction);
            }
            if (current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const gleam = this.scene.add.graphics().setPosition(cx, y).lineStyle(2, 0xffeab5).strokeCircle(0, 0, radius + 7);
                group.add(gleam);
                this.scene.tweens.add({ targets: gleam, scale: 1.23, alpha: 0, duration: 620, ease: 'Sine.easeOut',
                    onComplete: () => gleam.destroy() });
                gleam.once('destroy', () => this.scene.tweens.killTweensOf(gleam));
            }
        });
    }
}

import Phaser from 'phaser';
import type { VictoryData } from '../scenes/VictoryScene';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GameStateManager } from '../systems/GameStateManager';
import type { PracticeSpeedSnapshot, PracticeVictoryResult } from '../systems/PersonalBattleBonuses';
import type { SceneBuilder } from '../systems/SceneBuilder';
import { drawComparisonSymbol } from './ComparisonProblemView';
import { getExamPresentation } from './ExamPresentation';
import { PracticeChoiceControl, type PracticeChoiceRegion as Box } from './PracticeChoiceControl';
import { actorPortraitKey } from '../loading/actor-portraits';
import { victoryArrow, victoryHost } from './VictoryFrame';

type Group = Phaser.GameObjects.Container;
type Journey = NonNullable<PracticeVictoryResult['journey']>;
type LootIcon = { key: string; frame?: number; value?: string; caption: string };

type TrainingVictory = PracticeVictoryResult & { journey: Journey };
export function isPracticeVictory(reward?: PracticeVictoryResult): reward is TrainingVictory {
    return !!reward?.journey;
}

const cream = '#fff0bd';
const seconds = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
function time(ms: number | null | undefined): string {
    return ms == null ? '—' : seconds.format(ms / 1000) + ' s';
}
function progress(snapshot?: PracticeSpeedSnapshot): number {
    return snapshot?.milestoneMs ? Math.min(1, snapshot.targetMs / snapshot.milestoneMs) : 0;
}

export class PracticeVictoryView {
    private readonly divider: Phaser.GameObjects.Rectangle;
    private readonly content: Group;
    private readonly portraits: PracticeChoiceControl[] = [];
    private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private scene: Phaser.Scene, private builder: SceneBuilder, private data: VictoryData,
        private ownerIndex: number, private reward: TrainingVictory, private selectOwner: (index: number) => void) {
        const divider = this.host('Divider');
        this.divider = scene.add.rectangle(divider.x, divider.y, divider.width, divider.height, 0xbb9658, .48).setDepth(divider.depth);
        const body = this.host('Body');
        this.content = scene.add.container(body.x, body.y).setName('practiceVictoryResult').setDepth(body.depth);
        this.makePortrait(0);
        if (data.coopMode) this.makePortrait(1);
        this.drawResult(ownerIndex);
    }

    destroy(): void {
        this.portraits.forEach(portrait => portrait.root.destroy());
        this.divider.destroy();
        this.content.destroy();
    }

    remoteSummary(): string {
        const reward = this.reward;
        const owner = this.data.coopMode ? (this.ownerIndex ? '②  ' : '①  ') : '';
        return owner + '⏱ ' + time(reward.journey.before?.medianMs) + ' → ' + time(reward.journey.after.medianMs)
            + '    ⚡ ' + (reward.mana ? '+' + reward.mana : '0');
    }

    private host(id: string) {
        return victoryHost(this.builder, 'practiceVictory' + id);
    }

    private art(parent: Group, key: string, b: Box & { depth?: number }, frame?: number) {
        const image = this.scene.add.image(b.x, b.y, key, frame).setDepth(b.depth ?? 0);
        image.setScale(Math.min(b.width / image.width, b.height / image.height)).setData('waterArtwork', true);
        parent.add(image);
        return image;
    }

    private label(parent: Group, name: string, value: string, b: Box & { depth?: number }, size: number, color = cream, word = false) {
        const label = this.scene.add.text(b.x, b.y, value, {
            fontFamily: 'Gelasio, Georgia, serif', fontStyle: 'bold', fontSize: size, resolution: 2, color,
            shadow: { offsetY: 2, color: '#092036', blur: 2, fill: true },
        }).setOrigin(.5).setDepth(b.depth ?? 0).setName(name).setData('waterTextBox', b).setData('practiceWord', word);
        while ((label.width > b.width || label.height > b.height) && size > 15) label.setFontSize(--size);
        parent.add(label);
        return label;
    }

    private clock(parent: Group, b: Box & { depth?: number }): void {
        const r = Math.min(b.width, b.height) * .38;
        parent.add(this.scene.add.graphics().setDepth(b.depth ?? 0).setPosition(b.x, b.y).lineStyle(Math.max(2, r * .15), 0xf5ce79)
            .strokeCircle(0, r * .1, r).lineBetween(0, -r, 0, -r * 1.28).lineBetween(-r * .38, -r * 1.28, r * .38, -r * 1.28)
            .lineBetween(0, -r * .52, 0, r * .1).lineBetween(0, r * .1, r * .46, r * .34));
    }

    private makePortrait(index: number): void {
        const host = this.host(index ? 'PortraitB' : 'PortraitA');
        const type = index ? this.data.playerBCharacterType : this.data.playerACharacterType ?? GameStateManager.getInstance().getPlayer().characterType;
        const control = new PracticeChoiceControl(this.scene, host, 'practiceVictoryOwner' + index, 'catacomb-painted-ring',
            '', null, () => this.selectOwner(index), false, 1);
        this.art(control.surface, type === 'boy_knight' ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait', host.regions.picture);
        const mark = this.scene.add.graphics().setName('selectedOwner').lineStyle(3, 0xffdb83)
            .strokeCircle(0, 0, host.height * .45);
        control.surface.add(mark);
        const b = host.regions.badge;
        control.surface.add(this.scene.add.circle(b.x, b.y, b.width / 2, 0x12324a).setStrokeStyle(2, 0xffdb83));
        this.label(control.surface, 'practiceOwnerNumber' + index, String(index + 1), b, 20);
        control.setEnabled(!!this.data.coopMode);
        this.portraits.push(control);
    }

    private drawResult(index: number): void {
        this.portraits.forEach((p, i) => {
            p.setSelected(i === index);
            (p.surface.getByName('selectedOwner') as Phaser.GameObjects.Graphics).setVisible(i === index);
        });
        const { journey } = this.reward;
        this.content.setData({ owner: index, targetId: journey.targetId });
        const h = this.host('Coins');
        const coins = this.scene.add.container(h.x, h.y).setDepth(h.depth);
        this.content.add(coins);
        this.art(coins, 'practice-victory-coin', h.regions.icon);
        const gold = (index ? this.data.goldRewardB : this.data.goldRewardA) ?? this.data.goldReward;
        this.label(coins, 'victoryCoin' + index, '+' + gold, h.regions.value, 44);
        const loot = this.scene.add.container().setName('practiceVictoryLoot').setDepth(this.host('Loot1').depth);
        this.content.add(loot);
        this.showLoot(loot, index, 0);
        this.showSpeed(journey, this.reward, index);
        this.content.add(this.showJourney(journey, index).root);
        this.content.sort('depth');
    }

    private showLoot(row: Group, index: number, page: number): void {
        row.removeAll(true);
        row.setData('page', page);
        const loot = this.data.personalLoot?.[index] ?? this.data;
        const captions: Record<string, string> = {
            'První dokončené kolo': 'První kolo', 'Za bezchybný souboj!': 'Bez chyby', 'Za první porážku': 'První výhra',
            'Za dokončení arény': 'Za arénu', 'Speciální krystal': 'Vzácný krystal',
        };
        const items: LootIcon[] = (loot.crystalDrops ?? []).map((c, i) => ({
            key: 'gemstone-icons', frame: c.tier === 'fragment' ? 3 : c.tier === 'prism' ? 5 : 1,
            value: String(c.value), caption: captions[loot.crystalLabels?.[i]] ?? 'Krystal',
        }));
        if (loot.arenaMana) items.push({ key: 'mana-icon', value: '+' + loot.arenaMana, caption: 'Za arénu' });
        if (loot.unlockedPet) items.push({ key: actorPortraitKey(this.scene, loot.unlockedPet.spriteKey), caption: 'Nový přítel' });
        if (loot.crystalOverflow) items.push({ key: 'gemstone-icons', frame: 1, value: '↓', caption: 'Na zemi' });
        if (this.data.arenaCompleted && this.data.nextCityArenaLevel !== undefined) {
            items.push({ key: 'catacomb-progress-journey-lock-open', value: String(this.data.nextCityArenaLevel), caption: 'Nová aréna' });
        }
        const perPage = 2;
        items.slice(page * perPage, (page + 1) * perPage).forEach((item, i) => {
            const h = this.host('Loot' + (i + 1)), r = h.regions;
            const group = this.scene.add.container(h.x, h.y).setDepth(h.depth);
            row.add(group);
            this.art(group, item.key, item.value ? r.icon : { ...r.icon, x: 0 }, item.frame);
            if (item.value) this.label(group, 'practiceLootValue' + i, item.value, r.value, 26);
            this.label(group, 'practiceLootCaption' + i, item.caption, r.caption, 17, '#e8d6ac', true);
        });
        if (items.length > perPage) {
            const h = this.host('MoreLoot');
            const more = new PracticeChoiceControl(this.scene, h, 'practiceVictoryMoreLoot', 'enamel-control-socket', '', null,
                () => this.showLoot(row, index, (page + 1) % Math.ceil(items.length / perPage)));
            this.art(more.surface, 'enamel-continue-normal', h.regions.icon);
            row.add(more.root);
        }
        row.sort('depth');
    }

    private showSpeed(journey: Journey, reward: PracticeVictoryResult, index: number): void {
        const before = journey.before?.medianMs ?? null, after = journey.after.medianMs;
        const max = Math.max(before ?? 0, after ?? 0, journey.after.targetMs);
        this.clock(this.content, this.host('Clock'));
        this.label(this.content, 'practiceSpeedTitle', 'Rychlost', this.host('SpeedTitle'), 29, cream, true);
        if (before !== null && after !== null) {
            const tenths = Math.round(after / 100) - Math.round(before / 100);
            const sign = tenths < 0 ? '−' : tenths > 0 ? '+' : '';
            this.label(this.content, 'practiceTimeChange', sign + time(Math.abs(tenths) * 100), this.host('TimeChange'),
                25, tenths < 0 ? '#aff2c7' : '#ccd9e1');
        }
        for (const [id, value] of [['Before', before], ['After', after]] as const) {
            const h = this.host(id), row = this.scene.add.container(h.x, h.y).setDepth(h.depth);
            this.content.add(row);
            this.label(row, 'practice' + id + 'Label', id === 'Before' ? 'Dřív' : 'Teď', h.regions.label, 21, '#c4d7e1', true);
            this.label(row, 'practice' + id + 'Time', time(value), h.regions.time, 27);
            this.bar(row, h.regions.track, (id === 'Before' ? value ?? 0 : before ?? 0) / max,
                (value ?? 0) / max, id === 'Before' ? 0x7597ad : 0xe4ae49);
        }
        const m = this.host('Mana'), owner = this.data.coopMode ? index ? 'B' : 'A' : 'Solo';
        const mana = this.scene.add.container(m.x, m.y).setDepth(m.depth);
        this.content.add(mana);
        this.art(mana, 'mana-icon', m.regions.icon).setAlpha(reward.mana ? 1 : .52);
        this.label(mana, 'victoryMana' + owner + 'ValueHost', reward.mana ? '+' + reward.mana : '0', m.regions.value, 39, '#aeeaff');
        this.label(mana, 'practiceManaTitle', 'Bonus tempa', m.regions.heading, 19, '#c3e4eb', true);
        if (reward.mana && reward.improvement !== null) {
            this.label(mana, 'practiceBonusTimeSaved', '−' + Math.round(reward.improvement * 100) + ' %', m.regions.personalChange, 22, '#aeeaff');
        }
    }

    private bar(parent: Group, b: Box, from: number, to: number, color: number): void {
        const track = this.scene.add.graphics().setPosition(b.x - b.width / 2, b.y - b.height / 2);
        const draw = (fraction: number) => {
            const width = (b.width - 4) * fraction;
            track.clear().fillStyle(0x071b2c).fillRoundedRect(0, 0, b.width, b.height, b.height / 2)
                .lineStyle(1.5, 0x698091).strokeRoundedRect(0, 0, b.width, b.height, b.height / 2);
            if (width > 1) {
                track.fillStyle(color).fillRoundedRect(2, 2, width, b.height - 4, Math.min(width, b.height - 4) / 2);
                track.fillStyle(0xffffff, .19).fillRoundedRect(3, 3, Math.max(0, width - 2), (b.height - 5) / 3, 2);
            }
        };
        parent.add(track);
        draw(this.reduced ? to : from);
        if (!this.reduced && from !== to) {
            const tween = this.scene.tweens.addCounter({ from, to, duration: 620, ease: 'Sine.easeInOut',
                onUpdate: t => draw(t.getValue() ?? to) });
            track.once('destroy', () => tween.remove());
        }
    }

    private showJourney(journey: Journey, index: number): PracticeChoiceControl {
        this.label(this.content, 'practiceJourneyTitle', 'Cesta k lišce', this.host('JourneyTitle'), 28, cream, true);
        const h = this.host('Journey'), r = h.regions;
        const card = new PracticeChoiceControl(this.scene, h, 'practiceVictoryJourney', 'practice-victory-rail', '', null, () => {
            const coop = CoopSessionManager.getInstance();
            const ownerSlot = this.data.coopMode ? index ? coop.getPlayerBSlotIndex() : coop.getPlayerASlotIndex()
                : GameStateManager.getInstance().getActiveSlotIndex() ?? -1;
            this.scene.scene.launch('CatacombOverviewScene', { targetId: journey.targetId, ownerSlot });
            this.scene.scene.sleep();
        });
        const surface = card.surface, module = getExamPresentation(journey.targetId);
        if (journey.targetId === 'comparison_symbols') {
            [0, 1, 2].forEach((sign, i) => surface.add(drawComparisonSymbol(this.scene, sign, r.example.width / 3, 0xffe8aa)
                .setPosition(r.example.x + (i - 1) * r.example.width / 3, r.example.y)));
        } else {
            this.label(surface, 'practiceModuleExample', module.compact.split(/\s{2,}/)[0], r.example, 38);
        }
        const divider = r.divider;
        surface.add(this.scene.add.rectangle(divider.x, divider.y, divider.width, divider.height, 0xc89e57, .65));
        this.label(surface, 'practiceModuleTitle', module.title, r.title, 24, cream, true);
        this.bar(surface, r.track, progress(journey.before), progress(journey.after), 0x59bbda);
        this.clock(surface, r.clock);
        this.label(surface, 'practiceJourneyTime', time(journey.after.milestoneMs), r.currentTime, 22);
        this.label(surface, 'practiceJourneyGoal', time(journey.after.targetMs), r.goalTime, 21);
        const open = journey.after.door !== 'locked';
        const lock = this.art(surface, open ? 'catacomb-progress-journey-lock-open' : 'catacomb-progress-journey-lock-closed', r.gate);
        const light = this.art(surface, open ? 'practice-victory-lock-open-active' : 'practice-victory-lock-closed-active', r.gate).setAlpha(0);
        card.root.on('pointerover', () => light.setAlpha(.85)).on('pointerout', () => light.setAlpha(0))
            .on('pointerupoutside', () => light.setAlpha(0)).on('pointerup', () => light.setAlpha(0));
        if (!this.reduced && open && journey.before?.door === 'locked') {
            const closed = this.art(surface, 'catacomb-progress-journey-lock-closed', r.gate);
            lock.setAlpha(0);
            const reveal = this.scene.tweens.add({ targets: closed, alpha: 0, delay: 620, duration: 220,
                onStart: () => lock.setAlpha(1) });
            closed.once('destroy', () => reveal.remove());
        }
        victoryArrow(this.scene, surface, r.arrow);
        this.art(surface, 'practice-victory-fox', r.fox);
        if (journey.after.door === 'complete') this.label(surface, 'practiceJourneyComplete', '✓', r.gate, 40);
        card.root.setData({ door: journey.after.door, targetId: journey.targetId });
        return card;
    }
}

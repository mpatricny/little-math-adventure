import Phaser from 'phaser';
import { DailyProgressDay, DailyProgressProfile, DailyProgressSystem } from '../systems/DailyProgressSystem';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GameStateManager } from '../systems/GameStateManager';
import { SaveSystem } from '../systems/SaveSystem';
import { ALL_PROBLEM_FORMS, ProblemForm, SubAtomId } from '../types';
import { OverlayBase } from './OverlayBase';

const FORM_COLORS: Record<ProblemForm, number> = {
    result_unknown: 0x58c8f4,
    missing_part: 0xc884ff,
    compare_equation_vs_number: 0xf0b44d,
    compare_equation_vs_equation: 0x67d58a,
};

const FORM_SHORT: Record<ProblemForm, string> = {
    result_unknown: 'VÝSLEDEK',
    missing_part: 'CHYBÍ ČÁST',
    compare_equation_vs_number: 'POROVNÁNÍ',
    compare_equation_vs_equation: '2 ROVNICE',
};

/** Today's learning is prominent; the lower strip preserves seven-day context. */
export class DailyProgressOverlay extends OverlayBase {
    private contentRoot!: Phaser.GameObjects.Container;

    constructor(scene: Phaser.Scene) {
        super(scene, 'DENNÍ POKROK', 1160, 620);
    }

    protected buildContent(area: { x: number; y: number; width: number; height: number }): void {
        this.contentRoot = this.scene.add.container(area.x, area.y);
        this.container.add(this.contentRoot);
    }

    protected onShow(): void {
        this.rebuildContent();
    }

    private rebuildContent(): void {
        this.contentRoot.removeAll(true);
        const state = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance();
        const profiles: DailyProgressProfile[] = [];
        const levels: number[] = [];

        if (coop.isCoopActive()) {
            const entries = [
                {
                    slot: coop.getPlayerASlotIndex(),
                    masteryData: coop.getPlayerAMasteryData(),
                },
                {
                    slot: coop.getPlayerBSlotIndex(),
                    masteryData: coop.getPlayerBMasteryData(),
                },
            ];

            for (const entry of entries) {
                const save = entry.slot >= 0 ? SaveSystem.load(entry.slot) : null;
                if (!save) continue;
                profiles.push({
                    player: save.player,
                    stats: {
                        ...save.mathStats,
                        masteryData: entry.masteryData ?? save.mathStats.masteryData,
                    },
                });
                levels.push(save.player.level);
            }
        }

        const isCoopSummary = profiles.length === 2;
        if (!isCoopSummary) {
            profiles.length = 0;
            profiles.push({ player: state.getPlayer(), stats: state.getMathStats() });
            levels.length = 0;
            levels.push(state.getPlayer().level);
        }

        const days = DailyProgressSystem.getRecentDaysForProfiles(profiles, 7);
        const today = days[days.length - 1];

        this.renderTodayCard(today, 0, 0, 710, 228, levels, isCoopSummary);
        this.renderFocusCard(today, 728, 0, 388, 228);
        this.renderHistory(days, 0, 244, 1116, 282);
    }

    private renderTodayCard(
        day: DailyProgressDay,
        x: number,
        y: number,
        width: number,
        height: number,
        levels: number[],
        isCoop: boolean,
    ): void {
        this.addPanel(x, y, width, height, 0x111c2d, 0xd7a849);
        this.addText(x + 22, y + 16, isCoop ? 'DNES · CO-OP' : 'DNES', isCoop ? 19 : 22, '#ffe29b', true);
        this.addText(x + (isCoop ? 200 : 91), y + 21, this.formatFullDate(day.date), 12, '#8999ad');

        const accuracy = day.attempts > 0 ? `${Math.round(day.correct / day.attempts * 100)} %` : '—';
        this.addText(x + 24, y + 52, `${day.attempts}`, 52, '#ffffff', true);
        this.addText(x + 25, y + 108, 'VYPOČÍTANÝCH\nPŘÍKLADŮ', 10, '#91a5bd', true);
        this.addMetric(x + 180, y + 58, 'SPRÁVNĚ', accuracy, '#7ee59a');
        this.addMetric(
            x + 180,
            y + 112,
            'RYCHLOST',
            day.averageResponseTimeMs > 0 ? `${(day.averageResponseTimeMs / 1000).toFixed(1)} s` : '—',
            '#7fdcf5',
        );

        this.addRewardTile(x + 330, y + 48, 112, 86, 'MINCE', day.coinsEarned, 0xf4c95d);
        this.addRewardTile(x + 452, y + 48, 112, 86, 'MANA', day.manaEarned, 0x63e7f2);
        this.addRewardTile(x + 574, y + 48, 112, 86, 'KRYSTALY', day.crystalsEarned, 0xc985ff);

        const milestoneY = y + 153;
        const milestoneBg = this.scene.add.rectangle(x + 18, milestoneY, width - 36, 56, 0x0b1220, 0.95)
            .setOrigin(0, 0)
            .setStrokeStyle(1, day.milestones.length > 0 ? 0xd7a849 : 0x34455e, 0.8);
        this.contentRoot.add(milestoneBg);
        this.addText(x + 32, milestoneY + 9, 'CO SE DNES NAUČILO', 10, '#91a5bd', true);
        const milestone = day.milestones.length > 0
            ? day.milestones.slice(0, 2).join('  •  ')
            : isCoop
                ? `Bez nové úrovně · hrdinové na úrovních ${levels.join(' a ')}`
                : `Bez nové úrovně · aktuální úroveň hrdiny ${levels[0]}`;
        this.addText(x + 32, milestoneY + 27, milestone, 15, day.milestones.length > 0 ? '#ffe29b' : '#c6cfda', true);
    }

    private renderFocusCard(day: DailyProgressDay, x: number, y: number, width: number, height: number): void {
        this.addPanel(x, y, width, height, 0x101a2a, 0x4a6fa5);
        this.addText(x + 18, y + 16, 'DNEŠNÍ TRÉNINK', 16, '#dbe8f5', true);
        this.addText(x + 18, y + 39, 'Nejčastěji procvičované atomy', 10, '#7f91a8');

        const topAtoms = Object.entries(day.subAtoms)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4) as Array<[SubAtomId, number]>;
        const maxCount = Math.max(1, ...topAtoms.map(([, count]) => count));

        if (topAtoms.length === 0) {
            this.addText(x + width / 2, y + 101, 'Dnes zatím bez příkladů', 15, '#66768b', true, 0.5);
        } else {
            topAtoms.forEach(([id, count], index) => {
                const rowY = y + 68 + index * 31;
                const dot = this.scene.add.circle(x + 29, rowY + 7, 12, 0x17283f)
                    .setStrokeStyle(2, 0x58c8f4, 0.9);
                this.contentRoot.add(dot);
                this.addText(x + 29, rowY + 7, id, 10, '#ffffff', true, 0.5, 0.5);
                this.addText(x + 51, rowY, `${count} příkladů`, 11, '#d3dce7', true);
                const barBg = this.scene.add.rectangle(x + 142, rowY + 5, width - 174, 7, 0x26364b)
                    .setOrigin(0, 0);
                const bar = this.scene.add.rectangle(x + 142, rowY + 5, (width - 174) * count / maxCount, 7, 0x58c8f4)
                    .setOrigin(0, 0);
                this.contentRoot.add([barBg, bar]);
            });
        }

        let legendX = x + 18;
        const legendY = y + height - 25;
        for (const form of ALL_PROBLEM_FORMS) {
            if (day.forms[form] <= 0) continue;
            const dot = this.scene.add.circle(legendX + 4, legendY + 5, 4, FORM_COLORS[form]);
            this.contentRoot.add(dot);
            this.addText(legendX + 12, legendY, `${FORM_SHORT[form]} ${day.forms[form]}`, 8, '#8fa0b4', true);
            legendX += 88;
        }
    }

    private renderHistory(days: DailyProgressDay[], x: number, y: number, width: number, height: number): void {
        this.addPanel(x, y, width, height, 0x0d1625, 0x344d68);
        this.addText(x + 20, y + 15, 'POSLEDNÍCH 7 DNÍ', 16, '#dbe8f5', true);
        this.addText(x + 196, y + 19, 'aktivita · přesnost · procvičované formy', 10, '#71849a');

        const gap = 10;
        const cardWidth = (width - 40 - gap * 6) / 7;
        const cardTop = y + 50;
        const cardHeight = height - 68;
        const maxAttempts = Math.max(1, ...days.map(day => day.attempts));

        days.forEach((day, index) => {
            const cardX = x + 20 + index * (cardWidth + gap);
            const isToday = index === days.length - 1;
            const card = this.scene.add.rectangle(cardX, cardTop, cardWidth, cardHeight, isToday ? 0x182a42 : 0x111d2d, 0.98)
                .setOrigin(0, 0)
                .setStrokeStyle(isToday ? 2 : 1, isToday ? 0xd7a849 : 0x2b4058, isToday ? 1 : 0.7);
            this.contentRoot.add(card);

            this.addText(cardX + cardWidth / 2, cardTop + 13, this.formatWeekday(day.date), 11, isToday ? '#ffe29b' : '#9aacbf', true, 0.5);
            this.addText(cardX + cardWidth / 2, cardTop + 31, this.formatShortDate(day.date), 9, '#687b91', false, 0.5);

            const barMaxHeight = 68;
            const barHeight = day.attempts > 0 ? Math.max(5, barMaxHeight * day.attempts / maxAttempts) : 2;
            const barY = cardTop + 124;
            const activityBar = this.scene.add.rectangle(
                cardX + cardWidth / 2,
                barY - barHeight / 2,
                25,
                barHeight,
                day.attempts > 0 ? 0x58c8f4 : 0x26374a,
                day.attempts > 0 ? 0.95 : 0.55,
            );
            this.contentRoot.add(activityBar);
            this.addText(cardX + cardWidth / 2, cardTop + 134, `${day.attempts}`, 18, '#f1f6fb', true, 0.5);
            const accuracy = day.attempts > 0 ? Math.round(day.correct / day.attempts * 100) : 0;
            this.addText(cardX + cardWidth / 2, cardTop + 157, day.attempts > 0 ? `${accuracy} % správně` : 'bez hry', 9, day.attempts > 0 ? '#7ee59a' : '#5c6b7e', true, 0.5);

            const previousActiveDay = days.slice(0, index).reverse().find(candidate => candidate.attempts > 0);
            if (day.attempts > 0 && previousActiveDay) {
                const previousAccuracy = Math.round(previousActiveDay.correct / previousActiveDay.attempts * 100);
                const change = accuracy - previousAccuracy;
                const trend = change === 0 ? 'beze změny' : `${change > 0 ? '+' : ''}${change} bodů`;
                this.addText(
                    cardX + cardWidth / 2,
                    cardTop + 174,
                    trend,
                    8,
                    change > 0 ? '#ffe29b' : change < 0 ? '#dc8791' : '#75869a',
                    true,
                    0.5,
                );
            }

            const formTotal = Math.max(1, day.attempts);
            let segmentX = cardX + 12;
            const segmentY = cardTop + cardHeight - 18;
            for (const form of ALL_PROBLEM_FORMS) {
                const segmentWidth = (cardWidth - 24) * day.forms[form] / formTotal;
                if (segmentWidth <= 0) continue;
                const segment = this.scene.add.rectangle(segmentX, segmentY, segmentWidth, 5, FORM_COLORS[form])
                    .setOrigin(0, 0);
                this.contentRoot.add(segment);
                segmentX += segmentWidth;
            }
            if (day.milestones.length > 0) {
                this.addText(cardX + cardWidth - 14, cardTop + 13, '★', 13, '#ffe29b', true, 0.5);
            }
        });
    }

    private addPanel(x: number, y: number, width: number, height: number, fill: number, stroke: number): void {
        const panel = this.scene.add.rectangle(x, y, width, height, fill, 0.97)
            .setOrigin(0, 0)
            .setStrokeStyle(1, stroke, 0.8);
        this.contentRoot.add(panel);
    }

    private addMetric(x: number, y: number, label: string, value: string, color: string): void {
        this.addText(x, y, label, 9, '#7f91a8', true);
        this.addText(x, y + 16, value, 19, color, true);
    }

    private addRewardTile(x: number, y: number, width: number, height: number, label: string, value: number, color: number): void {
        const tile = this.scene.add.rectangle(x, y, width, height, 0x0b1321, 0.96)
            .setOrigin(0, 0)
            .setStrokeStyle(1, color, 0.7);
        this.contentRoot.add(tile);
        this.addText(x + width / 2, y + 14, label, 9, `#${color.toString(16).padStart(6, '0')}`, true, 0.5);
        this.addText(x + width / 2, y + 41, `+${value}`, 25, '#ffffff', true, 0.5);
    }

    private addText(
        x: number,
        y: number,
        value: string,
        size: number,
        color: string,
        bold: boolean = false,
        originX: number = 0,
        originY: number = 0,
    ): Phaser.GameObjects.Text {
        const text = this.scene.add.text(x, y, value, {
            resolution: 2,
            fontFamily: bold ? 'Palatino Linotype, Book Antiqua, Georgia, serif' : 'Arial, sans-serif',
            fontSize: `${size}px`,
            fontStyle: bold ? 'bold' : 'normal',
            color,
        }).setOrigin(originX, originY);
        this.contentRoot.add(text);
        return text;
    }

    private formatWeekday(dateKey: string): string {
        return new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' })
            .format(this.dateFromKey(dateKey))
            .replace('.', '')
            .toUpperCase();
    }

    private formatShortDate(dateKey: string): string {
        return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' }).format(this.dateFromKey(dateKey));
    }

    private formatFullDate(dateKey: string): string {
        return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long' }).format(this.dateFromKey(dateKey));
    }

    private dateFromKey(dateKey: string): Date {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day, 12);
    }
}

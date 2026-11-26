import { isAdvancedNode } from '../systems/AdvancedCurriculum';
import { getExamPresentation } from './ExamPresentation';
import Phaser from 'phaser';
import { DailyProgressDay, DailyProgressSystem } from '../systems/DailyProgressSystem';
import { LearningProfileOptions, SKILL_LABELS, SKILL_SYMBOLS } from '../systems/LearningProfileView';
import { getLearningBand, getLearningFrontier } from '../systems/LearningProgress';
import { BAND_RANGES } from '../systems/MathSkillRules';
import { SceneBuilder } from '../systems/SceneBuilder';
import { LearningOverlay } from './LearningOverlay';
import { destroyLearningLayout, LearningButton, learningCard, learningHost, learningText, LEARNING_MUTED, LEARNING_TEAL } from './LearningUi';

/** Personal dated history. Browsing never switches the player who is playing. */
export class DailyProgressOverlay extends LearningOverlay {
    private readonly dailyLayout: SceneBuilder;
    private readonly contentRoot: Phaser.GameObjects.Container;
    private selectedDate: string | null = null;
    private weekStart: string | null = null;

    constructor(scene: Phaser.Scene, options: LearningProfileOptions = {}) {
        super(scene, 'DENNÍ POKROK', options);
        this.dailyLayout = new SceneBuilder(scene); this.dailyLayout.buildScene('DailyProgressLayout');
        this.contentRoot = scene.add.container(); this.container.add(this.contentRoot);
    }

    protected renderProfile(): void {
        if (!this.profile) return;
        const today = DailyProgressSystem.dateKey(Date.now());
        this.selectedDate ??= today;
        this.weekStart ??= this.startOfWeek(this.selectedDate);
        this.contentRoot.removeAll(true);
        const weekEnd = this.shiftDate(this.weekStart, 6);
        const days = DailyProgressSystem.getRecentDays(this.profile.player, this.profile.stats, 7, this.date(weekEnd).getTime());
        const day = days.find(entry => entry.date === this.selectedDate)!;
        const summary = DailyProgressSystem.getSummary(this.profile.player, this.profile.stats);
        const training = this.currentTraining();
        this.contentRoot.setData({ profileSlot: this.profile.slotIndex, day, summary, training, weekStart: this.weekStart });

        const total = learningHost(this.dailyLayout, 'summary');
        learningCard(this.scene, this.contentRoot, total.x, total.y, total.width, total.height);
        this.textAt('summaryLabel', 'CELKEM', 18, LEARNING_MUTED, 'left');
        this.textAt('summaryAttempts', `✎ ${summary.attempts}`, 26);
        this.textAt('summaryCorrect', `✓ ${summary.correct}`, 26);
        this.textAt('summaryAccuracy', summary.accuracy === null ? '—' : `${Math.round(summary.accuracy * 100)} %`, 26);
        this.textAt('date', `${day.date === today ? 'DNES' : 'DEN'} · ${this.fullDate(day.date)}`, 23);

        this.renderMetric(1, '◷', 'Čas hry', this.playTime(day.playTimeMs), day.playTimeMs === null ? 27 : 35);
        this.renderMetric(2, '✎', 'Příklady', `${day.attempts}`, 42);
        this.renderMetric(3, '✓', 'Úspěšnost', day.attempts ? `${Math.round(day.correct / day.attempts * 100)} %` : '—', 38);
        const accuracy = learningHost(this.dailyLayout, 'metric3');
        learningText(this.scene, this.contentRoot, accuracy.x, accuracy.y + 40, `✓ ${day.correct}   ✕ ${day.wrong}`, 17, LEARNING_MUTED);

        const h = learningHost(this.dailyLayout, 'metric4');
        learningCard(this.scene, this.contentRoot, h.x, h.y, h.width, h.height);
        learningText(this.scene, this.contentRoot, h.x, h.y - 37, 'Trénuje teď', 18);
        learningText(this.scene, this.contentRoot, h.x - 48, h.y - 1, training.range, 29);
        learningText(this.scene, this.contentRoot, h.x + 45, h.y - 1, training.symbol,
            training.symbol === '< = >' ? 40 : training.symbol.length > 3 ? 24 : 38);
        learningText(this.scene, this.contentRoot, h.x, h.y + 40, training.label, 18, LEARNING_MUTED);

        const average = learningHost(this.dailyLayout, 'average');
        learningCard(this.scene, this.contentRoot, average.x, average.y, average.width, average.height);
        this.textAt('averageLabel', '◷ ✓ Průměr správně', 18, LEARNING_MUTED);
        this.textAt('averageValue', day.averageResponseTimeMs > 0
            ? `${new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(day.averageResponseTimeMs / 1000)} s`
            : '—', 25);

        const available = DailyProgressSystem.getAvailableDateRange(this.profile.player, this.profile.stats);
        const firstWeek = this.startOfWeek(available.firstDate);
        const currentWeek = this.startOfWeek(today);
        new LearningButton(this.scene, this.contentRoot, learningHost(this.dailyLayout, 'historyPrevious'),
            'dailyWeekPrevious', '', '‹', () => this.changeWeek(-1)).setEnabled(this.weekStart > firstWeek);
        new LearningButton(this.scene, this.contentRoot, learningHost(this.dailyLayout, 'historyNext'),
            'dailyWeekNext', '', '›', () => this.changeWeek(1)).setEnabled(this.weekStart < currentWeek);
        new LearningButton(this.scene, this.contentRoot, learningHost(this.dailyLayout, 'historyToday'),
            'dailyToday', 'DNES', '↶', () => {
                this.selectedDate = DailyProgressSystem.dateKey(Date.now());
                this.weekStart = this.startOfWeek(this.selectedDate); this.renderProfile();
            }).setEnabled(this.selectedDate !== today || this.weekStart !== currentWeek);
        this.textAt('historyTitle', `${this.shortDate(this.weekStart)} – ${this.fullDate(weekEnd)}`, 19, LEARNING_MUTED);
        const max = Math.max(1, ...days.map(entry => entry.attempts));
        days.forEach((entry, index) => this.renderHistoryDay(entry, index, max, today));
    }

    private renderMetric(index: number, symbol: string, label: string, value: string, valueSize: number): void {
        const h = learningHost(this.dailyLayout, `metric${index}`);
        learningCard(this.scene, this.contentRoot, h.x, h.y, h.width, h.height, index === 2);
        learningText(this.scene, this.contentRoot, h.x - 76, h.y - 37, symbol, 28);
        learningText(this.scene, this.contentRoot, h.x + 14, h.y - 37, label, 18);
        learningText(this.scene, this.contentRoot, h.x, h.y + 2, value, valueSize)
            .setName(index === 1 ? 'dailyPlayTime' : index === 2 ? 'dailyAttempts' : 'dailyAccuracy');
    }

    private currentTraining(): { range: string; symbol: string; label: string } {
        const data = this.profile.stats.masteryData;
        const comparison = data.comparisonChapter?.status === 'training' || data.comparisonChapter?.status === 'exam_ready';
        const band = comparison ? 'A' : getLearningBand(data);
        const domain = BAND_RANGES[band];
        const skill = getLearningFrontier(data);
        if (!comparison && isAdvancedNode(skill)) {
            const presentation = getExamPresentation(skill);
            return { range: presentation.range, symbol: presentation.compact, label: presentation.title };
        }
        const ordinal = Number(skill[1]) - 1;
        return {
            range: `${domain.minResult}–${domain.maxResult}`,
            symbol: comparison ? '< = >' : SKILL_SYMBOLS[ordinal],
            label: comparison ? 'Porovnávání' : band === 'E' ? 'Přes 10' : SKILL_LABELS[ordinal],
        };
    }

    private renderHistoryDay(day: DailyProgressDay, index: number, max: number, today: string): void {
        const h = learningHost(this.dailyLayout, `historyDay${index + 1}`);
        const button = new LearningButton(this.scene, this.contentRoot, h, `dailyHistory:${index}`, '', '', () => {
            this.selectedDate = day.date; this.renderProfile();
        }, this.selectedDate === day.date).setEnabled(day.date <= today);
        button.root.setData('date', day.date);
        const weekday = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' }).format(this.date(day.date)).replace('.', '').toUpperCase();
        learningText(this.scene, button.surface, 0, -37, weekday, 16);
        learningText(this.scene, button.surface, 0, -16, this.shortDate(day.date), 14, LEARNING_MUTED);
        const height = day.attempts ? Math.max(4, 20 * day.attempts / max) : 2;
        button.surface.add(this.scene.add.rectangle(0, 17 - height / 2, 32, height, day.attempts ? LEARNING_TEAL : 0xcbb987));
        learningText(this.scene, button.surface, 0, 34, day.date <= today ? `${day.attempts}` : '—', 23);
    }

    private changeWeek(direction: -1 | 1): void {
        this.weekStart = this.shiftDate(this.weekStart!, direction * 7);
        const today = DailyProgressSystem.dateKey(Date.now());
        this.selectedDate = [this.shiftDate(this.selectedDate!, direction * 7), today].sort()[0];
        this.renderProfile();
    }
    private textAt(id: string, text: string, size: number, color = '#244944', align: 'left' | 'center' = 'center'): void {
        const host = learningHost(this.dailyLayout, id);
        learningText(this.scene, this.contentRoot, host.x, host.y, text, size, color, align).setName(`daily:${id}`);
    }
    private playTime(ms: number | null): string {
        if (ms === null) return 'Neměřeno';
        if (ms > 0 && ms < 60000) return `${Math.floor(ms / 1000)} s`;
        const minutes = Math.floor(ms / 60000);
        return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    }
    private date(key: string): Date { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    private shiftDate(key: string, days: number): string {
        const date = this.date(key); date.setDate(date.getDate() + days); return DailyProgressSystem.dateKey(date.getTime());
    }
    private startOfWeek(key: string): string { return this.shiftDate(key, -((this.date(key).getDay() + 6) % 7)); }
    private shortDate(key: string): string { return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' }).format(this.date(key)); }
    private fullDate(key: string): string { return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(this.date(key)); }
    public destroy(): void {
        if (this.dailyLayout) destroyLearningLayout(this.scene, this.dailyLayout, 'DailyProgressLayout');
        super.destroy();
    }
}

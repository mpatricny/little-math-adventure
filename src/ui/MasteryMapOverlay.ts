import Phaser from 'phaser';
import { OverlayBase } from './OverlayBase';
import { ScrollablePanel } from './ScrollablePanel';
import { MasterySystem } from '../systems/MasterySystem';
import { SUB_ATOM_EXAM_REQUIREMENTS } from '../systems/ExamProgress';
import { GameStateManager } from '../systems/GameStateManager';
import { ProblemDatabase } from '../systems/ProblemDatabase';
import {
    ALL_BANDS, ALL_SUB_ATOM_NUMBERS, ALL_PROBLEM_FORMS,
    BandId, SubAtomId, ProblemForm, MasteryState,
} from '../types';

const SUB_ATOM_NAMES: Record<string, string> = {
    A1: 'Sčítání (0-5)', A2: 'Odčítání (0-5)', A3: 'Tři operandy (0-5)', A4: 'Mix (0-5)',
    B1: 'Sčítání (6-8)', B2: 'Odčítání (6-8)', B3: 'Tři operandy (6-8)', B4: 'Mix (6-8)',
    C1: 'Sčítání (0-10)', C2: 'Odčítání (0-10)', C3: 'Tři operandy (0-10)', C4: 'Mix (0-10)',
    D1: 'Sčítání (11-20)', D2: 'Odčítání (11-20)', D3: 'Tři operandy (11-20)', D4: 'Mix (11-20)',
    E1: 'Sčítání přes 10', E2: 'Odčítání přes 10', E3: 'Tři operandy (0-20)', E4: 'Mix (0-20)',
};

const BAND_RANGES: Record<string, string> = {
    A: '0-5', B: '6-8', C: '0-10', D: '11-20', E: '0-20',
};

const FORM_LABELS: Record<ProblemForm, string> = {
    result_unknown: 'Najdi výsledek',
    missing_part: 'Doplň chybějící část',
    compare_equation_vs_number: 'Porovnej příklad s číslem',
    compare_equation_vs_equation: 'Porovnej dva příklady',
};

const STATE_COLORS: Record<MasteryState, number> = {
    locked: 0x555555,
    training: 0x4488ff,
    secure: 0x44cc44,
    fluent: 0xffaa00,
    mastery: 0xff44ff,
};

const STATE_LABELS: Record<MasteryState, string> = {
    locked: 'Zamčeno',
    training: 'Procvičování',
    secure: 'Jistota',
    fluent: 'Plynulost',
    mastery: 'Mistrovství',
};

/**
 * Mastery Map overlay — detailed mastery progress per sub-atom with
 * collapsible per-form breakdowns, response times, and progress bars.
 */
export class MasteryMapOverlay extends OverlayBase {
    private scrollPanel!: ScrollablePanel;
    private expandedSubAtoms: Set<string> = new Set();
    private savedScrollOffset: number = 0;

    constructor(scene: Phaser.Scene) {
        super(scene, 'MAPA UČENÍ', 1150, 610);
    }

    protected buildContent(area: { x: number; y: number; width: number; height: number }): void {
        this.scrollPanel = new ScrollablePanel(this.scene, this.container, area);
    }

    protected onShow(): void {
        this.rebuildContent();
    }

    /** Opens the map directly on one atom; useful for contextual links and QA. */
    public showNode(subAtomId: SubAtomId): void {
        this.expandedSubAtoms.clear();
        this.expandedSubAtoms.add(subAtomId);
        this.show();
    }

    private rebuildContent(): void {
        this.savedScrollOffset = this.scrollPanel.getScrollOffset();
        this.scrollPanel.clearContent();
        const content = this.scrollPanel.getContent();
        const mastery = MasterySystem.getInstance();
        const data = GameStateManager.getInstance().getMasteryData();
        const problemDb = ProblemDatabase.getInstance();

        let yOffset = 0;
        const totalWidth = 1090;

        yOffset = this.renderMapIntro(content, yOffset, totalWidth);

        for (const bandId of ALL_BANDS) {
            const band = data.bands[bandId];
            yOffset = this.renderBandMap(content, bandId, band.state, data, yOffset, totalWidth);

            // The map stays clean until a node is selected. Only then do the
            // existing detailed form/accuracy/speed metrics unfold below it.
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const saId = `${bandId}${num}` as SubAtomId;
                if (this.expandedSubAtoms.has(saId)) {
                    const sa = data.subAtoms[saId];
                    yOffset = this.renderExpandedDetail(content, saId, sa, mastery, data, problemDb, yOffset, totalWidth);
                }
            }

            yOffset += 18;
        }

        this.scrollPanel.setContentHeight(yOffset);
        this.scrollPanel.setScrollOffset(this.savedScrollOffset);
    }

    private renderMapIntro(
        content: Phaser.GameObjects.Container,
        yOffset: number,
        width: number,
    ): number {
        const intro = this.scene.add.rectangle(0, yOffset, width, 50, 0x101929, 0.98)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0x425c78, 0.7);
        content.add(intro);
        content.add(this.scene.add.text(18, yOffset + 10, 'CESTA ATOMŮ', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#f2d58a',
        }));
        content.add(this.scene.add.text(18, yOffset + 29, 'Klikni na uzel a teprve potom uvidíš formy, přesnost a rychlost.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '10px',
            color: '#8294aa',
        }));

        const legendStates: MasteryState[] = ['training', 'secure', 'fluent', 'mastery'];
        let legendX = 535;
        for (const state of legendStates) {
            const color = STATE_COLORS[state];
            content.add(this.scene.add.circle(legendX, yOffset + 25, 5, color));
            content.add(this.scene.add.text(legendX + 10, yOffset + 18, STATE_LABELS[state], {
                fontFamily: 'Arial, sans-serif',
                fontSize: '9px',
                color: `#${color.toString(16).padStart(6, '0')}`,
            }));
            legendX += 135;
        }
        return yOffset + 62;
    }

    private renderBandMap(
        content: Phaser.GameObjects.Container,
        bandId: BandId,
        bandState: MasteryState,
        data: any,
        yOffset: number,
        width: number,
    ): number {
        const laneHeight = 176;
        const lane = this.scene.add.rectangle(0, yOffset, width, laneHeight, 0x0d1726, 0.97)
            .setOrigin(0, 0)
            .setStrokeStyle(1, STATE_COLORS[bandState], bandState === 'locked' ? 0.25 : 0.55);
        content.add(lane);

        const bandColor = STATE_COLORS[bandState];
        const bandHalo = this.scene.add.circle(72, yOffset + 82, 39, bandColor, bandState === 'locked' ? 0.05 : 0.14)
            .setStrokeStyle(1, bandColor, 0.35);
        const bandBadge = this.scene.add.circle(72, yOffset + 82, 30, 0x121f32, 1)
            .setStrokeStyle(3, bandColor, 0.9);
        content.add([bandHalo, bandBadge]);
        content.add(this.scene.add.text(72, yOffset + 73, bandId, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5));
        content.add(this.scene.add.text(72, yOffset + 101, BAND_RANGES[bandId], {
            fontFamily: 'Arial, sans-serif',
            fontSize: '9px',
            color: '#8da0b6',
        }).setOrigin(0.5));

        const nodePoints = [
            { x: 245, y: yOffset + 53 },
            { x: 455, y: yOffset + 112 },
            { x: 680, y: yOffset + 53 },
            { x: 900, y: yOffset + 112 },
        ];
        const route = this.scene.add.graphics();
        route.lineStyle(6, 0x25364a, 0.9);
        route.lineBetween(104, yOffset + 82, nodePoints[0].x - 30, nodePoints[0].y);
        for (let index = 0; index < nodePoints.length - 1; index++) {
            route.lineBetween(
                nodePoints[index].x + 30,
                nodePoints[index].y,
                nodePoints[index + 1].x - 30,
                nodePoints[index + 1].y,
            );
        }
        route.lineStyle(2, bandColor, bandState === 'locked' ? 0.14 : 0.45);
        route.lineBetween(104, yOffset + 82, nodePoints[0].x - 30, nodePoints[0].y);
        for (let index = 0; index < nodePoints.length - 1; index++) {
            route.lineBetween(
                nodePoints[index].x + 30,
                nodePoints[index].y,
                nodePoints[index + 1].x - 30,
                nodePoints[index + 1].y,
            );
        }
        content.add(route);

        nodePoints.forEach((point, index) => {
            const saId = `${bandId}${ALL_SUB_ATOM_NUMBERS[index]}` as SubAtomId;
            this.renderMapNode(content, saId, data.subAtoms[saId], point.x, point.y);
        });

        const bandLabel = this.scene.add.text(1060, yOffset + 14, STATE_LABELS[bandState].toUpperCase(), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '9px',
            fontStyle: 'bold',
            color: `#${bandColor.toString(16).padStart(6, '0')}`,
        }).setOrigin(1, 0);
        content.add(bandLabel);
        return yOffset + laneHeight;
    }

    private renderMapNode(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        sa: any,
        x: number,
        y: number,
    ): void {
        const state = sa.state as MasteryState;
        const color = STATE_COLORS[state];
        const selected = this.expandedSubAtoms.has(saId);
        const target = this.getNextSolveTarget(state);

        const halo = this.scene.add.circle(x, y, selected ? 39 : 35, color, selected ? 0.26 : 0.1)
            .setStrokeStyle(selected ? 2 : 1, color, selected ? 0.9 : 0.3);
        const node = this.scene.add.circle(x, y, 28, 0x101c2e, 1)
            .setStrokeStyle(3, color, state === 'locked' ? 0.45 : 1)
            .setInteractive({ useHandCursor: true });
        content.add([halo, node]);
        content.add(this.scene.add.text(x, y - 2, state === 'locked' ? '×' : saId, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: state === 'locked' ? '20px' : '15px',
            fontStyle: 'bold',
            color: state === 'locked' ? '#5c6570' : '#ffffff',
        }).setOrigin(0.5));
        content.add(this.scene.add.text(x, y + 39, SUB_ATOM_NAMES[saId], {
            fontFamily: 'Arial, sans-serif',
            fontSize: '10px',
            color: state === 'locked' ? '#596575' : '#c7d2df',
            align: 'center',
            wordWrap: { width: 150 },
        }).setOrigin(0.5, 0));
        const progressLabel = state === 'locked'
            ? 'ZAMČENO'
            : state === 'mastery'
                ? '★ HOTOVO'
                : `${sa.successfulSolves ?? 0} / ${target}`;
        content.add(this.scene.add.text(x, y - 52, progressLabel, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '9px',
            fontStyle: 'bold',
            color: `#${color.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5));

        node.on('pointerover', () => {
            node.setStrokeStyle(4, color, 1);
            halo.setAlpha(selected ? 0.34 : 0.2);
        });
        node.on('pointerout', () => {
            node.setStrokeStyle(3, color, state === 'locked' ? 0.45 : 1);
            halo.setAlpha(1);
        });
        node.on('pointerdown', () => {
            if (selected) this.expandedSubAtoms.clear();
            else {
                this.expandedSubAtoms.clear();
                this.expandedSubAtoms.add(saId);
            }
            this.rebuildContent();
        });
    }

    // ── Expanded detail panel ──

    private renderExpandedDetail(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        sa: any,
        mastery: MasterySystem,
        data: any,
        problemDb: ProblemDatabase,
        yOffset: number,
        totalWidth: number,
    ): number {
        const state = sa.state as MasteryState;
        const color = STATE_COLORS[state];

        // Panel background
        const panelBg = this.scene.add.rectangle(10, yOffset, totalWidth - 20, 10, 0x0d1b2a)
            .setOrigin(0, 0)
            .setStrokeStyle(1, color, 0.3);
        content.add(panelBg);

        let py = yOffset + 12;

        // Header
        const headerText = this.scene.add.text(24, py, `${saId}: ${SUB_ATOM_NAMES[saId]} ─ ${STATE_LABELS[state].toUpperCase()}`, {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#e8d44d', fontStyle: 'bold',
        });
        content.add(headerText);
        py += 26;

        if (state === 'locked') {
            const lockedText = this.scene.add.text(24, py, 'Zamčeno', {
                fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#555555',
            });
            content.add(lockedText);
            py += 30;
            panelBg.setSize(totalWidth - 20, py - yOffset);
            return py + 8;
        }

        // Summary line
        const totalCorrect = this.getTotalCorrect(saId, data);
        const totalWrong = this.getTotalWrong(saId, data);
        const accuracy = mastery.getLast20Accuracy(saId);
        const medianRT = mastery.getMedianRT(saId);
        const rtStr = medianRT === Infinity ? '--' : `${(medianRT / 1000).toFixed(1)}s`;

        const summaryText = this.scene.add.text(24, py,
            `Celkem: ✓${totalCorrect}  ✗${totalWrong}  |  Přesnost (posl. 20): ${Math.round(accuracy * 100)}%  |  Median RT: ${rtStr}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#b9c7d8',
        });
        content.add(summaryText);
        py += 30;

        const sectionTop = py;
        const formBottom = this.renderFormTable(content, saId, data, mastery, problemDb, sectionTop);
        const separator = this.scene.add.rectangle(564, sectionTop, 1, 108, 0x4a6fa5, 0.36)
            .setOrigin(0, 0);
        content.add(separator);
        const nextBottom = this.renderNextLevel(content, saId, sa, mastery, state, sectionTop, totalWidth, 592);
        py = Math.max(formBottom, nextBottom);

        panelBg.setSize(totalWidth - 20, py - yOffset + 8);
        return py + 12;
    }

    private renderFormTable(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        data: any,
        _mastery: MasterySystem,
        problemDb: ProblemDatabase,
        yOffset: number,
    ): number {
        // Table header
        const colX = [24, 240, 330, 400, 480];
        const headerStyle = { fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#7fa1c4', fontStyle: 'bold' as const };

        const headers = ['Forma', 'Správně', 'Špatně', 'Prům. RT'];
        for (let i = 0; i < headers.length; i++) {
            const ht = this.scene.add.text(colX[i], yOffset, headers[i], headerStyle);
            content.add(ht);
        }

        // Separator
        const sep = this.scene.add.rectangle(24, yOffset + 16, 520, 1, 0x4a6fa5, 0.3).setOrigin(0, 0);
        content.add(sep);
        yOffset += 22;

        // Rows
        for (const form of ALL_PROBLEM_FORMS) {
            const stats = this.computeFormStats(saId, form, data, problemDb);

            const rowStyle = { fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#d6deea' };

            const formText = this.scene.add.text(colX[0], yOffset, FORM_LABELS[form], rowStyle);
            content.add(formText);

            const correctText = this.scene.add.text(colX[1], yOffset, `${stats.correct}`, {
                ...rowStyle, color: stats.correct > 0 ? '#44cc44' : '#555555',
            });
            content.add(correctText);

            const wrongText = this.scene.add.text(colX[2], yOffset, `${stats.wrong}`, {
                ...rowStyle, color: stats.wrong > 0 ? '#ff6666' : '#555555',
            });
            content.add(wrongText);

            const rtDisplay = stats.correct === 0 ? '--' : `${(stats.meanRT / 1000).toFixed(1)}s`;
            const rtText = this.scene.add.text(colX[3], yOffset, rtDisplay, rowStyle);
            content.add(rtText);

            yOffset += 20;
        }

        return yOffset + 8;
    }

    private renderNextLevel(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        sa: any,
        mastery: MasterySystem,
        state: MasteryState,
        yOffset: number,
        _totalWidth: number,
        xOffset: number = 24,
    ): number {
        const color = STATE_COLORS[state];

        if (state === 'mastery') {
            const starText = this.scene.add.text(xOffset, yOffset, '★ Mistrovství!', {
                fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#ff44ff', fontStyle: 'bold',
            });
            content.add(starText);
            return yOffset + 28;
        }

        const transitions: Record<string, string> = {
            training: 'Zkouška atomu (Procvičování → Jistota)',
            secure: 'Výzva plynulosti (Jistota → Plynulost)',
            fluent: 'Výzva mistrovství (Plynulost → Mistrovství)',
        };

        const nextLabel = transitions[state] || '';
        if (!nextLabel) return yOffset;

        const nextText = this.scene.add.text(xOffset, yOffset, `DALŠÍ KROK\n${nextLabel}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#e0c777', fontStyle: 'bold',
            lineSpacing: 4,
        });
        content.add(nextText);
        yOffset += 43;

        // Progress bars
        const bars = this.getNextLevelProgress(saId, sa, mastery, state);
        for (const bar of bars) {
            yOffset = this.renderProgressBar(content, bar, yOffset, color, xOffset);
        }

        return yOffset;
    }

    private renderProgressBar(
        content: Phaser.GameObjects.Container,
        item: { label: string; current: number; target: number; valueStr: string; met: boolean },
        yOffset: number,
        stateColor: number,
        xOffset: number,
    ): number {
        const barX = xOffset;
        const barWidth = 150;
        const barHeight = 8;

        const label = this.scene.add.text(barX, yOffset, item.label, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#a7b5c7',
        });
        content.add(label);

        const barBg = this.scene.add.rectangle(barX + 120, yOffset + 2, barWidth, barHeight, 0x222244).setOrigin(0, 0);
        content.add(barBg);

        const fillRatio = Math.min(1, item.current / item.target);
        const fillColor = item.met ? 0x44cc44 : stateColor;
        if (fillRatio > 0) {
            const barFill = this.scene.add.rectangle(barX + 120, yOffset + 2, barWidth * fillRatio, barHeight, fillColor).setOrigin(0, 0);
            content.add(barFill);
        }

        const checkMark = item.met ? ' ✓' : '';
        const valText = this.scene.add.text(barX + 268, yOffset, `${item.valueStr}${checkMark}`, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: item.met ? '#44ff44' : '#a7b5c7',
        });
        content.add(valText);

        return yOffset + 21;
    }

    // ── Data computation helpers ──

    private computeFormStats(
        subAtomId: SubAtomId,
        form: ProblemForm,
        data: any,
        problemDb: ProblemDatabase,
    ): { correct: number; wrong: number; meanRT: number } {
        const problems = problemDb.getProblemsForForm(subAtomId, form);
        let correct = 0;
        let wrong = 0;
        let totalRT = 0;
        let rtCount = 0;

        for (const p of problems) {
            const record = data.problemRecords[p.key];
            if (!record) continue;

            for (const attempt of record.attempts) {
                if (attempt.correct) {
                    correct++;
                    if (attempt.responseTimeMs <= 20000) {
                        totalRT += attempt.responseTimeMs;
                        rtCount++;
                    }
                } else {
                    wrong++;
                }
            }
        }

        return {
            correct,
            wrong,
            meanRT: rtCount > 0 ? totalRT / rtCount : 0,
        };
    }

    private getTotalCorrect(saId: SubAtomId, data: any): number {
        let total = 0;
        for (const record of Object.values(data.problemRecords) as any[]) {
            if (record.subAtomId === saId) {
                total += record.attempts.filter((a: any) => a.correct).length;
            }
        }
        return total;
    }

    private getTotalWrong(saId: SubAtomId, data: any): number {
        let total = 0;
        for (const record of Object.values(data.problemRecords) as any[]) {
            if (record.subAtomId === saId) {
                total += record.attempts.filter((a: any) => !a.correct).length;
            }
        }
        return total;
    }

    private getNextSolveTarget(state: MasteryState): number {
        switch (state) {
            case 'training': return SUB_ATOM_EXAM_REQUIREMENTS.successfulSolves;
            case 'secure': return 30;
            case 'fluent': return 50;
            default: return 0;
        }
    }

    private getNextLevelProgress(
        saId: SubAtomId,
        sa: any,
        mastery: MasterySystem,
        state: MasteryState,
    ): Array<{ label: string; current: number; target: number; valueStr: string; met: boolean }> {
        const solves = sa.successfulSolves || 0;
        const accuracy = mastery.getLast20Accuracy(saId);
        const medianRT = mastery.getMedianRT(saId);
        const rtStr = medianRT === Infinity ? '--' : `${(medianRT / 1000).toFixed(1)}s`;

        if (state === 'training') {
            const progress = mastery.getSubAtomExamProgress(saId);
            return [
                {
                    label: 'Úlohy:',
                    current: progress.successfulSolves,
                    target: progress.requiredSuccessfulSolves,
                    valueStr: `${progress.successfulSolves}/${progress.requiredSuccessfulSolves}`,
                    met: progress.successfulSolves >= progress.requiredSuccessfulSolves,
                },
                {
                    label: 'Přesnost:',
                    current: progress.accuracy * 100,
                    target: progress.requiredAccuracy * 100,
                    valueStr: `${Math.round(progress.accuracy * 100)}%/${Math.round(progress.requiredAccuracy * 100)}%`,
                    met: progress.accuracy >= progress.requiredAccuracy,
                },
                {
                    label: 'Formy:',
                    current: progress.qualifyingForms,
                    target: progress.requiredQualifyingForms,
                    valueStr: `${progress.qualifyingForms}/${progress.requiredQualifyingForms}`,
                    met: progress.qualifyingForms >= progress.requiredQualifyingForms,
                },
            ];
        } else if (state === 'secure') {
            const formsCount = mastery.getFormsWithSolves(saId, 4);
            return [
                { label: 'Úlohy:', current: solves, target: 30, valueStr: `${solves}/30`, met: solves >= 30 },
                { label: 'Přesnost:', current: accuracy * 100, target: 85, valueStr: `${Math.round(accuracy * 100)}%/85%`, met: accuracy >= 0.85 },
                { label: 'Median RT:', current: medianRT === Infinity ? 0 : (7000 - medianRT) / 7000 * 100, target: 100, valueStr: `${rtStr}/7.0s`, met: medianRT <= 7000 },
                { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2 },
            ];
        } else if (state === 'fluent') {
            const formsCount = mastery.getFormsWithSolves(saId, 4);
            return [
                { label: 'Úlohy:', current: solves, target: 50, valueStr: `${solves}/50`, met: solves >= 50 },
                { label: 'Přesnost:', current: accuracy * 100, target: 92, valueStr: `${Math.round(accuracy * 100)}%/92%`, met: accuracy >= 0.92 },
                { label: 'Median RT:', current: medianRT === Infinity ? 0 : (5000 - medianRT) / 5000 * 100, target: 100, valueStr: `${rtStr}/5.0s`, met: medianRT <= 5000 },
                { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2 },
            ];
        }

        return [];
    }
}

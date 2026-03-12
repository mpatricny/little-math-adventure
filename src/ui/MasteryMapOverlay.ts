import Phaser from 'phaser';
import { OverlayBase } from './OverlayBase';
import { ScrollablePanel } from './ScrollablePanel';
import { MasterySystem } from '../systems/MasterySystem';
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
    result_unknown: 'result_unknown',
    missing_part: 'missing_part',
    compare_equation_vs_number: 'compare_eq_vs_num',
    compare_equation_vs_equation: 'compare_eq_vs_eq',
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
    training: 'Training',
    secure: 'Secure',
    fluent: 'Fluent',
    mastery: 'Mastery',
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
        super(scene, 'MAPA MISTROVSTVÍ', 1150, 600);
    }

    protected buildContent(area: { x: number; y: number; width: number; height: number }): void {
        this.scrollPanel = new ScrollablePanel(this.scene, this.container, area);
    }

    protected onShow(): void {
        this.rebuildContent();
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

        for (const bandId of ALL_BANDS) {
            const band = data.bands[bandId];
            const bandLocked = band.state === 'locked';

            // Band header
            yOffset = this.renderBandHeader(content, bandId, band.state, yOffset, totalWidth);

            if (bandLocked) {
                const lockedText = this.scene.add.text(20, yOffset, '(zamčeno)', {
                    fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#555555',
                });
                content.add(lockedText);
                yOffset += 30;
                continue;
            }

            // Sub-atom cards row (4 cards)
            const cardWidth = 240;
            const cardGap = 16;
            const cardRowX = 10;

            for (let i = 0; i < ALL_SUB_ATOM_NUMBERS.length; i++) {
                const num = ALL_SUB_ATOM_NUMBERS[i];
                const saId = `${bandId}${num}` as SubAtomId;
                const sa = data.subAtoms[saId];
                const cx = cardRowX + i * (cardWidth + cardGap);

                this.renderSubAtomCard(content, saId, sa, cx, yOffset, cardWidth);
            }

            yOffset += 120; // card height

            // Expanded detail panel (if any card in this band is expanded)
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const saId = `${bandId}${num}` as SubAtomId;
                if (this.expandedSubAtoms.has(saId)) {
                    const sa = data.subAtoms[saId];
                    yOffset = this.renderExpandedDetail(content, saId, sa, mastery, data, problemDb, yOffset, totalWidth);
                }
            }

            yOffset += 16; // gap between bands
        }

        this.scrollPanel.setContentHeight(yOffset);
        this.scrollPanel.setScrollOffset(this.savedScrollOffset);
    }

    // ── Band header ──

    private renderBandHeader(
        content: Phaser.GameObjects.Container,
        bandId: BandId,
        state: MasteryState,
        yOffset: number,
        width: number,
    ): number {
        const color = STATE_COLORS[state];

        const headerBg = this.scene.add.rectangle(0, yOffset, width, 32, 0x111122)
            .setOrigin(0, 0);
        content.add(headerBg);

        const headerText = this.scene.add.text(12, yOffset + 7, `PÁSMO ${bandId} (${BAND_RANGES[bandId]})`, {
            fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#e8d44d', fontStyle: 'bold',
        });
        content.add(headerText);

        // State badge (colored pill)
        const badgeX = 240;
        const badge = this.scene.add.rectangle(badgeX, yOffset + 8, 80, 18, color, 0.3)
            .setOrigin(0, 0)
            .setStrokeStyle(1, color);
        content.add(badge);

        const badgeText = this.scene.add.text(badgeX + 40, yOffset + 8 + 9, STATE_LABELS[state], {
            fontSize: '11px', fontFamily: 'Arial, sans-serif',
            color: `#${color.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5);
        content.add(badgeText);

        // Accent line below
        const line = this.scene.add.rectangle(0, yOffset + 32, width, 2, color, 0.3)
            .setOrigin(0, 0);
        content.add(line);

        return yOffset + 38;
    }

    // ── Sub-atom card (collapsed) ──

    private renderSubAtomCard(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        sa: any,
        x: number,
        y: number,
        width: number,
    ): void {
        const state = sa.state as MasteryState;
        const color = STATE_COLORS[state];
        const cardHeight = 110;
        const isExpanded = this.expandedSubAtoms.has(saId);

        // Card background
        const cardBg = this.scene.add.rectangle(x, y, width, cardHeight, 0x16213e)
            .setOrigin(0, 0)
            .setStrokeStyle(1, color, 0.3);
        content.add(cardBg);

        // Top glow line (3px)
        const glowLine = this.scene.add.rectangle(x, y, width, 3, color)
            .setOrigin(0, 0);
        content.add(glowLine);

        // Sub-atom ID
        const idText = this.scene.add.text(x + 10, y + 10, saId, {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold',
        });
        content.add(idText);

        // Chevron
        const chevron = this.scene.add.text(x + width - 24, y + 10, isExpanded ? '▲' : '▼', {
            fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#8888aa',
        });
        content.add(chevron);

        // Name
        const name = SUB_ATOM_NAMES[saId] || saId;
        const nameText = this.scene.add.text(x + 10, y + 32, name, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#8888cc',
        });
        content.add(nameText);

        // State indicator
        const stateDot = this.scene.add.circle(x + 10, y + 58, 4, color);
        content.add(stateDot);

        const stateText = this.scene.add.text(x + 20, y + 52, STATE_LABELS[state], {
            fontSize: '12px', fontFamily: 'Arial, sans-serif',
            color: `#${color.toString(16).padStart(6, '0')}`,
        });
        content.add(stateText);

        // Solve count
        if (state !== 'locked') {
            const solves = sa.successfulSolves || 0;
            const nextTarget = this.getNextSolveTarget(state);
            const solvesText = this.scene.add.text(x + 10, y + 70, `Úlohy: ${solves}`, {
                fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8888aa',
            });
            content.add(solvesText);

            // Mini progress bar
            if (nextTarget > 0) {
                const barX = x + 10;
                const barY = y + 88;
                const barW = width - 20;
                const barH = 6;

                const barBg = this.scene.add.rectangle(barX, barY, barW, barH, 0x222244).setOrigin(0, 0);
                content.add(barBg);

                const fillRatio = Math.min(1, solves / nextTarget);
                if (fillRatio > 0) {
                    const barFill = this.scene.add.rectangle(barX, barY, barW * fillRatio, barH, color).setOrigin(0, 0);
                    content.add(barFill);
                }

                const barLabel = this.scene.add.text(barX + barW + 4, barY - 2, `${solves}/${nextTarget}`, {
                    fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#666688',
                });
                // Don't add if it would overflow, just skip
                if (barX + barW + 4 < x + width + 50) {
                    // Actually just position within the bar area
                }
                content.add(barLabel);
            }
        }

        // Make card interactive (click to expand/collapse)
        cardBg.setInteractive({ useHandCursor: true });
        cardBg.on('pointerover', () => cardBg.setStrokeStyle(1, color, 0.8));
        cardBg.on('pointerout', () => cardBg.setStrokeStyle(1, color, 0.3));
        cardBg.on('pointerdown', () => {
            if (this.expandedSubAtoms.has(saId)) {
                this.expandedSubAtoms.delete(saId);
            } else {
                // Close others in same band to avoid visual clutter
                const bandId = saId[0];
                for (const num of ALL_SUB_ATOM_NUMBERS) {
                    this.expandedSubAtoms.delete(`${bandId}${num}` as SubAtomId);
                }
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
            fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#e8d44d', fontStyle: 'bold',
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
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#aaaacc',
        });
        content.add(summaryText);
        py += 24;

        // Per-form table
        py = this.renderFormTable(content, saId, data, mastery, problemDb, py);

        // Next level section
        py = this.renderNextLevel(content, saId, sa, mastery, state, py, totalWidth);

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
        const headerStyle = { fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#6688aa', fontStyle: 'bold' as const };

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

            const rowStyle = { fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#ccccee' };

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

            yOffset += 18;
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
    ): number {
        const color = STATE_COLORS[state];

        if (state === 'mastery') {
            const starText = this.scene.add.text(24, yOffset, '★ Mistrovství!', {
                fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff44ff', fontStyle: 'bold',
            });
            content.add(starText);
            return yOffset + 28;
        }

        const transitions: Record<string, string> = {
            training: 'Zkouška sub-atomu (Training → Secure)',
            secure: 'Plynulost (Secure → Fluent)',
            fluent: 'Mistrovství (Fluent → Mastery)',
        };

        const nextLabel = transitions[state] || '';
        if (!nextLabel) return yOffset;

        const nextText = this.scene.add.text(24, yOffset, `Další úroveň: ${nextLabel}`, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#aaaacc', fontStyle: 'bold',
        });
        content.add(nextText);
        yOffset += 22;

        // Progress bars
        const bars = this.getNextLevelProgress(saId, sa, mastery, state);
        for (const bar of bars) {
            yOffset = this.renderProgressBar(content, bar, yOffset, color);
        }

        return yOffset;
    }

    private renderProgressBar(
        content: Phaser.GameObjects.Container,
        item: { label: string; current: number; target: number; valueStr: string; met: boolean },
        yOffset: number,
        stateColor: number,
    ): number {
        const barX = 36;
        const barWidth = 140;
        const barHeight = 8;

        const label = this.scene.add.text(barX, yOffset, item.label, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8888aa',
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
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: item.met ? '#44ff44' : '#8888aa',
        });
        content.add(valText);

        return yOffset + 18;
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
            case 'training': return 20;
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
            const formsCount = mastery.getFormsWithSolves(saId, 4);
            return [
                { label: 'Úlohy:', current: solves, target: 20, valueStr: `${solves}/20`, met: solves >= 20 },
                { label: 'Přesnost:', current: accuracy * 100, target: 70, valueStr: `${Math.round(accuracy * 100)}%/70%`, met: accuracy >= 0.70 },
                { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2 },
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

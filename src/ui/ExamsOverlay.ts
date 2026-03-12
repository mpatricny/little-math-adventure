import Phaser from 'phaser';
import { OverlayBase } from './OverlayBase';
import { ScrollablePanel } from './ScrollablePanel';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';
import {
    ALL_BANDS, ALL_SUB_ATOM_NUMBERS,
    BandId, SubAtomId, MasteryState, TrialTier,
} from '../types';

/** Human-readable sub-atom names (Czech) */
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

const STATE_COLORS: Record<MasteryState, number> = {
    locked: 0x555555,
    training: 0x4488ff,
    secure: 0x44cc44,
    fluent: 0xffaa00,
    mastery: 0xff44ff,
};

/** Numeric ordering so we can check if a state has surpassed a required level */
const STATE_RANK: Record<MasteryState, number> = {
    locked: 0, training: 1, secure: 2, fluent: 3, mastery: 4,
};

const MEDAL_COLORS: Record<TrialTier, string> = {
    none: '#555555',
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
};

const MEDAL_LABELS: Record<TrialTier, string> = {
    none: '---',
    bronze: 'Bronz',
    silver: 'Stříbro',
    gold: 'Zlato',
};

/**
 * Exams overlay — shows all exam types, their status, eligibility, and progress.
 */
export class ExamsOverlay extends OverlayBase {
    private scrollPanel!: ScrollablePanel;

    constructor(scene: Phaser.Scene) {
        super(scene, 'ZKOUŠKY', 1100, 600);
    }

    protected buildContent(area: { x: number; y: number; width: number; height: number }): void {
        this.scrollPanel = new ScrollablePanel(this.scene, this.container, area);
    }

    protected onShow(): void {
        this.rebuildContent();
    }

    private rebuildContent(): void {
        this.scrollPanel.clearContent();
        const content = this.scrollPanel.getContent();
        const mastery = MasterySystem.getInstance();
        const data = GameStateManager.getInstance().getMasteryData();

        let yOffset = 0;
        const sectionWidth = 1040;

        for (const bandId of ALL_BANDS) {
            const band = data.bands[bandId];
            const bandLocked = band.state === 'locked';

            // Band header
            const headerBg = this.scene.add.rectangle(0, yOffset, sectionWidth, 36, bandLocked ? 0x222233 : 0x1e2a4a)
                .setOrigin(0, 0)
                .setStrokeStyle(1, bandLocked ? 0x333344 : 0x4a6fa5);
            content.add(headerBg);

            const stateLabel = bandLocked ? 'Zamčeno 🔒' : this.stateLabel(band.state);
            const headerText = this.scene.add.text(12, yOffset + 8, `PÁSMO ${bandId} (${BAND_RANGES[bandId]}) ── ${stateLabel}`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: bandLocked ? '#555555' : '#e8d44d',
                fontStyle: 'bold',
            });
            content.add(headerText);

            yOffset += 44;

            if (bandLocked) {
                const lockedText = this.scene.add.text(24, yOffset, '(zamčeno)', {
                    fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#555555',
                });
                content.add(lockedText);
                yOffset += 32;
            } else {
                // Sub-atoms
                for (const num of ALL_SUB_ATOM_NUMBERS) {
                    const saId = `${bandId}${num}` as SubAtomId;
                    const sa = data.subAtoms[saId];

                    yOffset = this.renderSubAtomExams(content, saId, sa, mastery, data, yOffset, sectionWidth);
                }

                // Band gate
                yOffset = this.renderBandGate(content, bandId, band, mastery, yOffset, sectionWidth);

                // Band mastery
                yOffset = this.renderBandMastery(content, bandId, band, mastery, yOffset, sectionWidth);
            }

            yOffset += 16; // gap between bands
        }

        this.scrollPanel.setContentHeight(yOffset);
    }

    private renderSubAtomExams(
        content: Phaser.GameObjects.Container,
        saId: SubAtomId,
        sa: any,
        mastery: MasterySystem,
        _data: any,
        yOffset: number,
        _width: number,
    ): number {
        const name = SUB_ATOM_NAMES[saId] || saId;
        const stateColor = STATE_COLORS[sa.state as MasteryState] || 0x555555;

        // Sub-atom header
        const saHeader = this.scene.add.text(24, yOffset, `${saId}: ${name}`, {
            fontSize: '14px', fontFamily: 'Arial, sans-serif',
            color: '#ccccee', fontStyle: 'bold',
        });
        content.add(saHeader);

        // State indicator dot
        const dot = this.scene.add.circle(16, yOffset + 8, 4, stateColor);
        content.add(dot);

        yOffset += 24;

        // --- Sub-atom exam ---
        yOffset = this.renderExamLine(content, '  Zkouška:', sa.state, sa.examBestMedal,
            sa.state === 'training', mastery.checkExamEligibility(saId),
            () => this.getSubAtomExamProgress(saId, sa, mastery), yOffset);

        // --- Fluency challenge ---
        const fluencyAvailable = sa.state === 'secure';
        yOffset = this.renderChallengeLine(content, '  Plynulost:', sa.state,
            sa.fluencyChallengeResult, fluencyAvailable,
            mastery.checkFluencyEligibility(saId),
            () => this.getFluencyProgress(saId, sa, mastery), yOffset, 'secure');

        // --- Mastery challenge ---
        const masteryAvailable = sa.state === 'fluent';
        yOffset = this.renderChallengeLine(content, '  Mistrovství:', sa.state,
            sa.masteryChallengeResult, masteryAvailable,
            mastery.checkMasteryChallengeEligibility(saId),
            () => this.getMasteryProgress(saId, sa, mastery), yOffset, 'fluent');

        yOffset += 8;
        return yOffset;
    }

    private renderExamLine(
        content: Phaser.GameObjects.Container,
        label: string,
        _state: MasteryState,
        bestMedal: TrialTier | null,
        isRelevantState: boolean,
        isEligible: boolean,
        getProgress: () => ProgressItem[],
        yOffset: number,
    ): number {
        let statusStr: string;
        let statusColor: string;

        if (bestMedal && bestMedal !== 'none') {
            statusStr = `★ ${MEDAL_LABELS[bestMedal]}`;
            statusColor = MEDAL_COLORS[bestMedal];
        } else if (isRelevantState && isEligible) {
            statusStr = '● DOSTUPNÁ!';
            statusColor = '#44ff44';
        } else if (isRelevantState) {
            statusStr = 'Nesplněno (podmínky)';
            statusColor = '#888899';
        } else {
            statusStr = '--- (zamčeno)';
            statusColor = '#555555';
        }

        const lineText = this.scene.add.text(36, yOffset, `${label}  ${statusStr}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: statusColor,
        });
        content.add(lineText);
        yOffset += 20;

        // Show progress bars if relevant
        if (isRelevantState && !bestMedal) {
            const progress = getProgress();
            for (const item of progress) {
                yOffset = this.renderProgressBar(content, item, yOffset);
            }
        }

        return yOffset;
    }

    private renderChallengeLine(
        content: Phaser.GameObjects.Container,
        label: string,
        state: MasteryState,
        result: 'pass' | 'fail' | null,
        isRelevantState: boolean,
        isEligible: boolean,
        getProgress: () => ProgressItem[],
        yOffset: number,
        requiredState: MasteryState,
    ): number {
        let statusStr: string;
        let statusColor: string;

        const stateRank = STATE_RANK[state];
        const requiredRank = STATE_RANK[requiredState];

        if (result === 'pass' || (stateRank > requiredRank && result !== 'fail')) {
            // Explicitly passed, or state has advanced beyond this challenge's level
            // (e.g. gold on sub-atom exam skips training→fluent, bypassing fluency challenge)
            statusStr = '✓ Splněno';
            statusColor = '#44ff44';
        } else if (result === 'fail') {
            statusStr = '✗ Nesplněno';
            statusColor = '#ff4444';
        } else if (isRelevantState && isEligible) {
            statusStr = '● DOSTUPNÁ!';
            statusColor = '#44ff44';
        } else if (state === requiredState) {
            statusStr = 'Nesplněno (podmínky)';
            statusColor = '#888899';
        } else {
            statusStr = '--- (zamčeno)';
            statusColor = '#555555';
        }

        const lineText = this.scene.add.text(36, yOffset, `${label}  ${statusStr}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: statusColor,
        });
        content.add(lineText);
        yOffset += 20;

        // Show progress if in relevant state and not yet passed
        if (state === requiredState && result !== 'pass') {
            const progress = getProgress();
            for (const item of progress) {
                yOffset = this.renderProgressBar(content, item, yOffset);
            }
        }

        return yOffset;
    }

    private renderBandGate(
        content: Phaser.GameObjects.Container,
        bandId: BandId,
        band: any,
        mastery: MasterySystem,
        yOffset: number,
        _width: number,
    ): number {
        const eligible = mastery.getBandGateEligibility(bandId);
        let statusStr: string;
        let statusColor: string;

        if (band.gateExamBestMedal && band.gateExamBestMedal !== 'none') {
            const medal = band.gateExamBestMedal as TrialTier;
            statusStr = `★ ${MEDAL_LABELS[medal]}`;
            statusColor = MEDAL_COLORS[medal];
        } else if (eligible) {
            statusStr = '● DOSTUPNÁ!';
            statusColor = '#44ff44';
        } else {
            statusStr = '--- (zamčeno)';
            statusColor = '#555555';
        }

        const lineText = this.scene.add.text(24, yOffset, `Brána pásma ${bandId}:  ${statusStr}`, {
            fontSize: '14px', fontFamily: 'Arial, sans-serif', color: statusColor, fontStyle: 'bold',
        });
        content.add(lineText);
        yOffset += 24;

        return yOffset;
    }

    private renderBandMastery(
        content: Phaser.GameObjects.Container,
        bandId: BandId,
        band: any,
        mastery: MasterySystem,
        yOffset: number,
        _width: number,
    ): number {
        const eligible = mastery.checkBandMasteryEligibility(bandId);
        let statusStr: string;
        let statusColor: string;

        if (band.bandMasteryChallengeResult === 'pass') {
            statusStr = '✓ Splněno';
            statusColor = '#44ff44';
        } else if (eligible) {
            statusStr = '● DOSTUPNÁ!';
            statusColor = '#44ff44';
        } else {
            statusStr = '--- (zamčeno)';
            statusColor = '#555555';
        }

        const lineText = this.scene.add.text(24, yOffset, `Mistrovství pásma ${bandId}:  ${statusStr}`, {
            fontSize: '14px', fontFamily: 'Arial, sans-serif', color: statusColor, fontStyle: 'bold',
        });
        content.add(lineText);
        yOffset += 24;

        return yOffset;
    }

    // ── Progress bar helpers ──

    private renderProgressBar(
        content: Phaser.GameObjects.Container,
        item: ProgressItem,
        yOffset: number,
    ): number {
        const barX = 60;
        const barWidth = 120;
        const barHeight = 8;

        // Label
        const label = this.scene.add.text(barX, yOffset, item.label, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8888aa',
        });
        content.add(label);

        // Bar background
        const barBg = this.scene.add.rectangle(barX + 110, yOffset + 2, barWidth, barHeight, 0x222244)
            .setOrigin(0, 0);
        content.add(barBg);

        // Bar fill
        const fillRatio = Math.min(1, item.current / item.target);
        const fillColor = item.met ? 0x44cc44 : STATE_COLORS[item.stateColor || 'training'];
        if (fillRatio > 0) {
            const barFill = this.scene.add.rectangle(barX + 110, yOffset + 2, barWidth * fillRatio, barHeight, fillColor)
                .setOrigin(0, 0);
            content.add(barFill);
        }

        // Value text
        const checkMark = item.met ? ' ✓' : '';
        const valText = this.scene.add.text(barX + 236, yOffset, `${item.valueStr}${checkMark}`, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif',
            color: item.met ? '#44ff44' : '#8888aa',
        });
        content.add(valText);

        return yOffset + 18;
    }

    // ── Progress data computation ──

    private getSubAtomExamProgress(saId: SubAtomId, sa: any, mastery: MasterySystem): ProgressItem[] {
        const solves = sa.successfulSolves;
        const accuracy = mastery.getLast20Accuracy(saId);
        const formsCount = mastery.getFormsWithSolves(saId, 4);

        return [
            { label: 'Úlohy:', current: solves, target: 20, valueStr: `${solves}/20`, met: solves >= 20, stateColor: 'training' },
            { label: 'Přesnost:', current: accuracy * 100, target: 70, valueStr: `${Math.round(accuracy * 100)}%/70%`, met: accuracy >= 0.70, stateColor: 'training' },
            { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2, stateColor: 'training' },
        ];
    }

    private getFluencyProgress(saId: SubAtomId, sa: any, mastery: MasterySystem): ProgressItem[] {
        const solves = sa.successfulSolves;
        const accuracy = mastery.getLast20Accuracy(saId);
        const medianRT = mastery.getMedianRT(saId);
        const rtDisplay = medianRT === Infinity ? '--' : `${(medianRT / 1000).toFixed(1)}s`;
        const formsCount = mastery.getFormsWithSolves(saId, 4); // approximate — real check uses getFormsWithFormAccuracy

        return [
            { label: 'Úlohy:', current: solves, target: 30, valueStr: `${solves}/30`, met: solves >= 30, stateColor: 'secure' },
            { label: 'Přesnost:', current: accuracy * 100, target: 85, valueStr: `${Math.round(accuracy * 100)}%/85%`, met: accuracy >= 0.85, stateColor: 'secure' },
            { label: 'Median RT:', current: medianRT === Infinity ? 0 : (7000 - medianRT) / 7000 * 100, target: 100, valueStr: `${rtDisplay}/7.0s`, met: medianRT <= 7000, stateColor: 'secure' },
            { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2, stateColor: 'secure' },
        ];
    }

    private getMasteryProgress(saId: SubAtomId, sa: any, mastery: MasterySystem): ProgressItem[] {
        const solves = sa.successfulSolves;
        const accuracy = mastery.getLast20Accuracy(saId);
        const medianRT = mastery.getMedianRT(saId);
        const rtDisplay = medianRT === Infinity ? '--' : `${(medianRT / 1000).toFixed(1)}s`;
        const formsCount = mastery.getFormsWithSolves(saId, 4);

        return [
            { label: 'Úlohy:', current: solves, target: 50, valueStr: `${solves}/50`, met: solves >= 50, stateColor: 'fluent' },
            { label: 'Přesnost:', current: accuracy * 100, target: 92, valueStr: `${Math.round(accuracy * 100)}%/92%`, met: accuracy >= 0.92, stateColor: 'fluent' },
            { label: 'Median RT:', current: medianRT === Infinity ? 0 : (5000 - medianRT) / 5000 * 100, target: 100, valueStr: `${rtDisplay}/5.0s`, met: medianRT <= 5000, stateColor: 'fluent' },
            { label: 'Formy:', current: formsCount, target: 2, valueStr: `${formsCount}/2`, met: formsCount >= 2, stateColor: 'fluent' },
        ];
    }

    private stateLabel(state: MasteryState): string {
        switch (state) {
            case 'locked': return 'Zamčeno';
            case 'training': return 'Training';
            case 'secure': return 'Secure';
            case 'fluent': return 'Fluent';
            case 'mastery': return 'Mastery';
        }
    }
}

interface ProgressItem {
    label: string;
    current: number;
    target: number;
    valueStr: string;
    met: boolean;
    stateColor?: MasteryState;
}

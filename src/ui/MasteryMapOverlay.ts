import Phaser from 'phaser';
import { ALL_PROBLEM_FORMS, SubAtomId } from '../types';
import { SceneBuilder } from '../systems/SceneBuilder';
import { buildLearningBands, learningFormExample, LearningProfileOptions, LearningSkillView, LEARNING_STATE_LABELS } from '../systems/LearningProfileView';
import { getComparisonStatistics } from '../systems/ComparisonStatistics';
import type { LearningStage } from '../systems/CatacombProgress';
import { CatacombProgressOverlay } from './CatacombProgressOverlay';
import { LearningOverlay } from './LearningOverlay';
import { ScrollablePanel, ScrollbarAppearance } from './ScrollablePanel';
import { destroyLearningLayout, LearningButton, learningCard, learningHost, learningMarks, learningText, LEARNING_MUTED } from './LearningUi';

/** Real curriculum bands, pictured skills and recorded answers for one explicit profile. */
export class MasteryMapOverlay extends LearningOverlay {
    private readonly mapLayout: SceneBuilder;
    private readonly scrollPanel: ScrollablePanel;
    private readonly legend: Phaser.GameObjects.Container;
    private expandedSubAtoms = new Set<string>();
    private revealDetail = false;
    private catacombs?: CatacombProgressOverlay;

    constructor(scene: Phaser.Scene, options: LearningProfileOptions = {}) {
        super(scene, 'MAPA UČENÍ', options);
        this.mapLayout = new SceneBuilder(scene); this.mapLayout.buildScene('LearningMapOverlay');
        const viewport = learningHost(this.mapLayout, 'viewport');
        const scrollbar = learningHost(this.mapLayout, 'scrollbar');
        const scrollbarInput = learningHost(this.mapLayout, 'scrollbarInput');
        const appearance = this.mapLayout.getElementDef('scrollbar')?.data as Omit<ScrollbarAppearance, 'host' | 'inputHost'>;
        this.scrollPanel = new ScrollablePanel(scene, this.container, viewport, { ...appearance, host: scrollbar, inputHost: scrollbarInput });
        this.legend = scene.add.container(); this.container.add(this.legend);
        const legend = learningHost(this.mapLayout, 'legend');
        const states: LearningStage[] = ['locked', 'training', 'secure', 'fluent', 'mastery', 'grandmaster', 'legend'];
        states.forEach((state, index) => {
            const x = legend.x + index * legend.width / states.length;
            learningMarks(scene, this.legend, x, legend.y - 10, state, 6, 6);
            learningText(scene, this.legend, x, legend.y + 12, LEARNING_STATE_LABELS[state], 15, LEARNING_MUTED);
        });
    }

    public showNode(subAtomId: SubAtomId | 'comparison_symbols'): void {
        this.expandedSubAtoms = new Set([subAtomId]); this.revealDetail = true;
        if (this.getIsVisible()) this.renderProfile(); else this.show();
    }
    protected onProfileChanged(): void { this.expandedSubAtoms.clear(); this.scrollPanel.setScrollOffset(0); }

    protected renderProfile(): void {
        if (!this.profile) return;
        const savedOffset = this.scrollPanel.getScrollOffset();
        this.scrollPanel.clearContent();
        const root = this.scrollPanel.getContent();
        const data = this.profile.stats.masteryData;
        const rowGap = this.mapLayout.getElementDef('bandPanel')?.data?.rowGap as number;
        root.setData('profileSlot', this.profile.slotIndex);
        let y = 0;
        let detailY: number | undefined;
        for (const band of buildLearningBands(data, this.profile.player)) {
            const row = this.scene.add.container(0, y).setName(`learningBand:${band.id}`);
            root.add(row);
            const panel = learningHost(this.mapLayout, 'bandPanel');
            learningCard(this.scene, row, panel.x, panel.y, panel.width, panel.height);
            const range = learningHost(this.mapLayout, 'bandRange');
            const subtitle = band.crossingTen ? 'Přes 10' : band.id === 'F' ? 'Pětky a desítky' : '';
            learningText(this.scene, row, range.x, range.y - (subtitle ? 10 : 0), band.label, 29);
            if (subtitle) learningText(this.scene, row, range.x, range.y + 24, subtitle, 15, LEARNING_MUTED);
            band.skills.forEach((skill, index) => this.renderSkill(row, skill, index, band.skills.length));
            y += panel.height + rowGap;
            const selected = band.skills.find(skill => this.expandedSubAtoms.has(skill.id));
            if (selected) { detailY = y; y = this.renderDetail(root, selected, y); }
        }
        this.scrollPanel.setContentHeight(Math.max(0, y - rowGap));
        this.scrollPanel.setScrollOffset(this.revealDetail && detailY !== undefined ? detailY : savedOffset);
        this.revealDetail = false;
    }

    private renderSkill(parent: Phaser.GameObjects.Container, skill: LearningSkillView & { stage: LearningStage }, index: number, count: number): void {
        const host = learningHost(this.mapLayout, `skill${count === 5 ? 'Five' : 'Four'}${index + 1}`);
        const selected = this.expandedSubAtoms.has(skill.id);
        const root = this.scene.add.container(host.x, host.y).setDepth(host.depth)
            .setName(skill.id === 'comparison_symbols' ? 'comparisonMapNode' : `masteryMapNode:${skill.id}`)
            .setSize(host.width, host.height).setInteractive({ useHandCursor: true })
            .setData({ skillId: skill.id, attempts: skill.attempts, state: skill.stage });
        const surface = this.scene.add.container(); root.add(surface);
        learningCard(this.scene, surface, 0, 0, host.width, host.height, selected);
        const ink = skill.state === 'locked' ? '#747869' : '#244944';
        learningText(this.scene, surface, 0, -24, skill.symbol, skill.id === 'comparison_symbols' ? 40 : skill.symbol.length > 3 ? 27 : 34, ink);
        learningText(this.scene, surface, 0, 9, skill.label, 17, ink);
        learningText(this.scene, surface, -host.width / 2 + 9, 38, `✎ ${skill.attempts}`, 16, ink, 'left');
        learningMarks(this.scene, surface, host.width / 2 - 43, 38, skill.stage, 5.5, 6);
        let pressed = false;
        const restore = () => { pressed = false; surface.setY(0); };
        root.on('pointerover', () => { if (!pressed) surface.setY(-2); });
        root.on('pointerdown', () => { pressed = true; surface.setY(2); });
        root.on('pointerout', restore);
        root.on('pointerupoutside', restore);
        root.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const tapped = pressed && this.scrollPanel.canTap(pointer); restore();
            if (!tapped) return;
            this.expandedSubAtoms.clear();
            if (!selected) this.expandedSubAtoms.add(skill.id);
            this.revealDetail = !selected;
            this.renderProfile();
        });
        parent.add(root);
        this.scrollPanel.clipInput(root);
    }

    private renderDetail(parent: Phaser.GameObjects.Container, skill: LearningSkillView & { stage: LearningStage }, y: number): number {
        const host = learningHost(this.mapLayout, 'detail');
        const root = this.scene.add.container(host.x, y + host.y).setDepth(host.depth)
            .setName(skill.id === 'comparison_symbols' ? 'comparisonMapDetail' : `learningDetail:${skill.id}`);
        root.setSize(host.width, host.height).setData('statistics', skill);
        parent.add(root);
        learningCard(this.scene, root, host.width / 2, host.height / 2, host.width, host.height, true);
        const title = learningHost(this.mapLayout, 'detailTitle');
        learningText(this.scene, root, title.x, title.y, skill.label, 27, '#244944', 'left');
        const mastery = learningHost(this.mapLayout, 'detailMastery');
        learningMarks(this.scene, root, mastery.x, mastery.y, skill.stage, 9, 6);
        const close = learningHost(this.mapLayout, 'detailClose');
        const back = new LearningButton(this.scene, root, close, 'learningDetailBack', 'Zpět', '↑', () => {
            this.expandedSubAtoms.clear(); this.scrollPanel.setScrollOffset(0); this.renderProfile();
        });
        this.scrollPanel.clipInput(back.root);
        const path = learningHost(this.mapLayout, 'detailCatacombs');
        const open = new LearningButton(this.scene, root, path, 'learningCatacombs', 'Katakomby', '◇', () => {
            this.catacombs ??= CatacombProgressOverlay.forScene(this.scene);
            this.catacombs.show(skill.id, this.profile.slotIndex);
        });
        this.scrollPanel.clipInput(open.root);
        const metrics = [
            ['✓', `${skill.correct}`, 'Správně'], ['✕', `${skill.wrong}`, 'Chyby'],
            ['◎', skill.accuracy === null ? '—' : `${Math.round(skill.accuracy * 100)} %`, 'Posledních 20'],
            ['◷', skill.medianMs === null ? '—' : `${(skill.medianMs / 1000).toFixed(1)} s`, 'Čas'],
        ];
        metrics.forEach(([symbol, value, label], index) => {
            const m = learningHost(this.mapLayout, `detailMetric${index + 1}`);
            learningText(this.scene, root, m.x, m.y - 8, `${symbol} ${value}`, 27);
            learningText(this.scene, root, m.x, m.y + 25, label, 15, LEARNING_MUTED);
        });
        const table = learningHost(this.mapLayout, 'detailTable');
        const rowGaps = this.mapLayout.getElementDef('detailTable')?.data as { formRowGap: number; comparisonRowGap: number };
        const exampleColumn = learningHost(this.mapLayout, 'detailExampleColumn');
        const labelColumn = learningHost(this.mapLayout, 'detailLabelColumn');
        const correctColumn = learningHost(this.mapLayout, 'detailCorrectColumn');
        const wrongColumn = learningHost(this.mapLayout, 'detailWrongColumn');
        const accuracyColumn = learningHost(this.mapLayout, 'detailAccuracyColumn');
        if (skill.id === 'comparison_symbols') {
            const stats = getComparisonStatistics(this.profile.stats.masteryData.comparisonChapter!);
            root.setData('statistics', stats);
            const names = ['Velikost', 'Počet', 'Předměty a čísla', 'Čísla', 'Výrazy s pomocí', 'Výrazy'];
            stats.stages.forEach((stage, index) => {
                const rowY = table.y + index * rowGaps.comparisonRowGap;
                const complete = this.profile.stats.masteryData.comparisonChapter!.status === 'complete'
                    || index < this.profile.stats.masteryData.comparisonChapter!.currentStageIndex;
                learningText(this.scene, root, table.x, rowY, `${complete ? '✓' : '○'} ${names[index]}`, 20, '#244944', 'left');
                learningText(this.scene, root, correctColumn.x, rowY, `✓ ${stage.correct}`, 22);
                learningText(this.scene, root, wrongColumn.x, rowY, `✕ ${stage.wrong}`, 22);
                learningText(this.scene, root, accuracyColumn.x, rowY, stage.accuracy === null ? '—' : `${Math.round(stage.accuracy * 100)} %`, 22);
            });
        } else {
            let rowIndex = 0;
            ALL_PROBLEM_FORMS.forEach(form => {
                const example = learningFormExample(skill.id as SubAtomId, form);
                if (!example) return;
                const attempts = Object.values(this.profile.stats.masteryData.problemRecords)
                    .filter(record => record.subAtomId === skill.id && record.form === form).flatMap(record => record.attempts);
                const correct = attempts.filter(attempt => attempt.correct).length;
                const rowY = table.y + rowIndex++ * rowGaps.formRowGap;
                learningText(this.scene, root, exampleColumn.x, rowY, example.expression, 32);
                learningText(this.scene, root, labelColumn.x, rowY, example.label, 18);
                learningText(this.scene, root, correctColumn.x, rowY, `✓ ${correct}`, 23);
                learningText(this.scene, root, wrongColumn.x, rowY, `✕ ${attempts.length - correct}`, 23);
                learningText(this.scene, root, accuracyColumn.x, rowY, attempts.length ? `${Math.round(correct / attempts.length * 100)} %` : '—', 21);
            });
        }
        return y + host.y + host.height + 16;
    }

    public destroy(): void {
        this.catacombs?.destroy();
        this.scrollPanel?.destroy();
        if (this.mapLayout) destroyLearningLayout(this.scene, this.mapLayout, 'LearningMapOverlay');
        super.destroy();
    }
}

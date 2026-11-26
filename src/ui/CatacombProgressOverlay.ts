import Phaser from 'phaser';
import type { PetDefinition, PracticeTargetId, PlayerState } from '../types';
import type { FoxAbilityId } from '../types/foxAbilities';
import { SceneBuilder } from '../systems/SceneBuilder';
import { readLearningProfiles, LEARNING_STATE_MARKS, type LearningProfileSnapshot } from '../systems/LearningProfileView';
import { catacombProgress, CATACOMB_STAGE_LABELS, learningStage, nextCatacombStage, type CatacombStage, type CatacombStageProgress } from '../systems/CatacombProgress';
import { catacombBatchGoal } from '../systems/CatacombBatch';
import { getOpenPracticeTargets, getPracticeTargetState, preferredPracticeTarget } from '../systems/PracticeProgress';
import { PracticeSystem, type PracticePlayer } from '../systems/PracticeSystem';
import { FOX_ABILITY_CONFIG, getFoxJourney, allocateFoxAbilityPoint } from '../systems/FoxAbilitySystem';
import { getFoxLessonProgress, FOX_LESSON_CORRECT, FOX_LESSON_QUESTIONS, FOX_LESSON_NAMES } from '../systems/FoxLessons';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GameStateManager } from '../systems/GameStateManager';
import { voice } from '../audio/AudioDirector';
import { CatacombTrialOwner } from '../systems/CatacombTrialOwner';
import { CATACOMB_FOX_PET, getPetAttackPower } from '../systems/CatacombPetProgress';
import { getExamPresentation, getPracticeOperation } from './ExamPresentation';
import { drawComparisonSymbol } from './ComparisonProblemView';
import { destroyLearningLayout, learningHost, type LearningHost } from './LearningUi';
import { paintedText, paintedArt, craftedButton, paintedActor, PAINTED, CRAFTED, CRAFTED_ABILITIES, FOX_HEADS } from './CatacombPaintedUi';
import { PracticeChoiceControl, type PracticeChoiceRegion } from './PracticeChoiceControl';
import type { CatacombRewardView } from './CatacombTrialUI';
import { retainObservatoryAssets, warmObservatory } from './observatory/assets.js';
export { FOX_PORTRAITS, FOX_REWARD_ICONS } from './CatacombPaintedUi';

const sec = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const ABILITY_NAMES = { shield: 'Štít', heal: 'Léčení', strike: 'Zásah' };
const LEFT = {
    card: 'catacomb-left-module', focus: 'catacomb-left-module-focus', pin: 'catacomb-left-pin',
    footer: 'catacomb-left-footer', previous: 'catacomb-left-previous', next: 'catacomb-left-next',
    divider: 'catacomb-left-column-divider',
};
const MODULE_ROWS = ['module1', 'module2', 'module3'];
const MODULE_ROWS_WITHOUT_LESSON = ['lessonEntry', ...MODULE_ROWS];

/** Display receipt for the fox panel. Awards have already been saved by the trial. */
export interface FoxRewardArrival {
    slot: number;
    target: PracticeTargetId;
    reward: CatacombRewardView | { kind: 'power'; ability: FoxAbilityId; before: number; after: number };
}

export function takeFoxReward(data?: { foxReward?: FoxRewardArrival }): FoxRewardArrival | undefined {
    // Phaser retains scene data between starts. A receipt describes one visit.
    const arrival = data?.foxReward;
    if (data) delete data.foxReward;
    return arrival;
}

/** Browsing, pinning and entering are separate actions. All values belong to the pictured owner. */
export class CatacombProgressOverlay {
    private static instances = new WeakMap<Phaser.Scene, CatacombProgressOverlay>();
    static forScene(scene: Phaser.Scene): CatacombProgressOverlay {
        let value = this.instances.get(scene);
        if (!value || value.destroyed) { value = new CatacombProgressOverlay(scene); this.instances.set(scene, value); }
        return value;
    }
    readonly root: Phaser.GameObjects.Container;
    private builder: SceneBuilder;
    private content: Phaser.GameObjects.Container;
    private backdrop?: Phaser.GameObjects.Image;
    private profiles: LearningProfileSnapshot[] = [];
    private profileIndex = 0;
    private target: PracticeTargetId = 'A1';
    private selectedStage: CatacombStage | null = null;
    private page = 0;
    private availableLesson: FoxAbilityId | null = null;
    private journey = false;
    private reward?: FoxRewardArrival['reward'];
    private releaseArt?: () => void;
    private lesson = false;
    private destroyed = false;
    private previewTimer?: Phaser.Time.TimerEvent;
    private previewObjects: Phaser.GameObjects.GameObject[] = [];
    private targetOrder: PracticeTargetId[] = [];
    private progressCache = new Map<PracticeTargetId, CatacombStageProgress[]>();

    constructor(private scene: Phaser.Scene, private onClose?: () => void) {
        this.builder = new SceneBuilder(scene); this.builder.buildScene('CatacombProgressOverlay');
        const h = this.h('root');
        this.root = scene.add.container(h.x, h.y).setDepth(h.depth).setVisible(false).setName('catacombProgress');
        const backdrop = scene.add.rectangle(640, 360, h.width, h.height, 0x020711, .98).setInteractive();
        backdrop.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => e.stopPropagation());
        this.content = scene.add.container(); this.root.add([backdrop, this.content]);
        scene.events.once('shutdown', this.destroy, this);
    }
    private h(id: string): LearningHost { return learningHost(this.builder, id); }
    private get profile() { return this.profiles[this.profileIndex]; }
    private get data() { return this.profile.stats.masteryData; }
    private get owner(): PracticePlayer {
        const coop = CoopSessionManager.getInstance();
        return !coop.isCoopActive() ? 'active' : this.profile.slotIndex === coop.getPlayerASlotIndex() ? 'A' : 'B';
    }
    private get editable(): boolean {
        const coop = CoopSessionManager.getInstance();
        return coop.isCoopActive() ? [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()].includes(this.profile.slotIndex)
            : this.profile.slotIndex === (GameStateManager.getInstance().getActiveSlotIndex() ?? -1);
    }
    private get pinned(): PracticeTargetId | undefined {
        return preferredPracticeTarget(this.data, this.profile.player);
    }
    show(target?: PracticeTargetId, slot?: number, reward?: FoxRewardArrival['reward']): void {
        this.profiles = readLearningProfiles();
        if (slot !== undefined && !this.profiles.some(p => p.slotIndex === slot)) this.profiles = readLearningProfiles({ slotIndices: [slot] });
        if (!this.profiles.length) return;
        this.releaseArt ??= retainObservatoryAssets();
        this.profileIndex = Math.max(0, this.profiles.findIndex(p => p.slotIndex === slot));
        this.prepareSnapshot();
        const open = getOpenPracticeTargets(this.data);
        this.target = target && open.includes(target) ? target : this.pinned ?? open[0] ?? 'A1';
        this.page = target ? this.pageForTarget(this.target) : 0;
        this.reward = reward;
        this.journey = !!reward; this.lesson = !target && !!this.availableLesson; this.selectedStage = null;
        this.root.setVisible(true); this.render();
    }
    hide(): void {
        this.releaseArt?.(); this.releaseArt = undefined;
        this.clearPreview();
        this.root.setVisible(false);
        this.content.removeAll(true);
    }
    private refresh(): void {
        const slot = this.profile.slotIndex;
        this.profiles = readLearningProfiles({ slotIndices: this.profiles.map(p => p.slotIndex) });
        this.profileIndex = Math.max(0, this.profiles.findIndex(p => p.slotIndex === slot));
        this.prepareSnapshot();
        this.render();
    }
    private txt(parent: Phaser.GameObjects.Container, value: string, host: LearningHost, size = 24, word = true, color?: string) {
        return paintedText(this.scene, parent, host, value, size, word, color);
    }
    private art(parent: Phaser.GameObjects.Container, key: string, host: LearningHost) { return paintedArt(this.scene, parent, key, host); }
    private local(host: LearningHost, x: number, y: number, width: number, height: number): LearningHost {
        return { ...host, x, y, width, height };
    }
    private button(id: string, name: string, callback: () => void, frame: string = CRAFTED.action, selected = false, enabled = true) {
        const navigation = ['previous', 'next'].includes(id);
        const resolved = navigation ? CRAFTED.socket : frame === PAINTED.action ? CRAFTED.action : frame === PAINTED.card ? CRAFTED.module : frame;
        return craftedButton(this.scene, this.content, this.h(id), name, callback, resolved, selected, enabled);
    }
    private prepareSnapshot(): void {
        const lesson = getFoxLessonProgress(this.profile.player, this.data);
        this.availableLesson = lesson.ready ? lesson.next : null;
        this.progressCache.clear();
        const open = getOpenPracticeTargets(this.data);
        open.forEach(id => this.progressCache.set(id, catacombProgress(this.data, this.profile.player, id)));
        const score = (id: PracticeTargetId) => {
            const stages = this.progressCache.get(id)!;
            if (stages.some(p => p.ready)) return -100;
            const p = stages.find(p => !p.completed);
            return !p ? 300 : p.lock === 'exam' ? 200 : 100 - p.readinessPercent;
        };
        const scores = new Map(open.map(id => [id, score(id)]));
        this.targetOrder = open.sort((a, b) => scores.get(a)! - scores.get(b)!);
    }
    private targets(): PracticeTargetId[] { return this.targetOrder; }
    private get moduleRows(): string[] { return this.availableLesson ? MODULE_ROWS : MODULE_ROWS_WITHOUT_LESSON; }
    private pageForTarget(target: PracticeTargetId): number {
        return Math.max(0, Math.floor(this.targets().indexOf(target) / this.moduleRows.length));
    }
    private example(parent: Phaser.GameObjects.Container, id: PracticeTargetId, h: LearningHost, size = 28) {
        if (id === 'comparison_symbols') {
            [0, 1, 2].forEach((value, i) => parent.add(drawComparisonSymbol(this.scene, value, size, 0xffedbe)
                .setPosition(h.x + (i - 1) * size * 1.6, h.y).setDepth(h.depth)));
        } else this.txt(parent, getExamPresentation(id).compact, h, size, false);
    }
    private operation(parent: Phaser.GameObjects.Container, id: PracticeTargetId | undefined, h: LearningHost): void {
        if (id === 'comparison_symbols') {
            parent.add(drawComparisonSymbol(this.scene, 0, 32, 0xffe7a6).setPosition(h.x, h.y).setDepth(h.depth)); return;
        }
        if (!id) return;
        const kind = getPracticeOperation(id);
        this.art(parent, kind === 'add' ? 'catacomb-painted-operation-add' : kind === 'subtract' ? 'catacomb-painted-operation-subtract' : 'catacomb-painted-operation-mix', h);
    }
    private marks(parent: Phaser.GameObjects.Container, id: PracticeTargetId, h: LearningHost, size = 7, step = 16) {
        const n = LEARNING_STATE_MARKS[learningStage(getPracticeTargetState(this.data, id), this.profile.player, id)];
        for (let i = 0; i < 6; i++) parent.add(this.scene.add.star(h.x + (i - 2.5) * step, h.y, 4, size * .4, size,
            i < n ? 0xffdf8c : 0x183048).setStrokeStyle(1, i < n ? 0xffefbd : 0x7e8b93).setDepth(h.depth));
    }
    private clearPreview(): void {
        this.previewTimer?.remove(); this.previewTimer = undefined;
        this.previewObjects.forEach(o => { this.scene.tweens.killTweensOf(o); o.destroy(); }); this.previewObjects = [];
    }
    private render(): void {
        this.clearPreview(); this.content.removeAll(true);
        if (!this.journey) this.reward = undefined;
        this.backdrop = this.art(this.content, this.journey ? PAINTED.foxRoom : PAINTED.room, this.h('panel')).setName('catacombBackdrop');
        this.renderHeader();
        if (this.journey) {
            this.renderJourney();
        } else {
            this.renderPinned();
            this.renderList();
            if (this.lesson) this.renderLesson();
            else this.renderModule();
        }
        this.root.setData({ target: this.target, slot: this.profile.slotIndex, journey: this.journey, lesson: this.lesson, pinned: this.pinned ?? null });
    }
    private headerLine(parent: Phaser.GameObjects.Container, value: string, area: LearningHost, size: number, word = true) {
        const line = this.txt(parent, value, area, size, word);
        if (line.width > area.width) line.setFontSize(Math.floor(size * area.width / line.width));
        return line;
    }
    private headerControl(id: string, name: string, artwork: string, onTap: () => void) {
        const host = this.h(id);
        const regions = this.builder.getElementDef(id)!.data!.regions as Record<string, PracticeChoiceRegion>;
        const control = new PracticeChoiceControl(this.scene, { ...host, regions }, name, artwork, '', null, onTap);
        this.content.add(control.root);
        return control;
    }
    private renderHeader(): void {
        if (!this.journey) this.art(this.content, 'catacomb-header-divider', this.h('headerDivider'));
        const title = this.h(this.journey ? 'journeyTitle' : 'title');
        this.art(this.content, this.journey ? 'catacomb-header-fox-title' : 'catacomb-header-title', title);
        this.txt(this.content, this.journey ? 'Moje liška' : 'Katakomby',
            { ...title, y: title.y + (this.journey ? 12 : 10), height: 44 }, 34);
        this.headerControl('close', 'catacombProgressClose', 'catacomb-header-close', () => {
            this.hide();
            this.onClose?.();
        });
        this.profiles.forEach((profile, index) => this.renderOwner(profile, index));

        if (this.journey) {
            this.headerControl('return', 'catacombJourneyBack', 'catacomb-header-back', () => { this.journey = false; this.render(); });
            this.renderJourneyPin();
        } else {
            const id = 'foxButton', host = this.h(id);
            const regions = this.builder.getElementDef(id)!.data!.regions as Record<string, PracticeChoiceRegion>;
            const head = FOX_HEADS[Number(getFoxJourney(this.profile.player).form) - 1];
            const fox = this.headerControl(id, 'catacombJourney', head, () => { this.journey = true; this.render(); });
            this.headerLine(fox.surface, 'Moje liška', { ...regions.label, depth: host.depth }, 23);
        }
    }
    private renderOwner(profile: LearningProfileSnapshot, index: number): void {
        const prefix = this.journey ? 'journeyOwner' : 'owner';
        const id = prefix + (index + 1), host = this.h(id), active = index === this.profileIndex;
        const button = this.button(id, 'catacombOwner:' + profile.slotIndex, () => {
            if (active) return;
            const journey = this.journey;
            this.show(undefined, profile.slotIndex);
            if (journey) { this.journey = true; this.render(); }
        }, active ? PAINTED.ring : 'catacomb-header-silver-ring', active);
        const diameter = host.height * .90;
        this.art(button.surface, profile.player.characterType?.startsWith('boy') ? 'catacomb-header-hero' : 'catacomb-header-heroine',
            this.local(host, 0, 0, diameter, diameter));
        const badgeY = this.journey ? host.height * .33 : host.height * .49;
        const badge = this.local(host, 0, badgeY, 24, 24);
        this.art(button.surface, index === 0 ? 'catacomb-header-sun' : 'catacomb-header-crystal', badge);
        const name = this.h(prefix + 'Name' + (index + 1));
        const label = this.headerLine(button.surface, profile.player.name || 'Hrdina', { ...name, x: name.x - host.x, y: name.y - host.y }, 17);
        label.setStroke('#101526', 2);
        if (!this.journey) {
            const shade = this.art(button.surface, 'catacomb-header-name-shade',
                this.local(host, label.x, label.y, Math.max(78, label.width + 20), 22));
            button.surface.moveBelow<Phaser.GameObjects.GameObject>(shade, label);
        }
    }
    private renderJourneyPin(): void {
        const pin = this.pinned, id = 'journeyPin', host = this.h(id);
        const button = this.button(id, 'catacombPinned', () => {
            if (pin) { this.journey = false; this.page = this.pageForTarget(pin); this.selectTarget(pin); }
        }, CRAFTED.label, false, !!pin);
        if (!pin) {
            this.txt(button.surface, 'Pro trénink', this.local(host, 0, 0, 190, 32), 19);
            return;
        }
        const regions = this.builder.getElementDef(id)!.data!.regions as Record<string, PracticeChoiceRegion>;
        const area = (key: string) => ({ ...regions[key], depth: host.depth });
        this.art(button.surface, 'catacomb-header-pin', area('pin'));
        this.art(button.surface, 'catacomb-painted-operation-apple', area('icon'));
        const module = getExamPresentation(pin);
        this.headerLine(button.surface, 'Pro trénink', area('caption'), 15);
        this.headerLine(button.surface, module.title, area('module'), 16);
        if (pin === 'comparison_symbols') this.example(button.surface, pin, area('example'), 21);
        else this.headerLine(button.surface, module.compact, area('example'), 21, false);
    }
    private renderPinned(): void {
        const pinned = this.pinned, h = this.h('pin'), area = (key: string) => this.leftRegion('pin', key);
        const b = this.leftControl('pin', 'catacombPinned', LEFT.pin, () => {
            if (!pinned) return;
            this.page = this.pageForTarget(pinned);
            this.selectTarget(pinned);
        }, false, !!pinned);
        b.root.setData('pinned', pinned ?? null);
        if (!pinned) {
            this.txt(b.surface, 'Vyber příklady', this.local(h, 0, 0, 220, 30), 20);
            return;
        }
        this.art(b.surface, 'catacomb-painted-operation-apple', area('icon'));
        this.txt(b.surface, 'Pro trénink', area('caption'), 15);
        this.txt(b.surface, getExamPresentation(pinned).title, area('module'), 15);
        this.leftExample(b.surface, pinned, area('example'), pinned.endsWith('4') ? 16 : 21);
        this.marks(b.surface, pinned, area('marks'), 4.5, 12);
    }
    private selectTarget(id: PracticeTargetId): void { this.target = id; this.selectedStage = null; this.lesson = false; this.render(); }
    private leftRegion(id: string, key: string): LearningHost {
        const regions = this.builder.getElementDef(id)!.data!.regions as Record<string, PracticeChoiceRegion>;
        return { ...regions[key], depth: this.h(id).depth };
    }
    private leftExample(parent: Phaser.GameObjects.Container, id: PracticeTargetId, area: LearningHost, size: number): void {
        const examples = getExamPresentation(id).compact.split(/\s{3,}/);
        if (examples.length !== 2) { this.example(parent, id, area, size); return; }
        const gap = 16, width = (area.width - gap) / 2, offset = (width + gap) / 2;
        examples.forEach((value, i) => this.txt(parent, value,
            { ...area, x: area.x + (i ? offset : -offset), width }, size, false));
        parent.add(this.scene.add.rectangle(area.x, area.y, 1.5, Math.min(21, area.height - 10), 0xe1bc70)
            .setDepth(area.depth).setName('moduleExampleDivider'));
    }
    private leftControl(id: string, name: string, frame: string, action: () => void, viewed = false, enabled = true) {
        const host = this.h(id);
        const regions = this.builder.getElementDef(id)!.data!.regions as Record<string, PracticeChoiceRegion>;
        const control = new PracticeChoiceControl(this.scene, { ...host, regions }, name, frame, '', null, action, false, .28);
        control.setEnabled(enabled);
        // Cyan follows the actual frame; gold pins remain independent of browsing.
        control.root.setData('selected', viewed);
        if (viewed) this.art(control.surface, LEFT.focus, { ...host, x: 0, y: 0 }).setName('viewedModuleOutline');
        this.content.add(control.root);
        return control;
    }
    private renderList(): void {
        this.art(this.content, LEFT.divider, this.h('moduleDivider')).setName('catacombModuleDivider');
        if (this.availableLesson) {
            const area = (key: string) => this.leftRegion('lessonEntry', key);
            const b = this.leftControl('lessonEntry', 'catacombFoxLesson', LEFT.card, () => { this.lesson = true; this.render(); }, this.lesson);
            this.art(b.surface, FOX_HEADS[Number(getFoxJourney(this.profile.player).form) - 1], area('portrait'));
            this.art(b.surface, CRAFTED_ABILITIES[this.availableLesson], area('ability'));
            this.txt(b.surface, FOX_LESSON_NAMES[this.availableLesson].replace(' ', '\n'), area('label'), 23);
            this.art(b.surface, PAINTED.door, area('door'));
        }
        const targets = this.targets(), rows = this.moduleRows;
        const pages = Math.max(1, Math.ceil(targets.length / rows.length));
        this.page = Math.min(this.page, pages - 1);
        const nearest = targets.find(id => {
            const stages = this.progressCache.get(id)!;
            const goal = stages.find(stage => !stage.completed);
            return goal && goal.lock !== 'exam' && !stages.some(stage => stage.ready);
        });
        const offset = this.page * rows.length;
        targets.slice(offset, offset + rows.length).forEach((id, i) => {
            const hostId = rows[i];
            const area = (key: string) => this.leftRegion(hostId === 'lessonEntry' ? 'module1' : hostId, key);
            const progress = this.progressCache.get(id)!;
            const p = progress.find(p => p.ready) ?? progress.find(p => !p.completed) ?? progress[3];
            const r = this.leftControl(hostId, `catacombModule:${id}`, LEFT.card, () => this.selectTarget(id), !this.lesson && this.target === id);
            this.operation(r.surface, id, area('icon'));
            const close = id === nearest;
            this.leftExample(r.surface, id, area('example'), id.endsWith('4') ? 21 : 26);
            this.txt(r.surface, getExamPresentation(id).title, area(close ? 'nearTitle' : 'title'), 16);
            this.marks(r.surface, id, area('marks'), 5);
            this.txt(r.surface, sec(p.speedMs), area('time'), 16, false, '#b7f7ed');
            if (p.ready) this.art(r.surface, PAINTED.door, area('door'));
            else if (close) this.txt(r.surface, 'Na dosah', area('near'), 14, true, '#ffe397');
            if (this.pinned === id) this.art(r.surface, 'catacomb-header-pin', area('pin')).setName('pinnedModuleMarker');
            r.root.setData({ progress, pinned: this.pinned === id });
        });
        this.art(this.content, LEFT.footer, this.h('moduleFooter')).setName('catacombModuleFooter');
        if (pages > 1) {
            for (const [id, delta] of [['previous', -1], ['next', 1]] as const) {
                this.leftControl(id, `catacombModules:${id}`, LEFT[id], () => { this.page += delta; this.render(); }, false,
                    delta < 0 ? this.page > 0 : this.page + 1 < pages);
            }
            this.txt(this.content, `${this.page + 1} / ${pages}`, this.h('moduleCount'), 23, false).setName('catacombModulePage');
        } else {
            const footer = this.h('moduleFooter');
            for (const [key, value, word, size] of [['label', 'Moduly', true, 21], ['count', String(targets.length), false, 25]] as const) {
                const area = this.leftRegion('moduleFooter', key);
                this.txt(this.content, value, { ...area, x: footer.x + area.x, y: footer.y + area.y }, size, word);
            }
        }
        this.root.setData({ modulePage: this.page, modulePages: pages, moduleCount: targets.length });
    }
    private renderLesson(): void {
        const p = getFoxLessonProgress(this.profile.player, this.data), ability = p.next;
        if (!ability) { this.journey = true; this.render(); return; }
        if (p.ready && this.editable) warmObservatory(ability);
        this.art(this.content, 'catacomb-detail-lesson-rune', this.h('lessonRune'));
        this.art(this.content, 'catacomb-detail-lesson-title', this.h('lessonTitle'));
        this.txt(this.content, FOX_LESSON_NAMES[ability], this.h('lessonTitle'), 32);
        this.art(this.content, ability === 'shield' ? 'catacomb-detail-shield-reward' : CRAFTED_ABILITIES[ability], this.h('rewardIcon'));
        const before = getFoxJourney(this.profile.player).powers[ability];
        const rank = this.h('rewardValue');
        this.content.add(this.scene.add.circle(rank.x, rank.y, rank.width / 2, 0x08243b).setStrokeStyle(2, 0xf4c36a));
        this.txt(this.content, String(before + 1), rank, 23, false);
        this.txt(this.content, 'Odměna', this.h('lessonRewardLabel'), 21);
        if (ability === 'shield') {
            this.backdrop?.setTexture('catacomb-painted-shield-panel-v3');
            this.previewShield();
        } else if (this.backdrop) {
            const art = ability === 'heal'
                ? { plate: 'catacomb-heal-painting', light: 'catacomb-heal-light', sheet: 'catacomb-heal-light-sheet' }
                : { plate: 'catacomb-strike-painting', light: 'catacomb-strike-light', sheet: 'catacomb-strike-light-sheet' };
            const painting = this.art(this.content, art.plate, this.h('lessonPainting')).setName('foxLessonPainting');
            this.content.moveTo(painting, this.content.getIndex(this.backdrop) + 1);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                // The light pass is registered to the middle half of the same painting.
                const topInset = ability === 'heal' ? 25 * painting.scaleY : 0;
                const light = this.scene.add.sprite(painting.x, painting.y + topInset, art.sheet)
                    .setName('foxLessonPaintedLight').setScale(painting.displayWidth / 384)
                    .play({ key: art.light, repeatDelay: 550 });
                this.content.add(light);
                this.content.moveTo(light, this.content.getIndex(painting) + 1);
            }
        }
        const goal = this.h('lessonGoal');
        const step = goal.width / FOX_LESSON_QUESTIONS;
        for (let i = 0; i < FOX_LESSON_QUESTIONS; i++) {
            const x = goal.x + (i + .5) * step - goal.width / 2;
            this.content.add(this.scene.add.circle(x, goal.y - goal.height * .20, step * .35, 0x09213b, .85)
                .setName('foxLessonGoalDot').setDepth(goal.depth).setStrokeStyle(2.5, 0xe8b951));
        }
        this.txt(this.content, `✓ ${FOX_LESSON_CORRECT}/${FOX_LESSON_QUESTIONS}`,
            { ...goal, y: goal.y + goal.height * .28, height: goal.height * .43 }, 19, false, '#fff0bb')
            .setName('foxLessonPassMark');
        this.enterButton(p.ready, false, () => this.startFoxLesson(p));
    }
    private enterButton(ready: boolean, completed: boolean, action: () => void): void {
        const h = this.h('enter');
        const button = this.button('enter', 'catacombEnter', action,
            ready ? 'catacomb-detail-entrance-frame' : 'catacomb-detail-practice-frame', ready, ready && this.editable);
        this.art(button.surface, ready ? 'catacomb-detail-entrance' : completed ? 'catacomb-detail-stage-cleared' : PAINTED.closedDoor,
            this.local(h, -94, -1, 83, 63));
        this.txt(button.surface, completed ? 'Hotovo' : 'Vstoupit', this.local(h, 35, -1, 180, 43), 30);
        button.root.setData('ready', ready);
    }
    private startFoxLesson(lesson: ReturnType<typeof getFoxLessonProgress>): void {
        if (!this.editable || !lesson.ready || !lesson.next) return;
        const targetId = lesson.targetId;
        if (!targetId) return;
        this.hide();
        this.scene.scene.start('FoxLessonScene', {
            ownerSlot: this.profile.slotIndex, targetId, ability: lesson.next, returnScene: this.scene.scene.key,
        });
    }
    private previewShield(): void {
        this.clearPreview();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const orb = this.scene.add.circle(1082, 430, 7, 0xc5f43c).setDepth(6);
        this.content.add(orb); this.previewObjects.push(orb);
        this.scene.tweens.add({ targets: orb, x: 940, y: 395, duration: 650, ease: 'Sine.easeIn',
            onComplete: () => { this.scene.tweens.add({ targets: orb, x: 1000, y: 460, alpha: 0, duration: 400 }); } });
        this.previewTimer = this.scene.time.delayedCall(3300, () => { if (this.root.visible && this.lesson && !this.journey) this.previewShield(); });
    }
    private renderModule(): void {
        const progress = this.progressCache.get(this.target) ?? catacombProgress(this.data, this.profile.player, this.target);
        const selected = this.selectedStage ?? nextCatacombStage(progress).stage;
        this.selectedStage = selected; const current = progress.find(p => p.stage === selected)!;
        this.backdrop?.setTexture(current.ready || current.completed ? 'catacomb-painted-speed-panel-open-v3' : 'catacomb-painted-speed-panel-closed-v3');
        const title = this.h('detailTitle');
        this.art(this.content, 'catacomb-detail-module-title', title);
        this.txt(this.content, getExamPresentation(this.target).title, { ...title, y: title.y + 10 }, 25);
        this.example(this.content, this.target, this.h('detailExample'), this.target.endsWith('4') ? 23 : 30);
        this.marks(this.content, this.target, this.h('detailMarks'), 7);
        const axis = this.h('axis'), values = progress.map(p => p.targetMs), min = Math.min(...values) * .8, max = Math.max(...values) * 1.16;
        const rail = this.art(this.content, 'catacomb-painted-speed-rail', axis).setName('catacombSpeedRail');
        // The painted diamond centers are 24 px inside the canonical 788 px source.
        // Use its fitted geometry for every value and portrait, not the layout box.
        const span = rail.displayWidth * (1 - 48 / rail.width), start = rail.x - span / 2, end = rail.x + span / 2;
        const x = (ms: number) => start + Math.min(1, Math.max(0, (ms - min) / (max - min))) * span;
        rail.setData({ start, end, min, max });
        progress.forEach(p => {
            const h = { ...axis, x: x(p.targetMs), y: axis.y + 26, width: 76, height: 61 };
            const b = craftedButton(this.scene, this.content, h, `catacombStage:${p.stage}`, () => {
                this.selectedStage = p.stage; this.render();
                if (p.lock === 'exam') voice(this.scene, 'vo.catacomb.exam-first');
            }, p.completed ? 'catacomb-detail-stage-cleared' : p.ready ? 'catacomb-detail-stage-ready' : 'catacomb-detail-stage-locked',
            p.stage === selected);
            if (p.stage === selected) {
                const halo = this.scene.add.ellipse(0, 0, 43, 43, 0x1c7488, .45).setStrokeStyle(2, 0x75e1dc);
                b.surface.addAt(halo, 0);
            }
            this.txt(this.content, CATACOMB_STAGE_LABELS[p.stage], { ...h, y: h.y + 30, width: 109, height: 21 }, 15);
            this.txt(this.content, sec(p.targetMs), { ...h, y: axis.y - 22 }, 20, false);
            this.content.add(this.scene.add.rectangle(h.x, axis.y, 3, 19, 0xffedb0)); b.root.setData('progress', p);
        });
        const mark = this.h('axisCurrent'), hint = this.h('axisHint');
        let hintX = hint.x;
        if (current.speedMs !== null) {
            const position = x(current.speedMs);
            const badgeX = Phaser.Math.Clamp(position, start + mark.width / 2, end - mark.width / 2);
            this.content.add(this.scene.add.graphics().fillStyle(0x0d3a47, 1)
                .fillRoundedRect(badgeX - mark.width / 2, mark.y - mark.height / 2, mark.width, mark.height, 19)
                .lineStyle(2, 0x7eebde).strokeRoundedRect(badgeX - mark.width / 2, mark.y - mark.height / 2, mark.width, mark.height, 19));
            this.art(this.content, this.profile.player.characterType.startsWith('boy') ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait',
                { ...mark, x: badgeX - 38, width: 28, height: 30 });
            this.txt(this.content, `${current.speedMs > max ? '› ' : ''}${sec(current.speedMs)}`, { ...mark, x: badgeX + 14, width: 87 }, 19, false, '#cbfff1');
            if (badgeX - mark.width / 2 < hintX + hint.width / 2 + 12) hintX = end - hint.width / 2;
            this.content.add(this.scene.add.graphics().lineStyle(2, 0x81f4ed).strokePoints([
                { x: badgeX, y: mark.y + mark.height / 2 }, { x: position, y: mark.y + mark.height / 2 }, { x: position, y: axis.y - 9 }
            ]));
        }
        this.txt(this.content, '←', { ...hint, x: hintX - 41, width: 26 }, 20, false, '#b8eee4');
        this.txt(this.content, 'Rychleji', { ...hint, x: hintX + 10, width: 78 }, 17, true, '#b8eee4');
        const requirements = this.h('requirements');
        const goal = catacombBatchGoal(selected);
        const reason = current.completed ? '✓' : current.ready ? `✓ ${goal.required}/${goal.total}`
            : current.lock === 'exam' ? '📖 → ★ ★' : current.lock === 'previous' ? '★ → ★' : '◷  →  ✓';
        this.txt(this.content, reason, !current.ready && !current.completed ? this.h('lockedRequirementSymbol') : requirements, 17, false, current.ready ? '#b8fff0' : '#ffdd95');
        if (!current.ready && !current.completed) {
            this.txt(this.content, current.lock === 'exam' ? 'Nejdřív zkouška' : current.lock === 'previous' ? 'Předchozí stupeň' : 'Ještě trénink', this.h('lockedRequirementLabel'), 16);
        }
        this.art(this.content, 'catacomb-detail-laurels', this.h('rewardLaurels'));
        paintedActor(this.scene, this.content, this.h('rewardFox'), 'fox', this.profile.player.characterType,
            getFoxJourney(this.profile.player).form, true);
        const point = selected === 'grandmaster' || selected === 'legend';
        const stat = this.h('rewardStatIcon');
        this.art(this.content, point ? CRAFTED.pawActive : 'catacomb-detail-planted-sword', point ? { ...stat, height: 63 } : stat);
        this.art(this.content, 'catacomb-detail-reward-title', this.h('rewardFrame'));
        this.txt(this.content, 'Za zkoušku', this.h('rewardLabel'), 16, true, '#b5f0e4');
        const owned = this.profile.player.unlockedPets.includes('catacomb_creature_A');
        if (current.ready && this.editable) warmObservatory(point ? 'rune' : owned ? 'attack' : 'rescue');
        const value = point ? 'Bod lišky' : 'Útok';
        const amount = current.completed ? '✓' : point || owned ? '+1' : '6';
        const amountHost = this.h('rewardAmount');
        const word = this.txt(this.content, value, amountHost, 24);
        const number = this.txt(this.content, amount, amountHost, 24, false);
        word.setX(amountHost.x - (number.width + 7) / 2);
        number.setX(amountHost.x + (word.width + 7) / 2);
        const pinned = this.pinned === this.target;
        const train = this.button('train', 'catacombChooseTraining', () => { if (this.editable && PracticeSystem.setTarget(this.target, this.owner)) this.refresh(); }, 'catacomb-detail-practice-frame', pinned, this.editable && !pinned);
        const trainHost = this.h('train');
        this.art(train.surface, 'catacomb-painted-operation-apple', this.local(trainHost, -87, -2, 49, 54));
        this.txt(train.surface, pinned ? '✓ Pro trénink' : 'Procvičovat', this.local(trainHost, 27, -1, 178, 39), 24);
        this.enterButton(current.ready, current.completed, () => this.startModuleTrial(this.target, current));
    }
    private startModuleTrial(target: PracticeTargetId, progress: CatacombStageProgress): void {
        if (!this.editable || !progress.ready) return;
        const stage = progress.stage;
        this.hide();
        this.scene.scene.start('CatacombTrialScene', {
            subAtomId: target, ownerSlot: this.profile.slotIndex, returnScene: this.scene.scene.key,
            examType: stage === 'fluency_challenge' ? stage : 'mastery_challenge',
            ...(stage === 'grandmaster' || stage === 'legend' ? { speedStage: stage } : {}),
        });
    }
    private mutatePlayer(action: (player: PlayerState) => boolean): void {
        if (!this.editable) return;
        const owner = new CatacombTrialOwner(this.profile.slotIndex);
        if (!owner.activate()) return;
        try { if (action(owner.player)) owner.save(); } finally { owner.release(); }
        this.refresh();
    }
    private renderJourney(): void {
        const journey = getFoxJourney(this.profile.player), lessons = getFoxLessonProgress(this.profile.player, this.data);
        const form = Number(journey.form) - 1, next = Math.min(4, form + 1), milestones = FOX_ABILITY_CONFIG.appearanceMilestones;
        this.art(this.content, 'fox-journey-guild-crest', this.h('foxCrest'));
        paintedActor(this.scene, this.content, this.h('now'), 'fox', this.profile.player.characterType, journey.form, true);
        paintedActor(this.scene, this.content, this.h('upcoming'), 'fox', this.profile.player.characterType, `0${next + 1}`);
        const fox = (this.scene.cache.json.get('pets') as PetDefinition[]).find(p => p.id === CATACOMB_FOX_PET)!;
        this.art(this.content, CRAFTED.label, this.h('attackFrame'));
        this.art(this.content, CRAFTED.swords, this.h('attackIcon'));
        const attack = getPetAttackPower(fox, this.profile.player);
        const previous = this.reward?.kind === 'attack' && this.reward.before < attack ? this.reward.before : undefined;
        if (previous !== undefined) this.headerLine(this.content, previous + ' →', this.h('attackLabel'), 26, false).setName('foxPreviousAttack');
        else this.txt(this.content, 'Nyní', this.h('attackLabel'), 25);
        this.txt(this.content, String(attack), this.h('attackValue'), 34, false, previous !== undefined ? '#9effe3' : undefined).setName('foxAttackPower');
        this.art(this.content, CRAFTED.label, this.h('nextLabel'));
        this.art(this.content, 'fox-journey-scroll', this.h('nextScroll'));
        this.txt(this.content, form === 4 ? 'Hotovo' : 'Příště', this.h('nextCaption'), 27);
        const growth = this.h('growth'), current = journey.points - milestones[form], goal = form === 4 ? 0 : milestones[next] - milestones[form];
        const width = growth.width;
        const arc = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(growth.x - width / 2, growth.y + 41),
            new Phaser.Math.Vector2(growth.x, growth.y - 36),
            new Phaser.Math.Vector2(growth.x + width / 2, growth.y + 41));
        const arcPoints = arc.getPoints(40);
        const gold = this.scene.add.graphics().setDepth(growth.depth);
        gold.lineStyle(12, 0x503013).strokePoints(arcPoints).lineStyle(8, 0xbf781d).strokePoints(arcPoints)
            .lineStyle(3, 0xffdb79).strokePoints(arcPoints);
        this.content.add(gold);
        for (let i = 0; i < 4; i++) this.art(this.content, form === 4 || current / goal >= (i + 1) / 4 ? 'fox-journey-paw-lit' : 'fox-journey-paw',
            { ...growth, x: growth.x + (i - 1.5) * width * .226, y: growth.y + (i === 0 || i === 3 ? 18 : 0), width: 72, height: 68 });
        this.txt(this.content, 'Další podoba', this.h('growthTitle'), 20).setStroke('#19202b', 2);
        this.txt(this.content, form === 4 ? '✓' : `${current} / ${goal}`, this.h('growthValue'), 25, false).setStroke('#19202b', 3);
        const insignia = { shield: 'fox-journey-shield', heal: 'fox-journey-heal', strike: 'fox-journey-strike' };
        (['shield', 'heal', 'strike'] as const).forEach((ability, i) => {
            const canImprove = journey.availablePoints > 0 || (lessons.ready && lessons.next === ability);
            const improve = () => {
                if (!this.editable || !canImprove) return;
                if (journey.availablePoints) this.mutatePlayer(player => {
                    if (!allocateFoxAbilityPoint(player, ability)) return false;
                    this.reward = { kind: 'power', ability, before: journey.powers[ability], after: getFoxJourney(player).powers[ability] };
                    return true;
                });
                else {
                    this.lesson = true; this.journey = false;
                    this.render();
                }
            };
            const h = this.h(`ability${i + 1}`), b = this.button(`ability${i + 1}`, `foxAbility:${ability}`, () => {
                improve();
            }, 'fox-journey-ability-rail', canImprove, this.editable && canImprove);
            this.art(b.surface, insignia[ability], this.local(h, -116, -5, 113, 94));
            this.txt(b.surface, ABILITY_NAMES[ability], this.local(h, journey.powers[ability] || lessons.next === ability ? 19 : 35, -1, 152, 39), 27);
            const gained = this.reward?.kind === 'power' && this.reward.ability === ability ? this.reward : undefined;
            if (gained) this.headerLine(b.surface, gained.before + ' → ' + gained.after, this.local(h, 109, -1, 65, 39), 21, false)
                .setColor('#9effe3').setName('foxPowerGained:' + ability);
            else if (journey.powers[ability] || lessons.next === ability) this.txt(b.surface,
                journey.powers[ability] ? String(journey.powers[ability]) : '→ 1', this.local(h, 112, -1, 52, 39), 23, false);
            const path = this.h(`abilityPath${i + 1}`), power = journey.powers[ability];
            const base = Math.floor(power / 4) * 4;
            const firstX = path.x - path.width * .47;
            const step = path.width * .3;
            const chain = this.scene.add.graphics().setDepth(path.depth);
            const end = firstX + 3 * step;
            chain.lineStyle(6, 0x563c21).lineBetween(h.x + h.width / 2 - 9, path.y, end, path.y)
                .lineStyle(2, 0xefc472).lineBetween(h.x + h.width / 2 - 9, path.y - 1, end, path.y - 1);
            if (lessons.ready && lessons.next === ability) {
                chain.lineStyle(8, 0x00ebe7, .3).lineBetween(h.x + h.width / 2 - 8, path.y, firstX, path.y)
                    .lineStyle(3, 0xbafff9).lineBetween(h.x + h.width / 2 - 8, path.y, firstX, path.y);
            }
            this.content.add(chain);
            for (let n = 0; n < 4; n++) {
                const level = base + n + 1, earned = power >= level;
                const upcoming = level === power + 1;
                const node = { ...path, x: firstX + n * step, width: upcoming ? 90 : 74, height: upcoming ? 73 : 57 };
                if (n < 3) this.art(this.content, 'fox-journey-rune-link', { ...path, x: node.x + step / 2, width: 33, height: 23 });
                const spendHere = upcoming && journey.availablePoints > 0;
                const name = spendHere ? `foxAllocate:${ability}` : `foxAbilityStep:${ability}:${level}`;
                const ctl = craftedButton(this.scene, this.content, node, name, improve, CRAFTED.socket,
                    upcoming && canImprove, this.editable && upcoming && canImprove);
                if ((upcoming && canImprove) || level === gained?.after) this.art(ctl.surface, 'fox-journey-socket-halo', this.local(node, 0, 0, node.width, node.height));
                if (spendHere) {
                    this.txt(ctl.surface, '+', this.local(node, 0, -2, 46, 48), 36, false, '#baffeb');
                } else {
                    const symbol = this.art(ctl.surface, earned ? insignia[ability] : upcoming && canImprove ? CRAFTED.lockActive : CRAFTED.lock,
                        this.local(node, 0, -1, upcoming ? 59 : 41, upcoming ? 62 : 39));
                    if (!upcoming && !earned) symbol.setTint(0xe3c8ad);
                }
            }
        });
        const pointCount = journey.availablePoints || (this.reward?.kind === 'ability' ? this.reward.after - this.reward.before : 0);
        if (pointCount > 0) {
            const points = this.h('pointCount');
            this.art(this.content, 'fox-journey-paw-lit', { ...points, x: points.x - 23, width: 36, height: 35 });
            this.txt(this.content, `+${pointCount}`, { ...points, x: points.x + 18 }, 23, false).setStroke('#19202b', 2).setName('foxRewardPoints');
        }
        if (lessons.ready && lessons.next) {
            const row = ['shield', 'heal', 'strike'].indexOf(lessons.next), p = this.h(`abilityPath${row + 1}`), a = this.h('journeyAction');
            const fromX = p.x - p.width * .47 + 30, fromY = p.y - 21;
            const toX = a.x - a.width * .15, toY = a.y - a.height * .34;
            // Follow the open strip above the active row. Approach the portal
            // from the left on the lower rows so the guide clears every socket.
            const curve = new Phaser.Curves.CubicBezier(new Phaser.Math.Vector2(fromX, fromY),
                new Phaser.Math.Vector2(fromX + 58, fromY - 49),
                new Phaser.Math.Vector2(toX - 44, Math.min(fromY - 39, toY - 40)),
                new Phaser.Math.Vector2(toX, toY));
            const points = curve.getPoints(56), guide = this.scene.add.graphics().setDepth(p.depth);
            guide.lineStyle(19, 0x00e9e7, .08).strokePoints(points).lineStyle(10, 0x47ffff, .22).strokePoints(points)
                .lineStyle(4, 0x76f8f2, .9).strokePoints(points).lineStyle(1.7, 0xecfffc).strokePoints(points);
            const direction = curve.getTangent(1);
            const backX = toX - direction.x * 24, backY = toY - direction.y * 24;
            const wingX = direction.y * 10, wingY = -direction.x * 10;
            guide.fillStyle(0x61efec).fillTriangle(toX, toY, backX + wingX, backY + wingY, backX - wingX, backY - wingY)
                .lineStyle(1.5, 0xf2ffff).strokeTriangle(toX, toY, backX + wingX, backY + wingY, backX - wingX, backY - wingY);
            this.content.add(guide); this.previewObjects.push(guide);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.scene.tweens.add({ targets: guide, alpha: .8, duration: 1200, yoyo: true, repeat: -1 });
        }
        const readyTarget = this.targets().find(id => this.progressCache.get(id)!.some(p => p.ready));
        const gateReady = lessons.next ? lessons.ready : !!readyTarget;
        if (this.editable && gateReady) {
            const stage = readyTarget && this.progressCache.get(readyTarget)?.find(p => p.ready)?.stage;
            warmObservatory(lessons.next ?? (stage === 'grandmaster' || stage === 'legend' ? 'rune'
                : this.profile.player.unlockedPets.includes('catacomb_creature_A') ? 'attack' : 'rescue'));
        }
        this.button('journeyAction', 'foxNextLesson', () => {
            if (lessons.ready) { this.startFoxLesson(lessons); return; }
            if (!lessons.next && readyTarget) {
                const stage = this.progressCache.get(readyTarget)?.find(p => p.ready);
                if (stage) this.startModuleTrial(readyTarget, stage);
                return;
            }
            this.journey = false; this.lesson = !!lessons.next; this.selectedStage = null;
            this.render();
        }, gateReady ? 'catacomb-painted-journey-door-open' : 'catacomb-painted-journey-door-closed', false,
        !gateReady || this.editable).root.setData('ready', gateReady);
        this.txt(this.content, lessons.next ? FOX_LESSON_NAMES[lessons.next] : 'Další zkoušky', this.h('journeyActionLabel'), 22);
        const owns = this.profile.player.ownedPets.includes(CATACOMB_FOX_PET), equipped = this.profile.player.activePet === CATACOMB_FOX_PET;
        if (owns && !equipped) {
            const equip = this.button('equip', 'foxEquip', () => this.mutatePlayer(player => { if (!player.ownedPets.includes(CATACOMB_FOX_PET)) return false; player.activePet = CATACOMB_FOX_PET; return true; }), CRAFTED.label, false, this.editable);
            this.art(equip.surface, FOX_HEADS[form], this.local(this.h('equip'), -79, 0, 40, 40));
            this.txt(equip.surface, 'Vzít lišku', this.local(this.h('equip'), 22, 0, 174, 35), 22);
        } else if (this.reward?.kind === 'rescue' && !owns) {
            const h = this.h('equip');
            this.art(this.content, CRAFTED.label, h);
            this.art(this.content, FOX_HEADS[form], { ...h, x: h.x - 73, width: 42, height: 42 });
            this.txt(this.content, 'U Pythie', { ...h, x: h.x + 22, width: 142 }, 22).setName('foxRescued');
        } else if (equipped) {
            const h = this.h('equip');
            const status = craftedButton(this.scene, this.content, h, 'foxEquipped', () => {}, CRAFTED.label, false, false);
            this.art(status.surface, FOX_HEADS[form], this.local(h, -79, 0, 40, 40));
            this.txt(status.surface, 'V družině', this.local(h, 8, 0, 128, 30), 21);
            this.txt(status.surface, '✓', this.local(h, 87, 0, 28, 30), 22, false, '#b7f7ed');
        }
    }
    destroy(): void {
        if (this.destroyed) return; this.destroyed = true; this.clearPreview();
        this.releaseArt?.(); this.releaseArt = undefined;
        this.scene.events.off('shutdown', this.destroy, this); this.root.destroy();
        destroyLearningLayout(this.scene, this.builder, 'CatacombProgressOverlay');
    }
}

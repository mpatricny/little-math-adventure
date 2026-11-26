import Phaser from 'phaser';
import type { MathProblem, PracticeTargetId } from '../types';
import type { FoxAbilityId } from '../types/foxAbilities';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CatacombTrialOwner } from '../systems/CatacombTrialOwner';
import { admitFoxLesson, completeFoxLesson, drawFoxLessonArithmeticKeys, FOX_LESSON_NAMES, FOX_LESSON_QUESTIONS,
    passedFoxLessonQuestions, type FoxLessonAdmission, type FoxLessonAnswer } from '../systems/FoxLessons';
import { FoxAbilitySystem, getFoxJourney } from '../systems/FoxAbilitySystem';
import { MasterySystem } from '../systems/MasterySystem';
import { generateComparisonExamProblems, generateComparisonTrainingProblems } from '../systems/ComparisonLearningSystem';
import { MathEngine } from '../systems/MathEngine';
import { ObservatoryRound } from '../ui/ObservatoryRound';
import { CatacombTrialUI } from '../ui/CatacombTrialUI';
import type { FoxRewardArrival } from '../ui/CatacombProgressOverlay';
import { getCatacombBatchRules } from '../systems/CatacombBatch';
import { GREEN, RED, icon } from '../ui/mathboard/Art';
import { learningHost } from '../ui/LearningUi';
import { paintedArt, paintedText, paintedActor, paintedButton, PAINTED, FOX_REWARD_ICONS } from '../ui/CatacombPaintedUi';
import { BattleFoxEffects } from '../ui/BattleFoxEffects';
import { battleBodyBounds } from '../ui/BattleActorGeometry';
import { CATACOMB_FOX_PET } from '../systems/CatacombPetProgress';

interface Init { ownerSlot?: number; targetId: PracticeTargetId; ability: FoxAbilityId; returnScene?: string }

/** The owner earns the constellation in the observatory, then tries its power on practice actors. */
export class FoxLessonScene extends Phaser.Scene {
    private args!: Init;
    private owner!: CatacombTrialOwner;
    private builder!: SceneBuilder;
    private root!: Phaser.GameObjects.Container;
    private ui!: Phaser.GameObjects.Container;
    private actors!: Phaser.GameObjects.Container;
    private round?: ObservatoryRound;
    private admission: FoxLessonAdmission | null = null;
    private answers: FoxLessonAnswer[] = [];
    private queue: MathProblem[] = [];
    private phase: 'ask' | 'demo' | 'effect' | 'victory' | 'retry' = 'ask';
    private effects!: BattleFoxEffects;
    private hero!: Phaser.GameObjects.Sprite;
    private fox!: Phaser.GameObjects.Sprite;
    private enemy!: Phaser.GameObjects.Sprite;
    private demoSystem?: FoxAbilitySystem;
    private heroHp = 3;
    private enemyHp = 3;
    private demoUsed = false;
    private beforePower = 0;
    constructor() { super({ key: 'FoxLessonScene' }); }
    init(args: Init): void {
        this.args = args; this.admission = null; this.answers = []; this.queue = []; this.round = undefined;
        this.phase = 'ask'; this.demoUsed = false; this.demoSystem = undefined;
    }
    create(): void {
        this.owner = new CatacombTrialOwner(this.args.ownerSlot);
        if (!this.owner.activate()) { this.scene.start(this.args.returnScene ?? 'GuildScene'); return; }
        this.events.once('shutdown', () => { this.round = undefined; this.owner.release(); });
        this.admission = admitFoxLesson(this.owner.player, this.owner.data, this.args.targetId, this.args.ability, Phaser.Utils.String.UUID());
        if (!this.admission) { this.leave(); return; }
        this.beforePower = getFoxJourney(this.owner.player).powers[this.args.ability];
        this.builder = new SceneBuilder(this); this.builder.buildScene('FoxLessonScene');
        this.root = this.add.container(); this.actors = this.add.container(); this.ui = this.add.container().setDepth(1000);
        const h = this.h('background'); paintedArt(this, this.root, 'catacomb-rune-chamber', h);
        this.root.add(this.actors);
        this.effects = new BattleFoxEffects(this);
        this.fillQueue();
        if (this.queue.length < FOX_LESSON_QUESTIONS) { this.showRetry(); return; }
        this.root.setVisible(false);
        this.round = new ObservatoryRound(this, this.builder,
            getCatacombBatchRules(this.owner.data, this.args.targetId, 'lesson', this.queue),
            this.queue, this.args.ability, {
                onAnswer: answer => {
                    if (!this.owner.isCurrent()) { this.leave(); return; }
                    this.answers.push({ problemKey: this.key(answer.problem), correct: answer.correct, assisted: answer.assisted });
                },
                onFinish: batch => {
                    if (!this.owner.isCurrent()) { this.leave(); return; }
                    if (batch.passed && passedFoxLessonQuestions(this.answers)) {
                        this.round?.destroy();
                        this.round = undefined;
                        this.root.setVisible(true);
                        this.showDemo();
                    } else {
                        this.phase = 'retry';
                        new CatacombTrialUI(this, this.builder).showResult(batch, null, () => this.leave(),
                            () => this.scene.restart(this.args), { primary: 'foxLessonRetry', secondary: 'foxLessonBack' });
                    }
                },
                onExit: () => this.leave(),
            });
    }
    private h(id: string) { return learningHost(this.builder, id); }
    private leave(): void {
        const ability = this.args.ability;
        const foxReward: FoxRewardArrival | undefined = this.phase === 'victory' && this.owner.isCurrent() ? {
            slot: this.owner.slot, target: this.args.targetId,
            reward: { kind: 'power', ability, before: this.beforePower, after: getFoxJourney(this.owner.player).powers[ability] },
        } : undefined;
        this.scene.start(this.args.returnScene ?? 'GuildScene', { foxReward });
    }
    private key(p: MathProblem): string { return p.masteryKey ?? p.id; }
    private fillQueue(): void {
        // Comparison exams rotate a chapter counter. Give this lesson its own draw and fresh value variants.
        if (this.args.targetId === 'comparison_symbols') {
            const chapter = MasterySystem.getInstance().getComparisonChapterState();
            const variant = Phaser.Math.Between(0, 23);
            this.queue = chapter.status === 'training'
                ? generateComparisonTrainingProblems(chapter, FOX_LESSON_QUESTIONS, false, variant)
                : generateComparisonExamProblems({ ...chapter }, FOX_LESSON_QUESTIONS, variant);
            return;
        }
        const engine = new MathEngine(this.registry);
        this.queue = drawFoxLessonArithmeticKeys(this.args.targetId)
            .map(key => engine.generateProblemFromKey(key, 'practice')).filter((p): p is MathProblem => !!p);
    }
    private showRetry(): void {
        this.phase = 'retry'; this.ui.removeAll(true); this.actors.removeAll(true);
        this.back(); this.drawOwner();
        paintedArt(this, this.ui, PAINTED.title, this.h('title'));
        paintedText(this, this.ui, this.h('title'), 'Ještě jednou', 34);
        paintedActor(this, this.actors, this.h('retryFox'), 'fox', this.owner.player.characterType, getFoxJourney(this.owner.player).form, true);
        const goal = this.h('retryGoal');
        const step = goal.width / FOX_LESSON_QUESTIONS;
        for (let i = 0; i < FOX_LESSON_QUESTIONS; i++) {
            const x = goal.x + (i - (FOX_LESSON_QUESTIONS - 1) / 2) * step;
            const answer = this.answers[i], success = answer?.correct && !answer.assisted;
            const fill = answer ? (success ? GREEN : RED) : 0x0c2b41;
            this.ui.add(this.add.circle(x, goal.y, step * .4, fill).setStrokeStyle(2, 0xffda85));
            if (answer) this.ui.add(icon(this, success ? 'check' : 'cross', 28).setPosition(x, goal.y));
        }
        const h = this.h('retry'), retry = paintedButton(this, this.ui, h, 'foxLessonRetry', () => this.scene.restart(this.args));
        paintedText(this, retry.surface, { ...h, x: -78, y: 0, width: 42 }, '↻', 38, false);
        paintedText(this, retry.surface, { ...h, x: 32, y: 0, width: 160 }, 'Znovu', 30);
    }
    private drawOwner(): void {
        const h = this.h('owner');
        paintedArt(this, this.ui, this.owner.player.characterType.startsWith('boy') ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait', h);
        paintedArt(this, this.ui, PAINTED.ring, { ...h, width: h.width + 6, height: h.height + 6 });
        paintedText(this, this.ui, this.h('ownerName'), this.owner.player.name, 22);
    }
    private back(): void {
        const h = this.h('back'), back = paintedButton(this, this.ui, h, 'foxLessonBack', () => this.leave());
        paintedText(this, back.surface, { ...h, x: 0, y: 0 }, '←', 32, false);
    }
    private showDemo(): void {
        this.phase = 'demo'; this.actors.removeAll(true);
        this.hero = paintedActor(this, this.actors, this.h('hero'), 'hero', this.owner.player.characterType);
        this.fox = paintedActor(this, this.actors, this.h('fox'), 'fox', this.owner.player.characterType, getFoxJourney(this.owner.player).form, true);
        this.enemy = paintedActor(this, this.actors, this.h('enemy'), 'slime');
        this.heroHp = this.args.ability === 'heal' ? 2 : 3; this.enemyHp = 3;
        // The real effect system runs against a sandbox actor set. Only the completed lesson is persisted.
        const preview = structuredClone(this.owner.player);
        preview.catacombFoxJourney ??= { version: 1, awards: {} };
        preview.catacombFoxJourney.lessons ??= {};
        preview.catacombFoxJourney.lessons[this.args.ability] = { evidenceId: 'lesson-demonstration', earnedAt: Date.now(), targetId: this.args.targetId };
        this.demoSystem = new FoxAbilitySystem('fox-lesson-preview', [{ id: 'A', profileId: 'preview', player: preview }], () => true);
        this.drawDemo();
    }
    private drawDemo(): void {
        this.ui.removeAll(true); this.back(); this.drawOwner();
        paintedArt(this, this.ui, PAINTED.title, this.h('title'));
        paintedText(this, this.ui, this.h('title'), this.phase === 'victory' ? 'Hotovo!' : FOX_LESSON_NAMES[this.args.ability], 34);
        paintedText(this, this.ui, this.h('heroHp'), '♥'.repeat(this.heroHp) + '♡'.repeat(3 - this.heroHp), 33, false, '#ffadbd');
        paintedText(this, this.ui, this.h('enemyHp'), '♥'.repeat(this.enemyHp) + '♡'.repeat(3 - this.enemyHp), 29, false, '#ffadbd');
        if (this.phase === 'victory') {
            const h = this.h('prize'); paintedArt(this, this.ui, PAINTED.action, h);
            paintedArt(this, this.ui, FOX_REWARD_ICONS[this.args.ability], { ...h, x: h.x - 95, width: 65, height: 70 });
            paintedText(this, this.ui, { ...h, x: h.x + 35 }, `${this.beforePower} → ${getFoxJourney(this.owner.player).powers[this.args.ability]}`, 33, false);
            const done = paintedButton(this, this.ui, this.h('done'), 'foxLessonDone', () => this.leave());
            paintedArt(this, done.surface, 'catacomb-painted-head-01', { ...this.h('done'), x: -70, y: 0, width: 48, height: 41 });
            paintedText(this, done.surface, { ...this.h('done'), x: 22, y: 0, width: 140 }, 'Moje liška', 25);
            if (this.owner.player.ownedPets.includes(CATACOMB_FOX_PET) && this.owner.player.activePet !== CATACOMB_FOX_PET) {
                const equip = paintedButton(this, this.ui, this.h('equip'), 'foxLessonEquip', () => {
                    if (this.phase !== 'victory' || !this.owner.isCurrent()) return;
                    this.owner.player.activePet = CATACOMB_FOX_PET; this.owner.save(); this.drawDemo();
                });
                paintedArt(this, equip.surface, 'catacomb-progress-fox-01', { ...this.h('equip'), x: -87, y: 0, width: 54, height: 50 });
                paintedText(this, equip.surface, { ...this.h('equip'), x: 27, y: 0, width: 150 }, 'Vzít lišku', 24);
            }
            return;
        }
        (['shield', 'heal', 'strike'] as const).forEach((ability, i) => {
            const h = this.h(`ability${i + 1}`), enabled = this.phase === 'demo' && ability === this.args.ability;
            const b = paintedButton(this, this.ui, h, `foxLessonUse:${ability}`, () => this.useAbility(), PAINTED.card, enabled, enabled);
            paintedArt(this, b.surface, FOX_REWARD_ICONS[ability], { ...h, x: 0, y: 0, width: 78, height: 80 });
            if (!enabled && ability !== this.args.ability) paintedArt(this, b.surface, PAINTED.closed, { ...h, x: 0, y: 0, width: 38, height: 42 });
        });
        const cue = this.ui.list.find(o => o.name === `foxLessonUse:${this.args.ability}`) as Phaser.GameObjects.Container | undefined;
        if (cue && this.phase === 'demo') {
            const h = this.h(`ability${['shield', 'heal', 'strike'].indexOf(this.args.ability) + 1}`);
            const arrow = paintedText(this, this.ui, { ...h, y: h.y - 70 }, '↓', 36, false, '#adffff');
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.tweens.add({ targets: arrow, y: arrow.y + 10, duration: 500, yoyo: true, repeat: -1 });
            arrow.once('destroy', () => this.tweens.killTweensOf(arrow));
        }
    }
    private useAbility(): void {
        if (this.phase !== 'demo' || !this.demoSystem || !this.owner.isCurrent()) return;
        const result = this.demoSystem.useAbility('A', this.args.ability, { phase: 'player_turn', paused: false,
            owners: { A: { hp: this.heroHp, maxHp: 3, foxEquipped: true } }, targets: [{ id: 'slime', hp: this.enemyHp, defense: 0 }] }, 'slime');
        if (!result.ok) return;
        this.phase = 'effect'; this.drawDemo();
        const ability = this.args.ability;
        if (ability === 'shield') this.effects.syncShield('A', this.hero, result.effect.after);
        this.effects.play(ability, 'A', this.fox, ability === 'strike' ? this.enemy : this.hero, result.effect.amount, () => {
            if (ability === 'shield') this.demonstrateBlock();
            else this.finishDemo();
        }, () => {
            if (ability === 'heal') this.heroHp = result.effect.after;
            if (ability === 'strike') this.enemyHp = result.effect.after;
            if (ability !== 'shield') {
                this.drawDemo();
                this.showPaintedImpact(ability);
            }
        });
    }
    private showPaintedImpact(ability: 'heal' | 'strike'): void {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const heal = ability === 'heal';
        const body = battleBodyBounds(heal ? this.hero : this.enemy);
        // These are the wrist and the slime's point of impact inside the light
        // sheet. The painted travel path has already been demonstrated above.
        const x = heal ? 236 : 306, y = heal ? 82 : 103;
        const sheet = heal ? 'catacomb-heal-light-sheet' : 'catacomb-strike-light-sheet';
        const burst = this.add.sprite(body.centerX, heal ? body.top + body.height * .67 : body.centerY, sheet)
            .setName('foxLessonPaintedImpact').setOrigin(x / 384, y / 150)
            .setCrop(x - 48, y - 44, 96, 88).setScale(Phaser.Math.Clamp(body.height / 90, 1, 2.4))
            .setDepth(64);
        burst.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => burst.destroy());
        burst.play({ key: heal ? 'catacomb-heal-light' : 'catacomb-strike-light', startFrame: heal ? 16 : 13, repeat: 0 });
    }
    private demonstrateBlock(): void {
        const from = battleBodyBounds(this.enemy), to = battleBodyBounds(this.hero);
        const projectile = this.add.circle(from.left, from.centerY, 11, 0xb2d839)
            .setStrokeStyle(3, 0xedffae).setDepth(60).setName('foxLessonIncoming');
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.tweens.add({ targets: projectile, x: to.right + 12, y: to.centerY, duration: reduced ? 150 : 600, ease: 'Sine.easeIn',
            onComplete: () => {
                projectile.destroy();
                const block = this.demoSystem!.absorbDamage('A', 1);
                this.heroHp -= block.damage; this.effects.block('A', this.hero);
                this.effects.syncShield('A', this.hero, block.remainingShield);
                this.time.delayedCall(650, () => this.finishDemo());
            } });
    }
    private finishDemo(): void {
        this.demoUsed = true;
        if (!this.admission || !this.owner.isCurrent() || !completeFoxLesson(this.admission, this.answers, this.demoUsed)) { this.leave(); return; }
        this.owner.save(); this.phase = 'victory'; this.drawDemo();
    }
}

import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import type { LearningMode, PracticeTargetId } from '../types';
import type { PracticeOverview } from '../systems/PracticeProgress';
import type { PracticePlayer } from '../systems/PracticeSystem';
import { PracticeChoiceControl, practiceArt, practiceCheck, practiceLabel, type PracticeChoiceHost } from './PracticeChoiceControl';

export interface PracticeChoicePlayer {
    owner: PracticePlayer;
    number: number;
    portrait: string;
    overview: PracticeOverview;
}
export interface ConfirmedPracticeChoice { owner: PracticePlayer; mode: LearningMode; targetId?: PracticeTargetId }
interface Options {
    players: PracticeChoicePlayer[];
    location: 'guild' | 'battle';
    onClose?: () => void;
    /** False keeps the modal open if a saved target became unavailable. */
    onConfirm: (choices: ConfirmedPracticeChoice[]) => boolean;
}

const ART = {
    panel: 'practice-choice-panel-v1', tall: 'practice-choice-tall-v1', card: 'practice-choice-card-v1',
    plaque: 'practice-choice-plaque-v1', zyx: 'practice-choice-zyx-v1',
    practice: 'practice-choice-training-v1', progress: 'practice-choice-progress-v1',
    practiceCompact: 'practice-choice-training-compact-v1', progressCompact: 'practice-choice-progress-compact-v1',
};

/** Zyx saves a preference on touch. The compact battle panel confirms this encounter. */
export class PracticeChoiceOverlay {
    readonly root: Phaser.GameObjects.Container;
    private readonly layout = new Map<string, PracticeChoiceHost>();
    private readonly content: Phaser.GameObjects.Container;
    private readonly choices: ConfirmedPracticeChoice[];
    private readonly confirmed: boolean[];
    private readonly controls = new Map<string, PracticeChoiceControl>();
    private readonly portraits: Phaser.GameObjects.Container[] = [];
    private action!: PracticeChoiceControl;
    private screen: 'guild' | 'choice' | 'closed' = 'choice';
    private disposed = false;

    get state() {
        return { screen: this.screen,
            confirmed: [...this.confirmed], choices: this.choices.map(c => ({ ...c })),
            ready: this.confirmed.every(Boolean) };
    }

    constructor(private readonly scene: Phaser.Scene, private readonly options: Options) {
        const builder = new SceneBuilder(scene);
        builder.buildScene('PracticeChoiceOverlay');
        const definitions = scene.cache.json.get('scenes').scenes.PracticeChoiceOverlay.elements;
        for (const definition of definitions) {
            const object = builder.get<Phaser.GameObjects.Container>(definition.id)!;
            this.layout.set(definition.id, { x: object.x, y: object.y, depth: object.depth,
                width: definition.width, height: definition.height, regions: definition.data?.regions });
            object.destroy();
        }
        const dim = this.h('Backdrop');
        this.root = scene.add.container(0, 0).setDepth(dim.depth).setName('practiceChoiceOverlay');
        const backdrop = scene.add.rectangle(dim.x, dim.y, dim.width, dim.height, 0x041222, .65).setInteractive();
        backdrop.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => event.stopPropagation());
        backdrop.on('pointerup', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => event.stopPropagation());
        this.content = scene.add.container(0, 0);
        this.root.add([backdrop, this.content]);
        this.choices = options.players.map(p => {
            const selected = p.overview.selection;
            const validPractice = selected.mode === 'practice' && p.overview.available
                && p.overview.targets.some(target => target.targetId === selected.targetId);
            return { owner: p.owner, mode: validPractice ? 'practice' : 'progress',
                targetId: validPractice ? selected.targetId : p.overview.practiceTargetId };
        });
        // Rows show the existing choice immediately. The one Do boje action
        // confirms both rows; inspecting this modal never changes a preference.
        this.confirmed = options.players.map(() => true);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        if (options.location === 'guild') this.showGuildChoices();
        else this.showChoices();
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true; this.screen = 'closed';
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.root.destroy(true);
        this.options.onClose?.();
    }

    private h(id: string): PracticeChoiceHost {
        const h = this.layout.get('practiceChoice' + id);
        if (!h) throw new Error(`Missing practice choice host: ${id}`);
        return h;
    }

    private title(id: string, value: string): void {
        const h = this.h(id), label = h.regions!.label;
        const group = this.scene.add.container(h.x, h.y).setDepth(h.depth);
        group.add([practiceArt(this.scene, ART.plaque, { ...h, x: 0, y: 0 }),
            practiceLabel(this.scene, value, label, 34)]);
        this.content.add(group);
    }

    private card(id: string, mode: LearningMode, onClick: () => void, tall = false): PracticeChoiceControl {
        const control = new PracticeChoiceControl(this.scene, this.h(id), 'practiceChoice' + id,
            tall ? ART.tall : ART.card, mode === 'practice' ? 'Trénovat' : 'Dál',
            tall ? ART[mode] : mode === 'practice' ? ART.practiceCompact : ART.progressCompact, onClick, tall);
        this.controls.set(id, control); this.content.add(control.root); return control;
    }

    private actionButton(id: string, label: string, onClick: () => void, battle: boolean): void {
        const h = this.h(id);
        this.action = new PracticeChoiceControl(this.scene, h, 'practiceChoiceConfirm', ART.plaque, label, null, onClick);
        const r = h.regions!.icon;
        if (battle) {
            this.action.surface.add(practiceArt(this.scene, 'arena-entry-crossed-swords-normal-v1', r)
                .setName('practiceChoiceBattleIcon'));
        } else {
            const g = this.scene.add.graphics().setPosition(r.x, r.y).lineStyle(3, 0xffefb4, 1);
            g.lineBetween(-r.width / 2, 0, r.width / 2, 0);
            g.strokePoints([{ x: 0, y: -r.height / 2 }, { x: r.width / 2, y: 0 }, { x: 0, y: r.height / 2 }]);
            this.action.surface.add(g);
        }
        this.content.add(this.action.root); this.action.setEnabled(false);
    }

    private showGuildChoices(): void {
        this.screen = 'guild';
        this.title('IntroTitle', 'Dvě cesty');
        const zyx = this.h('Zyx');
        this.content.add(practiceArt(this.scene, ART.zyx, zyx).setDepth(zyx.depth));
        const player = this.options.players[0];
        for (const mode of ['practice', 'progress'] as const) {
            const id = mode === 'practice' ? 'IntroPractice' : 'IntroProgress';
            const card = this.card(id, mode, () => {
                const choice = { ...this.choices[0], mode };
                if (!this.options.onConfirm([choice])) return;
                this.choices[0] = choice;
                this.controls.get('IntroPractice')!.setSelected(mode === 'practice');
                this.controls.get('IntroProgress')!.setSelected(mode === 'progress');
            }, true);
            card.setEnabled(mode === 'progress' || player.overview.available);
            card.setSelected(this.choices[0].mode === mode);
        }
        this.actionButton('IntroAction', 'Hotovo', () => this.destroy(), false);
        this.action.setEnabled(true);
        this.content.sort('depth');
    }

    private showChoices(): void {
        this.screen = 'choice';
        const panel = this.h('Panel'); this.content.add(practiceArt(this.scene, ART.panel, panel).setDepth(panel.depth));
        this.title('Title', 'Před soubojem');
        const coop = this.options.players.length > 1;
        this.options.players.forEach((player, index) => {
            const suffix = coop ? index ? 'B' : 'A' : 'Solo';
            this.createPortrait(suffix, player);
            for (const mode of ['practice', 'progress'] as const) {
                const id = (mode === 'practice' ? 'Practice' : 'Progress') + suffix;
                const card = this.card(id, mode, () => {
                    this.choices[index].mode = mode; this.confirmed[index] = true; this.updateChoices();
                });
                const canChoosePractice = player.overview.available
                    && (player.overview.introductionSeen || player.overview.introductionAvailable);
                card.setEnabled(mode === 'progress' || canChoosePractice);
            }
        });
        if (coop) {
            const h = this.h('Divider');
            this.content.add(this.scene.add.rectangle(h.x, h.y, h.width, h.height, 0xc3944a, .25).setDepth(h.depth));
        }
        this.actionButton('Action', 'Do boje', () => {
            if (!this.confirmed.every(Boolean)) return;
            this.action.setEnabled(false);
            const accepted = this.options.onConfirm(this.choices.map(c => c.mode === 'progress'
                ? { owner: c.owner, mode: c.mode } : { ...c }));
            if (accepted) this.destroy(); else this.action.setEnabled(true);
        }, true);
        this.updateChoices(); this.content.sort('depth');
    }

    private createPortrait(suffix: string, player: PracticeChoicePlayer): void {
        const h = this.h('Portrait' + suffix), regions = h.regions!;
        const group = this.scene.add.container(h.x, h.y).setDepth(h.depth).setName('practiceChoicePortrait' + player.number);
        const rim = this.scene.add.graphics().setName('rim');
        const portrait = practiceArt(this.scene, player.portrait, regions.picture);
        const badge = this.scene.add.graphics().fillStyle(0x173247).fillCircle(regions.number.x, regions.number.y, regions.number.width / 2)
            .lineStyle(2, 0xe0ba76).strokeCircle(regions.number.x, regions.number.y, regions.number.width / 2);
        const number = practiceLabel(this.scene, String(player.number), regions.number, 21).setData('practiceWord', false);
        const check = practiceCheck(this.scene, regions.check.x, regions.check.y, regions.check.width).setName('check').setVisible(false);
        group.add([rim, portrait, badge, number, check]);
        group.setData('radius', h.width / 2); this.portraits.push(group); this.content.add(group);
    }

    private updateChoices(): void {
        const coop = this.options.players.length > 1;
        this.options.players.forEach((_player, index) => {
            const suffix = coop ? index ? 'B' : 'A' : 'Solo';
            for (const [id, mode] of [['Practice', 'practice'], ['Progress', 'progress']]) {
                this.controls.get(id + suffix)!.setSelected(this.confirmed[index] && this.choices[index].mode === mode);
            }
            const p = this.portraits[index], radius = p.getData('radius');
            const rim = p.getByName('rim') as Phaser.GameObjects.Graphics;
            rim.clear().fillStyle(0x183b52).fillCircle(0, 0, radius)
                .lineStyle(4, this.confirmed[index] ? 0x9be6c8 : 0xd8ae66).strokeCircle(0, 0, radius);
            (p.getByName('check') as Phaser.GameObjects.Graphics).setVisible(this.confirmed[index]);
        });
        this.action.setEnabled(this.confirmed.every(Boolean));
    }
}

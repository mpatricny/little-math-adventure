import Phaser from 'phaser';
import { sfx } from '../audio/AudioDirector';
import type { CatacombBatch } from '../systems/CatacombBatch';
import type { SceneBuilder } from '../systems/SceneBuilder';
import { learningHost, type LearningHost } from './LearningUi';
import { PracticeChoiceControl, practiceArt, practiceLabel } from './PracticeChoiceControl';
import { icon } from './mathboard/Art';

export interface CatacombRewardView {
    kind: 'attack' | 'ability' | 'rescue';
    before: number;
    after: number;
}

function rewardCaption(reward: CatacombRewardView): string {
    if (reward.kind === 'rescue') return 'Liška u Pythie';
    if (reward.after <= reward.before) return '';
    return reward.kind === 'ability' ? `Bod lišky +${reward.after - reward.before}` : `Útok ${reward.before} → ${reward.after}`;
}

/** Keep the fox and her constellation visible throughout the verdict. */
export class CatacombTrialUI {
    constructor(private scene: Phaser.Scene, private builder: SceneBuilder) {}

    showResult(batch: CatacombBatch, reward: CatacombRewardView | null, exitResult: () => void, retry: () => void,
        names = { primary: 'catacombPrimary', secondary: 'catacombSecondary' }): void {
        const h = (id: string) => learningHost(this.builder, id);
        const scene = this.scene;
        const root = scene.add.container().setName('catacombTrialPanel').setDepth(h('observatoryVerdict').depth);
        const won = reward !== null;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        root.setData('outcome', won ? 'won' : 'lost');
        const shade = h('observatoryResultShade');
        root.add(scene.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x071124, won ? .16 : .31));
        const banner = scene.add.container().setName('observatoryOutcomeBanner');
        root.add(banner);
        banner.add(practiceArt(scene, 'catacomb-crafted-module', h('observatoryResultBanner')));
        const prizeHost = h('observatoryPrize');
        const art = !reward ? 'catacomb-painted-door-closed' : reward.kind === 'rescue' ? 'catacomb-progress-fox-01' :
            reward.after <= reward.before ? 'catacomb-painted-door-open' :
            reward.kind === 'ability' ? 'catacomb-crafted-paw-active' : 'catacomb-crafted-swords-normal';
        const prize = practiceArt(scene, art, prizeHost).setName('observatoryResultPrize');
        banner.add(prize);

        const host = h('observatoryResultSeal');
        const radius = Math.min(host.width, host.height) / 2;
        const seal = scene.add.container(host.x, host.y).setName(won ? 'observatoryWinSeal' : 'observatoryLossSeal');
        seal.add([
            scene.add.circle(0, 3, radius, 0x281a24, .75),
            scene.add.circle(0, 0, radius - 2, won ? 0x20714f : 0x963d3f).setStrokeStyle(3, 0xf3d28c),
            scene.add.circle(0, 0, radius - 7).setStrokeStyle(1, won ? 0xa8e1af : 0xf3a09a),
            icon(scene, won ? 'check' : 'cross', radius * 1.88, 0xfff2c7),
        ]);
        banner.add(seal);

        banner.add(practiceLabel(scene, won ? 'Výhra!' : 'Nevyšlo to', h('observatoryVerdict'), 61)
            .setColor(won ? '#ffe093' : '#ffe5d1').setName('observatoryResultTitle'));
        const detail = reward ? rewardCaption(reward) : batch.expired ? 'Čas vypršel' : batch.correctCount < batch.rules.required ? 'Málo hvězd' : '';
        if (detail) banner.add(practiceLabel(scene, detail, h('observatoryResultDetail'), 31).setName('observatoryResultDetail'));
        // Scores count the child's own successes. Gifted seats retain a cyan rim, as on the mural.
        const score = h('observatoryScore');
        const scoreText = practiceLabel(scene, `${batch.correctCount}/${batch.rules.total}`, score, 30)
            .setName('observatoryResultScore').setData('practiceWord', false);
        banner.add(scoreText);
        this.addStars(banner, h('observatoryResultStars'), batch);

        if (!reduced) {
            scene.tweens.add({ targets: banner, y: { from: -20, to: 0 }, alpha: { from: .2, to: 1 }, duration: 310, ease: 'Cubic.Out' });
            if (won) {
                scene.tweens.add({ targets: seal, scale: { from: .4, to: 1 }, duration: 420, ease: 'Back.Out' });
                // The glints travel out from the real award, once, while the coloured constellation settles.
                for (let i = 0; i < 12; i++) {
                    const angle = Math.PI * 2 * i / 12;
                    const distance = prizeHost.height * (.40 + (i % 3) * .025);
                    const dx = Math.cos(angle), dy = Math.sin(angle);
                    const glint = scene.add.star(prizeHost.x + dx * distance * .5, prizeHost.y + dy * distance * .5,
                        4, 2, i % 2 ? 7 : 10, 0xffdf8a).setAlpha(0);
                    banner.add(glint);
                    scene.tweens.add({ targets: glint, x: prizeHost.x + dx * distance, y: prizeHost.y + dy * distance,
                        alpha: { from: 1, to: 0 }, delay: 170 + i % 3 * 70, duration: 700, ease: 'Cubic.Out',
                        onComplete: () => glint.destroy() });
                }
            } else {
                scene.tweens.add({ targets: seal, scale: { from: 1.42, to: 1 }, angle: { from: -16, to: 0 },
                    duration: 320, ease: 'Back.Out' });
            }
        }
        if (won) sfx(scene, 'reward.victory');
        let selected = false;
        const action = (id: string, name: string, text: string, glyph: 'back' | 'replay' | 'fox', callback: () => void) => {
            const host = h(id);
            const button = new PracticeChoiceControl(scene, { ...host, regions: {
                label: { x: host.width * .08, y: 0, width: host.width * .53, height: host.height * .6 },
            } }, name, glyph === 'back' ? 'practice-choice-plaque-v1' : 'catacomb-crafted-action', text, null, () => {
                if (selected) return;
                selected = true;
                callback();
            });
            if (glyph === 'fox') {
                button.surface.add(practiceArt(scene, 'catacomb-painted-head-01', {
                    ...host, x: -host.width * .28, y: 0, width: host.width * .19, height: host.height * .70,
                }));
            } else {
                const sign = icon(scene, glyph === 'back' ? 'next' : glyph, glyph === 'back' ? 33 : 45);
                if (glyph === 'back') sign.setAngle(180);
                button.surface.add(sign.setX(-host.width * .24));
            }
            root.add(button.root);
        };
        if (!won) action('observatoryResultBack', names.secondary, 'Zpět', 'back', exitResult);
        action(won ? 'observatoryResultDone' : 'observatoryResultAction', names.primary,
            won ? 'Moje liška' : 'Znovu', won ? 'fox' : 'replay', won ? exitResult : retry);
    }

    private addStars(parent: Phaser.GameObjects.Container, host: LearningHost, batch: CatacombBatch): void {
        const slots = this.scene.add.container(host.x, host.y).setName('observatoryResultStars');
        parent.add(slots);
        const width = Math.min(host.width / batch.rules.total, host.height);
        const radius = width * .44;
        const gifts = batch.giftedStars;
        for (let i = 0; i < batch.rules.total; i++) {
            const x = (i - (batch.rules.total - 1) / 2) * width;
            const answered = batch.answers[i];
            const star = this.scene.add.star(x, 0, 5, radius * .48, radius,
                answered?.correct ? 0xfbc55c : 0x15233e).setStrokeStyle(1.8,
                answered?.correct ? 0xffebae : gifts.includes(i) ? 0x80dcf5 : 0x8291a9);
            slots.add(star);
            if (answered && !answered.correct) slots.add(icon(this.scene, 'cross', radius * 1.6, 0xffb7a3).setX(x));
        }
    }
}

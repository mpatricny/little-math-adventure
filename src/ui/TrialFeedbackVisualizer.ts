import Phaser from 'phaser';
import { MathProblem } from '../types';

const HINT_ITEM_COUNT = 8;
const ITEM_SCALE = 0.18;      // Larger for child visibility
const ITEM_SPACING = 42;      // Comfortable spacing between items
const GROUP_GAP = 60;          // Visual gap between left and right groups
const MAX_VISUAL_OPERAND = 10;

// Slow, deliberate timing for first-graders
const APPEAR_STAGGER = 280;       // ms between each item appearing
const APPEAR_DURATION = 350;      // ms for one item's appear animation
const COUNTER_INTRO = 500;        // ms delay before counter appears
const PRE_COUNT_PAUSE = 1000;     // ms pause before items start moving
const MOVE_DURATION = 900;        // ms for one item to travel
const BETWEEN_MOVES = 700;        // ms gap between consecutive item moves
const COUNTER_PULSE = 400;        // ms for counter number pulse
const FINAL_HOLD = 800;           // ms hold after last change before completion
const STEP_PAUSE = 1200;          // ms pause between three-operand steps
const KNOWN_TINT = 0xff6666;      // Warm red for "known" items in cross-off animation

/**
 * Visual feedback for trial wrong answers.
 * Uses slow counting animations — items join/leave a group
 * while a large counter increments/decrements one by one.
 * Designed for first-graders: minimal text, purely visual.
 */
export class TrialFeedbackVisualizer {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private onComplete: () => void;
    private randomFrame: number;
    private counterText: Phaser.GameObjects.Text | null = null;
    private rightCounterText: Phaser.GameObjects.Text | null = null;

    constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, onComplete: () => void) {
        this.scene = scene;
        this.container = scene.add.container(0, 0);
        parent.add(this.container);
        this.onComplete = onComplete;
        this.randomFrame = Phaser.Math.Between(0, HINT_ITEM_COUNT - 1);
    }

    /**
     * Show visual explanation for a problem.
     */
    show(problem: MathProblem): void {
        const { operand1, operand2, operand3, operator, operator2 } = problem;
        const maxOp = Math.max(operand1, operand2, operand3 ?? 0);

        if (maxOp > MAX_VISUAL_OPERAND) {
            this.showTextOnly(problem);
            return;
        }

        if (problem.problemType === 'missing_operand') {
            this.showMissingOperand(problem);
        } else if (operand3 !== undefined && operator2) {
            this.showThreeOperand(problem);
        } else if (operator === '+') {
            this.showAddition(problem);
        } else if (operator === '-') {
            this.showSubtraction(problem);
        } else {
            this.showTextOnly(problem);
        }
    }

    /**
     * Addition: show left group with counter, right group appears,
     * items slide over one by one as counter increments.
     * Example 3+2: [🍎🍎🍎]  [🍎🍎] → items move → [🍎🍎🍎🍎🍎], counter: 3→4→5
     */
    private showAddition(problem: MathProblem): void {
        const { operand1, operand2, answer } = problem;

        // Final positions centered on x=0 for all answer items
        const posX = (i: number) => this.itemPosX(i, answer);

        let delay = 0;

        // Phase 1: Left group appears at final positions
        for (let i = 0; i < operand1; i++) {
            const item = this.createItem(posX(i), 0);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 2: Counter appears below left group
        const leftCenterX = this.groupCenterX(posX, 0, operand1);
        this.counterText = this.createCounter(leftCenterX, 55, operand1, delay);
        delay += COUNTER_INTRO;

        if (operand2 === 0) {
            delay += FINAL_HOLD;
            this.scene.time.delayedCall(delay, () => this.onComplete());
            return;
        }

        // Phase 3: Right group appears offset to the right
        const rightItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < operand2; i++) {
            const idx = operand1 + i;
            const item = this.createItem(posX(idx) + GROUP_GAP, 0);
            rightItems.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += PRE_COUNT_PAUSE;

        // Phase 4: Items slide in one by one, counter increments
        for (let i = 0; i < operand2; i++) {
            const idx = operand1 + i;
            const targetX = posX(idx);
            const newCount = operand1 + i + 1;
            const newCenterX = this.groupCenterX(posX, 0, newCount);

            this.scene.tweens.add({
                targets: rightItems[i],
                x: targetX,
                duration: MOVE_DURATION,
                delay,
                ease: 'Quad.easeInOut',
            });

            this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                this.updateCounter(newCount, newCenterX);
            });

            delay += MOVE_DURATION + BETWEEN_MOVES;
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Subtraction: show all items with counter, items fly away one by one
     * as counter decrements.
     * Example 5-2: [🍎🍎🍎🍎🍎] → items leave → [🍎🍎🍎], counter: 5→4→3
     */
    private showSubtraction(problem: MathProblem): void {
        const { operand1, operand2, answer } = problem;
        if (operand1 === 0) {
            this.scene.time.delayedCall(FINAL_HOLD, () => this.onComplete());
            return;
        }

        // Items centered on x=0 for operand1 count
        const posX = (i: number) => this.itemPosX(i, operand1);

        let delay = 0;

        // Phase 1: All items appear
        const items: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < operand1; i++) {
            const item = this.createItem(posX(i), 0);
            items.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 2: Counter
        const centerX = this.groupCenterX(posX, 0, operand1);
        this.counterText = this.createCounter(centerX, 55, operand1, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        // Phase 3: Items fly away one by one from the right
        for (let i = 0; i < operand2; i++) {
            const idx = operand1 - 1 - i;
            const newCount = operand1 - i - 1;
            const newCenterX = this.groupCenterX(posX, 0, newCount);

            this.scene.tweens.add({
                targets: items[idx],
                y: -80,
                alpha: 0,
                scale: ITEM_SCALE * 0.4,
                duration: MOVE_DURATION,
                delay,
                ease: 'Quad.easeIn',
            });

            this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                this.updateCounter(newCount, newCenterX);
            });

            delay += MOVE_DURATION + BETWEEN_MOVES;
        }

        // Phase 4: Gentle pulse on remaining items
        if (answer > 0) {
            delay += 200;
            for (let i = 0; i < answer; i++) {
                this.scene.tweens.add({
                    targets: items[i],
                    scale: ITEM_SCALE * 1.25,
                    duration: 300,
                    delay,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                });
            }
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Three-operand: two sequential counting phases.
     * Example 3+2-1: first count up 3→4→5, pause, then count down 5→4.
     */
    private showThreeOperand(problem: MathProblem): void {
        const { operand1, operand2, operand3, operator, operator2, answer } = problem;
        if (operand3 === undefined || !operator2) return;

        const intermediate = operator === '+' ? operand1 + operand2 : operand1 - operand2;
        const maxCount = Math.max(operand1, intermediate, answer);

        // All positions centered based on max visible count
        const posX = (i: number) => this.itemPosX(i, maxCount);

        let delay = 0;

        // Phase 1: Show operand1 items
        const items: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < operand1; i++) {
            const item = this.createItem(posX(i), 0);
            items.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;
        this.counterText = this.createCounter(
            this.groupCenterX(posX, 0, operand1), 55, operand1, delay
        );
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        // Phase 2: First operation
        if (operator === '+') {
            const newItems: Phaser.GameObjects.Image[] = [];
            for (let i = 0; i < operand2; i++) {
                const idx = operand1 + i;
                const item = this.createItem(posX(idx) + GROUP_GAP, 0);
                newItems.push(item);
                items.push(item);
                this.animateAppear(item, delay);
                delay += APPEAR_STAGGER;
            }
            delay += PRE_COUNT_PAUSE;

            for (let i = 0; i < operand2; i++) {
                const idx = operand1 + i;
                const newCount = operand1 + i + 1;
                this.scene.tweens.add({
                    targets: newItems[i],
                    x: posX(idx),
                    duration: MOVE_DURATION,
                    delay,
                    ease: 'Quad.easeInOut',
                });
                this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                    this.updateCounter(newCount, this.groupCenterX(posX, 0, newCount));
                });
                delay += MOVE_DURATION + BETWEEN_MOVES;
            }
        } else {
            // First op is subtraction
            for (let i = 0; i < operand2; i++) {
                const idx = operand1 - 1 - i;
                const newCount = operand1 - i - 1;
                this.scene.tweens.add({
                    targets: items[idx],
                    y: -80, alpha: 0, scale: ITEM_SCALE * 0.4,
                    duration: MOVE_DURATION,
                    delay,
                    ease: 'Quad.easeIn',
                });
                this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                    this.updateCounter(newCount, this.groupCenterX(posX, 0, newCount));
                });
                delay += MOVE_DURATION + BETWEEN_MOVES;
            }
        }

        delay += STEP_PAUSE;

        // Phase 3: Second operation
        if (operator2 === '+') {
            const newItems2: Phaser.GameObjects.Image[] = [];
            for (let i = 0; i < operand3; i++) {
                const idx = intermediate + i;
                const item = this.createItem(posX(idx) + GROUP_GAP, 0);
                newItems2.push(item);
                items.push(item);
                this.animateAppear(item, delay);
                delay += APPEAR_STAGGER;
            }
            delay += PRE_COUNT_PAUSE;

            for (let i = 0; i < operand3; i++) {
                const idx = intermediate + i;
                const newCount = intermediate + i + 1;
                this.scene.tweens.add({
                    targets: newItems2[i],
                    x: posX(idx),
                    duration: MOVE_DURATION,
                    delay,
                    ease: 'Quad.easeInOut',
                });
                this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                    this.updateCounter(newCount, this.groupCenterX(posX, 0, newCount));
                });
                delay += MOVE_DURATION + BETWEEN_MOVES;
            }
        } else {
            // Second op is subtraction — remove from visible (indices 0..intermediate-1)
            for (let i = 0; i < operand3; i++) {
                const idx = intermediate - 1 - i;
                const newCount = intermediate - i - 1;
                this.scene.tweens.add({
                    targets: items[idx],
                    y: -80, alpha: 0, scale: ITEM_SCALE * 0.4,
                    duration: MOVE_DURATION,
                    delay,
                    ease: 'Quad.easeIn',
                });
                this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                    this.updateCounter(newCount, this.groupCenterX(posX, 0, newCount));
                });
                delay += MOVE_DURATION + BETWEEN_MOVES;
            }
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Missing operand dispatcher: choose pedagogically appropriate animation.
     * Addition: count-up (known >= unknown) or cross-off (known < unknown).
     * Subtraction: reinterpret as standard subtraction.
     */
    private showMissingOperand(problem: MathProblem): void {
        const { operand1, operand2: total, operator, answer: missingValue } = problem;

        if (operator !== '+') {
            // Subtraction: keep current behavior (reinterpret as standard subtraction)
            const fakeProblem = { ...problem, operand2: missingValue, answer: total };
            this.showSubtraction(fakeProblem);
            return;
        }

        if (operand1 === 0) {
            // Edge case: 0 + ? = N → fall back to standard addition (0 + N = N)
            const fakeProblem = { ...problem, operand2: missingValue, answer: total };
            this.showAddition(fakeProblem);
            return;
        }

        if (operand1 >= missingValue) {
            this.showMissingOperandCountUp(problem);
        } else {
            this.showMissingOperandCrossOff(problem);
        }
    }

    /**
     * Missing operand count-up: "Count up from what you know to the total."
     * Used when known >= unknown (e.g., 3 + ? = 5: known=3, unknown=2).
     * Shows left group (known), right group (total with different frame),
     * then pops in gap items one by one, incrementing left counter until it matches right.
     */
    private showMissingOperandCountUp(problem: MathProblem): void {
        const { operand1: known, operand2: total, answer: unknown } = problem;
        const rightFrame = (this.randomFrame + 4) % HINT_ITEM_COUNT;

        // Layout: [left group] GAP [gap items] GAP [right group]
        const leftWidth = (known - 1) * ITEM_SPACING;
        const gapWidth = unknown > 0 ? (unknown - 1) * ITEM_SPACING : 0;
        const rightWidth = (total - 1) * ITEM_SPACING;
        const totalWidth = leftWidth + GROUP_GAP + gapWidth + GROUP_GAP + rightWidth;
        const startX = -totalWidth / 2;

        const leftPosX = (i: number) => startX + i * ITEM_SPACING;
        const gapPosX = (i: number) => startX + leftWidth + GROUP_GAP + i * ITEM_SPACING;
        const rightPosX = (i: number) => startX + leftWidth + GROUP_GAP + gapWidth + GROUP_GAP + i * ITEM_SPACING;

        let delay = 0;

        // Phase 1: Left items appear
        for (let i = 0; i < known; i++) {
            const item = this.createItem(leftPosX(i), 0);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 2: Left counter
        const leftCenterX = (leftPosX(0) + leftPosX(known - 1)) / 2;
        this.counterText = this.createCounter(leftCenterX, 55, known, delay);
        delay += COUNTER_INTRO;

        // Phase 3: Right items appear (different frame)
        for (let i = 0; i < total; i++) {
            const item = this.createItem(rightPosX(i), 0, rightFrame);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 4: Right counter
        const rightCenterX = (rightPosX(0) + rightPosX(total - 1)) / 2;
        this.rightCounterText = this.createCounter(rightCenterX, 55, total, delay);
        delay += COUNTER_INTRO;

        // Edge case: unknown === 0 → counters already match
        if (unknown === 0) {
            delay += FINAL_HOLD;
            this.scene.time.delayedCall(delay, () => this.onComplete());
            return;
        }

        delay += PRE_COUNT_PAUSE;

        // Phase 5: Gap items pop in one-by-one, counter increments
        const gapItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < unknown; i++) {
            const item = this.createItem(gapPosX(i), 0);
            gapItems.push(item);
            this.animateAppear(item, delay);

            const newCount = known + i + 1;
            const newCenterX = (leftPosX(0) + gapPosX(i)) / 2;

            this.scene.time.delayedCall(delay + APPEAR_DURATION, () => {
                this.updateCounter(newCount, newCenterX);
            });

            delay += APPEAR_DURATION + BETWEEN_MOVES;
        }

        // Phase 6: Match highlight — right counter pulses gold
        delay += 200;
        this.scene.time.delayedCall(delay, () => {
            if (this.rightCounterText) {
                this.rightCounterText.setColor('#ffdd44');
                this.scene.tweens.add({
                    targets: this.rightCounterText,
                    scale: 1.5,
                    duration: COUNTER_PULSE / 2,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        if (this.rightCounterText) this.rightCounterText.setColor('#ffffff');
                    },
                });
            }
        });
        delay += COUNTER_PULSE;

        // Phase 7: Gap items pulse to highlight the answer
        delay += 200;
        for (let i = 0; i < gapItems.length; i++) {
            this.scene.tweens.add({
                targets: gapItems[i],
                scale: ITEM_SCALE * 1.25,
                duration: 300,
                delay,
                yoyo: true,
                ease: 'Sine.easeInOut',
            });
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Missing operand cross-off: "Remove what you know from the total."
     * Used when known < unknown (e.g., 1 + ? = 8: known=1, unknown=7).
     * Shows all total items (first `known` tinted red), then tinted items
     * fly away left-to-right, leaving the unknown count.
     */
    private showMissingOperandCrossOff(problem: MathProblem): void {
        const { operand1: known, operand2: total, answer: unknown } = problem;

        const posX = (i: number) => this.itemPosX(i, total);

        let delay = 0;

        // Phase 1: All items appear — first `known` are tinted
        const items: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < total; i++) {
            const item = this.createItem(posX(i), 0);
            if (i < known) {
                item.setTint(KNOWN_TINT);
            }
            items.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 2: Counter showing total
        const centerX = this.groupCenterX(posX, 0, total);
        this.counterText = this.createCounter(centerX, 55, total, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        // Phase 3: Tinted items fly away left-to-right
        for (let j = 0; j < known; j++) {
            const removedSoFar = j + 1;
            const remaining = total - removedSoFar;
            const firstRemainingIdx = j + 1;
            const newCenterX = remaining > 0
                ? this.groupCenterX(posX, firstRemainingIdx, remaining)
                : 0;

            this.scene.tweens.add({
                targets: items[j],
                y: -80,
                alpha: 0,
                scale: ITEM_SCALE * 0.4,
                duration: MOVE_DURATION,
                delay,
                ease: 'Quad.easeIn',
            });

            this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                this.updateCounter(remaining, newCenterX);
            });

            delay += MOVE_DURATION + BETWEEN_MOVES;
        }

        // Phase 4: Remaining items pulse
        if (unknown > 0) {
            delay += 200;
            for (let i = known; i < total; i++) {
                this.scene.tweens.add({
                    targets: items[i],
                    scale: ITEM_SCALE * 1.25,
                    duration: 300,
                    delay,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                });
            }
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Text-only fallback for numbers > 10.
     */
    private showTextOnly(problem: MathProblem): void {
        const { operand1, operand2, operand3, operator, operator2, answer } = problem;

        let text: string;
        if (operand3 !== undefined && operator2) {
            text = `${operand1} ${operator} ${operand2} ${operator2} ${operand3} = ${answer}`;
        } else if (problem.problemType === 'missing_operand') {
            text = `${operand1} ${operator} ${answer} = ${operand2}`;
        } else {
            text = `${operand1} ${operator} ${operand2} = ${answer}`;
        }

        const label = this.scene.add.text(0, 0, text, {
            fontSize: '40px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0);
        this.container.add(label);

        this.scene.tweens.add({
            targets: label,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 600,
            ease: 'Back.easeOut',
        });

        this.scene.time.delayedCall(1500, () => this.onComplete());
    }

    // ─── Helpers ─────────────────────────────────────

    /** Calculate centered X position for item at index within a group of totalCount items */
    private itemPosX(index: number, totalCount: number): number {
        if (totalCount <= 0) return 0;
        return -(totalCount - 1) * ITEM_SPACING / 2 + index * ITEM_SPACING;
    }

    /** Get center X of items from startIdx to startIdx+count-1 using position function */
    private groupCenterX(posX: (i: number) => number, startIdx: number, count: number): number {
        if (count <= 0) return 0;
        return (posX(startIdx) + posX(startIdx + count - 1)) / 2;
    }

    private createItem(x: number, y: number, frame?: number): Phaser.GameObjects.Image {
        const item = this.scene.add.image(x, y, 'hint-items-sheet', frame ?? this.randomFrame);
        item.setScale(0).setAlpha(0);
        this.container.add(item);
        return item;
    }

    private animateAppear(item: Phaser.GameObjects.Image, delay: number): void {
        this.scene.tweens.add({
            targets: item,
            scale: ITEM_SCALE,
            alpha: 1,
            duration: APPEAR_DURATION,
            delay,
            ease: 'Back.easeOut',
        });
    }

    /** Create the large counter number below the item group */
    private createCounter(x: number, y: number, value: number, delay: number): Phaser.GameObjects.Text {
        const counter = this.scene.add.text(x, y, value.toString(), {
            fontSize: '42px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);
        this.container.add(counter);

        this.scene.tweens.add({
            targets: counter,
            alpha: 1,
            scale: 1,
            duration: 400,
            delay,
            ease: 'Back.easeOut',
        });

        return counter;
    }

    /** Update counter value with gold pulse and optional position shift */
    private updateCounter(newValue: number, newX: number): void {
        if (!this.counterText) return;
        this.counterText.setText(newValue.toString());
        this.counterText.setColor('#ffdd44'); // Gold highlight

        // Scale pulse
        this.scene.tweens.add({
            targets: this.counterText,
            scale: 1.5,
            duration: COUNTER_PULSE / 2,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (this.counterText) this.counterText.setColor('#ffffff');
            },
        });

        // Slide to new center position
        this.scene.tweens.add({
            targets: this.counterText,
            x: newX,
            duration: COUNTER_PULSE,
            ease: 'Sine.easeInOut',
        });
    }

    /**
     * Clean up all created objects.
     */
    destroy(): void {
        this.counterText = null;
        this.rightCounterText = null;
        this.container.removeAll(true);
        this.container.destroy();
    }
}

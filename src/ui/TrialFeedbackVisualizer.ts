import Phaser from 'phaser';
import { MathProblem } from '../types';
import { formatMathProblem } from '../utils/formatMathProblem';

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
// Balance scale constants
const SCALE_BEAM_WIDTH = 300;     // Total beam width
const SCALE_FULCRUM_Y = 80;       // Y position of fulcrum (below items area)
const SCALE_TIP_ANGLE = 0.18;     // Radians to tip (~10 degrees)
const SCALE_TIP_DURATION = 1200;  // ms for tipping animation
const SCALE_PAN_RADIUS = 40;      // Pan circle radius
const SCALE_NUMBER_SIZE = '38px'; // Font size for numbers on pans
const SCALE_SYMBOL_SIZE = '48px'; // Font size for <, =, > reveal
const SCALE_APPEAR_DURATION = 600;
const SCALE_DROP_DURATION = 800;  // ms for numbers dropping into pans
const SCALE_RESULT_HOLD = 1200;   // ms to hold final result before completing

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

        if (problem.problemType === 'comparison' || problem.problemType === 'comparison_eq_vs_eq') {
            this.showComparison(problem);
            return;
        }

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
     *
     * Priority order:
     * 1. Three-operand (operand3 + operator2 present) → two-step undo+solve
     * 2. Subtraction → part-part-whole matching
     * 3. Addition, operand1 === 0 → fake as standard addition
     * 4. Addition, known ≥ unknown → count-up from known (left group + right reference)
     * 5. Addition, known < unknown → count-up from known (single row, no reference)
     */
    private showMissingOperand(problem: MathProblem): void {
        const { operand1, operand2: total, operand3, operator, operator2, answer: missingValue } = problem;

        if (operand3 !== undefined && operator2) {
            this.showMissingOperandThreeOperand(problem);
            return;
        }

        if (operator !== '+') {
            this.showMissingOperandMatching(problem);
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
            this.showMissingOperandCountUpFromKnown(problem);
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
     * Missing operand count-up from known: "Count on from what you know."
     * Used when known < unknown (e.g., 1 + ? = 8: known=1, unknown=7).
     *
     * "Counting on" strategy — same approach teachers use:
     * 1. Show known item(s) at leftmost position of final layout
     * 2. Counter shows known count
     * 3. New items pop in one-by-one using different sprite frame
     * 4. Counter increments with gold pulse until reaching total
     * 5. All new items pulse to highlight — these are the answer
     */
    private showMissingOperandCountUpFromKnown(problem: MathProblem): void {
        const { operand1: known, operand2: total, answer: unknown } = problem;
        const newFrame = (this.randomFrame + 4) % HINT_ITEM_COUNT;

        // All items positioned in final 'total'-wide layout
        const posX = (i: number) => this.itemPosX(i, total);

        let delay = 0;

        // Phase 1: Known items appear at leftmost positions
        for (let i = 0; i < known; i++) {
            const item = this.createItem(posX(i), 0);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Phase 2: Counter showing known count
        const knownCenterX = known > 0 ? this.groupCenterX(posX, 0, known) : 0;
        this.counterText = this.createCounter(knownCenterX, 55, known, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        // Phase 3: New items pop in one-by-one with different frame
        const newItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < unknown; i++) {
            const idx = known + i;
            const item = this.createItem(posX(idx), 0, newFrame);
            newItems.push(item);
            this.animateAppear(item, delay);

            const newCount = known + i + 1;
            const newCenterX = this.groupCenterX(posX, 0, newCount);

            this.scene.time.delayedCall(delay + APPEAR_DURATION, () => {
                this.updateCounter(newCount, newCenterX);
            });

            delay += APPEAR_DURATION + BETWEEN_MOVES;
        }

        // Phase 4: Counter pulses gold when reaching total
        delay += 200;
        this.scene.time.delayedCall(delay, () => {
            if (this.counterText) {
                this.counterText.setColor('#ffdd44');
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
            }
        });
        delay += COUNTER_PULSE;

        // Phase 5: All new items pulse to highlight — these are the answer
        if (newItems.length > 0) {
            delay += 200;
            for (const item of newItems) {
                this.scene.tweens.add({
                    targets: item,
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
     * Missing operand matching for subtraction: "Part-part-whole matching."
     * For: 5 - ? = 3 (operand1=5, result=3, answer=2)
     *
     * Line up start and end, find the gap:
     * 1. Top row: operand1 items (what we started with), counter above
     * 2. Bottom row: result items in different color, left-aligned, counter below
     * 3. Match pairs: pulse top[i] and bottom[i], then dim both
     * 4. Unmatched top items pulse larger — these are the answer
     * 5. Answer counter appears below unmatched items
     */
    private showMissingOperandMatching(problem: MathProblem): void {
        const { operand1, operand2: result, answer } = problem;

        const topY = -30;
        const bottomY = 40;
        const posX = (i: number) => this.itemPosX(i, operand1);
        const bottomFrame = (this.randomFrame + 4) % HINT_ITEM_COUNT;

        let delay = 0;

        // Phase 1: Top row — operand1 items
        const topItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < operand1; i++) {
            const item = this.createItem(posX(i), topY);
            topItems.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Top counter
        const topCenterX = this.groupCenterX(posX, 0, operand1);
        this.counterText = this.createCounter(topCenterX, topY - 50, operand1, delay);
        delay += COUNTER_INTRO;

        // Phase 2: Bottom row — result items (different frame), left-aligned
        const bottomItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < result; i++) {
            const item = this.createItem(posX(i), bottomY, bottomFrame);
            bottomItems.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Bottom counter
        const bottomCenterX = result > 0 ? this.groupCenterX(posX, 0, result) : 0;
        this.rightCounterText = this.createCounter(bottomCenterX, bottomY + 55, result, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        // Phase 3: Match pairs — pulse both, then dim
        for (let i = 0; i < result; i++) {
            const capturedI = i;
            this.scene.time.delayedCall(delay, () => {
                // Pulse both matched items
                this.scene.tweens.add({
                    targets: [topItems[capturedI], bottomItems[capturedI]],
                    scale: ITEM_SCALE * 1.2,
                    duration: 250,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        // Dim both after matching
                        this.scene.tweens.add({
                            targets: [topItems[capturedI], bottomItems[capturedI]],
                            alpha: 0.3,
                            duration: 300,
                            ease: 'Sine.easeOut',
                        });
                    },
                });
            });
            delay += 500 + BETWEEN_MOVES;
        }

        delay += 400;

        // Phase 4: Unmatched top items pulse larger — these are the answer
        if (answer > 0) {
            for (let i = result; i < operand1; i++) {
                this.scene.tweens.add({
                    targets: topItems[i],
                    scale: ITEM_SCALE * 1.3,
                    duration: 400,
                    delay,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                });
            }
            delay += 400;

            // Phase 5: Answer counter below unmatched items
            const unmatchedCenterX = this.groupCenterX(posX, result, answer);
            const answerCounter = this.scene.add.text(
                unmatchedCenterX, bottomY + 55,
                answer.toString(),
                {
                    fontSize: '42px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#44ff44',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 5,
                }
            ).setOrigin(0.5).setAlpha(0).setScale(0.5);
            this.container.add(answerCounter);

            this.scene.tweens.add({
                targets: answerCounter,
                alpha: 1,
                scale: 1,
                duration: 400,
                delay,
                ease: 'Back.easeOut',
            });
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Missing operand three-operand: "Undo the last step, then solve the inner problem."
     * For: 4 + ? - 2 = 3 (operand1=4, result=3, operand3=2, operator2='-', answer=1)
     *
     * Two visual steps:
     * Step A — Undo last operation: show result items, add/remove operand3 to get intermediate
     * Step B — Solve inner problem: show operand1 items, count up/down to intermediate
     */
    private showMissingOperandThreeOperand(problem: MathProblem): void {
        const { operand1, operand2: result, operand3, operator, operator2, answer } = problem;
        if (operand3 === undefined || !operator2) return;

        // Undo formula: reverse operator2 to find intermediate
        const intermediate = operator2 === '-' ? result + operand3 : result - operand3;

        // Fall back to text for large numbers
        if (intermediate > MAX_VISUAL_OPERAND || Math.max(operand1, result, operand3) > MAX_VISUAL_OPERAND) {
            this.showTextOnly(problem);
            return;
        }

        const stepAY = -35;
        const stepBY = 45;

        let delay = 0;

        // ─── Step A: Undo last operation ───
        // Show result items
        const maxStepA = Math.max(result, intermediate);
        const posXA = (i: number) => this.itemPosX(i, maxStepA);

        const stepAItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < result; i++) {
            const item = this.createItem(posXA(i), stepAY);
            stepAItems.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Counter for Step A
        const resultCenterX = this.groupCenterX(posXA, 0, result);
        this.counterText = this.createCounter(resultCenterX, stepAY + 55, result, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        if (operator2 === '-') {
            // Undo subtraction by adding operand3 items back
            const newFrame = (this.randomFrame + 4) % HINT_ITEM_COUNT;
            for (let i = 0; i < operand3; i++) {
                const idx = result + i;
                const item = this.createItem(posXA(idx), stepAY, newFrame);
                stepAItems.push(item);
                this.animateAppear(item, delay);

                const newCount = result + i + 1;
                const newCenterX = this.groupCenterX(posXA, 0, newCount);

                this.scene.time.delayedCall(delay + APPEAR_DURATION, () => {
                    this.updateCounter(newCount, newCenterX);
                });

                delay += APPEAR_DURATION + BETWEEN_MOVES;
            }
        } else {
            // Undo addition by removing operand3 items
            for (let i = 0; i < operand3; i++) {
                const idx = result - 1 - i;
                const newCount = result - i - 1;
                const newCenterX = newCount > 0 ? this.groupCenterX(posXA, 0, newCount) : 0;

                this.scene.tweens.add({
                    targets: stepAItems[idx],
                    y: stepAY - 60,
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
        }

        delay += STEP_PAUSE;

        // Fade Step A items to background
        for (const item of stepAItems) {
            this.scene.tweens.add({
                targets: item,
                alpha: 0.35,
                y: stepAY - 15,
                duration: 400,
                delay,
                ease: 'Sine.easeOut',
            });
        }
        if (this.counterText) {
            this.scene.tweens.add({
                targets: this.counterText,
                alpha: 0.35,
                duration: 400,
                delay,
                ease: 'Sine.easeOut',
            });
        }
        delay += 500;

        // ─── Step B: Solve inner problem (operand1 ○ ? = intermediate) ───
        const maxStepB = Math.max(operand1, intermediate);
        const posXB = (i: number) => this.itemPosX(i, maxStepB);
        const stepBFrame = (this.randomFrame + 2) % HINT_ITEM_COUNT;

        // Show operand1 items
        const stepBItems: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < operand1; i++) {
            const item = this.createItem(posXB(i), stepBY, stepBFrame);
            stepBItems.push(item);
            this.animateAppear(item, delay);
            delay += APPEAR_STAGGER;
        }

        delay += COUNTER_INTRO;

        // Step B counter
        const op1CenterX = operand1 > 0 ? this.groupCenterX(posXB, 0, operand1) : 0;
        this.rightCounterText = this.createCounter(op1CenterX, stepBY + 55, operand1, delay);
        delay += COUNTER_INTRO + PRE_COUNT_PAUSE;

        if (operator === '+') {
            // Addition: pop in gap items counting up to intermediate
            const gapFrame = (this.randomFrame + 6) % HINT_ITEM_COUNT;
            const gapItems: Phaser.GameObjects.Image[] = [];
            for (let i = 0; i < answer; i++) {
                const idx = operand1 + i;
                const item = this.createItem(posXB(idx), stepBY, gapFrame);
                gapItems.push(item);
                this.animateAppear(item, delay);

                const newCount = operand1 + i + 1;
                const newCenterX = this.groupCenterX(posXB, 0, newCount);

                this.scene.time.delayedCall(delay + APPEAR_DURATION, () => {
                    this.updateRightCounter(newCount, newCenterX);
                });

                delay += APPEAR_DURATION + BETWEEN_MOVES;
            }

            // Pulse gap items
            if (gapItems.length > 0) {
                delay += 200;
                for (const item of gapItems) {
                    this.scene.tweens.add({
                        targets: item,
                        scale: ITEM_SCALE * 1.25,
                        duration: 300,
                        delay,
                        yoyo: true,
                        ease: 'Sine.easeInOut',
                    });
                }
            }
        } else {
            // Subtraction: items fly away counting down to intermediate
            for (let i = 0; i < answer; i++) {
                const idx = operand1 - 1 - i;
                const newCount = operand1 - i - 1;
                const newCenterX = newCount > 0 ? this.groupCenterX(posXB, 0, newCount) : 0;

                this.scene.tweens.add({
                    targets: stepBItems[idx],
                    y: stepBY - 60,
                    alpha: 0,
                    scale: ITEM_SCALE * 0.4,
                    duration: MOVE_DURATION,
                    delay,
                    ease: 'Quad.easeIn',
                });

                this.scene.time.delayedCall(delay + MOVE_DURATION, () => {
                    this.updateRightCounter(newCount, newCenterX);
                });

                delay += MOVE_DURATION + BETWEEN_MOVES;
            }

            // Pulse remaining items
            const remaining = operand1 - answer;
            if (remaining > 0) {
                delay += 200;
                for (let i = 0; i < remaining; i++) {
                    this.scene.tweens.add({
                        targets: stepBItems[i],
                        scale: ITEM_SCALE * 1.25,
                        duration: 300,
                        delay,
                        yoyo: true,
                        ease: 'Sine.easeInOut',
                    });
                }
            }
        }

        delay += FINAL_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Comparison: solve equation(s), then show results on a balance scale.
     *
     * Phase 1: Solve left equation visually (items + counting) or show number
     * Phase 2: Solve right side (number or equation)
     * Phase 3: Balance scale appears
     * Phase 4: Result numbers drop into pans
     * Phase 5: Scale tips (or stays balanced) and symbol appears
     */
    private showComparison(problem: MathProblem): void {
        const { operand1, operand2, operator, operand3, operand4, operator2, operator3 } = problem;
        const isEqVsEq = problem.problemType === 'comparison_eq_vs_eq';
        const isThreeOpComparison = !isEqVsEq && operand4 !== undefined && operator2;

        // Compute left result
        let leftResult = operator === '+' ? operand1 + operand2 : operand1 - operand2;
        if (isThreeOpComparison && operand3 !== undefined) {
            leftResult = operator2 === '+' ? leftResult + operand3 : leftResult - operand3;
        }

        // Compute right result
        let rightResult: number;
        if (isEqVsEq && operand3 !== undefined && operand4 !== undefined && operator3) {
            rightResult = operator3 === '+' ? operand3 + operand4 : operand3 - operand4;
        } else if (isThreeOpComparison) {
            rightResult = operand4!;
        } else {
            rightResult = operand3 ?? 0;
        }

        // answer: 0 = <, 1 = =, 2 = >
        const comparisonSymbols = ['<', '=', '>'];
        const symbol = comparisonSymbols[problem.answer] || '=';

        const useItems = Math.max(operand1, operand2, operand3 ?? 0, operand4 ?? 0) <= MAX_VISUAL_OPERAND;

        let delay = 0;

        // ─── Phase 1: Solve left equation ───
        const leftY = -60;
        if (isThreeOpComparison && operand3 !== undefined) {
            // Three-operand: always use text solve with full expression
            const displayOp = operator === '*' ? '×' : operator;
            const displayOp2 = operator2 === '*' ? '×' : operator2;
            const expr = `${operand1} ${displayOp} ${operand2} ${displayOp2} ${operand3}`;
            delay = this.animateTextSolve(
                operand1, operand2, operator, leftResult,
                -SCALE_BEAM_WIDTH / 2 - 20, leftY, delay, expr
            );
        } else if (useItems) {
            delay = this.animateEquationSolve(
                operand1, operand2, operator, leftResult,
                -SCALE_BEAM_WIDTH / 2 - 20, leftY, delay
            );
        } else {
            delay = this.animateTextSolve(
                operand1, operand2, operator, leftResult,
                -SCALE_BEAM_WIDTH / 2 - 20, leftY, delay
            );
        }

        delay += STEP_PAUSE;

        // ─── Phase 2: Solve right side ───
        const rightY = -60;
        if (isEqVsEq && operand3 !== undefined && operand4 !== undefined && operator3) {
            if (useItems) {
                delay = this.animateEquationSolve(
                    operand3, operand4, operator3, rightResult,
                    SCALE_BEAM_WIDTH / 2 + 20, rightY, delay
                );
            } else {
                delay = this.animateTextSolve(
                    operand3, operand4, operator3, rightResult,
                    SCALE_BEAM_WIDTH / 2 + 20, rightY, delay
                );
            }
        } else {
            // Right side is just a number — show it with a pop-in
            const numText = this.scene.add.text(
                SCALE_BEAM_WIDTH / 2 + 20, rightY,
                rightResult.toString(),
                {
                    fontSize: '42px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 5,
                }
            ).setOrigin(0.5).setAlpha(0).setScale(0.5);
            this.container.add(numText);

            this.scene.tweens.add({
                targets: numText,
                alpha: 1,
                scale: 1,
                duration: 400,
                delay,
                ease: 'Back.easeOut',
            });
            delay += 600;
        }

        delay += STEP_PAUSE;

        // ─── Phase 3: Balance scale appears ───
        delay = this.animateBalanceScale(leftResult, rightResult, symbol, delay);

        delay += SCALE_RESULT_HOLD;
        this.scene.time.delayedCall(delay, () => this.onComplete());
    }

    /**
     * Animate solving an equation with item counting (for operands <= 10).
     * Shows items appearing, counting, and reveals the result number.
     * Returns the delay after animation completes.
     */
    private animateEquationSolve(
        op1: number, op2: number, operator: string, result: number,
        centerX: number, centerY: number, startDelay: number
    ): number {
        let delay = startDelay;

        // Equation text above items
        const displayOp = operator === '*' ? '×' : operator;
        const eqText = this.scene.add.text(
            centerX, centerY - 50,
            `${op1} ${displayOp} ${op2}`,
            {
                fontSize: '26px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
            }
        ).setOrigin(0.5).setAlpha(0);
        this.container.add(eqText);

        this.scene.tweens.add({
            targets: eqText,
            alpha: 1,
            duration: 300,
            delay,
        });
        delay += 400;

        // Show items for operand1
        const totalItems = operator === '+' ? result : op1;
        const itemScale = ITEM_SCALE * 0.8;
        const itemSpacing = ITEM_SPACING * 0.7;
        const posX = (i: number) => centerX - (totalItems - 1) * itemSpacing / 2 + i * itemSpacing;

        const items: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < op1; i++) {
            const item = this.scene.add.image(posX(i), centerY, 'hint-items-sheet', this.randomFrame);
            item.setScale(0).setAlpha(0);
            this.container.add(item);
            items.push(item);

            this.scene.tweens.add({
                targets: item,
                scale: itemScale,
                alpha: 1,
                duration: APPEAR_DURATION * 0.7,
                delay,
                ease: 'Back.easeOut',
            });
            delay += APPEAR_STAGGER * 0.5;
        }

        delay += 300;

        if (operator === '+') {
            // Addition: new items slide in
            for (let i = 0; i < op2; i++) {
                const idx = op1 + i;
                const item = this.scene.add.image(posX(idx) + 40, centerY - 30, 'hint-items-sheet', this.randomFrame);
                item.setScale(0).setAlpha(0);
                this.container.add(item);
                items.push(item);

                this.scene.tweens.add({
                    targets: item,
                    scale: itemScale,
                    alpha: 1,
                    x: posX(idx),
                    y: centerY,
                    duration: MOVE_DURATION * 0.6,
                    delay,
                    ease: 'Quad.easeOut',
                });
                delay += (MOVE_DURATION + BETWEEN_MOVES) * 0.4;
            }
        } else {
            // Subtraction: items fly away
            for (let i = 0; i < op2; i++) {
                const idx = op1 - 1 - i;
                this.scene.tweens.add({
                    targets: items[idx],
                    y: centerY - 60,
                    alpha: 0,
                    scale: itemScale * 0.3,
                    duration: MOVE_DURATION * 0.6,
                    delay,
                    ease: 'Quad.easeIn',
                });
                delay += (MOVE_DURATION + BETWEEN_MOVES) * 0.4;
            }
        }

        delay += 300;

        // Fade equation text, show result number
        this.scene.tweens.add({
            targets: eqText,
            alpha: 0.3,
            duration: 400,
            delay,
        });

        // Fade items
        for (const item of items) {
            this.scene.tweens.add({
                targets: item,
                alpha: 0,
                duration: 400,
                delay: delay + 100,
            });
        }

        const resultText = this.scene.add.text(
            centerX, centerY,
            result.toString(),
            {
                fontSize: '42px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 5,
            }
        ).setOrigin(0.5).setAlpha(0).setScale(0.5);
        this.container.add(resultText);

        this.scene.tweens.add({
            targets: resultText,
            alpha: 1,
            scale: 1,
            duration: 500,
            delay: delay + 200,
            ease: 'Back.easeOut',
        });

        delay += 700;
        return delay;
    }

    /**
     * Text-only equation solve for large numbers (>10).
     * Shows "5 + 8" → animates to "= 13".
     */
    private animateTextSolve(
        op1: number, op2: number, operator: string, result: number,
        centerX: number, centerY: number, startDelay: number,
        expressionOverride?: string
    ): number {
        let delay = startDelay;
        const displayOp = operator === '*' ? '×' : operator;

        const eqText = this.scene.add.text(
            centerX, centerY - 20,
            expressionOverride ?? `${op1} ${displayOp} ${op2}`,
            {
                fontSize: '30px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaaaa',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
            }
        ).setOrigin(0.5).setAlpha(0);
        this.container.add(eqText);

        this.scene.tweens.add({
            targets: eqText,
            alpha: 1,
            duration: 400,
            delay,
            ease: 'Sine.easeOut',
        });
        delay += 800;

        // Fade equation, show result
        this.scene.tweens.add({
            targets: eqText,
            alpha: 0.3,
            duration: 400,
            delay,
        });

        const resultText = this.scene.add.text(
            centerX, centerY + 15,
            result.toString(),
            {
                fontSize: '42px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 5,
            }
        ).setOrigin(0.5).setAlpha(0).setScale(0.5);
        this.container.add(resultText);

        this.scene.tweens.add({
            targets: resultText,
            alpha: 1,
            scale: 1,
            duration: 500,
            delay: delay + 200,
            ease: 'Back.easeOut',
        });

        delay += 700;
        return delay;
    }

    /**
     * Draw and animate a balance scale with two numbers.
     * The scale tips toward the heavier (larger) side.
     */
    private animateBalanceScale(
        leftValue: number, rightValue: number, symbol: string, startDelay: number
    ): number {
        let delay = startDelay;
        const scaleY = SCALE_FULCRUM_Y;

        // Fulcrum triangle (drawn with graphics)
        const gfx = this.scene.add.graphics();
        gfx.setAlpha(0);
        this.container.add(gfx);

        // Draw fulcrum
        gfx.fillStyle(0x888888, 1);
        gfx.fillTriangle(0, scaleY, -18, scaleY + 30, 18, scaleY + 30);

        // Beam container that will rotate
        const beamContainer = this.scene.add.container(0, scaleY);
        beamContainer.setAlpha(0);
        this.container.add(beamContainer);

        // Beam (horizontal bar)
        const beamGfx = this.scene.add.graphics();
        beamGfx.fillStyle(0xaaaaaa, 1);
        beamGfx.fillRoundedRect(-SCALE_BEAM_WIDTH / 2, -4, SCALE_BEAM_WIDTH, 8, 4);
        beamContainer.add(beamGfx);

        // Left pan
        const leftPanGfx = this.scene.add.graphics();
        leftPanGfx.fillStyle(0x6688bb, 0.6);
        leftPanGfx.fillCircle(0, 0, SCALE_PAN_RADIUS);
        leftPanGfx.lineStyle(2, 0x88aadd, 0.8);
        leftPanGfx.strokeCircle(0, 0, SCALE_PAN_RADIUS);
        const leftPan = this.scene.add.container(-SCALE_BEAM_WIDTH / 2 + 20, 0);
        leftPan.add(leftPanGfx);
        beamContainer.add(leftPan);

        // Right pan
        const rightPanGfx = this.scene.add.graphics();
        rightPanGfx.fillStyle(0xbb8866, 0.6);
        rightPanGfx.fillCircle(0, 0, SCALE_PAN_RADIUS);
        rightPanGfx.lineStyle(2, 0xddaa88, 0.8);
        rightPanGfx.strokeCircle(0, 0, SCALE_PAN_RADIUS);
        const rightPan = this.scene.add.container(SCALE_BEAM_WIDTH / 2 - 20, 0);
        rightPan.add(rightPanGfx);
        beamContainer.add(rightPan);

        // Appear animation for scale
        this.scene.tweens.add({
            targets: [gfx, beamContainer],
            alpha: 1,
            duration: SCALE_APPEAR_DURATION,
            delay,
            ease: 'Sine.easeOut',
        });
        delay += SCALE_APPEAR_DURATION + 300;

        // Left number drops into left pan
        const leftNumText = this.scene.add.text(0, -5, leftValue.toString(), {
            fontSize: SCALE_NUMBER_SIZE,
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0);
        leftPan.add(leftNumText);

        this.scene.tweens.add({
            targets: leftNumText,
            alpha: 1,
            y: { from: -40, to: -5 },
            duration: SCALE_DROP_DURATION,
            delay,
            ease: 'Bounce.easeOut',
        });
        delay += SCALE_DROP_DURATION + 200;

        // Right number drops into right pan
        const rightNumText = this.scene.add.text(0, -5, rightValue.toString(), {
            fontSize: SCALE_NUMBER_SIZE,
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0);
        rightPan.add(rightNumText);

        this.scene.tweens.add({
            targets: rightNumText,
            alpha: 1,
            y: { from: -40, to: -5 },
            duration: SCALE_DROP_DURATION,
            delay,
            ease: 'Bounce.easeOut',
        });
        delay += SCALE_DROP_DURATION + 400;

        // ─── Tip the scale ───
        let targetAngle = 0;
        if (leftValue > rightValue) {
            targetAngle = -SCALE_TIP_ANGLE; // Left heavier → left side goes down (counterclockwise)
        } else if (leftValue < rightValue) {
            targetAngle = SCALE_TIP_ANGLE;  // Right heavier → right side goes down (clockwise)
        }

        this.scene.tweens.add({
            targets: beamContainer,
            rotation: targetAngle,
            duration: SCALE_TIP_DURATION,
            delay,
            ease: 'Elastic.easeOut',
        });
        delay += SCALE_TIP_DURATION;

        // ─── Reveal comparison symbol ───
        const symbolColor = symbol === '=' ? '#44ff44' : '#ffdd44';
        const symbolText = this.scene.add.text(0, scaleY + 55, symbol, {
            fontSize: SCALE_SYMBOL_SIZE,
            fontFamily: 'Arial, sans-serif',
            color: symbolColor,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.3);
        this.container.add(symbolText);

        this.scene.tweens.add({
            targets: symbolText,
            alpha: 1,
            scale: 1,
            duration: 500,
            delay,
            ease: 'Back.easeOut',
        });
        delay += 500;

        return delay;
    }

    /**
     * Text-only fallback for numbers > 10.
     */
    private showTextOnly(problem: MathProblem): void {
        const text = formatMathProblem(problem, 'answer');

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

    /** Update right counter value with gold pulse and optional position shift */
    private updateRightCounter(newValue: number, newX: number): void {
        if (!this.rightCounterText) return;
        this.rightCounterText.setText(newValue.toString());
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

        this.scene.tweens.add({
            targets: this.rightCounterText,
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

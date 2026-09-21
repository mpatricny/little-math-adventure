import Phaser from 'phaser';
import { MathProblem } from '../types';
import { comparisonObjectScale } from './ComparisonPresentation';

export interface ComparisonHost {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
}

export interface ComparisonProblemLayout {
    left: ComparisonHost;
    right: ComparisonHost;
    relation: ComparisonHost;
}

/** The approved vector artwork, shared by choices, lessons, exams and feedback. */
export function comparisonGlyph(scene: Phaser.Scene, value: number, plain: boolean, width: number): Phaser.GameObjects.Image {
    const key = value === 1
        ? (plain ? 'comparison-equal' : 'comparison-equal-jaws')
        : (plain ? 'comparison-greater' : 'comparison-crocodile');
    const image = scene.add.image(0, 0, key).setFlipX(value === 0);
    image.setScale(width / image.width);
    return image;
}

/** Pure presentation: no attempts, mastery, rewards or answer timers. */
export class ComparisonProblemView {
    readonly root: Phaser.GameObjects.Container;
    readonly left: Phaser.GameObjects.Container;
    readonly right: Phaser.GameObjects.Container;
    readonly slot: Phaser.GameObjects.Graphics;
    readonly relation: Phaser.GameObjects.Container;
    private readonly pairRings: Phaser.GameObjects.Graphics;

    constructor(private scene: Phaser.Scene, readonly problem: MathProblem, readonly layout: ComparisonProblemLayout) {
        this.root = scene.add.container(0, 0).setName('comparisonProblem');
        this.left = this.createOperand(layout.left, true);
        this.right = this.createOperand(layout.right, false);
        this.relation = scene.add.container(layout.relation.x, layout.relation.y).setDepth(layout.relation.depth).setName('comparisonRelation');
        this.slot = scene.add.graphics().setName('emptyComparisonSlot');
        this.slot.lineStyle(2, 0x917747, 0.85);
        const w = layout.relation.width, h = layout.relation.height;
        // A genuinely empty, dashed target. No neutral head, ○ or question mark.
        for (let x = -w / 2 + 8; x < w / 2 - 6; x += 12) {
            this.slot.lineBetween(x, -h / 2, Math.min(x + 6, w / 2 - 6), -h / 2);
            this.slot.lineBetween(x, h / 2, Math.min(x + 6, w / 2 - 6), h / 2);
        }
        for (let y = -h / 2 + 8; y < h / 2 - 6; y += 12) {
            this.slot.lineBetween(-w / 2, y, -w / 2, Math.min(y + 6, h / 2 - 6));
            this.slot.lineBetween(w / 2, y, w / 2, Math.min(y + 6, h / 2 - 6));
        }
        this.relation.add(this.slot);
        this.pairRings = scene.add.graphics().setDepth(layout.relation.depth);
        this.root.add([this.left, this.right, this.relation, this.pairRings]);
    }

    private createOperand(host: ComparisonHost, isLeft: boolean): Phaser.GameObjects.Container {
        const meta = this.problem.comparisonMeta!;
        const value = isLeft ? meta.leftValue : meta.rightValue;
        const root = this.scene.add.container(host.x, host.y).setDepth(host.depth).setName(isLeft ? 'comparisonLeft' : 'comparisonRight');
        const numberedObjects = meta.stage === 'number_crocodile';
        const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: 'Arial, sans-serif', fontStyle: 'bold', fontSize: '64px',
            color: '#4a3826', resolution: 2,
        };
        if (meta.representation === 'size') {
            const item = this.scene.add.image(0, 0, 'comparison-apple');
            const ratio = comparisonObjectScale(value, isLeft ? meta.rightValue : meta.leftValue);
            const width = Math.min(this.layout.left.width, this.layout.right.width);
            const height = Math.min(this.layout.left.height, this.layout.right.height);
            item.setScale(Math.min(width / item.width, height / item.height) * ratio);
            root.add(item);
        } else if (meta.representation === 'count' || numberedObjects) {
            // Same grid and piece size on both sides, even when their counts differ.
            const spacing = Math.min(34, host.width / 3);
            const itemWidth = spacing * 0.88;
            const rows = Math.ceil(value / 3);
            for (let i = 0; i < value; i++) {
                const row = Math.floor(i / 3), inRow = Math.min(3, value - row * 3);
                const item = this.scene.add.image(
                    (i % 3 - (inRow - 1) / 2) * spacing,
                    (row - (rows - 1) / 2) * spacing - (numberedObjects ? 25 : 0),
                    'comparison-apple',
                ).setName('comparisonItem');
                item.setScale(itemWidth / item.width);
                root.add(item);
            }
            if (numberedObjects) root.add(this.scene.add.text(0, 42, `${value}`, { ...textStyle, fontSize: '44px' }).setOrigin(0.5));
        } else {
            const expression = meta.representation === 'expression' && isLeft;
            const label = expression ? `${this.problem.operand1} ${this.problem.operator === '*' ? '×' : this.problem.operator} ${this.problem.operand2}` : `${value}`;
            root.add(this.scene.add.text(0, 0, label, { ...textStyle, fontSize: expression ? '32px' : meta.representation === 'expression' ? '48px' : '64px' }).setOrigin(0.5));
        }
        return root;
    }

    reveal(plain = !this.problem.comparisonMeta?.showCrocodile): Phaser.GameObjects.Image {
        this.relation.removeAll(true);
        const symbol = comparisonGlyph(this.scene, this.problem.answer, plain, plain ? 52 : 86);
        symbol.setName('filledComparisonRelation');
        this.relation.add(symbol);
        return symbol;
    }

    /** Pair equal pieces explicitly; equality never eats one side. */
    pairEqual(): void {
        this.pairRings.clear().lineStyle(2.5, 0x668644, 0.9);
        const circles = (side: Phaser.GameObjects.Container): void => {
            for (const child of side.list) {
                const item = child as Phaser.GameObjects.Image | Phaser.GameObjects.Text;
                if (!('displayWidth' in item)) continue;
                this.pairRings.strokeEllipse(side.x + item.x, side.y + item.y, item.displayWidth + 8, item.displayHeight + 8);
            }
        };
        circles(this.left); circles(this.right);
    }

    clearPairing(): void { this.pairRings.clear(); }

    highlightOffer(): void {
        if (this.problem.answer === 1) { this.pairEqual(); return; }
        const side = this.problem.answer === 0 ? this.right : this.left;
        const host = this.problem.answer === 0 ? this.layout.right : this.layout.left;
        this.pairRings.clear().lineStyle(3, 0x668644, 0.9);
        this.pairRings.strokeRoundedRect(side.x - host.width / 2 - 4, side.y - host.height / 2 - 4, host.width + 8, host.height + 8, 16);
    }

    destroy(): void { this.root.destroy(true); }
}

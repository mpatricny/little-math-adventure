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

/** One empty target style for chapter, ordinary exercises and advanced exams. */
export function drawComparisonSlot(scene: Phaser.Scene, width: number, height: number, color = 0x917747): Phaser.GameObjects.Graphics {
    const slot = scene.add.graphics().setName('emptyComparisonSlot');
    slot.lineStyle(width < 40 ? 1.5 : 2, color, 0.85);
    const step = Math.min(12, width / 4), dash = step / 2;
    for (let x = -width / 2 + dash; x < width / 2 - dash; x += step) {
        slot.lineBetween(x, -height / 2, Math.min(x + dash, width / 2 - dash), -height / 2);
        slot.lineBetween(x, height / 2, Math.min(x + dash, width / 2 - dash), height / 2);
    }
    for (let y = -height / 2 + dash; y < height / 2 - dash; y += step) {
        slot.lineBetween(-width / 2, y, -width / 2, Math.min(y + dash, height / 2 - dash));
        slot.lineBetween(width / 2, y, width / 2, Math.min(y + dash, height / 2 - dash));
    }
    return slot;
}

/** Same plain-sign paths as the SVGs, with Canvas-safe ink on dark surfaces. */
export function drawComparisonSymbol(scene: Phaser.Scene, answer: number, width: number, ink: number): Phaser.GameObjects.Graphics {
    const glyph = scene.add.graphics().setName('filledComparisonRelation');
    const scale = width / 240;
    const paths = answer === 1
        ? [[[30, 69], [210, 69]], [[30, 158], [210, 158]]]
        : [[[35, 28], [207, 111], [35, 194]]];
    glyph.lineStyle(26 * scale, ink, 1).fillStyle(ink, 1);
    for (const path of paths) {
        const points = path.map(([x, y]) => new Phaser.Geom.Point((x - 120) * scale * (answer === 0 ? -1 : 1), (y - 110) * scale));
        glyph.strokePoints(points, false);
        points.forEach(point => glyph.fillCircle(point.x, point.y, 13 * scale));
    }
    return glyph;
}

/** Pure presentation: no attempts, mastery, rewards or answer timers. */
export class ComparisonProblemView {
    readonly root: Phaser.GameObjects.Container;
    readonly left: Phaser.GameObjects.Container;
    readonly right: Phaser.GameObjects.Container;
    readonly slot: Phaser.GameObjects.Graphics;
    readonly relation: Phaser.GameObjects.Container;
    private readonly pairRings: Phaser.GameObjects.Graphics;

    constructor(private scene: Phaser.Scene, readonly problem: MathProblem, readonly layout: ComparisonProblemLayout, private ink?: number) {
        this.root = scene.add.container(0, 0).setName('comparisonProblem');
        this.left = this.createOperand(layout.left, true);
        this.right = this.createOperand(layout.right, false);
        this.relation = scene.add.container(layout.relation.x, layout.relation.y).setDepth(layout.relation.depth).setName('comparisonRelation');
        this.slot = drawComparisonSlot(scene, layout.relation.width, layout.relation.height, ink);
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
            color: this.ink === undefined ? '#4a3826' : `#${this.ink.toString(16).padStart(6, '0')}`, resolution: 2,
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

    reveal(plain = !this.problem.comparisonMeta?.showCrocodile): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
        this.relation.removeAll(true);
        const symbol = plain && this.ink !== undefined
            ? drawComparisonSymbol(this.scene, this.problem.answer, 52, this.ink)
            : comparisonGlyph(this.scene, this.problem.answer, plain, plain ? 52 : 86);
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

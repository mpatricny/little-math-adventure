import Phaser from 'phaser';
import { MathProblem } from '../types';
import { getComparisonExpressions } from '../utils/formatMathProblem';
import { drawComparisonSlot, drawComparisonSymbol } from './ComparisonProblemView';

/** Compact version of the chapter's empty relation for ordinary arithmetic. */
export class ComparisonExpressionView {
    readonly root: Phaser.GameObjects.Container;
    readonly left: Phaser.GameObjects.Text;
    readonly right: Phaser.GameObjects.Text;
    readonly relation: Phaser.GameObjects.Container;
    readonly width: number;
    private readonly symbolWidth: number;
    private readonly ink: number;

    constructor(scene: Phaser.Scene, private problem: MathProblem, options: {
        x: number; y: number; depth: number; fontSize: number; color: string;
        compact?: boolean; align?: 'left' | 'center';
    }) {
        const expressions = getComparisonExpressions(problem);
        if (!expressions) throw new Error('ComparisonExpressionView requires a comparison');
        const style = { fontFamily: 'Arial, sans-serif', fontSize: `${options.fontSize}px`, fontStyle: 'bold', color: options.color, resolution: 2 };
        this.ink = Number.parseInt(options.color.replace('#', ''), 16);
        const label = (value: string) => options.compact ? value.replace(/\s/g, '') : value;
        this.root = scene.add.container(options.x, options.y).setDepth(options.depth).setName('comparisonExpression');
        this.left = scene.add.text(0, 0, label(expressions.left), style).setOrigin(0, 0.5).setName('comparisonLeftExpression');
        this.right = scene.add.text(0, 0, label(expressions.right), style).setOrigin(0, 0.5).setName('comparisonRightExpression');
        const size = Math.round(options.fontSize * 1.1), gap = options.compact ? 5 : 12;
        this.symbolWidth = size * 0.92;
        this.width = this.left.width + this.right.width + size + gap * 2;
        const start = options.align === 'left' ? 0 : -this.width / 2;
        this.left.setX(start);
        this.relation = scene.add.container(start + this.left.width + gap + size / 2, 0).setName('comparisonRelation').setSize(size, size);
        this.relation.add(drawComparisonSlot(scene, size, size, options.color === '#fff3d4' ? 0xc6a977 : undefined));
        this.right.setX(start + this.left.width + gap * 2 + size);
        this.root.add([this.left, this.relation, this.right]);
        this.root.setSize(this.width, Math.max(size, this.left.height));
    }

    reveal(): void {
        this.relation.removeAll(true);
        const glyph = drawComparisonSymbol(this.root.scene, this.problem.answer, this.symbolWidth, this.ink);
        this.relation.add(glyph);
    }

    destroy(): void { this.root.destroy(true); }
}

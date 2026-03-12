import Phaser from 'phaser';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';

/**
 * Debug panel showing the current mastery problem pool.
 * Appears on top-right when D is pressed (alongside SceneDebugger).
 * Lightweight, not a modal overlay.
 */
export class DebugPoolDisplay {
    private container: Phaser.GameObjects.Container;
    private infoText: Phaser.GameObjects.Text;
    private bg: Phaser.GameObjects.Rectangle;

    constructor(scene: Phaser.Scene) {
        this.container = scene.add.container(0, 0);
        this.container.setDepth(20001);
        this.container.setScrollFactor(0);
        this.container.setVisible(false);

        // Background
        this.bg = scene.add.rectangle(1270, 10, 380, 400, 0x000000, 0.85)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0x00ff00);
        this.container.add(this.bg);

        // Text
        this.infoText = scene.add.text(1260, 20, '', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#00ff00',
            lineSpacing: 3,
            wordWrap: { width: 360 },
        }).setOrigin(1, 0);
        this.container.add(this.infoText);
    }

    show(): void {
        this.container.setVisible(true);
        this.refresh();
    }

    hide(): void {
        this.container.setVisible(false);
    }

    refresh(): void {
        try {
            const mastery = MasterySystem.getInstance();
            const data = GameStateManager.getInstance().getMasteryData();
            const frontier = mastery.getFrontierSubAtom();
            const band = mastery.getCurrentBand();

            const lines: string[] = [];
            lines.push('MASTERY POOL DEBUG');
            lines.push('──────────────────────────');
            lines.push(`Frontier: ${frontier} (${data.subAtoms[frontier].state})`);
            lines.push(`Band: ${band} | Pool: ${data.currentPoolIndex}/${data.currentPool.length}`);
            lines.push('');

            // Current pool
            lines.push('CURRENT POOL:');
            if (data.currentPool.length === 0) {
                lines.push('  (empty - will generate on next draw)');
            } else {
                for (let i = 0; i < data.currentPool.length; i++) {
                    const key = data.currentPool[i];
                    const marker = i === data.currentPoolIndex ? ' ◄' : '';
                    const source = this.getSourceLabel(key, data, frontier);
                    // Shorten key for display
                    const shortKey = this.shortenKey(key);
                    lines.push(` [${i}] ${shortKey}  ${source}${marker}`);
                }
            }

            lines.push('');

            // Retry pool
            lines.push(`RETRY (${data.retryPool.length}):`);
            if (data.retryPool.length > 0) {
                const retryKeys = data.retryPool.slice(0, 5).map(k => this.shortenKey(k));
                lines.push(`  ${retryKeys.join(', ')}`);
                if (data.retryPool.length > 5) {
                    lines.push(`  ... +${data.retryPool.length - 5} more`);
                }
            }

            // Slow pool
            lines.push(`SLOW (${data.slowPool.length}):`);
            if (data.slowPool.length > 0) {
                const slowKeys = data.slowPool.slice(0, 5).map(k => this.shortenKey(k));
                lines.push(`  ${slowKeys.join(', ')}`);
                if (data.slowPool.length > 5) {
                    lines.push(`  ... +${data.slowPool.length - 5} more`);
                }
            }

            this.infoText.setText(lines.join('\n'));

            // Resize background to fit text
            const textHeight = this.infoText.height + 20;
            this.bg.setSize(380, Math.max(200, textHeight));

        } catch (e) {
            this.infoText.setText('MASTERY POOL DEBUG\n──────────────────\nError reading pool data');
        }
    }

    private getSourceLabel(key: string, data: any, frontier: string): string {
        if (data.retryPool.includes(key)) return '[retry]';
        if (data.slowPool.includes(key)) return '[slow]';

        // Parse subAtomId from key (format: "A1:3+2:result_unknown")
        const subAtomId = key.split(':')[0];
        if (subAtomId === frontier) return '[current]';

        const state = data.subAtoms[subAtomId]?.state;
        if (state === 'secure') return '[improve]';
        if (state === 'fluent') return '[review]';
        if (state === 'mastery') return '[master]';
        return `[${state || '?'}]`;
    }

    private shortenKey(key: string): string {
        // "A1:3+2:result_unknown" → "A1:3+2:res_unk"
        return key
            .replace('result_unknown', 'res_unk')
            .replace('missing_part', 'mis_part')
            .replace('compare_equation_vs_number', 'cmp_num')
            .replace('compare_equation_vs_equation', 'cmp_eq');
    }

    destroy(): void {
        this.container?.destroy();
    }
}

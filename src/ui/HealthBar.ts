import Phaser from 'phaser';

export interface HealthBarConfig {
    x: number;
    y: number;
    width?: number;
    height?: number;
    maxValue: number;
    currentValue: number;
    showText?: boolean;
    textPrefix?: string;
    backgroundColor?: number;
    fillColor?: number;
    borderColor?: number;
    useColorGradient?: boolean;  // Changes color based on health %
}

export class HealthBar {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Rectangle;
    private fill: Phaser.GameObjects.Rectangle;
    private border: Phaser.GameObjects.Rectangle;
    private text: Phaser.GameObjects.Text | null = null;

    private maxValue: number;
    private currentValue: number;
    private width: number;
    private height: number;
    private useColorGradient: boolean;
    private textPrefix: string;

    constructor(scene: Phaser.Scene, config: HealthBarConfig) {
        this.scene = scene;
        this.maxValue = config.maxValue;
        this.currentValue = config.currentValue;
        this.width = config.width || 100;
        this.height = config.height || 16;
        this.useColorGradient = config.useColorGradient ?? true;
        this.textPrefix = config.textPrefix || '';

        // Create container for all elements
        this.container = scene.add.container(config.x, config.y);

        // Border/frame
        this.border = scene.add.rectangle(0, 0, this.width + 4, this.height + 4, config.borderColor ?? 0x333333);
        this.border.setOrigin(0.5);
        this.container.add(this.border);

        // Background (empty bar)
        this.background = scene.add.rectangle(0, 0, this.width, this.height, config.backgroundColor ?? 0x222222);
        this.background.setOrigin(0.5);
        this.container.add(this.background);

        // Fill (health remaining)
        this.fill = scene.add.rectangle(-this.width / 2, 0, this.width, this.height, config.fillColor ?? 0x44cc44);
        this.fill.setOrigin(0, 0.5);
        this.container.add(this.fill);

        // Optional text display
        if (config.showText !== false) {
            this.text = scene.add.text(0, 0, this.getDisplayText(), {
                fontSize: `${Math.max(14, this.height - 4)}px`,
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5);
            this.container.add(this.text);
        }

        // Initial update
        this.updateDisplay();
    }

    private getDisplayText(): string {
        if (this.textPrefix) {
            return `${this.textPrefix}: ${this.currentValue}/${this.maxValue}`;
        }
        return `${this.currentValue}/${this.maxValue}`;
    }

    private getColorForPercent(percent: number): number {
        if (percent > 0.5) {
            return 0x44cc44; // Green
        } else if (percent > 0.25) {
            return 0xcccc44; // Yellow
        } else {
            return 0xcc4444; // Red
        }
    }

    private updateDisplay(): void {
        const percent = Math.max(0, Math.min(1, this.currentValue / this.maxValue));

        // Update fill width
        this.fill.setSize(this.width * percent, this.height);

        // Update color if using gradient
        if (this.useColorGradient) {
            this.fill.setFillStyle(this.getColorForPercent(percent));
        }

        // Update text
        if (this.text) {
            this.text.setText(this.getDisplayText());
        }
    }

    /**
     * Set current health value
     */
    setValue(value: number): void {
        this.currentValue = Math.max(0, Math.min(value, this.maxValue));
        this.updateDisplay();
    }

    /**
     * Set maximum health value
     */
    setMaxValue(value: number): void {
        this.maxValue = Math.max(1, value);
        this.updateDisplay();
    }

    /**
     * Set both current and max values at once
     */
    setValues(current: number, max: number): void {
        this.maxValue = Math.max(1, max);
        this.currentValue = Math.max(0, Math.min(current, this.maxValue));
        this.updateDisplay();
    }

    /**
     * Animate value change
     */
    animateToValue(value: number, duration: number = 300): void {
        const startValue = this.currentValue;
        const targetValue = Math.max(0, Math.min(value, this.maxValue));

        this.scene.tweens.addCounter({
            from: startValue,
            to: targetValue,
            duration,
            ease: 'Power2',
            onUpdate: (tween) => {
                this.currentValue = Math.round(tween.getValue());
                this.updateDisplay();
            },
        });
    }

    /**
     * Flash the bar (for damage/heal effects)
     */
    flash(color: number = 0xffffff, duration: number = 100): void {
        const originalColor = this.fill.fillColor;

        this.scene.tweens.add({
            targets: this.fill,
            fillColor: color,
            duration: duration / 2,
            yoyo: true,
            onComplete: () => {
                this.updateDisplay(); // Restore correct color
            },
        });
    }

    /**
     * Set position
     */
    setPosition(x: number, y: number): void {
        this.container.setPosition(x, y);
    }

    /**
     * Set visibility
     */
    setVisible(visible: boolean): void {
        this.container.setVisible(visible);
    }

    /**
     * Set alpha
     */
    setAlpha(alpha: number): void {
        this.container.setAlpha(alpha);
    }

    /**
     * Set depth
     */
    setDepth(depth: number): void {
        this.container.setDepth(depth);
    }

    /**
     * Get current value
     */
    getValue(): number {
        return this.currentValue;
    }

    /**
     * Get max value
     */
    getMaxValue(): number {
        return this.maxValue;
    }

    /**
     * Get percentage (0-1)
     */
    getPercent(): number {
        return this.currentValue / this.maxValue;
    }

    /**
     * Destroy the health bar
     */
    destroy(): void {
        this.container.destroy();
    }

    /**
     * Get the container for adding to other containers
     */
    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }
}

import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { LearningProfileOptions, LearningProfileSnapshot, readLearningProfiles } from '../systems/LearningProfileView';
import { destroyLearningLayout, LearningButton, learningHost, learningPortrait, learningText } from './LearningUi';

/** Shared parchment and independent profile browsing for the two learning views. */
export abstract class LearningOverlay {
    protected readonly container: Phaser.GameObjects.Container;
    protected readonly layout: SceneBuilder;
    protected profiles: LearningProfileSnapshot[] = [];
    protected profileIndex = 0;
    private readonly selector: Phaser.GameObjects.Container;
    private visible = false;
    private destroyed = false;
    private readonly escape = () => { if (this.visible) this.hide(); };

    constructor(protected readonly scene: Phaser.Scene, title: string, protected readonly options: LearningProfileOptions = {}) {
        this.layout = new SceneBuilder(scene); this.layout.buildScene('LearningPanelLayout');
        const origin = learningHost(this.layout, 'overlayHost');
        this.container = scene.add.container(origin.x, origin.y).setDepth(origin.depth).setVisible(false)
            .setName(`${title}:learningOverlay`).setScrollFactor(0);
        const back = scene.add.rectangle(0, 0, 1280, 720, 0x0b2026, 0.83).setInteractive();
        back.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => event.stopPropagation());
        const frame = learningHost(this.layout, 'frame');
        const image = scene.add.image(frame.x, frame.y, 'learning-panel-v1');
        image.setScale(Math.min(frame.width / image.width, frame.height / image.height));
        this.container.add([back, image]);
        const titleHost = learningHost(this.layout, 'title');
        learningText(scene, this.container, titleHost.x, titleHost.y, title, 26, '#244944', 'left');
        new LearningButton(scene, this.container, learningHost(this.layout, 'close'), 'learningClose', '', '×', () => this.hide());
        this.selector = scene.add.container(); this.container.add(this.selector);
        scene.input.keyboard?.on('keydown-ESC', this.escape);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    protected get profile(): LearningProfileSnapshot { return this.profiles[this.profileIndex]; }
    public getSelectedSlotIndex(): number { return this.profile?.slotIndex ?? -1; }

    public show(): void {
        if (this.visible || this.destroyed) return;
        const previous = this.profile?.slotIndex ?? this.options.selectedSlotIndex
            ?? GameStateManager.getInstance().getActiveSlotIndex();
        this.profiles = readLearningProfiles(this.options);
        this.profileIndex = Math.max(0, this.profiles.findIndex(profile => profile.slotIndex === previous));
        this.visible = true; this.container.setVisible(true); this.refresh();
    }

    public selectProfile(slotIndex: number): void {
        const index = this.profiles.findIndex(profile => profile.slotIndex === slotIndex);
        if (index < 0 || index === this.profileIndex) return;
        this.profileIndex = index;
        this.options.onProfileChange?.(slotIndex);
        this.onProfileChanged(); this.refresh();
    }

    private refresh(): void {
        this.selector.removeAll(true);
        if (!this.profile) return;
        const identity = learningHost(this.layout, 'profile');
        learningPortrait(this.scene, this.selector, identity.x - 138, identity.y, this.profile.player.characterType, 64);
        learningText(this.scene, this.selector, identity.x + 22, identity.y - 5,
            this.profile.player.name || 'Hrdina', 21).setWordWrapWidth(250, true);
        if (this.profiles.length > 1) {
            const change = (delta: number) => this.selectProfile(this.profiles[(this.profileIndex + delta + this.profiles.length) % this.profiles.length].slotIndex);
            new LearningButton(this.scene, this.selector, learningHost(this.layout, 'profilePrevious'), 'learningProfilePrevious', '', '‹', () => change(-1));
            new LearningButton(this.scene, this.selector, learningHost(this.layout, 'profileNext'), 'learningProfileNext', '', '›', () => change(1));
            learningText(this.scene, this.selector, identity.x + 22, identity.y + 23, `${this.profileIndex + 1} / ${this.profiles.length}`, 13, '#6a6a51');
        }
        this.renderProfile();
    }
    protected abstract renderProfile(): void;
    protected onProfileChanged(): void {}
    public hide(): void { this.visible = false; this.container.setVisible(false); }
    public toggle(): void { if (this.visible) this.hide(); else this.show(); }
    public getIsVisible(): boolean { return this.visible; }
    public setPlacement(x: number, y: number, depth: number): this { this.container.setPosition(x, y).setDepth(depth); return this; }
    public destroy(): void {
        if (this.destroyed) return; this.destroyed = true;
        this.scene.input.keyboard?.off('keydown-ESC', this.escape);
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.container.destroy();
        destroyLearningLayout(this.scene, this.layout, 'LearningPanelLayout');
    }
}

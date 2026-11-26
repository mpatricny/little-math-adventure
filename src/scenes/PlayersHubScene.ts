import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { getPlayerResumeScene } from '../systems/SilverpondProgressSystem';
import { LearningProfileSnapshot, readLearningProfiles, readSavedLearningProfiles } from '../systems/LearningProfileView';
import { DailyProgressSystem } from '../systems/DailyProgressSystem';
import { DailyProgressOverlay } from '../ui/DailyProgressOverlay';
import { MasteryMapOverlay } from '../ui/MasteryMapOverlay';
import { CatacombProgressOverlay, takeFoxReward, type FoxRewardArrival } from '../ui/CatacombProgressOverlay';
import { LearningButton, learningCard, learningHost, learningPortrait, learningText, LEARNING_MUTED } from '../ui/LearningUi';

export interface PlayersHubInit { selectedSlotIndex?: number; firstPlayerSlot?: number; foxReward?: FoxRewardArrival }

/** One profile hub shared by menu, legacy save selection and co-op selection. */
export class PlayersHubScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private root!: Phaser.GameObjects.Container;
    private content!: Phaser.GameObjects.Container;
    private profiles: LearningProfileSnapshot[] = [];
    private currentSlotIndex = -1;
    private player1Slot = -1;
    private player2Slot = -1;
    private deletingSlot: number | null = null;
    private modalRoot?: Phaser.GameObjects.Container;
    private dailyProgressOverlay?: DailyProgressOverlay;
    private masteryMapOverlay?: MasteryMapOverlay;
    private foxPanel?: CatacombProgressOverlay;
    private entry: PlayersHubInit = {};
    private unsubscribeSaves?: () => void;

    constructor(key = 'MenuNewScene', private readonly coopMode = false) { super({ key }); }
    init(data: PlayersHubInit = {}): void {
        this.entry = data; this.deletingSlot = null;
        this.player1Slot = data.firstPlayerSlot ?? -1; this.player2Slot = -1;
        this.dailyProgressOverlay = undefined; this.masteryMapOverlay = undefined; this.foxPanel = undefined;
    }
    create(): void {
        this.sceneBuilder = new SceneBuilder(this); this.sceneBuilder.buildScene('PlayersHubLayout');
        const origin = learningHost(this.sceneBuilder, 'root');
        this.root = this.add.container(origin.x, origin.y).setDepth(origin.depth).setName('playersHub');
        const frame = learningHost(this.sceneBuilder, 'frame');
        const image = this.add.image(frame.x, frame.y, 'learning-panel-v1');
        image.setScale(Math.min(frame.width / image.width, frame.height / image.height)); this.root.add(image);
        const title = learningHost(this.sceneBuilder, 'title');
        learningText(this, this.root, title.x, title.y, this.coopMode ? 'HRAJEME SPOLU' : 'HRÁČI', 28, '#244944', 'left');
        new LearningButton(this, this.root, learningHost(this.sceneBuilder, 'close'), 'playersHubClose', '', '×', () => this.goBack());
        this.content = this.add.container(); this.root.add(this.content);
        this.refreshProfiles();
        const arrival = takeFoxReward(this.entry);
        const remembered = arrival?.slot ?? this.entry.selectedSlotIndex ?? this.registry.get('playersHubSelectedSlot');
        this.currentSlotIndex = this.profiles.some(p => p.slotIndex === remembered) ? remembered : this.profiles[0]?.slotIndex ?? -1;
        if (this.coopMode && this.player1Slot < 0) this.player1Slot = this.currentSlotIndex;
        if (this.coopMode && this.currentSlotIndex !== this.player1Slot) this.player2Slot = this.currentSlotIndex;
        this.render();
        if (arrival) {
            this.foxPanel = CatacombProgressOverlay.forScene(this);
            this.foxPanel.show(arrival.target, arrival.slot, arrival.reward);
        }
        const back = () => { if (!this.overlayVisible()) this.goBack(); };
        const enter = () => { if (!this.overlayVisible() && this.deletingSlot === null) this.onLoadClicked(); };
        this.input.keyboard?.on('keydown-ESC', back);
        this.input.keyboard?.on('keydown-ENTER', enter);
        this.unsubscribeSaves = SaveSystem.observeChanges(() => {
            if (!this.sys.isActive() || this.deletingSlot !== null) return;
            this.refreshProfiles(); this.render();
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.unsubscribeSaves?.(); this.unsubscribeSaves = undefined;
            this.input.keyboard?.off('keydown-ESC', back); this.input.keyboard?.off('keydown-ENTER', enter);
            this.dailyProgressOverlay?.destroy(); this.masteryMapOverlay?.destroy(); this.modalRoot?.destroy();
        });
    }
    private refreshProfiles(): void {
        this.profiles = readLearningProfiles({ slotIndices: readSavedLearningProfiles().map(p => p.slotIndex) });
        if (!this.profiles.some(p => p.slotIndex === this.currentSlotIndex)) this.currentSlotIndex = this.profiles[0]?.slotIndex ?? -1;
    }
    private get selected(): LearningProfileSnapshot | undefined { return this.profiles.find(p => p.slotIndex === this.currentSlotIndex); }
    private overlayVisible(): boolean { return !!(this.foxPanel?.root.visible || this.dailyProgressOverlay?.getIsVisible() || this.masteryMapOverlay?.getIsVisible()); }
    private goBack(): void {
        if (this.overlayVisible()) return;
        if (this.deletingSlot !== null) { this.closeDelete(); return; }
        if (this.coopMode) this.scene.start('MenuNewScene', { selectedSlotIndex: this.currentSlotIndex });
        else this.scene.start('MenuScene');
    }
    private select(slot: number): void {
        if (this.overlayVisible() || this.deletingSlot !== null) return;
        this.currentSlotIndex = slot; this.registry.set('playersHubSelectedSlot', slot);
        if (this.coopMode) {
            if (this.player1Slot < 0) this.player1Slot = slot;
            else if (slot !== this.player1Slot) this.player2Slot = slot;
        }
        this.render();
    }
    private render(): void {
        this.content.removeAll(true);
        this.profiles.forEach((profile, index) => this.renderPlayerCard(profile, index));
        if (!this.profiles.length) {
            const empty = learningHost(this.sceneBuilder, 'empty');
            learningPortrait(this, this.content, empty.x - 65, empty.y - 35, 'girl', 160);
            learningText(this, this.content, empty.x + 75, empty.y - 35, '+', 72);
            learningText(this, this.content, empty.x, empty.y + 40, 'Nový hráč', 28);
        }
        const count = learningHost(this.sceneBuilder, 'count');
        learningText(this, this.content, count.x, count.y, `${this.profiles.length} / 8`, 18, LEARNING_MUTED);
        if (this.selected) this.renderSummary(this.selected);
        const emptySlot = this.firstEmptySlot();
        new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'newPlayer'), 'hubNewPlayer',
            emptySlot >= 0 ? 'Nový hráč' : 'Plno', '+', () => this.createPlayer()).setEnabled(emptySlot >= 0);
        new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'deletePlayer'), 'hubDeletePlayer',
            '', '⌫', () => this.openDelete()).setEnabled(!!this.selected);
        if (this.coopMode) {
            const pair = learningHost(this.sceneBuilder, 'pair');
            const a = this.profiles.find(p => p.slotIndex === this.player1Slot);
            const b = this.profiles.find(p => p.slotIndex === this.player2Slot);
            if (a) learningPortrait(this, this.content, pair.x - 64, pair.y, a.player.characterType, 66);
            learningText(this, this.content, pair.x, pair.y, '+', 34);
            if (b) learningPortrait(this, this.content, pair.x + 64, pair.y, b.player.characterType, 66);
            else learningText(this, this.content, pair.x + 64, pair.y, '?', 36, LEARNING_MUTED);
            new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'coopStart'), 'hubCoopStart', 'HRÁT', '▶',
                () => this.startCoop()).setEnabled(!!a && !!b && a.slotIndex !== b.slotIndex);
        } else {
            new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'solo'), 'hubSolo', 'SÁM', '▶',
                () => this.onLoadClicked()).setEnabled(!!this.selected);
            const coopButton = new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'coop'), 'hubCoop', 'SPOLU', ' ',
                () => this.scene.start('CoopSetupScene', { selectedSlotIndex: this.currentSlotIndex, firstPlayerSlot: this.currentSlotIndex }))
                .setEnabled(!!this.selected);
            learningPortrait(this, coopButton.surface, -84, 0, 'girl', 55);
            learningPortrait(this, coopButton.surface, -52, 0, 'boy', 55);
        }
    }
    private renderPlayerCard(profile: LearningProfileSnapshot, index: number): void {
        const host = learningHost(this.sceneBuilder, `playerCard${index + 1}`);
        const chosen = this.coopMode ? profile.slotIndex === this.player1Slot || profile.slotIndex === this.player2Slot
            : profile.slotIndex === this.currentSlotIndex;
        const button = new LearningButton(this, this.content, host, `playerCard:${profile.slotIndex}`, '', '', () => this.select(profile.slotIndex), chosen);
        button.root.setData('profileSlot', profile.slotIndex);
        learningPortrait(this, button.surface, 0, -29, profile.player.characterType, 98);
        const name = learningText(this, button.surface, 0, 48, profile.player.name || 'Hrdina', 18);
        name.setWordWrapWidth(host.width - 18, true).setName(`playerName:${profile.slotIndex}`);
        if (chosen) {
            const badge = this.add.circle(host.width / 2 - 21, -host.height / 2 + 21, 14, 0x267e79);
            button.surface.add(badge);
            learningText(this, button.surface, host.width / 2 - 21, -host.height / 2 + 21,
                this.coopMode ? profile.slotIndex === this.player1Slot ? '1' : '2' : '✓', 18, '#ffffff');
        }
    }
    private renderSummary(profile: LearningProfileSnapshot): void {
        const panel = learningHost(this.sceneBuilder, 'summary');
        learningCard(this, this.content, panel.x, panel.y, panel.width, panel.height, true);
        const portrait = learningHost(this.sceneBuilder, 'summaryPortrait');
        learningPortrait(this, this.content, portrait.x, portrait.y, profile.player.characterType, portrait.width);
        const name = learningHost(this.sceneBuilder, 'summaryName');
        learningText(this, this.content, name.x, name.y, profile.player.name || 'Hrdina', 25)
            .setWordWrapWidth(name.width, true).setName('hubSelectedName');
        const level = learningHost(this.sceneBuilder, 'summaryLevel');
        learningText(this, this.content, level.x, level.y, `★ ${profile.player.level}`, 27);
        const total = learningHost(this.sceneBuilder, 'summaryTotal');
        const summary = DailyProgressSystem.getSummary(profile.player, profile.stats);
        learningText(this, this.content, total.x, total.y, `✎ ${summary.attempts}`, 27).setName('hubSummaryTotal');
        const totalLabel = learningHost(this.sceneBuilder, 'summaryTotalLabel');
        learningText(this, this.content, totalLabel.x, totalLabel.y, 'CELKEM', 13, LEARNING_MUTED);
        const today = DailyProgressSystem.getRecentDays(profile.player, profile.stats, 1)[0];
        const daily = learningHost(this.sceneBuilder, 'summaryToday');
        learningText(this, this.content, daily.x, daily.y, `Dnes · ${today.attempts}`, 17, LEARNING_MUTED);
        new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'day'), 'hubDay', 'DEN', '◷', () => this.showDaily());
        const map = new LearningButton(this, this.content, learningHost(this.sceneBuilder, 'map'), 'hubMap', 'MAPA', ' ', () => this.showMap());
        const mapIcon = this.add.image(-48, 0, 'guild-map-normal-v2');
        mapIcon.setScale(Math.min(48 / mapIcon.width, 48 / mapIcon.height)); map.surface.add(mapIcon);
    }
    private profileOptions() {
        return { slotIndices: this.profiles.map(p => p.slotIndex), selectedSlotIndex: this.currentSlotIndex,
            onProfileChange: (slot: number) => {
                this.currentSlotIndex = slot; this.registry.set('playersHubSelectedSlot', slot); this.render();
            } };
    }
    private showDaily(): void {
        if (!this.selected || this.overlayVisible()) return;
        this.dailyProgressOverlay?.destroy();
        this.dailyProgressOverlay = new DailyProgressOverlay(this, this.profileOptions()); this.dailyProgressOverlay.show();
    }
    private showMap(): void {
        if (!this.selected || this.overlayVisible()) return;
        this.masteryMapOverlay?.destroy();
        this.masteryMapOverlay = new MasteryMapOverlay(this, this.profileOptions()); this.masteryMapOverlay.show();
    }
    private firstEmptySlot(): number {
        for (let slot = 0; slot < 8; slot++) if (!this.profiles.some(p => p.slotIndex === slot)) return slot;
        return -1;
    }
    private createPlayer(): void {
        const slotIndex = this.firstEmptySlot();
        if (slotIndex < 0 || this.overlayVisible()) return;
        CoopSessionManager.getInstance().endSession();
        this.scene.start('CharacterSelectNewScene', { slotIndex });
    }
    /** Kept as the explicit solo entry point for existing integrations. */
    private onLoadClicked(): void {
        if (this.coopMode) { this.startCoop(); return; }
        if (!this.selected || this.overlayVisible()) return;
        CoopSessionManager.getInstance().endSession();
        const game = GameStateManager.getInstance();
        if (game.loadSlot(this.currentSlotIndex)) this.scene.start(getPlayerResumeScene(game.getPlayer()));
    }
    private startCoop(): void {
        if (this.overlayVisible() || this.player1Slot < 0 || this.player2Slot < 0 || this.player1Slot === this.player2Slot) return;
        const coop = CoopSessionManager.getInstance(); coop.endSession();
        if (coop.startSession(this.player1Slot, this.player2Slot)) {
            this.scene.start(getPlayerResumeScene(GameStateManager.getInstance().getPlayer()));
        }
    }
    /** Existing controller/test integrations use this co-op entry point. */
    public onStartClicked(): void { this.startCoop(); }
    private openDelete(): void {
        if (!this.selected || this.overlayVisible()) return;
        this.deletingSlot = this.currentSlotIndex;
        const origin = learningHost(this.sceneBuilder, 'deleteModal');
        this.modalRoot = this.add.container(origin.x, origin.y).setDepth(origin.depth).setName('deletePlayerDialog');
        this.modalRoot.add(this.add.rectangle(0, 0, 1280, 720, 0x0b2026, 0.8).setInteractive());
        learningCard(this, this.modalRoot, 0, 0, origin.width, origin.height);
        learningText(this, this.modalRoot, 0, -125, 'Smazat hráče?', 28);
        learningPortrait(this, this.modalRoot, 0, -35, this.selected.player.characterType, 115);
        learningText(this, this.modalRoot, 0, 40, this.selected.player.name, 23).setWordWrapWidth(420, true);
        new LearningButton(this, this.modalRoot, learningHost(this.sceneBuilder, 'deleteCancel'), 'hubDeleteCancel', 'ZPĚT', '←', () => this.closeDelete());
        new LearningButton(this, this.modalRoot, learningHost(this.sceneBuilder, 'deleteConfirm'), 'hubDeleteConfirm', 'SMAZAT', '⌫', () => this.confirmDelete());
    }
    private closeDelete(): void { this.deletingSlot = null; this.modalRoot?.destroy(); this.modalRoot = undefined; }
    private confirmDelete(): void {
        if (this.deletingSlot === null) return;
        const slot = this.deletingSlot;
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive() && [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()].includes(slot)) coop.endSession();
        SaveSystem.deleteSlot(slot);
        if (this.player1Slot === slot) this.player1Slot = -1;
        if (this.player2Slot === slot) this.player2Slot = -1;
        this.closeDelete(); this.refreshProfiles(); this.render();
    }
}

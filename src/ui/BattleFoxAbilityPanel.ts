import Phaser from 'phaser';
import type { FoxAbilityId, FoxAbilityState, FoxOwnerId } from '../types/foxAbilities';
import { BattleDockControl, DOCK_OWNER_COLORS, dockBadge, dockHost, dockImage, dockTabTexture, dockText, setDockName, type DockHost } from './BattleDockArt';

export interface FoxAbilityPanelOwner {
    id: FoxOwnerId;
    name: string;
    portrait: string;
    foxPortrait: string;
    abilities: Record<FoxAbilityId, FoxAbilityState>;
}
export interface FoxAbilityPanelState {
    owners: FoxAbilityPanelOwner[];
    turnOwner: FoxOwnerId;
    /** Changes once at entry to a normal hero/pet turn, not on every render. */
    turnToken: string;
    visible: boolean;
    selectionEnabled: boolean;
    wideNames?: boolean;
}
export interface FoxAbilityPanelLayout {
    frame: DockHost;
    singleFrame: DockHost;
    tabs: [DockHost, DockHost];
    singleTab: DockHost;
    divider: DockHost;
    abilities: Record<FoxAbilityId, DockHost>;
}
type OwnerTab = { control: BattleDockControl; label: Phaser.GameObjects.Text;
    number: ReturnType<typeof dockBadge> };
type AbilityControl = { control: BattleDockControl; gem: Phaser.GameObjects.Image; emptyGem: Phaser.GameObjects.Graphics;
    lock: Phaser.GameObjects.Image };
const ABILITIES: FoxAbilityId[] = ['shield', 'heal', 'strike'];
const ICONS = {
    shield: ['battle-dock-shield-normal-v3', 'battle-dock-shield-active-v3'],
    heal: ['battle-dock-heal-normal-v3', 'battle-dock-heal-active-v3'],
    strike: ['battle-dock-strike-normal-v3', 'battle-dock-strike-active-v3'],
} as const;

/** Presentation only: selecting another fox never activates another player. */
export class BattleFoxAbilityPanel {
    readonly root: Phaser.GameObjects.Container;
    readonly tabs: OwnerTab[];
    readonly abilities: Record<FoxAbilityId, AbilityControl>;
    private outline: Phaser.GameObjects.Image;
    private divider: Phaser.GameObjects.Graphics;
    private state: FoxAbilityPanelState | null = null;
    private turnToken: string | null = null;
    private selectedOwner: FoxOwnerId = 'A';

    constructor(private scene: Phaser.Scene, private layout: FoxAbilityPanelLayout,
        private callbacks: { selectOwner: (owner: FoxOwnerId) => void; useAbility: (owner: FoxOwnerId, ability: FoxAbilityId) => void }) {
        this.root = scene.add.container(0, 0).setDepth(layout.frame.depth).setName('battleFoxAbilityPanel');
        this.outline = dockImage(scene, dockTabTexture(scene, layout.frame.width, layout.frame.height,
            DOCK_OWNER_COLORS.A, true, 'group'), layout.frame);
        this.divider = scene.add.graphics(); this.root.add([this.outline, this.divider]);
        this.tabs = layout.tabs.map((h, index) => this.createTab(h, index)) as [OwnerTab, OwnerTab];
        this.abilities = Object.fromEntries(ABILITIES.map(id => [id, this.createAbility(layout.abilities[id], id)])) as Record<FoxAbilityId, AbilityControl>;
    }

    restoreSelection(owner: FoxOwnerId, token: string): void { this.selectedOwner = owner; this.turnToken = token; }

    get owner(): FoxOwnerId { return this.selectedOwner; }
    get count(): number { return this.state?.owners.length ?? 0; }

    render(state: FoxAbilityPanelState): void {
        this.state = state;
        if (state.turnToken !== this.turnToken || !state.owners.some(o => o.id === this.selectedOwner)) {
            this.turnToken = state.turnToken;
            this.selectedOwner = state.owners.find(o => o.id === state.turnOwner)?.id ?? state.owners[0]?.id ?? 'A';
        }
        this.root.setVisible(state.visible && state.owners.length > 0).setData('owner', this.selectedOwner);
        const owner = state.owners.find(o => o.id === this.selectedOwner);
        if (!owner) return;
        const h = dockHost(state.owners.length === 1 ? this.layout.singleFrame : this.layout.frame, Boolean(state.wideNames));
        const color = DOCK_OWNER_COLORS[this.selectedOwner];
        this.outline.setTexture(dockTabTexture(this.scene, h.width, h.height, color, true, 'group')).setScale(.5).setPosition(h.x, h.y);
        const d = this.layout.divider;
        this.divider.clear().lineStyle(1.5, color, .75).lineBetween(d.x, d.y - d.height / 2, d.x, d.y + d.height / 2)
            .fillStyle(0xffde8d).fillCircle(d.x, d.y - d.height / 2, 1.5).fillCircle(d.x, d.y + d.height / 2, 1.5);
        this.tabs.forEach((tab, index) => {
            const value = state.owners[index]; tab.control.root.setVisible(Boolean(value));
            if (!value) return;
            const host = dockHost(state.owners.length === 1 ? this.layout.singleTab : this.layout.tabs[index], Boolean(state.wideNames));
            const regions = host.regions!, selected = value.id === this.selectedOwner;
            tab.control.root.setPosition(host.x, host.y).setSize(host.width, host.height).setData('owner', value.id).setName(`battleFoxOwner${value.id}`);
            if (tab.label.getData('layoutWidth') !== host.width) {
                tab.label.setPosition(regions.name.x, regions.name.y).setWordWrapWidth(regions.name.width - 2, true)
                    .setData('safeRegion', regions.name).setData('savedName', null).setData('layoutWidth', host.width);
            }
            setDockName(tab.label, value.name);
            tab.control.setIcon(value.foxPortrait);
            for (const icon of [tab.control.normalIcon, tab.control.activeIcon]) icon.setPosition(regions.icon.x, regions.icon.y);
            tab.number.root.setPosition(regions.number.x, regions.number.y);
            tab.number.text.setText(value.id === 'A' ? '1' : '2');
            tab.number.plate.setFillStyle(value.id === 'A' ? 0x124b50 : 0x50255b);
            tab.control.setEnabled(state.visible && state.selectionEnabled);
            tab.control.setFrame(dockTabTexture(this.scene, host.width, host.height,
                DOCK_OWNER_COLORS[value.id], selected), host.width, host.height);
            tab.control.frame.setAlpha(1);
            tab.label.setColor(selected ? '#fffaf0' : '#c5d2db');
            tab.control.root.setData('selected', selected);
            // Resizing a Container does not update its previously-created hit area.
            if (tab.control.root.input) tab.control.root.input.hitArea.setSize(host.width, host.height);
        });
        for (const id of ABILITIES) {
            const a = this.abilities[id], value = owner.abilities[id];
            a.control.root.setData({ owner: owner.id, ability: id, ...value });
            a.control.setEnabled(state.visible && value.disabledReason === null);
            a.control.badge.root.setVisible(value.unlocked);
            a.control.badge.text.setText(String(value.power));
            a.gem.setVisible(value.unlocked && !value.used);
            a.gem.setAlpha(value.disabledReason === null ? 1 : .65);
            a.emptyGem.setVisible(!value.unlocked || value.used);
            a.lock.setVisible(!value.unlocked);
        }
    }

    private createTab(h: DockHost, index: number): OwnerTab {
        const regions = h.regions!;
        const frame = dockTabTexture(this.scene, h.width, h.height);
        const control = new BattleDockControl(this.scene, h, `battleFoxOwner${index === 0 ? 'A' : 'B'}`, frame,
            'companion-fox-01-idle-sheet-portrait', 'companion-fox-01-idle-sheet-portrait', () => {
                const owner = this.state?.owners[index];
                if (!owner || !this.state?.selectionEnabled) return;
                this.selectedOwner = owner.id;
                this.callbacks.selectOwner(owner.id);
                this.render(this.state);
            }, regions.icon.width);
        control.normalIcon.setPosition(regions.icon.x, regions.icon.y); control.activeIcon.setPosition(regions.icon.x, regions.icon.y);
        const label = dockText(this.scene, '', regions.name, 24, 'battleFoxOwnerName');
        const number = dockBadge(this.scene, regions.number.width);
        number.root.setPosition(regions.number.x, regions.number.y);
        control.surface.add([label, number.root]);
        this.root.add(control.root);
        return { control, label, number };
    }

    private createAbility(h: DockHost, id: FoxAbilityId): AbilityControl {
        const regions = h.regions!;
        const control = new BattleDockControl(this.scene, h, `battleFox${id}`, 'battle-dock-square-v3',
            ICONS[id][0], ICONS[id][1], () => this.callbacks.useAbility(this.selectedOwner, id), regions.icon.width, regions.power.width);
        control.setIllumination({ shield: 0x00bde8, heal: 0x81c92c, strike: 0xffb516 }[id], h.width, false);
        const { width: size, x, y } = regions.gem;
        const gem = dockImage(this.scene, 'battle-dock-gem-v3', { x, y, width: size, height: size });
        const emptyGem = this.scene.add.graphics().fillStyle(0x041827).lineStyle(2, 0xffd46b);
        const diamond = [{ x, y: y - size / 2 }, { x: x + size / 2, y }, { x, y: y + size / 2 }, { x: x - size / 2, y }];
        emptyGem.fillPoints(diamond, true).strokePoints(diamond, true);
        const lock = dockImage(this.scene, 'battle-dock-lock-v3', regions.lock);
        control.badge.root.setPosition(regions.power.x, regions.power.y);
        control.surface.add([gem, emptyGem, lock]);
        this.root.add(control.root);
        return { control, gem, emptyGem, lock };
    }
}

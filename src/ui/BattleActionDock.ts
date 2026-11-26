import Phaser from 'phaser';
import type { FoxAbilityId, FoxOwnerId } from '../types/foxAbilities';
import { BattleDockControl, DOCK_OWNER_COLORS, dockBadge, dockHost, dockImage, dockTabTexture, dockText, setDockName, type DockHost } from './BattleDockArt';
import { BattleFoxAbilityPanel, type FoxAbilityPanelLayout, type FoxAbilityPanelState } from './BattleFoxAbilityPanel';

export interface BattleHudPoint { x: number; y: number; depth: number; width?: number; height?: number; rotation?: number }
export interface BattleActionDockLayout {
    footer: DockHost; attack: DockHost; attackIcon: DockHost; potion: DockHost; potionIcon: DockHost;
    potionBadge: DockHost; power: DockHost; owner: DockHost; portraitFrame: DockHost;
    portrait: DockHost; name: DockHost; ownerMark: DockHost; divider: DockHost;
    oneFoxOffset: DockHost; fox: FoxAbilityPanelLayout;
}
export interface BattleActionDockState {
    visible: boolean; attackEnabled: boolean; actorKind: 'hero' | 'pet'; owner: FoxOwnerId;
    ownerName: string; ownerPortrait: string; coop: boolean; potionEnabled: boolean; potionCount: number;
    attackPower: number; petTexture?: string | null; petFrame?: string | number; petId?: string | null; petDamage?: number;
    fox?: FoxAbilityPanelState;
}

/** Approved navy/gold lower-edge HUD. State and combat remain outside the view. */
export class BattleActionDock {
    readonly attackRoot: Phaser.GameObjects.Container;
    readonly potionRoot: Phaser.GameObjects.Container;
    readonly ownerRoot: Phaser.GameObjects.Container;
    readonly abilityPanel: BattleFoxAbilityPanel;
    private readonly attack: BattleDockControl;
    private readonly potion: BattleDockControl;
    private readonly potionBadge: ReturnType<typeof dockBadge>;
    private readonly powerBadge: ReturnType<typeof dockBadge>;
    private readonly ownerFrame: Phaser.GameObjects.Image;
    private readonly ownerPortrait: Phaser.GameObjects.Image;
    private readonly ownerName: Phaser.GameObjects.Text;
    private readonly namePlate: Phaser.GameObjects.Image;
    private readonly ownerMark: ReturnType<typeof dockBadge>;
    private readonly ownerLight: Phaser.GameObjects.Graphics;
    private readonly backing: Phaser.GameObjects.Image;
    private readonly divider: Phaser.GameObjects.Graphics;
    private mode = -1;
    private wide = false;

    constructor(private scene: Phaser.Scene, private layout: BattleActionDockLayout,
        callbacks: { onAttack: () => void; onPotion: () => void;
            selectFoxOwner?: (owner: FoxOwnerId) => void; useFoxAbility?: (owner: FoxOwnerId, ability: FoxAbilityId) => void }) {
        this.backing = scene.add.image(layout.footer.x, layout.footer.y, this.backingTexture(layout.portraitFrame))
            .setDepth(layout.footer.depth).setName('battleDockBacking').setScale(.5);
        this.divider = scene.add.graphics().setDepth(layout.divider.depth);
        this.attack = new BattleDockControl(scene, layout.attack, 'battleAttackAction', 'battle-dock-round-v3',
            'prep-sword-normal-v2', 'prep-sword-active-v2', callbacks.onAttack, layout.attackIcon.width, layout.power.width);
        this.attack.setIllumination(0xffa315, layout.attack.width, true);
        this.potion = new BattleDockControl(scene, layout.potion, 'battlePotionAction', 'battle-dock-round-v3',
            'character-book-red-potion', 'character-book-red-potion', callbacks.onPotion, layout.potionIcon.width, layout.potionBadge.width);
        for (const [control, host, icon] of [[this.attack, layout.attack, layout.attackIcon],
            [this.potion, layout.potion, layout.potionIcon]] as const) {
            control.normalIcon.setPosition(icon.x - host.x, icon.y - host.y);
            control.activeIcon.setPosition(icon.x - host.x, icon.y - host.y);
        }
        this.powerBadge = this.attack.badge; this.potionBadge = this.potion.badge;
        this.powerBadge.root.setPosition(layout.power.x - layout.attack.x, layout.power.y - layout.attack.y);
        this.potionBadge.root.setPosition(layout.potionBadge.x - layout.potion.x, layout.potionBadge.y - layout.potion.y);
        this.powerBadge.root.setName('battleAttackPower'); this.potionBadge.root.setName('battlePotionCount');
        this.attackRoot = this.attack.root; this.potionRoot = this.potion.root;
        this.ownerRoot = scene.add.container(layout.owner.x, layout.owner.y).setDepth(layout.owner.depth).setName('battleActionOwner');
        const local = (h: DockHost) => ({ ...h, x: h.x - layout.owner.x, y: h.y - layout.owner.y });
        const nameHost = local(layout.name);
        this.namePlate = dockImage(scene, dockTabTexture(scene, nameHost.width, nameHost.height, DOCK_OWNER_COLORS.A, true, 'name'), nameHost);
        this.ownerLight = scene.add.graphics();
        this.ownerFrame = dockImage(scene, 'battle-dock-round-v3', local(layout.portraitFrame));
        this.ownerPortrait = dockImage(scene, 'town-hud-heroine-portrait', local(layout.portrait)).setName('battleActionOwnerPortrait');
        const text = layout.name.regions!.name;
        this.ownerName = dockText(scene, '', { ...text, x: nameHost.x + text.x, y: nameHost.y + text.y }, 28, 'battleActionOwnerName');
        this.ownerMark = dockBadge(scene, layout.ownerMark.width);
        this.ownerMark.root.setPosition(layout.ownerMark.x - layout.owner.x, layout.ownerMark.y - layout.owner.y).setName('battleOwnerNumber');
        this.ownerRoot.add([this.namePlate, this.ownerLight, this.ownerFrame, this.ownerPortrait, this.ownerName, this.ownerMark.root]);
        this.abilityPanel = new BattleFoxAbilityPanel(scene, layout.fox, {
            selectOwner: owner => callbacks.selectFoxOwner?.(owner),
            useAbility: (owner, ability) => callbacks.useFoxAbility?.(owner, ability),
        });
    }
    get abilityOwner(): FoxOwnerId { return this.abilityPanel.owner; }
    render(state: BattleActionDockState): void {
        const count = state.fox?.owners.length ?? 0;
        const wide = [state.ownerName, ...(state.fox?.owners.map(o => o.name) ?? [])].some(name => Array.from(name).length > 8);
        this.place(count, wide);
        const pet = state.actorKind === 'pet';
        this.backing.setVisible(state.visible); this.divider.setVisible(state.visible && count > 0);
        this.attackRoot.setVisible(state.visible).setData({ actorKind: state.actorKind, owner: state.owner, petId: pet ? state.petId : null });
        this.potionRoot.setVisible(state.visible); this.ownerRoot.setVisible(state.visible).setData('owner', state.owner);
        this.attack.setIcon(pet && state.petTexture ? state.petTexture : 'prep-sword-normal-v2',
            pet && state.petTexture ? state.petTexture : 'prep-sword-active-v2', pet ? state.petFrame : undefined);
        this.attack.setEnabled(state.visible && state.attackEnabled && (!pet || Boolean(state.petTexture)));
        this.attack.setSelected(false);
        this.potion.setEnabled(state.visible && state.potionEnabled);
        this.powerBadge.root.setVisible(state.visible);
        this.powerBadge.text.setText(String(Math.max(0, pet ? state.petDamage ?? 0 : state.attackPower)));
        this.potionBadge.root.setVisible(state.visible); this.potionBadge.text.setText(String(Math.max(0, state.potionCount)));
        setDockName(this.ownerName, state.ownerName); this.ownerPortrait.setTexture(state.ownerPortrait);
        this.ownerPortrait.setScale(Math.min(this.layout.portrait.width / this.ownerPortrait.width, this.layout.portrait.height / this.ownerPortrait.height));
        this.ownerMark.text.setText(state.owner === 'A' ? '1' : '2');
        this.ownerMark.plate.setFillStyle(state.owner === 'A' ? 0x124b50 : 0x50255b);
        this.ownerLight.clear();
        const radius = this.layout.portraitFrame.width / 2 + 1, color = DOCK_OWNER_COLORS[state.owner];
        const portrait = dockHost(this.layout.portraitFrame, wide), owner = dockHost(this.layout.owner, wide);
        for (const [width, alpha] of [[10, .08], [6, .25], [2.5, 1]]) this.ownerLight.lineStyle(width, color, alpha)
            .strokeCircle(portrait.x - owner.x, portrait.y - owner.y, radius);
        const name = dockHost(this.layout.name, wide);
        this.namePlate.setTexture(dockTabTexture(this.scene, name.width, name.height, color, true, 'name')).setScale(.5);
        this.abilityPanel.render({ ...(state.fox ?? { owners: [], turnOwner: state.owner, turnToken: '', visible: false, selectionEnabled: false }), wideNames: wide });
    }
    private place(count: number, wide: boolean): void {
        if (this.mode === count && this.wide === wide) return;
        this.mode = count; this.wide = wide;
        const host = (h: DockHost) => dockHost(h, wide);
        const owner = host(this.layout.owner), name = host(this.layout.name);
        const portrait = host(this.layout.portraitFrame), attack = host(this.layout.attack);
        const power = host(this.layout.power), foxFrame = host(this.layout.fox.singleFrame);
        const actionOffset = count === 1 ? host(this.layout.oneFoxOffset).x : 0;
        const centered = count < 2;
        // Center the visible controls as one group. The attack badge can extend past its frame.
        const left = portrait.x - portrait.width / 2 + actionOffset;
        const right = count === 1 ? foxFrame.x + foxFrame.width / 2
            : Math.max(attack.x + attack.width / 2, power.x + power.width / 2);
        const groupOffset = centered ? this.layout.footer.x - (left + right) / 2 : 0;
        const dx = actionOffset + groupOffset;
        this.abilityPanel.root.setX(groupOffset);
        this.ownerRoot.setPosition(owner.x + dx, owner.y);
        this.namePlate.setPosition(name.x - owner.x, name.y - owner.y);
        const text = name.regions!.name;
        this.ownerName.setPosition(name.x - owner.x + text.x, name.y - owner.y + text.y)
            .setWordWrapWidth(text.width - 2, true).setData('safeRegion', text).setData('savedName', null);
        this.attackRoot.setX(attack.x + dx); this.potionRoot.setX(host(this.layout.potion).x + dx);
        this.backing.setTexture(this.backingTexture(portrait, dx, centered)).setScale(.5);
        const h = host(this.layout.divider), x = h.x + dx;
        this.divider.clear().lineStyle(1.5, 0xffd16a, .9).lineBetween(x, h.y - h.height / 2, x, h.y + h.height / 2);
        const diamond = [{ x, y: h.y - 6 }, { x: x + 6, y: h.y }, { x, y: h.y + 6 }, { x: x - 6, y: h.y }];
        this.divider.fillStyle(0x1bc8ef).lineStyle(1.5, 0xffd16a).fillPoints(diamond, true).strokePoints(diamond, true);
    }
    private backingTexture(portrait: DockHost, offset = 0, centered = false): string {
        const h = this.layout.footer;
        const shoulder = portrait.x - portrait.width / 2 + offset - (h.x - h.width / 2);
        const key = `battle-dock-backing-v5-${h.width}-${h.height}-${shoulder}-${centered}`;
        if (this.scene.textures.exists(key)) return key;
        const tex = this.scene.textures.createCanvas(key, h.width * 2, h.height * 2)!;
        const c = tex.getContext(); c.scale(2, 2);
        const bottom = Math.max(0, shoulder - h.height * .78);
        c.beginPath(); c.moveTo(0, h.height - 2); c.lineTo(bottom, h.height - 2);
        c.bezierCurveTo(bottom + 14, h.height - 2, shoulder - 18, 2, shoulder + 8, 2);
        if (centered) {
            // Mirror the original shoulder into the same continuous bottom-edge stroke.
            c.lineTo(h.width - shoulder - 8, 2);
            c.bezierCurveTo(h.width - shoulder + 18, 2, h.width - bottom - 14, h.height - 2, h.width - bottom, h.height - 2);
            c.lineTo(h.width, h.height - 2);
            c.lineTo(h.width, h.height);
        } else {
            c.lineTo(h.width - 1, 2);
            c.lineTo(h.width - 1, h.height);
        }
        c.lineTo(0, h.height); c.closePath();
        const blue = c.createLinearGradient(0, 0, 0, h.height);
        blue.addColorStop(0, '#14435a'); blue.addColorStop(.14, '#0a293f'); blue.addColorStop(1, '#031120');
        c.fillStyle = blue; c.fill();
        const gold = c.createLinearGradient(0, 0, 0, h.height);
        gold.addColorStop(0, '#fff2b4'); gold.addColorStop(.08, '#f9c759'); gold.addColorStop(.35, '#a96210'); gold.addColorStop(.8, '#f7cc70'); gold.addColorStop(1, '#fff2ad');
        c.strokeStyle = '#56350c'; c.lineWidth = 7; c.stroke(); c.strokeStyle = gold; c.lineWidth = 4; c.stroke();
        c.strokeStyle = '#fff3b8'; c.lineWidth = 1; c.stroke();
        tex.refresh(); return key;
    }
}

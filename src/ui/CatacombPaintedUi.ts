import Phaser from 'phaser';
import { practiceArt, PracticeChoiceControl, type PracticeChoiceHost } from './PracticeChoiceControl';
import { captureBattleBody } from './BattleActorGeometry';
import { queueTexture } from '../loading/AssetPreparation';
import { registerLoadedAnimations } from '../systems/SceneAssetPlugin';
import type { CharacterType } from '../types';
import type { LearningHost } from './LearningUi';

export const FOX_PORTRAITS = ['catacomb-progress-fox-01', 'catacomb-progress-fox-02', 'catacomb-progress-fox-03', 'catacomb-progress-fox-04', 'catacomb-progress-fox-05'];
export const FOX_HEADS = ['catacomb-painted-head-01', 'catacomb-painted-head-02', 'catacomb-painted-head-03', 'catacomb-painted-head-04', 'catacomb-painted-head-05'];
export const FOX_REWARD_ICONS = { shield: 'battle-dock-shield-normal-v3', heal: 'battle-dock-heal-normal-v3', strike: 'battle-dock-strike-normal-v3' };
export const PAINTED = {
    room: 'catacomb-painted-room', foxRoom: 'catacomb-painted-fox-room', title: 'catacomb-painted-title',
    card: 'catacomb-painted-card', action: 'catacomb-painted-action', ring: 'catacomb-painted-ring',
    door: 'catacomb-painted-door-open', closedDoor: 'catacomb-painted-door-closed', closed: 'catacomb-progress-journey-lock-closed',
    open: 'catacomb-progress-journey-lock-open', paw: 'catacomb-progress-paw',
};

/** Canonical painted families from the approved reference, with distinct structural shapes. */
export const CRAFTED = {
    title: 'catacomb-crafted-title', label: 'catacomb-crafted-label', skill: 'catacomb-crafted-skill',
    module: 'catacomb-crafted-module', action: 'catacomb-crafted-action', socket: 'catacomb-crafted-socket',
    lock: 'catacomb-crafted-lock-normal', lockActive: 'catacomb-crafted-lock-active',
    paw: 'catacomb-crafted-paw-normal', pawActive: 'catacomb-crafted-paw-active',
    swords: 'catacomb-crafted-swords-normal',
};
export const CRAFTED_ABILITIES = { shield: 'catacomb-crafted-shield-normal', heal: 'catacomb-crafted-heal-normal', strike: 'catacomb-crafted-strike-normal' };

/** Frame choice is explicit. Locked content stays legible and its geometry never becomes a circle. */
export function craftedButton(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, host: LearningHost,
    name: string, action: () => void, frame: string = CRAFTED.action, selected = false, enabled = true) {
    const h: PracticeChoiceHost = { ...host, regions: { label: { x: 0, y: 0, width: host.width * .75, height: host.height * .6 } } };
    const button = new PracticeChoiceControl(scene, h, name, frame, '', null, action, false, .85);
    button.setSelected(selected); button.setEnabled(enabled); parent.add(button.root);
    return button;
}

export function paintedText(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, host: LearningHost,
    value: string, size = 24, word = true, color = '#fff0c5') {
    const text = scene.add.text(host.x, host.y, value, { resolution: 2, fontFamily: 'Gelasio, Georgia, serif',
        fontSize: size, fontStyle: 'bold', color, align: 'center',
        shadow: { color: '#051123', offsetY: 2, blur: 3, fill: true } }).setOrigin(.5).setDepth(host.depth)
        .setData('word', word).setData('safeRegion', host);
    parent.add(text); return text;
}
export function paintedArt(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, key: string, host: LearningHost) {
    const image = practiceArt(scene, key, host).setDepth(host.depth); parent.add(image); return image;
}
export function paintedButton(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, host: LearningHost,
    name: string, action: () => void, frame = PAINTED.action, selected = false, enabled = true) {
    const h: PracticeChoiceHost = { ...host, regions: { label: { x: 0, y: 0, width: host.width * .78, height: host.height * .6 } } };
    const round = host.width / host.height < 1.7;
    const button = new PracticeChoiceControl(scene, h, name, round ? PAINTED.ring : frame, '', null, action);
    if (round) {
        const disc = scene.add.circle(0, 0, Math.min(host.width, host.height) * .39, selected ? 0x125f77 : 0x071c34);
        button.surface.addAt(disc, 0);
    }
    button.setSelected(selected); button.setEnabled(enabled); parent.add(button.root);
    return button;
}

/** Fit visible anatomy with one uniform scale; video padding is kept intact. */
export function paintedActor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, host: LearningHost,
    actor: 'fox' | 'hero' | 'slime', character?: CharacterType, form = '01', faceRight = false) {
    // These previews only need idle. Importing the full combat configuration also
    // pulls attack/walk/defend sheets into the guild's static preload graph.
    const player = character?.startsWith('boy')
        ? { idleTexture: 'boy-knight-idle-sheet', idleAnim: 'boy-knight-idle' }
        : { idleTexture: 'knight-idle-sheet', idleAnim: 'knight-idle' };
    const texture = actor === 'hero' ? player.idleTexture : actor === 'slime' ? 'slime-sheet'
        : `companion-fox-${form}-idle-sheet`;
    const animation = actor === 'hero' ? player.idleAnim : actor === 'slime' ? 'slime-idle' : `companion-fox-${form}-idle`;
    const ready = actor !== 'fox' || scene.textures.exists(texture);
    const sprite = scene.add.sprite(0, 0, ready ? texture : FOX_PORTRAITS[Number(form) - 1], ready ? 0 : undefined)
        .setDepth(host.depth).setFlipX(faceRight);
    parent.add(sprite);
    const place = () => {
        const body = captureBattleBody(sprite);
        const scale = Math.min(host.width / (body.right - body.left), host.height / (body.bottom - body.top));
        const center = (body.left + body.right) / 2;
        sprite.setScale(scale).setPosition(host.x - (faceRight ? body.mirrorX - center : center) * scale,
            host.y + host.height / 2 - body.bottom * scale);
    };
    const play = () => {
        if (!scene.anims.exists(animation)) registerLoadedAnimations(scene);
        if (scene.anims.exists(animation)) sprite.play(animation);
    };
    place();
    if (ready) play();
    else {
        // A read-only profile opened through the learning map may have a form
        // outside the current party. Keep its matching portrait until its idle arrives.
        const event = Phaser.Textures.Events.ADD_KEY + texture;
        const start = () => {
            sprite.setTexture(texture, 0).setData('battleBody', undefined);
            place();
            play();
        };
        scene.textures.once(event, start);
        sprite.once('destroy', () => scene.textures.off(event, start));
        queueTexture(scene, texture, scene.cache.json.get('textures'));
        if (!scene.load.isLoading()) scene.load.start();
    }
    return sprite;
}

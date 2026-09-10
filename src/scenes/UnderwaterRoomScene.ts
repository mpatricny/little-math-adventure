import { sfx } from '../audio/AudioDirector';
import { acquirePuzzle, puzzleProfile, puzzleProgress, recordPuzzleAnswer } from '../systems/puzzles/PuzzleService';
import { observePuzzleViewState, stopObservingPuzzleViewState } from '../ui/PuzzleViewState';
import { isCurrentLightChallenge, underwaterLightChallenge } from '../systems/UnderwaterLightPuzzle';
import { underwaterWordCipher } from '../systems/UnderwaterWordCipher';
import { cipherWord } from '../systems/puzzles/WordPuzzles';
import type { PuzzleFamily, PuzzleInstance, PuzzleProfile } from '../types/puzzles';
import Phaser from 'phaser';
import type { EnemyDefinition, PlayerState } from '../types';
import type { UnderwaterRoom } from '../types/underwater';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { MasterySystem } from '../systems/MasterySystem';
import { underwaterBellChallenge } from '../systems/UnderwaterBellProblems';
import { underwaterCurrentChallenge } from '../systems/UnderwaterCurrentProblems';
import { underwaterPumpChallenge } from '../systems/UnderwaterPumpProblems';
import { underwaterReverseChallenge } from '../systems/UnderwaterReverseProblems';
import { underwaterRoutingChallenge } from '../systems/UnderwaterRoutingProblems';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { createEncounterCatalog } from '../systems/EncounterCatalog';
import {
    canEnterUnderwater, canUseUnderwaterExit, claimUnderwaterChest, getUnderwaterProgress,
    recordUnderwaterPuzzleAttempt, UNDERWATER_ROOMS, UNDERWATER_START, visitUnderwaterRoom,
    canOpenUnderwaterChest, canRestoreUnderwaterMechanism, restoreUnderwaterMechanism, recordUnderwaterMechanismAttempt,
    completeUnderwaterMechanismStage, getUnderwaterSeals,
    claimUnderwaterDepthCrystal, setUnderwaterRestPoint, getUnderwaterRestPoint,
} from '../systems/UnderwaterProgressSystem';
import { UnderwaterUI, waterHost } from '../ui/UnderwaterUI';
import { WalkingSceneHud } from '../ui/WalkingSceneHud';
import { waterArtwork } from '../ui/UnderwaterTheme';
import type { WaterBox } from '../ui/UnderwaterTheme';
import { UnderwaterHotspot, waterRipple, dissolveUnderwaterKelp } from '../ui/UnderwaterWorldFX';
import { UnderwaterBellPuzzle } from '../ui/UnderwaterBellPuzzle';
import { UnderwaterWordChest } from '../ui/UnderwaterWordChest';
import { UnderwaterChestReward, type UnderwaterChestLoot } from '../ui/UnderwaterChestReward';
import { UnderwaterCurrentPuzzle } from '../ui/UnderwaterCurrentPuzzle';
import { UnderwaterPumpPuzzle } from '../ui/UnderwaterPumpPuzzle';
import { UnderwaterReversePuzzle } from '../ui/UnderwaterReversePuzzle';
import { UnderwaterRoutingPuzzle } from '../ui/UnderwaterRoutingPuzzle';
import { UnderwaterLightPuzzle } from '../ui/UnderwaterLightPuzzle';
import { waterPearl } from '../ui/UnderwaterPearls';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { needsDepthCrystalShipReturn } from '../systems/DepthCrystalProgressSystem';

type EntryData = { preview?: boolean; fromSurface?: boolean; roomId?: string; entryId?: string; battleLost?: boolean; resumeX?: number; arriving?: boolean; guardianFreed?: boolean };

/** First playable slice. The graph and stable progress IDs can grow without replacing saves. */
export class UnderwaterRoomScene extends Phaser.Scene {
    private activePuzzle?: PuzzleInstance;
    private activePuzzleKey = '';
    private puzzleOwner: 'A' | 'B' = 'A';
    private builder!: SceneBuilder;
    private ui!: UnderwaterUI;
    private hud!: WalkingSceneHud;
    private room!: UnderwaterRoom;
    private roomId = UNDERWATER_START;
    private entryId = 'surface';
    private entry: EntryData = {};
    private blocked = false;
    private loadFailed = false;
    private transitioning = false;
    private party: Phaser.GameObjects.Container[] = [];
    private path: Array<{ x: number; y: number }> = [];
    bellPuzzle?: UnderwaterBellPuzzle;
    wordChest?: UnderwaterWordChest;
    currentPuzzle?: UnderwaterCurrentPuzzle;
    pumpPuzzle?: UnderwaterPumpPuzzle;
    reversePuzzle?: UnderwaterReversePuzzle;
    routingPuzzle?: UnderwaterRoutingPuzzle;
    lightPuzzle?: UnderwaterLightPuzzle;
    private bellHotspot?: UnderwaterHotspot;
    private guardianHotspot?: UnderwaterHotspot;
    private bellLights: Phaser.GameObjects.Image[] = [];
    private exits: Array<{ id: string; hotspot: UnderwaterHotspot; blocker?: Phaser.GameObjects.Image }> = [];
    private mechanismHotspot?: UnderwaterHotspot;
    private refreshChest?: () => void;
    private revealing = false;
    private pendingSeal?: 'shell' | 'current';
    private seals = new Map<string, Phaser.GameObjects.Container>();

    constructor() { super({ key: 'UnderwaterRoomScene' }); }

    init(data: EntryData = {}): void {
        this.entry = data;
        this.activePuzzle = undefined;
        this.activePuzzleKey = '';
        this.party = [];
        this.path = [];
        this.bellPuzzle = undefined;
        this.wordChest = undefined;
        this.currentPuzzle = undefined;
        this.pumpPuzzle = undefined;
        this.reversePuzzle = undefined;
        this.routingPuzzle = undefined;
        this.lightPuzzle = undefined;
        this.bellHotspot = undefined;
        this.guardianHotspot = undefined;
        this.bellLights = [];
        this.exits = [];
        this.mechanismHotspot = undefined;
        this.refreshChest = undefined;
        this.revealing = false; this.pendingSeal = undefined; this.seals = new Map();
        this.transitioning = false;
        this.loadFailed = false;
        this.input.enabled = true;
        const state = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance();
        coop.activatePlayerA();
        if (data.preview && !state.isPreviewActive()) {
            if (coop.isCoopActive()) coop.endSession();
            state.beginUnderwaterPreview();
            MasterySystem.destroyInstance();
        }
        this.blocked = !state.isPreviewActive() && !canEnterUnderwater(state.getPlayer());
        const progress = getUnderwaterProgress(state.getPlayer());
        this.roomId = data.fromSurface ? UNDERWATER_START : data.roomId ?? progress.roomId;
        if (!UNDERWATER_ROOMS[this.roomId]) this.roomId = UNDERWATER_START;
        this.entryId = data.fromSurface ? 'surface' : data.entryId ?? progress.entryId;
        if (data.battleLost) {
            const rest = getUnderwaterRestPoint(state.getPlayer());
            this.roomId = rest.roomId; this.entryId = rest.entryId;
        }
        this.room = UNDERWATER_ROOMS[this.roomId];
        if (data.fromSurface || data.battleLost) this.eachPlayer(player => { delete getUnderwaterProgress(player).position; });
    }

    preload(): void {
        if (this.blocked) return;
        const textures = this.cache.json.get('textures').images as Record<string, string>;
        const missing = Object.keys(textures).filter(key => key.startsWith('underwater-'))
            .filter(key => !this.textures.exists(key));
        if (!missing.length) return;
        this.ui = new UnderwaterUI(this);
        this.ui.open('CESTA POD HLADINU');
        const status = this.ui.text('puzzleEquationHost', 'Načítám podvodní svět…', 25, true);
        const progressListener = (value: number) => this.ui.updateText(status, `Načítám podvodní svět… ${Math.round(value * 100)} %`);
        const errorListener = () => { this.loadFailed = true; };
        this.load.on('progress', progressListener);
        this.load.on('loaderror', errorListener);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.load.off('progress', progressListener);
            this.load.off('loaderror', errorListener);
        });
        missing.forEach(key => this.load.image(key, `assets/${textures[key]}`));
    }

    create(): void {
        if (this.blocked) { this.scene.start('SilverpondTownMockScene'); return; }
        this.ui?.close();
        this.ui = new UnderwaterUI(this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.savePuzzle();
            if (this.activePuzzle) stopObservingPuzzleViewState(this.activePuzzle.state);
        });
        if (this.loadFailed) {
            this.ui.dialog('JEZERO SE NENAČETLO', 'Zkontroluj připojení k Wi-Fi. Tvůj postup je v bezpečí.',
                'ZKUSIT ZNOVU', () => this.scene.restart(this.entry), () => this.scene.start('MenuScene'), 'ZPĚT DO MENU');
            return;
        }
        const progress = this.progress();
        if (!progress.introSeen) { this.showSurfaceIntro(); return; }
        this.builder = new SceneBuilder(this);
        this.builder.buildScene(this.room.layout);
        this.eachPlayer(player => visitUnderwaterRoom(player, this.roomId, this.entryId));
        this.path = [0, 1, 2, 3].map(index => {
            const point = this.builder.getZone(`path${index}`);
            if (!point) throw new Error(`Missing underwater path point ${index}`);
            return point;
        }).sort((a, b) => a.x - b.x);
        if (this.entry.battleLost) this.rest();
        this.createParty();
        this.createWaterEffects();
        const title = this.ui.text('titleHost', this.room.name, 24);
        this.tweens.add({ targets: title, alpha: 0, delay: 2400, duration: 600 });
        this.room.exits.forEach(exit => {
            const host = waterHost(this.builder, exit.host);
            const hotspot = new UnderwaterHotspot(this, host, { id: exit.host,
                kind: exit.target === 'surface' ? 'stairs' : 'arch',
                enabled: canUseUnderwaterExit(this.player(), this.roomId, exit.id), onClick: () => {
                if (this.busy()) return;
                if (!canUseUnderwaterExit(this.player(), this.roomId, exit.id)) {
                    if (exit.requiresSeals) {
                        this.ui.notice('Najdi lasturovou a proudovou pečeť.');
                        this.bellHotspot?.pulse();
                    } else if (exit.requiresBell) this.bellHotspot?.pulse();
                    else if (exit.requiresShortcut || exit.requiresMechanism) this.mechanismHotspot?.pulse();
                    else this.guardianHotspot?.pulse();
                    return;
                }
                hotspot.pulse();
                this.swimTo(host.x, () => this.enterOpening(host, exit.target, exit.entry, exit.descent));
            } });
            const blocker = exit.requiresBell || exit.requiresShortcut || exit.requiresMechanism || exit.requiresEncounter || exit.requiresSeals
                ? waterArtwork(this, 'underwater-sealed-kelp', host).setDepth(host.depth - 1) : undefined;
            this.exits.push({ id: exit.id, hotspot, blocker });
        });
        this.refreshExits();
        // One-way currents have visible receiving mouths, never reverse navigation.
        this.room.arrivals?.forEach(arrival => {
            const flow = new UnderwaterHotspot(this, waterHost(this.builder, arrival.host), {
                id: arrival.host, kind: 'arrival',
                enabled: Boolean(progress.restoredMechanisms?.includes(arrival.requiresMechanism)), onClick: () => undefined,
            });
            flow.root.disableInteractive().setData('waterHotspot', false);
        });
        if (this.room.encounter) this.createGuardian();
        if (this.room.mechanism) this.createMechanism();
        if (this.room.chest) this.createChest();
        if (this.room.puzzle) this.createBellHub();
        if (this.room.rest) this.createRestPoint();
        if (this.room.finale) this.createFinale();
        this.hud = new WalkingSceneHud(this, { onMenu: () => this.leaveToMenu() });
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.busy() || pointer.y < 220 || this.input.hitTestPointer(pointer).length > 0) return;
            this.swimTo(pointer.x);
        });
        // The shared pause menu owns Escape and fullscreen, as in other walking scenes.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.removeAllListeners('pointerdown');
        });
        this.cameras.main.fadeIn(350, 4, 43, 55);
        this.revealing = true;
        this.time.delayedCall(550, () => { this.revealing = false; this.presentUnlocks(); });
        // A book/pause overlay may have been open during arrival; reveal as soon as it closes.
        this.time.addEvent({ delay: 500, loop: true, callback: () => this.presentUnlocks() });
        if (this.entry.battleLost) this.ui.notice('♥ Zdraví doplněno');
    }

    private player(): PlayerState { return GameStateManager.getInstance().getPlayer(); }
    private progress() { CoopSessionManager.getInstance().activatePlayerA(); return getUnderwaterProgress(this.player()); }
    private busy(): boolean {
        return this.transitioning || this.revealing || Boolean(this.ui.modal) || Boolean(this.hud?.isBookOpen()) || Boolean(this.hud?.isMenuOpen());
    }

    private eachPlayer(action: (player: PlayerState) => void): void {
        const state = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) coop.forBothPlayers(() => action(state.getPlayer()));
        else { action(state.getPlayer()); state.save(); }
        coop.activatePlayerA();
    }

    private showSurfaceIntro(): void {
        this.builder = new SceneBuilder(this);
        this.builder.buildScene('SilverpondTownMockScene');
        const dive = () => {
            if (this.transitioning) return;
            this.ui.close();
            this.transitioning = true;
            this.eachPlayer(player => { getUnderwaterProgress(player).introSeen = true; });
            const target = waterHost(this.builder, 'underwaterEntryHost');
            const config = getPlayerSpriteConfig(this.player().characterType);
            const hero = this.add.sprite(target.x, target.y - 95, config.idleTexture).setScale(0.6).setDepth(target.depth);
            this.tweens.add({ targets: hero, y: target.y + 65, alpha: 0, duration: 650, ease: 'Sine.easeIn' });
            this.cameras.main.fadeOut(750, 4, 43, 55);
            this.time.delayedCall(770, () => this.scene.restart({ roomId: UNDERWATER_START, entryId: 'surface' }));
        };
        this.ui.open('Šupina ti půjčí dech.');
        const hands = new SceneBuilder(this);
        hands.buildScene('UnderwaterHandsOn');
        const portrait = waterHost(this.ui.builder, 'modalPortraitHost');
        const zyx = this.add.sprite(portrait.x, portrait.y, 'spritesheet-zyx-transparent2-sheet', 0);
        zyx.setScale(Math.min(portrait.width / zyx.width, portrait.height / zyx.height));
        if (this.anims.exists('zyx-idle')) zyx.play('zyx-idle');
        this.ui.modal!.add([zyx, waterArtwork(this, 'silverpond-water-breathing-scale', waterHost(hands, 'introScaleHost'))]);
        this.ui.button(hands, 'iconDiveHost', '↓', dive, true, 40);
    }

    private createParty(): void {
        const host = waterHost(this.builder, 'partyHost');
        const entry = this.builder.getZone(this.entryId) ?? this.builder.getZone(this.roomId === UNDERWATER_START ? 'surface' : 'bell')
            ?? this.builder.getZone('shallows') ?? this.builder.getZone(this.room.exits[0].id)!;
        const players: PlayerState[] = [];
        this.eachPlayer(player => players.push({ ...player }));
        players.forEach((player, index) => {
            const config = getPlayerSpriteConfig(player.characterType);
            const saved = this.progress().position;
            const leaderX = !this.entry.battleLost && !this.entry.fromSurface
                ? this.entry.resumeX ?? (saved?.roomId === this.roomId ? saved.x : entry.x) : entry.x;
            const x = Phaser.Math.Clamp(leaderX - index * 100, this.path[0].x, this.path[3].x);
            const root = this.add.container(x, this.pathY(x)).setDepth(host.depth).setName(`underwaterPlayer${index}`);
            const aura = this.add.ellipse(0, -host.height * 0.43, host.width, host.height, 0x8fe9e7, 0.12)
                .setStrokeStyle(2, 0xb7ffed, 0.55);
            const sprite = this.add.sprite(0, 0, config.idleTexture).setOrigin(0.5, 1);
            sprite.setScale(Math.min(host.width * 0.86 / sprite.width, host.height * 0.86 / sprite.height));
            sprite.setData('waterArtwork', true);
            if (this.anims.exists(config.idleAnim)) sprite.play(config.idleAnim);
            root.add([aura, sprite]);
            // Prototype floating uses existing idle; no procedurally deformed animation frames.
            this.tweens.add({ targets: [aura, sprite], y: '-=5', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.party.push(root);
        });
        const arrival = this.room.exits.find(exit => exit.id === this.entryId && exit.passage)
            ?? this.room.arrivals?.find(arrival => arrival.id === this.entryId);
        if (this.entry.arriving && arrival) {
            const doorway = waterHost(this.builder, arrival.host);
            this.transitioning = true;
            this.party.forEach((actor, index) => {
                const destination = { x: actor.x, y: actor.y };
                actor.setPosition(doorway.x - index * 20, doorway.y + doorway.height * 0.4).setScale(0.6).setAlpha(0);
                this.tweens.add({ targets: actor, ...destination, scale: 1, alpha: 1, duration: 600, ease: 'Sine.easeOut',
                    onComplete: () => { if (index === 0) this.transitioning = false; } });
            });
        }
    }

    private pathY(x: number): number {
        for (let index = 1; index < this.path.length; index++) {
            const left = this.path[index - 1], right = this.path[index];
            if (x <= right.x) return Phaser.Math.Linear(left.y, right.y, Phaser.Math.Clamp((x - left.x) / (right.x - left.x), 0, 1));
        }
        return this.path[this.path.length - 1].y;
    }

    private swimTo(targetX: number, then?: () => void): void {
        this.party.forEach((actor, index) => {
            this.tweens.killTweensOf(actor);
            const x = Phaser.Math.Clamp(targetX - index * 100, this.path[0].x, this.path[3].x);
            const sprite = actor.list[1] as Phaser.GameObjects.Sprite;
            sprite.setFlipX(x < actor.x);
            this.tweens.add({ targets: actor, x, duration: Math.max(220, Math.abs(x - actor.x) * 2.5), ease: 'Sine.easeInOut',
                onUpdate: () => actor.y = this.pathY(actor.x),
                onComplete: () => {
                    if (index !== 0) return;
                    this.eachPlayer(player => { getUnderwaterProgress(player).position = { roomId: this.roomId, x: actor.x }; });
                    if (!this.busy()) then?.();
                },
            });
        });
    }

    private createWaterEffects(): void {
        const host = waterHost(this.builder, 'waterEffectsHost');
        // Small pooled vector bubbles; no full-screen distortion over text or UI.
        for (let index = 0; index < 12; index++) {
            const x = host.x - host.width / 2 + (index * 109) % host.width;
            const bubble = this.add.circle(x, host.y + host.height / 2, 2 + index % 4, 0xe4fff6, 0.13)
                .setStrokeStyle(1, 0xc9ffff, 0.28).setDepth(host.depth);
            this.tweens.add({ targets: bubble, y: host.y - host.height / 2 - 10, x: x + 24,
                duration: 9000 + index * 310, delay: index * 530, repeat: -1 });
        }
    }

    private createGuardian(): void {
        const encounter = this.room.encounter!;
        if (this.progress().defeatedEncounters.includes(encounter.id)) return;
        const catalog = createEncounterCatalog(this.cache.json.get('encounters'), { core: this.cache.json.get('enemies') as EnemyDefinition[] });
        const enemies = catalog.resolveJourneyEncounter(encounter.id, 'solo').enemies;
        const host = waterHost(this.builder, encounter.host);
        const startBattle = () => {
            if (this.busy()) return;
            this.swimTo(host.x - 150, () => {
                this.transitioning = true;
                this.eachPlayer(player => { getUnderwaterProgress(player).position = { roomId: this.roomId, x: host.x }; });
                this.scene.start('BattleScene', { encounterId: encounter.id, mode: 'journey',
                    returnScene: 'UnderwaterRoomScene', returnData: { roomId: this.roomId, entryId: this.entryId, resumeX: host.x,
                        guardianFreed: Boolean(this.room.finale) },
                    backgroundKey: this.room.background });
            });
        };
        enemies.forEach((enemy, index) => {
            const actorHost = index === 0 ? host : waterHost(this.builder, 'guardianEscortHost');
            // Put the interaction light behind the creature so it does not wash out its palette.
            const hotspot = new UnderwaterHotspot(this, actorHost, {
                id: index === 0 ? 'guardianInteract' : 'guardianEscortInteract', kind: 'bell', onClick: startBattle,
            });
            const fish = this.add.sprite(actorHost.x, actorHost.y, enemy.spriteKey).setDepth(actorHost.depth);
            fish.setScale(Math.min(actorHost.width / fish.width, actorHost.height / fish.height));
            fish.setData('waterArtwork', true);
            const anim = `${enemy.animPrefix}-idle`;
            if (this.anims.exists(anim)) fish.play(anim);
            if (index === 0) this.guardianHotspot = hotspot;
        });
    }

    private refreshExits(): void {
        this.exits.forEach(exit => {
            const enabled = canUseUnderwaterExit(this.player(), this.roomId, exit.id);
            const shown = !exit.blocker || this.progress().revealedPassages?.includes(`${this.roomId}:${exit.id}`);
            exit.hotspot.setEnabled(enabled && Boolean(shown));
            exit.blocker?.setVisible(!enabled || !shown);
        });
    }

    private presentUnlocks(): void {
        if (this.busy()) return;
        const progress = this.progress();
        const hubSeals = this.room.puzzle ? getUnderwaterSeals(this.player()).filter(kind => !progress.litHubSeals?.includes(kind)) : [];
        const openings = this.exits.filter(exit => exit.blocker && canUseUnderwaterExit(this.player(), this.roomId, exit.id)
            && !progress.revealedPassages?.includes(`${this.roomId}:${exit.id}`));
        const pending = this.pendingSeal; this.pendingSeal = undefined;
        if (!pending && !hubSeals.length && !openings.length) return;
        this.revealing = true;
        const jobs: Array<(done: () => void) => void> = [];
        if (pending) jobs.push(done => this.illuminateSeal('sealHost', pending, done));
        hubSeals.forEach(kind => jobs.push(done => this.illuminateSeal(`${kind}SealHost`, kind, () => {
            this.eachPlayer(player => {
                const lit = getUnderwaterProgress(player).litHubSeals ??= [];
                if (!lit.includes(kind)) lit.push(kind);
            }); done();
        })));
        openings.forEach(exit => jobs.push(done => {
            const open = () => {
                exit.hotspot.setEnabled(true); exit.hotspot.pulse();
                dissolveUnderwaterKelp(this, exit.blocker!, () => {
                    this.eachPlayer(player => {
                        const shown = getUnderwaterProgress(player).revealedPassages ??= [];
                        const id = `${this.roomId}:${exit.id}`;
                        if (!shown.includes(id)) shown.push(id);
                    });
                    exit.hotspot.pulse(); done();
                });
            };
            if (this.room.exits.find(e => e.id === exit.id)?.requiresSeals) {
                // Connect the two lit seals to their destination without a text instruction.
                for (const source of this.seals.values()) for (let i = 0; i < 3; i++) {
                    const pearl = waterPearl(this, source.x, source.y, 19).setDepth(source.depth + 2);
                    const path = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(source.x, source.y),
                        new Phaser.Math.Vector2((source.x + exit.blocker!.x) / 2, source.y - 100),
                        new Phaser.Math.Vector2(exit.blocker!.x, exit.blocker!.y));
                    this.tweens.addCounter({ from: 0, to: 1, duration: 800, delay: i * 120,
                        onUpdate: tween => { const p = path.getPoint(tween.getValue() ?? 0); pearl.setPosition(p.x, p.y); },
                        onComplete: () => pearl.destroy() });
                }
                this.time.delayedCall(900, open);
            } else open();
        }));
        const next = () => {
            const job = jobs.shift();
            if (job) job(next);
            else { this.revealing = false; this.refreshExits(); }
        };
        next();
    }

    private illuminateSeal(id: string, kind: 'shell' | 'current', done: () => void): void {
        const target = this.seals.get(id)!;
        const layout = new SceneBuilder(this); layout.buildScene('UnderwaterRevelation');
        const focus = waterHost(layout, 'revealSealHost'), shadeHost = waterHost(layout, 'revealShadeHost');
        const shade = this.add.rectangle(shadeHost.x, shadeHost.y, shadeHost.width, shadeHost.height, 0x021728, 1)
            .setAlpha(0).setDepth(shadeHost.depth).setName('sealRevealShade');
        const seal = this.buildSeal(focus, kind, false).setName('sealReveal');
        this.tweens.add({ targets: shade, alpha: 0.62, duration: 400 });
        this.tweens.add({ targets: seal, alpha: 1, duration: 1200, onComplete: () => {
            waterRipple(this, focus.x, focus.y, focus.depth - 1, 0xbaffdf, 1.4);
        } });
        this.tweens.add({ targets: seal, x: target.x, y: target.y, scale: target.width / focus.width,
            delay: 2000, duration: 850, ease: 'Sine.easeInOut', onComplete: () => {
                target.setAlpha(1); waterRipple(this, target.x, target.y, target.depth + 1, 0xbaffdf, 0.6);
                seal.destroy(); shade.destroy();
                layout.get('revealSealHost')?.destroy(); layout.get('revealShadeHost')?.destroy();
                this.time.delayedCall(450, done);
            } });
        this.tweens.add({ targets: shade, alpha: 0, delay: 2000, duration: 800 });
    }

    private createMechanism(): void {
        const mechanism = this.room.mechanism!;
        const host = waterHost(this.builder, mechanism.host);
        const restored = () => this.progress().restoredMechanisms?.includes(mechanism.id) ?? false;
        const rotary = mechanism.kind === 'pump' || mechanism.kind === 'routing';
        const image = waterArtwork(this, rotary ? 'underwater-pump-impeller' : 'underwater-pearl-shell', host)
            .setDepth(host.depth);
        if (!rotary) waterPearl(this, host.x, host.y - 4, host.height * 0.44).setDepth(host.depth + 1);
        const seal = mechanism.seal ? this.createSeal('sealHost', mechanism.seal, restored()) : undefined;
        const flowHost = waterHost(this.builder, 'restoredFlowHost');
        const flow = this.add.container(flowHost.x, flowHost.y).setDepth(flowHost.depth).setVisible(restored());
        for (let i = 0; i < 10; i++) {
            const spark = this.add.circle(-flowHost.width / 2, (i % 5 - 2) * flowHost.height / 7, 2 + i % 2, 0xbaffde, 0.45);
            flow.add(spark);
            this.tweens.add({ targets: spark, x: flowHost.width / 2, duration: 3000, delay: i * 300, repeat: -1 });
        }
        const spin = rotary
            ? this.tweens.add({ targets: image, angle: 360, duration: 6500, repeat: -1, paused: !restored() }) : undefined;
        const finish = () => {
            sfx(this, 'water.pump');
            const first = !restored();
            const worldPlayer = this.player();
            this.eachPlayer(player => {
                if (restoreUnderwaterMechanism(player, this.roomId, worldPlayer)) ManaSystem.add(player, mechanism.mana);
            });
            flow.setVisible(true); spin?.resume();
            if (first && mechanism.seal) this.pendingSeal = mechanism.seal;
            else seal?.setAlpha(1);
            this.refreshExits(); this.refreshChest?.();
            this.rest(); this.hud.refresh();
            waterRipple(this, host.x, host.y, host.depth);
        };
        this.mechanismHotspot = new UnderwaterHotspot(this, host, {
            id: 'mechanismInteract', kind: 'spring', enabled: canRestoreUnderwaterMechanism(this.player(), this.roomId),
            onClick: () => {
                if (this.busy()) return;
                if (!canRestoreUnderwaterMechanism(this.player(), this.roomId)) { this.guardianHotspot?.pulse(); return; }
                this.swimTo(host.x - 130, () => {
                    if (mechanism.kind === 'light') {
                        const instance = this.drawPuzzle('light', mechanism.id, underwaterLightChallenge, true, isCurrentLightChallenge);
                        this.lightPuzzle = new UnderwaterLightPuzzle(this, this.ui, {
                            state: observePuzzleViewState(instance.state),
                            onAnswer: (correct, assisted) => {
                                this.answerPuzzle(correct, assisted);
                                this.eachPlayer(player => recordUnderwaterMechanismAttempt(player, this.roomId, assisted));
                                if (correct) finish();
                            }, onClose: () => this.closePuzzle(),
                        }, instance.payload); return;
                    }
                    if (mechanism.kind === 'reverse') {
                        const openStage = (stage: number) => {
                            const instance = this.drawPuzzle('reverse', `${mechanism.id}:${stage}`, p => underwaterReverseChallenge(p, stage));
                            this.reversePuzzle = new UnderwaterReversePuzzle(this, this.ui, instance.payload, { state: observePuzzleViewState(instance.state),
                                onAnswer: (correct, assisted) => {
                                this.answerPuzzle(correct, assisted);
                                    this.eachPlayer(player => {
                                        recordUnderwaterMechanismAttempt(player, this.roomId, assisted);
                                        if (correct) completeUnderwaterMechanismStage(player, this.roomId, stage);
                                    });
                                    if (correct && stage === mechanism.stages! - 1) finish();
                                },
                                onNext: () => {
                                    this.closePuzzle();
                                    if (stage < mechanism.stages! - 1) openStage(stage + 1);
                                }, onClose: () => this.closePuzzle(),
                            });
                        };
                        openStage(restored() ? 0 : Math.min(mechanism.stages! - 1, this.progress().mechanismStages?.[mechanism.id] ?? 0));
                        return;
                    }
                    if (mechanism.kind === 'routing') {
                        const instance = this.drawPuzzle('routing', mechanism.id, underwaterRoutingChallenge);
                        this.routingPuzzle = new UnderwaterRoutingPuzzle(this, this.ui, instance.payload, { state: observePuzzleViewState(instance.state),
                            onAnswer: (correct, assisted) => {
                                this.answerPuzzle(correct, assisted);
                                this.eachPlayer(player => recordUnderwaterMechanismAttempt(player, this.roomId, assisted));
                                if (correct) finish();
                            }, onClose: () => this.closePuzzle(),
                        }); return;
                    }
                    if (mechanism.kind === 'pump') {
                        const instance = this.drawPuzzle('pump', mechanism.id, underwaterPumpChallenge);
                        this.pumpPuzzle = new UnderwaterPumpPuzzle(this, this.ui, instance.payload, { state: observePuzzleViewState(instance.state),
                            onAnswer: (correct, assisted) => {
                                this.answerPuzzle(correct, assisted);
                                this.eachPlayer(player => recordUnderwaterMechanismAttempt(player, this.roomId, assisted));
                                if (correct) finish();
                            }, onClose: () => this.closePuzzle(),
                        }); return;
                    }
                    const instance = this.drawPuzzle('current', mechanism.id, underwaterCurrentChallenge);
                    this.currentPuzzle = new UnderwaterCurrentPuzzle(this, this.ui, instance.payload, { state: observePuzzleViewState(instance.state),
                        onAnswer: (correct, assisted) => {
                                this.answerPuzzle(correct, assisted);
                            // Joint application is world evidence, not an independently recalled math fact.
                            this.eachPlayer(player => recordUnderwaterMechanismAttempt(player, this.roomId, assisted));
                            if (correct) finish();
                        },
                        onClose: () => this.closePuzzle(),
                    });
                });
            },
        });
    }

    private createChest(): void {
        const chest = this.room.chest!;
        let pendingLoot: UnderwaterChestLoot | undefined;
        const showLoot = () => {
            if (!pendingLoot) return;
            new UnderwaterChestReward(this, pendingLoot);
            pendingLoot = undefined;
        };
        const host = waterHost(this.builder, chest.host);
        const image = waterArtwork(this, 'chest-forest-spin', host).setDepth(host.depth);
        const refresh = () => {
            const opened = this.progress().openedChests.includes(chest.id);
            image.setAlpha(opened ? 0.48 : canOpenUnderwaterChest(this.player(), this.roomId) ? 1 : 0.65);
            glow.setEnabled(!opened && canOpenUnderwaterChest(this.player(), this.roomId));
        };
        const claim = () => {
            const worldPlayer = this.player();
            const recipients: string[] = [];
            const coop = CoopSessionManager.getInstance();
            this.eachPlayer(player => {
                const reward = claimUnderwaterChest(player, this.roomId, worldPlayer);
                if (!reward) return;
                ProgressionSystem.awardBattleCoin(player, reward.coins);
                ManaSystem.add(player, reward.mana);
                recipients.push(coop.getActivePlayer());
            });
            // Values come from the same catalog entry that was just paid and saved.
            if (recipients.length) pendingLoot = { coins: chest.coins, mana: chest.mana,
                players: coop.isCoopActive() ? recipients : undefined };
            refresh(); this.hud.refresh(); waterRipple(this, host.x, host.y, host.depth);
            if (!this.ui.modal) showLoot();
        };
        const glow = new UnderwaterHotspot(this, host, { id: 'chestInteract', kind: 'chest',
            enabled: !this.progress().openedChests.includes(chest.id), onClick: () => {
            if (this.busy() || this.progress().openedChests.includes(chest.id)) return;
            if (!canOpenUnderwaterChest(this.player(), this.roomId)) {
                if (chest.requiresEncounter) this.guardianHotspot?.pulse();
                else this.mechanismHotspot?.pulse();
                return;
            }
            this.swimTo(host.x - 80, () => {
                if (chest.lock === 'none') { claim(); return; }
                const instance = this.drawPuzzle('word_cipher', chest.id, profile => {
                    const word = cipherWord(); return { word, clues: underwaterWordCipher(word, profile, chest.postal) };
                });
                this.wordChest = new UnderwaterWordChest(this, this.ui, {
                    state: observePuzzleViewState(instance.state), word: instance.payload.word, band: instance.profile.band, clues: instance.payload.clues, postal: chest.postal,
                    onAnswer: (correct, assisted) => this.answerPuzzle(correct, assisted),
                    onClose: () => { this.closePuzzle(); showLoot(); },
                    onSolved: claim,
                });
            });
        } });
        this.refreshChest = refresh;
        refresh();
    }

    private createBellHub(): void {
        const seals = getUnderwaterSeals(this.player());
        this.createSeal('shellSealHost', 'shell', seals.includes('shell') && Boolean(this.progress().litHubSeals?.includes('shell')));
        this.createSeal('currentSealHost', 'current', seals.includes('current') && Boolean(this.progress().litHubSeals?.includes('current')));
        this.bellHotspot = new UnderwaterHotspot(this, waterHost(this.builder, 'bellHost'), { id: 'bellInteract', kind: 'bell', onClick: () => {
            if (!this.busy()) this.swimTo(waterHost(this.builder, 'bellHost').x - 150, () => this.openPuzzle());
        } });
        const lights = waterHost(this.builder, 'bellProgressHost');
        const notes = this.progress().bellNotes;
        for (let i = 0; i < this.room.puzzle!.requiredNotes; i++) {
            this.bellLights.push(waterPearl(this, lights.x + (i - 1) * lights.width / 3, lights.y, lights.height)
                .setAlpha(i < notes ? 1 : 0.22).setDepth(lights.depth));
        }
    }

    private createRestPoint(): void {
        const rest = this.room.rest!;
        const spring = waterHost(this.builder, rest.host);
        new UnderwaterHotspot(this, spring, { id: 'springInteract', kind: 'spring', onClick: () => {
            if (!this.busy()) {
                if (rest.requiresEncounter && !this.progress().defeatedEncounters.includes(rest.requiresEncounter)) {
                    this.guardianHotspot?.pulse(); return;
                }
                this.swimTo(spring.x, () => {
                    this.eachPlayer(player => setUnderwaterRestPoint(player, this.roomId, rest.entry));
                    this.rest(); this.hud.refresh(); waterRipple(this, spring.x, spring.y, spring.depth);
                    this.showHealing();
                });
            }
        } });
    }

    private openPuzzle(): void {
        const notes = this.progress().bellNotes;
        const total = this.room.puzzle!.requiredNotes;
        if (notes >= total) {
            this.bellHotspot?.pulse();
            const bell = waterHost(this.builder, 'bellHost');
            waterRipple(this, bell.x, bell.y, bell.depth);
            return;
        }
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive() && notes % 2 === 1) coop.activatePlayerB();
        else coop.activatePlayerA();
        const mastery = MasterySystem.getInstance();
        mastery.setActiveData(coop.isCoopActive()
            ? coop.getActivePlayer() === 'A' ? coop.getPlayerAMasteryData() : coop.getPlayerBMasteryData()
            : null);
        const instance = this.drawPuzzle('bell', `bell:${notes}`, p => underwaterBellChallenge(p, 0, notes), false);
        const challenge = instance.payload;
        this.bellPuzzle = new UnderwaterBellPuzzle(this, this.ui, {
            challenge, notes, total, state: observePuzzleViewState(instance.state),
            solver: coop.isCoopActive() ? { texture: getPlayerSpriteConfig(this.player().characterType).idleTexture,
                id: coop.getActivePlayer() } : undefined,
            onAnswer: (correct, evidence) => {
                this.answerPuzzle(correct, evidence.assisted);
                this.eachPlayer(player => recordUnderwaterPuzzleAttempt(player, correct, evidence.assisted));
                if (correct) { this.bellLights[notes]?.setAlpha(1); sfx(this, 'water.bell'); }
                this.refreshExits();
                if (coop.isCoopActive()) coop.applyAndPersistMasteryProgress();
                this.hud.refresh();
            },
            onNext: () => { this.closePuzzle(); this.openPuzzle(); },
            onClose: () => this.closePuzzle(),
        });
    }

    private closePuzzle(): void {
        this.ui.close();
        this.savePuzzle();
        if (this.activePuzzle) stopObservingPuzzleViewState(this.activePuzzle.state);
        this.activePuzzle = undefined;
        this.bellPuzzle = undefined;
        this.currentPuzzle = undefined;
        this.pumpPuzzle = undefined;
        this.reversePuzzle = undefined;
        this.routingPuzzle = undefined;
        this.lightPuzzle = undefined;
        this.wordChest = undefined;
        CoopSessionManager.getInstance().activatePlayerA();
        MasterySystem.getInstance().setActiveData(null);
        this.hud?.refresh();
        this.presentUnlocks();
    }

    private drawPuzzle<T>(family: PuzzleFamily, key: string, generate: (profile: PuzzleProfile) => T, shared = true,
        acceptPayload?: (payload: T) => boolean): PuzzleInstance<T> {
        this.puzzleOwner = CoopSessionManager.getInstance().getActivePlayer();
        this.activePuzzleKey = `${this.roomId}:${key}`;
        const instance = acquirePuzzle(puzzleProgress(this.player()).active, this.activePuzzleKey, family, generate, puzzleProfile(family, shared), true, acceptPayload);
        this.activePuzzle = instance;
        observePuzzleViewState(instance.state, () => this.savePuzzle());
        this.savePuzzle();
        return instance;
    }

    private savePuzzle(): void {
        if (!this.activePuzzle) return;
        const coop = CoopSessionManager.getInstance();
        if (this.puzzleOwner === 'B') coop.activatePlayerB(); else coop.activatePlayerA();
        puzzleProgress(this.player()).active[this.activePuzzleKey] = this.activePuzzle;
        GameStateManager.getInstance().save();
    }

    private answerPuzzle(correct: boolean, assisted: boolean): void {
        if (!this.activePuzzle) return;
        this.savePuzzle();
        recordPuzzleAnswer(this.activePuzzle, correct, assisted, this.player());
        this.savePuzzle();
    }

    private rest(): void {
        this.eachPlayer(player => { player.hp = player.maxHp; player.status = 'healthy'; });
    }

    private showHealing(): void {
        // Vector hearts stay legible in Canvas, WebGL and Android without emoji-font fallback.
        this.party.forEach(actor => {
            const heart = this.add.graphics().setPosition(actor.x, actor.y - 115).setDepth(actor.depth + 1).setName('underwaterHealing');
            heart.fillStyle(0x96ffd0, 1).lineStyle(2, 0x184d43, 1);
            heart.fillCircle(-9, -5, 11).fillCircle(9, -5, 11);
            heart.fillTriangle(-20, 0, 20, 0, 0, 24);
            this.tweens.add({ targets: heart, y: heart.y - 65, alpha: 0, delay: 350, duration: 1300, onComplete: () => heart.destroy() });
        });
    }

    private createSeal(hostId: string, kind: 'shell' | 'current', collected: boolean): Phaser.GameObjects.Container {
        const host = waterHost(this.builder, hostId);
        const root = this.buildSeal(host, kind, collected).setName(hostId);
        this.seals.set(hostId, root); return root;
    }

    private buildSeal(host: WaterBox, kind: 'shell' | 'current', collected: boolean): Phaser.GameObjects.Container {
        const root = this.add.container(host.x, host.y).setDepth(host.depth ?? 100).setSize(host.width, host.height).setAlpha(collected ? 1 : 0.3);
        root.add(this.add.circle(0, 0, host.width / 2, 0x0e303d, 0.9).setStrokeStyle(2, 0xb9b689));
        root.add(waterArtwork(this, kind === 'shell' ? 'underwater-pearl-shell' : 'underwater-pump-impeller',
            { ...host, x: 0, y: kind === 'shell' ? 5 : 0, width: host.width * 0.84, height: host.height * 0.84 }));
        root.add(waterPearl(this, 0, kind === 'shell' ? -2 : 0, host.width * 0.28));
        return root;
    }

    private enterOpening(host: WaterBox, target: string, entry: string, descent = false): void {
        this.transitioning = true;
        this.party.forEach((actor, index) => {
            this.tweens.killTweensOf(actor);
            this.tweens.add({ targets: actor, x: host.x - index * 20,
                y: target === 'surface' ? host.y : host.y + host.height * 0.4,
                scale: 0.6, alpha: 0, duration: 550, ease: 'Sine.easeIn' });
        });
        this.cameras.main.fadeOut(600, 4, 43, 55);
        this.time.delayedCall(620, () => descent
            ? this.scene.start('UnderwaterDescentScene') : this.takeExit(target, entry));
    }

    private createFinale(): void {
        const finale = this.room.finale!;
        const won = this.progress().defeatedEncounters.includes(this.room.encounter!.id);
        const crystalHost = waterHost(this.builder, finale.crystalHost);
        const crystal = waterArtwork(this, 'underwater-depth-crystal', crystalHost);
        if (won) {
            const host = waterHost(this.builder, finale.guardianHost);
            // A rescued companion occupies a separate, higher water layer, never the
            // player's saved battle-return position or the path to the crystal.
            const animated = this.anims.exists('depth-guardian-friendly-idle');
            const guardian = this.add.sprite(host.x, host.y, animated
                ? 'silverpond-depth-guardian-friendly-idle-sheet' : 'underwater-guardian-calm')
                .setDepth(host.depth).setName('friendlyDepthGuardian').setData('waterArtwork', true);
            guardian.setScale(Math.min(host.width / guardian.width, host.height / guardian.height));
            if (animated) guardian.play('depth-guardian-friendly-idle');
            // Phaser flips the currently sampled frame, not the full spritesheet.
            // A small dead zone keeps him from twitching when the hero swims beneath him.
            const faceHero = () => {
                const dx = (this.party[0]?.x ?? crystalHost.x) - guardian.x;
                if (Math.abs(dx) > 32) guardian.setFlipX(dx > 0);
            };
            faceHero();
            this.events.on(Phaser.Scenes.Events.UPDATE, faceHero);
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, faceHero));
            // Only a fresh victory plays the departure. Reloads/return visits show
            // the friendly idle at its resting host without moving anyone's save.
            if (this.entry.guardianFreed && !this.entry.battleLost) {
                const arrival = waterHost(this.builder, finale.guardianArrivalHost);
                guardian.setPosition(arrival.x, arrival.y);
                this.tweens.add({ targets: guardian, x: host.x, y: host.y,
                    delay: 400, duration: 2200, ease: 'Sine.easeInOut' });
            }
        }
        crystal.setVisible(!this.progress().depthCrystalClaimed);
        const glow = new UnderwaterHotspot(this, crystalHost, { id: 'depthCrystalInteract', kind: 'spring', enabled: won && !this.progress().depthCrystalClaimed,
            onClick: () => {
                if (this.busy() || this.progress().depthCrystalClaimed) return;
                if (!won) { this.guardianHotspot?.pulse(); return; }
                this.swimTo(crystalHost.x - 120, () => {
                    this.eachPlayer(player => claimUnderwaterDepthCrystal(player));
                    sfx(this, 'reward.crystal');
                    crystal.setVisible(false); glow.setEnabled(false);
                    this.ui.dialog('Strážce je svobodný.', 'Druhý krystal! Na hladině nás čeká Zyxova loď.', 'K LODI', () => {
                        this.takeExit('surface', 'surface');
                    }, () => this.ui.close(), 'JEŠTĚ PROZKOUMAT');
                });
            },
        });
    }

    private takeExit(target: string, entryId: string): void {
        this.transitioning = true;
        if (target === 'surface') {
            this.eachPlayer(player => getUnderwaterProgress(player).active = false);
            const state = GameStateManager.getInstance();
            this.scene.start(needsDepthCrystalShipReturn(state.getPlayer()) ? 'ZyxRocketInterludeScene'
                : state.isPreviewActive() ? 'MenuScene' : 'SilverpondTownMockScene');
        } else {
            this.eachPlayer(player => visitUnderwaterRoom(player, target, entryId));
            this.scene.restart({ roomId: target, entryId, arriving: true });
        }
    }

    private leaveToMenu(): void {
        this.closePuzzle();
        this.eachPlayer(() => undefined);
        this.scene.start('MenuScene');
    }
}

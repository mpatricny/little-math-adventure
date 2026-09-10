import { gameAudio, sfx } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { canUseUnderwaterExit, getUnderwaterProgress, visitUnderwaterRoom } from '../systems/UnderwaterProgressSystem';
import { UnderwaterButton, waterArtwork, fitWaterText } from '../ui/UnderwaterTheme';
import { waterHost } from '../ui/UnderwaterUI';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { DESCENT, descentCollides, descentHitHp } from '../systems/UnderwaterDescentRules';
import { waterRipple } from '../ui/UnderwaterWorldFX';

/** A continuous two-screen swim, not a video or a replacement for the boss encounter. */
export class UnderwaterDescentScene extends Phaser.Scene {
    private finished = false;
    private progress = { value: 0 };
    private actors: Phaser.GameObjects.Container[] = [];
    private hazards: Array<{ sprite: Phaser.GameObjects.Sprite; radius: number; touched: Set<number> }> = [];
    private hp: number[] = [];
    private immuneUntil: number[] = [];
    private desiredX = 640;
    private manual = false;
    private calm = false;
    private elapsed = 0;
    private audioBriefing = false;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private health!: Phaser.GameObjects.Text;
    constructor() { super('UnderwaterDescentScene'); }

    create(): void {
        this.finished = false; this.progress = { value: 0 };
        this.actors = []; this.hazards = []; this.hp = []; this.immuneUntil = [];
        this.manual = false; this.calm = false; this.elapsed = 0; this.desiredX = 640;
        const state = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance(); coop.activatePlayerA();
        if (!canUseUnderwaterExit(state.getPlayer(), 'sp_depth_gate', 'heart')) {
            this.scene.start('UnderwaterRoomScene', { roomId: 'sp_depth_gate', entryId: 'heart' }); return;
        }
        const builder = new SceneBuilder(this); builder.buildScene('UnderwaterDescent');
        const bg = waterHost(builder, 'descentBackdropHost');
        waterArtwork(this, 'underwater-descent-bg', bg);
        const route = [0, 1, 2, 3, 4].map(i => builder.getZone(`descent${i}`)!);
        this.cameras.main.setBounds(0, 0, bg.width, bg.height);
        const players = [state.getPlayer()];
        if (coop.isCoopActive()) {
            coop.activatePlayerB(); players.push(state.getPlayer()); coop.activatePlayerA();
        }
        const actorHost = waterHost(builder, 'descentPartyHost');
        const actors = players.map((player, index) => {
            this.hp.push(player.hp); this.immuneUntil.push(0);
            const cfg = getPlayerSpriteConfig(player.characterType);
            const root = this.add.container(route[0].x - index * 80, route[0].y - index * 35).setDepth(actorHost.depth).setName(`descentPlayer${index}`);
            const sprite = this.add.sprite(0, 0, cfg.idleTexture);
            sprite.setScale(Math.min(actorHost.width / sprite.width, actorHost.height / sprite.height));
            if (this.anims.exists(cfg.idleAnim)) sprite.play(cfg.idleAnim);
            const aura = this.add.ellipse(0, 0, actorHost.width, actorHost.height, 0xa6efee, 0.09).setStrokeStyle(2, 0xc5fff6, 0.4);
            root.add([aura, sprite]); return root;
        });
        this.actors = actors;
        // Existing real creature motion, translated through the water as separate actors.
        [0, 1, 2, 3].forEach(i => {
            const h = waterHost(builder, `descentFish${i}Host`);
            const fish = this.add.sprite(h.x, h.y, 'silverpond-bubble-fish-idle-sheet').setDepth(h.depth).setName(`descentHazard${i}`);
            fish.setScale(Math.min(h.width / fish.width, h.height / fish.height));
            if (this.anims.exists('bubble-fish-idle')) fish.play('bubble-fish-idle');
            this.hazards.push({ sprite: fish, radius: Math.min(h.width, h.height) * 0.33, touched: new Set() });
            this.tweens.add({ targets: fish, x: h.x + (i % 2 ? 190 : -190), duration: 5000 + i * 900, yoyo: true, repeat: -1 });
        });
        const motes = waterHost(builder, 'descentMotesHost');
        for (let i = 0; i < 24; i++) {
            const bubble = this.add.circle((i * 179) % motes.width, (i * 137) % motes.height, 2 + i % 3, 0xb7f6fa, 0.18).setDepth(motes.depth);
            this.tweens.add({ targets: bubble, y: bubble.y - 170, alpha: 0, duration: 5000 + i * 90, repeat: -1 });
        }
        const skip = new UnderwaterButton(this, { ...waterHost(builder, 'descentSkipHost'), name: 'descentSkipHost',
            label: 'KLIDNÝ PONOR', fontSize: 18, icon: 'continue', onClick: () => {
                this.calm = true; skip.setState('selected');
            } });
        skip.root.setScrollFactor(0);
        const helpHost = waterHost(builder, 'descentSteeringHost');
        const help = this.add.text(helpHost.x, helpHost.y, '←   Uhýbej rybám   →', { resolution: 2, fontFamily: 'Georgia', fontSize: '24px',
            color: '#e2fff1', stroke: '#062334', strokeThickness: 5 }).setOrigin(0.5).setDepth(helpHost.depth).setScrollFactor(0).setName('descentSteeringHost');
        fitWaterText(help, helpHost, 24);
        const healthHost = waterHost(builder, 'descentHealthHost');
        this.health = this.add.text(healthHost.x, healthHost.y, '', { resolution: 2, fontFamily: 'Arial', fontSize: '22px',
            color: '#e2fff1', stroke: '#062334', strokeThickness: 5 }).setOrigin(0.5).setDepth(healthHost.depth).setScrollFactor(0).setName('descentHealthHost');
        this.updateHealth(); fitWaterText(this.health, healthHost, 22);
        this.cursors = this.input.keyboard?.createCursorKeys();
        const steer = (p: Phaser.Input.Pointer) => {
            if (this.finished || this.input.hitTestPointer(p).length) return;
            this.desiredX = Phaser.Math.Clamp(p.x, DESCENT.minX, DESCENT.maxX); this.manual = true;
        };
        this.input.on('pointerdown', steer);
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) steer(p); });
        const path = new Phaser.Curves.Spline(route.map(p => new Phaser.Math.Vector2(p.x, p.y)));
        const descentTween = this.tweens.add({ targets: this.progress, value: 1, duration: DESCENT.durationMs, delay: 500,
            onUpdate: () => {
                const p = path.getPoint(Phaser.Math.Easing.Sine.InOut(this.progress.value));
                if (!this.manual) this.desiredX = p.x;
                actors.forEach((actor, i) => actor.setY(p.y - i * 35));
                this.cameras.main.setScroll(0, Phaser.Math.Clamp(p.y - 325, 0, bg.height - 720));
            }, onComplete: () => this.arrive() });
        this.cameras.main.fadeIn(650, 3, 24, 48);
        this.events.once('shutdown', () => {
            skip.destroy(); this.input.removeAllListeners('pointerdown'); this.input.removeAllListeners('pointermove');
            if (this.cursors) Object.values(this.cursors).forEach(key => key.destroy());
        });
        this.audioBriefing = true;
        let briefingActive = true;
        this.events.once('shutdown', () => { briefingActive = false; });
        descentTween.pause();
        sfx(this, 'water.splash');
        void gameAudio().speak('vo.descent.intro', this, 'vo.descent.intro').finally(() => {
            if (!briefingActive) return;
            this.audioBriefing = false;
            if (this.scene.isActive()) descentTween.resume();
        });
    }

    update(_time: number, delta: number): void {
        if (this.audioBriefing || this.finished || !this.actors.length) return;
        this.elapsed += delta;
        const step = DESCENT.speed * Math.min(delta, 50) / 1000;
        const direction = Number(Boolean(this.cursors?.right.isDown)) - Number(Boolean(this.cursors?.left.isDown));
        if (direction) { this.manual = true; this.desiredX = Phaser.Math.Clamp(this.actors[0].x + direction * step, DESCENT.minX, DESCENT.maxX); }
        const x = this.actors[0].x + Phaser.Math.Clamp(this.desiredX - this.actors[0].x, -step, step);
        this.actors.forEach((actor, index) => {
            actor.x = x - index * 80;
            if (this.calm || this.elapsed < DESCENT.graceMs || this.elapsed < this.immuneUntil[index]) return;
            const hazard = this.hazards.find(h => !h.touched.has(index) && descentCollides(actor, { x: h.sprite.x, y: h.sprite.y, radius: h.radius }));
            if (!hazard) return;
            hazard.touched.add(index); this.immuneUntil[index] = this.elapsed + DESCENT.invulnerabilityMs;
            this.hp[index] = descentHitHp(this.hp[index]);
            sfx(this, 'water.bubbles');
            const state = GameStateManager.getInstance(), coop = CoopSessionManager.getInstance();
            index ? coop.activatePlayerB() : coop.activatePlayerA();
            state.getPlayer().hp = this.hp[index]; state.save(); coop.activatePlayerA();
            waterRipple(this, actor.x, actor.y, actor.depth + 1, 0xffc28e, 0.55);
            this.tweens.add({ targets: actor, alpha: 0.4, duration: 150, yoyo: true, repeat: 3 });
            this.updateHealth();
        });
    }

    private updateHealth(): void {
        this.health?.setText(this.hp.map((hp, i) => `${this.hp.length > 1 ? (i ? 'B: ' : 'A: ') : ''}${hp} HP`).join('     '));
    }

    private arrive(): void {
        if (this.finished) return;
        this.finished = true;
        this.cameras.main.fadeOut(650, 2, 13, 34);
        this.time.delayedCall(670, () => {
            const state = GameStateManager.getInstance(); const coop = CoopSessionManager.getInstance();
            const save = () => { getUnderwaterProgress(state.getPlayer()).descentSeen = true; visitUnderwaterRoom(state.getPlayer(), 'sp_lake_heart', 'gate'); };
            if (coop.isCoopActive()) coop.forBothPlayers(save); else { save(); state.save(); }
            coop.activatePlayerA();
            this.scene.start('UnderwaterRoomScene', { roomId: 'sp_lake_heart', entryId: 'gate', arriving: true });
        });
    }
}

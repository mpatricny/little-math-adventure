import Phaser from 'phaser';
import type { FoxAbilityId, FoxOwnerId } from '../types/foxAbilities';
import { battleBodyBounds } from './BattleActorGeometry';

type Sprite = Phaser.GameObjects.Sprite;
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type Shield = { actor: Sprite; pane: Phaser.GameObjects.Image; motes: Emitter; power: number; pulseUntil: number; nextMote: number };
type Run = { objects: Phaser.GameObjects.GameObject[]; movers: object[]; timer?: Phaser.Time.TimerEvent };

/** Bounded, scene-owned particles. Effects never apply combat results: those
 * have already been committed by BattleFoxAbilitySession before play(). */
export class BattleFoxEffects {
    private readonly emitters = new Set<Emitter>();
    private readonly runs = new Set<Run>();
    private readonly shields = new Map<FoxOwnerId, Shield>();
    private elapsed = 0;
    private disposed = false;
    private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private scene: Phaser.Scene) {
        this.createTextures();
        scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.update, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    syncShield(owner: FoxOwnerId, actor: Sprite, power: number): void {
        let shield = this.shields.get(owner);
        if (!shield && power > 0) {
            const pane = this.scene.add.image(0, 0, 'fox-vfx-air').setDepth(40).setName(`foxAirShield${owner}`);
            const motes = this.emitter('star', { lifespan: 550, speedY: { min: -28, max: -9 }, speedX: { min: -9, max: 9 },
                scale: { start: .19, end: 0 }, tint: [0xbbfaff, 0x73d8ff] });
            shield = { actor, pane, motes, power, pulseUntil: 0, nextMote: 0 };
            this.shields.set(owner, shield);
        }
        if (shield) { shield.power = power; shield.pane.setData('remaining', power); }
    }

    play(ability: FoxAbilityId, owner: FoxOwnerId, source: Sprite, target: Sprite, amount: number,
        done: () => void, onImpact?: () => void): void {
        const run: Run = { objects: [], movers: [] }; this.runs.add(run);
        const body = battleBodyBounds(target), fromBody = battleBodyBounds(source);
        const from = { x: fromBody.centerX, y: fromBody.top + fromBody.height * .25 };
        const to = { x: body.centerX, y: body.centerY };
        const green = ability === 'heal', color = green ? 0x78ffad : ability === 'strike' ? 0x72ddff : 0xa3f8ff;
        const sparks = this.emitter('star', { lifespan: { min: 320, max: 700 }, speed: { min: 18, max: 95 },
            scale: { start: .28, end: 0 }, tint: [color, 0xfff5c7], rotate: { min: 0, max: 180 } }, run);
        const dust = this.emitter('glow', { lifespan: { min: 250, max: 560 }, speed: { min: 3, max: 24 },
            scale: { start: .32, end: 0 }, tint: [color, green ? 0xffd889 : 0x86aaff] }, run);
        const path = this.scene.add.graphics().setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
        run.objects.push(path);
        const orb = this.scene.add.image(from.x, from.y, 'fox-vfx-glow').setTint(color)
            .setScale(.55).setDepth(60).setBlendMode(Phaser.BlendModes.ADD);
        run.objects.push(orb);
        const flight = { t: 0 }; run.movers.push(flight);
        this.scene.tweens.add({ targets: flight, t: 1, duration: this.reduced ? 90 : 280, ease: 'Sine.easeIn',
            onUpdate: () => {
                const p = flight.t, x = Phaser.Math.Linear(from.x, to.x, p), y = Phaser.Math.Linear(from.y, to.y, p) - Math.sin(p * Math.PI) * 52;
                orb.setPosition(x, y); if (!this.reduced) { dust.emitParticleAt(x, y, 2); sparks.emitParticleAt(x, y, 1); }
            },
            onComplete: () => {
                orb.setVisible(false);
                onImpact?.();
                const label = this.scene.add.text(body.centerX + body.width * .35, body.top + 32,
                    `${ability === 'strike' ? '−' : '+'}${amount}`, { fontFamily: 'Arial, sans-serif', fontSize: 30,
                        fontStyle: 'bold', color: green ? '#ccffcc' : '#fff2bd', stroke: '#12283a', strokeThickness: 4, resolution: 2 })
                    .setOrigin(.5).setDepth(88).setName('foxEffectAmount');
                run.objects.push(label);
                let pending = 2;
                const complete = () => {
                    if (--pending > 0 || this.disposed) return;
                    this.scene.tweens.add({ targets: run.objects, alpha: 0, duration: this.reduced ? 80 : 250,
                        onComplete: () => { this.disposeRun(run); if (!this.disposed) done(); } });
                };
                this.scene.tweens.add({ targets: label, y: label.y - (this.reduced ? 0 : 25), alpha: 0,
                    delay: 300, duration: 550, onComplete: complete });
                let effect: Phaser.Tweens.Tween;
                if (ability === 'heal') effect = this.heal(run, target, sparks, dust, path);
                else if (ability === 'strike') effect = this.strike(run, to, sparks, dust, path);
                else {
                    const shield = this.shields.get(owner);
                    if (shield) shield.pulseUntil = this.elapsed + 700;
                    effect = this.shieldBurst(run, target, sparks, dust, path);
                }
                // Finish after both motion and readable feedback complete. A wall-clock
                // deadline can cut off the impact on a slower tablet because
                // Phaser's tween clock smooths long frames independently.
                effect.once(Phaser.Tweens.Events.TWEEN_COMPLETE, complete);
            },
        });
    }

    block(owner: FoxOwnerId, actor: Sprite): void {
        const shield = this.shields.get(owner);
        if (shield) shield.pulseUntil = this.elapsed + 650;
        const body = battleBodyBounds(actor), at = { x: body.right + 16, y: body.centerY };
        const run: Run = { objects: [], movers: [] }; this.runs.add(run);
        const shards = this.emitter('shard', { lifespan: { min: 230, max: 650 }, speed: { min: 90, max: 230 },
            angle: { min: -65, max: 65 }, gravityY: 100, scale: { start: .4, end: 0 }, tint: [0xd9ffff, 0x65d7ff],
            rotate: { min: -60, max: 60 } }, run);
        shards.explode(this.reduced ? 6 : 28, at.x, at.y);
        const glints = this.emitter('star', { lifespan: { min: 250, max: 600 }, speed: { min: 55, max: 160 },
            angle: { min: -80, max: 80 }, scale: { start: .44, end: 0 }, tint: [0xb9faff, 0xffffff] }, run);
        glints.explode(this.reduced ? 3 : 16, at.x, at.y);
        const flare = this.scene.add.image(at.x, at.y, 'fox-vfx-glow').setDepth(60)
            .setTint(0x9ceaff).setScale(this.reduced ? .7 : 1.5).setBlendMode(Phaser.BlendModes.ADD);
        const arc = this.scene.add.graphics().setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
        run.objects.push(flare, arc);
        this.scene.tweens.add({ targets: flare, alpha: 0, scale: this.reduced ? .7 : 2, duration: 300 });
        const wave = { t: 0 }; run.movers.push(wave);
        this.scene.tweens.add({ targets: wave, t: 1, duration: 420, onUpdate: () => {
            const radius = this.reduced ? 30 : 18 + wave.t * 58, alpha = (1 - wave.t) * .85;
            arc.clear();
            for (const [width, opacity] of [[12, .14], [3, 1]]) {
                arc.lineStyle(width, 0xc3faff, alpha * opacity).beginPath()
                    .arc(at.x - 20, at.y, radius, -1.2, 1.2).strokePath();
            }
        } });
        run.timer = this.scene.time.delayedCall(700, () => this.disposeRun(run));
    }

    private heal(run: Run, target: Sprite, stars: Emitter, dust: Emitter, path: Phaser.GameObjects.Graphics): Phaser.Tweens.Tween {
        const body = battleBodyBounds(target);
        const hearts = this.emitter('heart', { lifespan: { min: 600, max: 900 }, speedY: { min: -100, max: -65 },
            speedX: { min: -18, max: 18 }, scale: { start: .38, end: .16 }, tint: [0xb6ffa9, 0xffef9a],
            rotate: { min: -15, max: 15 } }, run);
        hearts.explode(this.reduced ? 2 : 7, body.centerX, body.centerY + 12);
        const progress = { t: 0 }; run.movers.push(progress);
        return this.scene.tweens.add({ targets: progress, t: 1, duration: this.reduced ? 180 : 850, onUpdate: () => {
            path.clear(); const p = progress.t, opacity = Math.sin(p * Math.PI) * .7;
            for (let strand = 0; strand < (this.reduced ? 1 : 2); strand++) {
                const points = [];
                for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 3 + p * 5 + strand * Math.PI;
                    points.push({ x: body.centerX + Math.cos(a) * (body.width * .54 + 12), y: body.bottom - t * body.height + Math.sin(a) * 12 }); }
                path.lineStyle(10, 0x51c986, opacity * .18).strokePoints(points, false);
                path.lineStyle(2, strand ? 0xffe5a0 : 0xb7ffd0, opacity).strokePoints(points, false);
                if (!this.reduced) { const a = p * Math.PI * 5 + strand * Math.PI;
                    const x = body.centerX + Math.cos(a) * (body.width * .53 + 10), y = body.bottom - p * body.height;
                    stars.emitParticleAt(x, y, 1); dust.emitParticleAt(x, y, 1); }
            }
        } });
    }

    private strike(run: Run, at: { x: number; y: number }, stars: Emitter, dust: Emitter, path: Phaser.GameObjects.Graphics): Phaser.Tweens.Tween {
        stars.explode(this.reduced ? 5 : 32, at.x, at.y); dust.explode(this.reduced ? 3 : 18, at.x, at.y);
        const shards = this.emitter('shard', { lifespan: { min: 180, max: 540 }, speed: { min: 110, max: 280 },
            scale: { start: .5, end: 0 }, tint: [0xbdf6ff, 0xffdd83], rotate: { min: 0, max: 360 } }, run);
        shards.explode(this.reduced ? 4 : 24, at.x, at.y);
        const progress = { t: 0 }; run.movers.push(progress);
        return this.scene.tweens.add({ targets: progress, t: 1, duration: this.reduced ? 160 : 490, onUpdate: () => {
            path.clear(); const p = progress.t, alpha = (1 - p) * .95;
            for (let arm = 0; arm < (this.reduced ? 2 : 7); arm++) {
                const angle = arm * Math.PI * 2 / 7, radius = 32 + p * 72;
                const points = Array.from({ length: 6 }, (_, i) => {
                    const a = angle + Math.sin(i * 4.4 + arm) * .14;
                    return { x: at.x + Math.cos(a) * radius * i / 5, y: at.y + Math.sin(a) * radius * i / 5 }; });
                path.lineStyle(9, 0x338fed, alpha * .2).strokePoints(points, false);
                path.lineStyle(2.4, 0xd0ffff, alpha).strokePoints(points, false);
            }
        } });
    }

    private shieldBurst(run: Run, target: Sprite, stars: Emitter, dust: Emitter, path: Phaser.GameObjects.Graphics): Phaser.Tweens.Tween {
        const body = battleBodyBounds(target), progress = { t: 0 }; run.movers.push(progress);
        return this.scene.tweens.add({ targets: progress, t: 1, duration: this.reduced ? 160 : 750, onUpdate: () => {
            path.clear(); const p = progress.t;
            for (let ribbon = 0; ribbon < 3; ribbon++) {
                const a = p * Math.PI * 2 + ribbon * Math.PI * 2 / 3;
                const x = body.right + 4 + Math.sin(a) * 29, y = body.centerY - Math.cos(a) * body.height * .48;
                if (!this.reduced) { stars.emitParticleAt(x, y, 1); dust.emitParticleAt(x, y, 1); }
            }
        } });
    }

    private emitter(kind: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, run?: Run): Emitter {
        const emitter = this.scene.add.particles(0, 0, `fox-vfx-${kind}`, { frequency: -1, maxParticles: 96,
            maxAliveParticles: 80, alpha: { start: .9, end: 0 }, blendMode: Phaser.BlendModes.ADD, ...config })
            .setDepth(58).setName('foxParticles');
        this.emitters.add(emitter); run?.objects.push(emitter);
        return emitter;
    }

    private update(_time: number, delta: number): void {
        const paused = this.scene.time.paused;
        for (const emitter of this.emitters) emitter.timeScale = paused ? 0 : 1;
        if (paused) return;
        this.elapsed += delta;
        for (const shield of this.shields.values()) {
            const body = battleBodyBounds(shield.actor), pulse = Math.max(0, (shield.pulseUntil - this.elapsed) / 700);
            const height = Phaser.Math.Clamp(body.height * 1.14, 105, 205);
            shield.pane.setPosition(body.right + 3, body.centerY).setScale(height / 384)
                .setAlpha((.52 + pulse * .42) * shield.actor.alpha)
                .setVisible(shield.actor.parentContainer?.visible !== false && (shield.power > 0 || pulse > 0));
            shield.motes.setVisible(shield.pane.visible);
            if (!this.reduced && shield.pane.visible && shield.power > 0 && this.elapsed >= shield.nextMote) {
                const a = this.elapsed * .004;
                shield.motes.emitParticleAt(body.right + 6 + Math.sin(a) * 23, body.centerY + Math.cos(a) * height * .39, 1);
                shield.nextMote = this.elapsed + 130;
            }
        }
    }

    private disposeRun(run: Run): void {
        run.timer?.remove(false); this.runs.delete(run);
        this.scene.tweens.killTweensOf([...run.movers, ...run.objects]);
        for (const object of run.objects) {
            this.emitters.delete(object as Emitter); object.destroy();
        }
    }

    private destroy(): void {
        this.disposed = true; this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.update, this);
        for (const run of [...this.runs]) this.disposeRun(run);
        for (const shield of this.shields.values()) { shield.pane.destroy(); shield.motes.destroy(); }
        this.shields.clear(); this.emitters.clear();
    }

    private createTextures(): void {
        for (const kind of ['glow', 'star', 'heart', 'shard', 'air']) {
            const key = `fox-vfx-${kind}`; if (this.scene.textures.exists(key)) continue;
            const air = kind === 'air', w = air ? 256 : 64, h = air ? 384 : 64;
            const texture = this.scene.textures.createCanvas(key, w, h)!, c = texture.getContext();
            if (air) {
                const curve = () => { c.beginPath(); c.moveTo(62, 30); c.bezierCurveTo(219, 67, 219, 317, 62, 354);
                    c.bezierCurveTo(122, 261, 122, 123, 62, 30); c.closePath(); };
                const glass = c.createLinearGradient(60, 0, 195, 0); glass.addColorStop(0, '#5ddfff00'); glass.addColorStop(.6, '#63d7ff24'); glass.addColorStop(1, '#d0ffff8a');
                curve(); c.fillStyle = glass; c.fill(); c.strokeStyle = '#aafaff'; c.lineWidth = 2.4;
                c.shadowColor = '#5edfff'; c.shadowBlur = 15; c.stroke(); c.shadowBlur = 0;
                for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(150, 192, 27 + i * 9, 82 + i * 24, 0, -1.35, 1.35);
                    c.strokeStyle = '#d2fcff55'; c.lineWidth = 1.2; c.stroke(); }
            } else if (kind === 'glow') {
                const glow = c.createRadialGradient(32, 32, 0, 32, 32, 31);
                glow.addColorStop(0, '#ffffff'); glow.addColorStop(.17, '#ffffffe0'); glow.addColorStop(.5, '#ffffff40'); glow.addColorStop(1, '#ffffff00');
                c.fillStyle = glow; c.fillRect(0, 0, w, h);
            } else {
                c.fillStyle = '#ffffff'; c.shadowColor = '#ffffff'; c.shadowBlur = 7; c.beginPath();
                if (kind === 'heart') { c.moveTo(32, 53); c.bezierCurveTo(4, 35, 7, 12, 22, 15); c.quadraticCurveTo(28, 15, 32, 24);
                    c.bezierCurveTo(43, 2, 68, 22, 32, 53); }
                else if (kind === 'shard') { c.moveTo(32, 7); c.lineTo(38, 29); c.lineTo(32, 57); c.lineTo(26, 35); }
                else { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 5 : 26;
                    const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r; i ? c.lineTo(x, y) : c.moveTo(x, y); } }
                c.closePath(); c.fill();
            }
            texture.refresh();
        }
    }
}

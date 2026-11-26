import { pointsFor, type ObservatoryReward } from './mural.js';
import { observatoryAssets } from './assets.js';

const WIDTH = 300, HEIGHT = 225;
type State = 'waiting' | 'earned' | 'assisted';
type Gem = { x: number; y: number; scale: number; radius: number; state: State; since: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Match SVG preserveAspectRatio="xMidYMid meet" for the square rune artwork.
function fit(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
    const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

/** Canvas version of the same painted inlays and star route used in the approved SVG preview. */
export class PaintedMural {
    readonly gems: Gem[];
    readonly ready: Promise<void>;
    private images?: HTMLImageElement[];
    private etchedRune?: HTMLCanvasElement;
    private mask = document.createElement('canvas');
    private reveal = document.createElement('canvas');
    private completedAt?: number;
    private missedAt?: number;
    private dirtyUntil = Infinity;
    private dirty = true;
    private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private reward: ObservatoryReward, count: number, private density: number) {
        const points = pointsFor(reward, count);
        this.gems = points.map(([x, y], index) => {
            const nearest = Math.min(...points.filter((_, i) => i !== index).map(([px, py]) => Math.hypot(x-px,y-py)));
            return { x, y, radius: Math.min(39, nearest * 0.88), scale: Math.min(1, nearest / 38), state: 'waiting', since: 0 };
        });
        for (const layer of [this.mask, this.reveal]) {
            layer.width = WIDTH * density;
            layer.height = HEIGHT * density;
        }
        this.ready = observatoryAssets().mural(reward)
            .then(images => {
                this.images = images;
                this.dirtyUntil = 0;
                if (reward === 'rune') {
                    this.etchedRune = document.createElement('canvas');
                    this.etchedRune.width = this.mask.width;
                    this.etchedRune.height = this.mask.height;
                    const ctx = this.etchedRune.getContext('2d')!;
                    ctx.scale(density, density);
                    ctx.filter = 'grayscale(1) sepia(.45) hue-rotate(173deg) saturate(1.45)';
                    fit(ctx, images[0]);
                }
            });
    }

    light(index: number, assisted: boolean, time: number) {
        const gem = this.gems[index];
        if (!gem || gem.state !== 'waiting') return;
        gem.state = assisted ? 'assisted' : 'earned';
        gem.since = time;
        this.dirty = true;
        this.dirtyUntil = time + 760;
    }

    finish(time: number, won: boolean) {
        this.completedAt = won ? time : undefined;
        this.missedAt = won ? undefined : time;
        this.dirty = true;
        this.dirtyUntil = time + 950;
    }

    paint(ctx: CanvasRenderingContext2D, time: number): boolean {
        if (!this.images || !this.dirty) return false;
        this.dirty = !this.reducedMotion && time < this.dirtyUntil;
        const [etched, awake, cold, hot] = this.images;
        const complete = this.completedAt === undefined ? 0 : this.reducedMotion ? 1 : clamp((time-this.completedAt)/650);
        const faded = this.missedAt === undefined ? 0 : this.reducedMotion ? 1 : clamp((time-this.missedAt)/900);
        ctx.save();
        ctx.setTransform(ctx.canvas.width/WIDTH,0,0,ctx.canvas.height/HEIGHT,0,0);
        ctx.clearRect(0,0,WIDTH,HEIGHT);
        ctx.globalAlpha = (this.reward === 'rune' ? .44 : .72) * (1 - complete);
        if (this.etchedRune) ctx.drawImage(this.etchedRune, 0, 0, WIDTH, HEIGHT);
        else fit(ctx,etched);
        ctx.globalAlpha = 1;
        if (complete < 1 && faded < 1) this.revealLocalColor(ctx,awake,time,1-faded);
        if (complete > 0) {
            ctx.globalAlpha = complete;
            fit(ctx,awake);
            ctx.globalAlpha = 1;
        }
        ctx.lineCap = 'round';
        this.gems.forEach((gem, i) => {
            if (!i) return;
            const previous = this.gems[i-1];
            const lit = gem.state !== 'waiting' && previous.state !== 'waiting';
            ctx.beginPath(); ctx.moveTo(previous.x,previous.y); ctx.lineTo(gem.x,gem.y);
            ctx.strokeStyle = lit ? '#ffdf92' : '#b5c4ec57';
            ctx.lineWidth = lit ? 1.5 : .9;
            ctx.stroke();
        });
        this.gems.forEach((gem,i) => {
            const lit = gem.state !== 'waiting';
            const phase = this.reducedMotion ? 1 : clamp((time-gem.since)/720);
            const pulse = lit ? 1 + .48*Math.sin(Math.PI*phase)*(1-phase) : 1;
            ctx.save();
            ctx.translate(gem.x,gem.y);
            ctx.scale(gem.scale*pulse,gem.scale*pulse);
            if (lit && phase < 1) {
                ctx.strokeStyle = `rgba(255,232,180,${1-phase})`;
                ctx.lineWidth = 1.4;
                for(let p=0;p<7;p++){
                    const angle = (137*p+17*i)*Math.PI/180;
                    const end = 12+(p%3)*2+8*phase, dx=Math.cos(angle),dy=Math.sin(angle);
                    ctx.beginPath(); ctx.moveTo(dx*(end-4),dy*(end-4)); ctx.lineTo(dx*end,dy*end); ctx.stroke();
                }
            }
            ctx.drawImage(lit ? hot : cold,-16,-16,32,32);
            if (gem.state === 'assisted') {
                ctx.beginPath(); ctx.ellipse(0,0,16,5,-.42,0,Math.PI*2);
                ctx.strokeStyle='#173953'; ctx.lineWidth=3.8; ctx.stroke();
                ctx.strokeStyle='#ffe89f'; ctx.lineWidth=1.8; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(3,-2); ctx.lineTo(7,0); ctx.lineTo(2,3);
                ctx.lineTo(0,9); ctx.lineTo(-2,3); ctx.lineTo(-7,0); ctx.lineTo(-2,-2); ctx.closePath();
                ctx.fillStyle='#8bf1f2'; ctx.fill(); ctx.strokeStyle='#285775'; ctx.lineWidth=1; ctx.stroke();
            }
            ctx.restore();
        });
        ctx.restore();
        return true;
    }

    private revealLocalColor(ctx: CanvasRenderingContext2D, art: HTMLImageElement, time: number, strength: number) {
        if (!this.gems.some(gem => gem.state !== 'waiting')) return;
        const mask = this.mask.getContext('2d')!, reveal = this.reveal.getContext('2d')!;
        mask.setTransform(this.density,0,0,this.density,0,0); mask.clearRect(0,0,WIDTH,HEIGHT);
        for (const gem of this.gems) {
            if (gem.state === 'waiting') continue;
            const {x,y,radius} = gem;
            const wash = mask.createRadialGradient(x,y,0,x,y,radius);
            wash.addColorStop(0,'white'); wash.addColorStop(.46,'rgba(255,255,255,.9)'); wash.addColorStop(1,'transparent');
            mask.globalAlpha = this.reducedMotion ? 1 : clamp((time-gem.since)/480);
            mask.fillStyle = wash; mask.fillRect(x-radius,y-radius,radius*2,radius*2);
        }
        reveal.setTransform(this.density,0,0,this.density,0,0); reveal.clearRect(0,0,WIDTH,HEIGHT);
        fit(reveal,art);
        reveal.globalCompositeOperation='destination-in';
        reveal.drawImage(this.mask,0,0,WIDTH,HEIGHT);
        reveal.globalCompositeOperation='source-over';
        ctx.globalAlpha=.92*strength; ctx.drawImage(this.reveal,0,0,WIDTH,HEIGHT); ctx.globalAlpha=1;
    }
}

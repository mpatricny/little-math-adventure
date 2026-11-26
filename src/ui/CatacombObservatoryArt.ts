import Phaser from 'phaser';
import type { SceneBuilder } from '../systems/SceneBuilder';
import { createStage } from './observatory/stage.js';
import { constellations, type ObservatoryReward } from './observatory/mural.js';
import { PaintedMural } from './observatory/PaintedMural';

export type { ObservatoryReward } from './observatory/mural.js';
let instance = 0;

type Bounds = { x: number; y: number; width: number; height: number; depth: number };

function layout(builder: SceneBuilder, id: string, width: number, height: number): Bounds {
    const host = builder.get<Phaser.GameObjects.Container>(id), def = builder.getElementDef(id);
    if (!host || !def?.width || !def.height) throw new Error('Missing observatory layout ' + id);
    const scale = Math.min(def.width / width, def.height / height);
    return { x: host.x, y: host.y, width: width * scale, height: height * scale, depth: host.depth };
}

/** The active scene owns these surfaces. Phaser overlays, input, and canvas/WebGL
 * screenshots all use the same camera and logical coordinates as the painting. */
export class CatacombObservatoryArt {
    readonly ready: Promise<void>;
    private readonly scene: Phaser.Scene;
    private readonly stage: ReturnType<typeof createStage>;
    private readonly mural: PaintedMural;
    private readonly world: Bounds;
    private readonly wall: Bounds;
    private readonly color: string;
    private readonly objects: Phaser.GameObjects.Image[] = [];
    private readonly keys: string[] = [];
    private visible = true;
    private destroyed = false;
    private time = 0;

    constructor(scene: Phaser.Scene, builder: SceneBuilder, reward: ObservatoryReward, count: number) {
        this.scene = scene;
        this.world = layout(builder,'observatoryWorld',1440,900);
        this.wall = layout(builder,'observatoryMural',300,225);
        this.color = constellations[reward].color;
        // Match the mural's actual footprint in the tablet's game framebuffer.
        // Repainting and uploading a supersampled colour mask per star is costly on mobile.
        const muralWidth = navigator.maxTouchPoints > 0 ? Math.min(600, Math.ceil(this.wall.width / 4) * 4) : 600;
        this.mural = new PaintedMural(reward, count, muralWidth / 300);
        const base = 'observatory-' + (++instance);
        // Only the light needs frequent updates. Keep the illustrated actors at
        // their original resolution and upload them only when their pose changes.
        const lightWidth = navigator.maxTouchPoints > 0 ? 576 : 960;
        const light = scene.textures.createCanvas(base+'-light', lightWidth, lightWidth * 5 / 8)!;
        const wall = scene.textures.createCanvas(base+'-mural',muralWidth,muralWidth * 3 / 4)!;
        this.keys.push(light.key,wall.key);
        const lightImage = this.place(light.key,this.world,'observatory-light');
        this.place(wall.key,this.wall,'observatory-constellation');
        const cast = new Map<string, Phaser.Textures.CanvasTexture>();
        let firstActor: Phaser.GameObjects.Image | undefined;
        this.stage = createStage(null, {
            canvas: light.canvas,
            paintActor: (name, [x, y, w, h], draw) => {
                // Use the take's fixed bounds for every frame. Blinking only
                // repaints the knight; it never uploads the fox or the room.
                let texture = cast.get(name);
                if (!texture) {
                    texture = scene.textures.createCanvas(base+'-'+name, Math.ceil(w*2/3), Math.ceil(h*2/3))!;
                    this.keys.push(texture.key);
                    cast.set(name, texture);
                    const world = this.world;
                    const image = this.place(texture.key, {
                        x: world.x + ((x + w/2)/1440 - .5)*world.width,
                        y: world.y + ((y + h/2)/900 - .5)*world.height,
                        width: w/1440*world.width, height: h/900*world.height, depth: world.depth,
                    }, 'observatory-'+name);
                    scene.children.moveBelow(image, lightImage);
                    firstActor ??= image;
                }
                const ctx = texture.context;
                const sx = ctx.canvas.width / w, sy = ctx.canvas.height / h;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.setTransform(sx, 0, 0, sy, -x*sx, -y*sy);
                draw(ctx);
                if (scene.renderer.type === Phaser.WEBGL) texture.refresh();
            },
            painted: (time: number, lightChanged: boolean) => {
                if (this.destroyed) return;
                this.time = time;
                if (lightChanged && scene.renderer.type === Phaser.WEBGL) light.refresh();
                if (this.mural.paint(wall.context,time) && scene.renderer.type === Phaser.WEBGL) wall.refresh();
            },
        });
        const roomReady = this.stage.room.then(plate => {
            if (this.destroyed) return;
            const texture = scene.textures.addImage(base+'-room',plate)!;
            this.keys.push(texture.key);
            const room = this.place(texture.key,this.world,'observatory-room');
            scene.children.moveBelow(room,firstActor ?? lightImage);
        });
        this.aim(0);
        this.ready = Promise.all([roomReady,this.stage.ready,this.mural.ready]).then(() => {
            if (this.destroyed) return;
            if (this.mural.paint(wall.context,this.time) && scene.renderer.type === Phaser.WEBGL) wall.refresh();
        });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    }

    private place(key: string, region: Bounds, name: string) {
        const image = this.scene.add.image(region.x,region.y,key).setName(name)
            .setDepth(region.depth).setDisplaySize(region.width,region.height).setVisible(this.visible);
        this.objects.push(image);
        return image;
    }

    private point(index: number) {
        const gem = this.mural.gems[index];
        if (!gem) return null;
        const x = this.wall.x + (gem.x/300-.5)*this.wall.width;
        const y = this.wall.y + (gem.y/225-.5)*this.wall.height;
        return { x: (x-this.world.x)/this.world.width+.5, y: (y-this.world.y)/this.world.height+.5 };
    }

    aim(index: number) {
        const point = this.point(index);
        if (point) this.stage.aimAt(point,{color:this.color});
    }

    async light(index: number, assisted = false): Promise<boolean> {
        const point = this.point(index);
        if (!point || this.destroyed || this.mural.gems[index].state !== 'waiting') return false;
        const contact = await this.stage.activate(point,{color:this.color,assisted});
        if (!contact || this.destroyed) return false;
        this.mural.light(index,assisted,this.time);
        return true;
    }

    setSky(elapsedFraction: number) { this.stage.setSky(elapsedFraction); }
    setPaused(paused: boolean) { this.stage.setPaused(paused); }
    finish(passed: boolean) {
        this.stage.finish(passed);
        this.mural.finish(this.time, passed);
    }
    setVisible(visible: boolean) {
        this.visible = visible;
        for (const image of this.objects) image.setVisible(visible);
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
        this.stage.destroy();
        for (const image of this.objects) image.destroy();
        for (const key of this.keys) this.scene.textures.remove(key);
    }
}

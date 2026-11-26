import type { Page } from 'playwright/test';

/** Sample the rendered game loop, including the actual opaque paw position in each video frame. */
export async function measurePedestalMotion(page: Page, forms: string[], record: boolean) {
    await page.waitForFunction(forms => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const panel = scene.children.getByName('catacombProgress');
        if (!panel?.visible) return false;
        const sprites = panel.getAll()[1].list.filter((s: any) => s.type === 'Sprite' && s.visible && s.anims?.isPlaying);
        return sprites.length === 2 && sprites.every((s: any, i: number) => s.texture.key.includes(forms[i])
            && s.anims.currentAnim.repeat === -1 && !s.anims.currentAnim.yoyo);
    }, forms, {timeout: 20000});
    return page.evaluate(record => {
        type Foot = { frame: string|number; x: number; y: number };
        const game = (window as any).__LITTLE_MATH_GAME__, scene = game.scene.keys.GuildScene;
        const content = scene.children.getByName('catacombProgress').getAll()[1];
        const room = content.list.find((o: any) => o.texture?.key === 'catacomb-painted-fox-room').getBounds();
        const sprites = content.list.filter((o: any) => o.type === 'Sprite' && o.visible && o.anims?.isPlaying);
        const footprints: Foot[][] = [[], []], pictures: string[] = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
        const capture = document.createElement('canvas');
        capture.width = 960; capture.height = 540;
        const drawer = capture.getContext('2d')!;
        function foot(sprite: any): Foot {
            const f = sprite.frame;
            canvas.width = f.cutWidth; canvas.height = f.cutHeight;
            ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, canvas.width, canvas.height);
            const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // A single loose antialiasing speck does not count as a planted paw.
            for (let y = canvas.height - 1; y >= 0; y--) {
                let totalX = 0, count = 0;
                for (let x = 0; x < canvas.width; x++) {
                    if (data[(y * canvas.width + x) * 4 + 3] >= 160) { totalX += x; count++; }
                }
                if (count < 4) continue;
                const px = f.x + totalX / count, py = f.y + y + 1;
                const localX = (sprite.flipX ? f.realWidth - px : px) - sprite.displayOriginX;
                const pos = sprite.getWorldTransformMatrix().transformPoint(localX, py - sprite.displayOriginY);
                return {frame: f.name, x: (pos.x - room.x) / room.width, y: (pos.y - room.y) / room.height};
            }
            throw Error('Transparent fox frame: ' + sprite.texture.key + '/' + f.name);
        }
        const started = performance.now();
        let firstPose = '', lastPose = '';
        return new Promise<{footprints: Foot[][]; pictures: string[]}>(resolve => {
            function rendered() {
                const time = performance.now();
                for (const [i, sprite] of sprites.entries()) {
                    if (!footprints[i].some(f => f.frame === sprite.frame.name)) footprints[i].push(foot(sprite));
                }
                const pose = sprites.map((s: any) => s.frame.name).join('/');
                const cycled = pose === firstPose && pose !== lastPose && pictures.length > 2;
                if (record && !cycled && pose !== lastPose) {
                    firstPose ||= pose;
                    drawer.drawImage(game.canvas, 0, 0, capture.width, capture.height);
                    pictures.push(capture.toDataURL('image/jpeg', .94).split(',')[1]);
                }
                lastPose = pose;
                if (record ? !cycled && time - started < 15000 : time - started < 2400) return;
                game.events.off('postrender', rendered);
                resolve({footprints, pictures});
            }
            game.events.on('postrender', rendered);
        });
    }, record);
}

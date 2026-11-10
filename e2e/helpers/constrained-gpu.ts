import type { Page } from 'playwright/test';

/** Exercise the actual WebGL upload path, not merely a reported capability. */
export async function constrainTextureUploads(page: Page, limit = 4096): Promise<void> {
    await page.addInitScript(({ limit }) => {
        const audit = (window as any).__textureUploadAudit = { limit, rejected: [] as any[] };
        for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
            if (!Context) continue;
            const prototype = Context.prototype as any;
            const getParameter = prototype.getParameter;
            const texImage2D = prototype.texImage2D;
            prototype.getParameter = function(parameter: number) {
                const value = getParameter.call(this, parameter);
                return parameter === this.MAX_TEXTURE_SIZE ? Math.min(limit, value) : value;
            };
            prototype.texImage2D = function(...args: any[]) {
                const width = args.length >= 9 ? args[3] : args[5]?.width;
                const height = args.length >= 9 ? args[4] : args[5]?.height;
                if (width > limit || height > limit) {
                    const nativeLimit = getParameter.call(this, this.MAX_TEXTURE_SIZE);
                    // This desktop driver may support larger textures. Force a
                    // genuinely invalid native upload instead of accepting the
                    // oversized image despite our emulated tablet capability.
                    // The texture remains incomplete; no synthetic black image
                    // is uploaded. Its real GPU sampling is inspected below.
                    texImage2D.call(this, args[0], args[1], this.RGBA,
                        nativeLimit + 1, 1, 0, this.RGBA, this.UNSIGNED_BYTE, null);
                    audit.rejected.push({ width, height, nativeLimit, error: this.getError() });
                    return;
                }
                return texImage2D.apply(this, args);
            };
        }
    }, { limit });
}

/** Read rendered GPU/Canvas pixels, including alpha, rather than trusting exists(). */
export async function renderedCreatureFrame(page: Page, sceneKey: string, key: string, index: number) {
    return page.evaluate(async ({ sceneKey, key, index }) => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const scene = game.scene.keys[sceneKey];
        const frame = scene.textures.getFrame(key, index);
        const source = scene.textures.get(key).getSourceImage();
        const expectedCanvas = document.createElement('canvas'); expectedCanvas.width = expectedCanvas.height = 512;
        const expectedContext = expectedCanvas.getContext('2d')!;
        expectedContext.drawImage(source, frame.cutX, frame.cutY, 512, 512, 0, 0, 512, 512);
        const expected = expectedContext.getImageData(0, 0, 512, 512).data;
        const sprite = scene.make.image({ x: 256, y: 256, key, frame: index, add: false });
        const target = scene.add.renderTexture(0, 0, 512, 512).setVisible(false);
        target.draw(sprite);
        const image = await new Promise<HTMLImageElement>(resolve => target.snapshot(resolve));
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 512, 512).data;
        let intersection = 0, union = 0, opaque = 0, colored = 0;
        for (let i = 0; i < expected.length; i += 4) {
            const a = expected[i + 3] > 127, b = pixels[i + 3] > 127;
            if (a && b) intersection++; if (a || b) union++;
            if (expected[i + 3] >= 250) {
                opaque++;
                if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 32) colored++;
            }
        }
        const result = { key, index, exists: scene.textures.exists(key),
            sourceWidth: source.width, sourceHeight: source.height,
            alphaIoU: intersection / union, coloredFraction: colored / opaque,
            cornerAlpha: [pixels[3], pixels[(512 * 512 - 1) * 4 + 3]], png: canvas.toDataURL('image/png') };
        target.destroy(); sprite.destroy();
        return result;
    }, { sceneKey, key, index });
}

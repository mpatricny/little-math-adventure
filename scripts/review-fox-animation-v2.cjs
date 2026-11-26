async (page) => {
    const output = '/Users/datamole/little-math-adventure/artifacts/sorceress/fox-companion-v2';
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.goto('http://127.0.0.1:8013/docs/design-drafts/fox-animation-v2/index.html');
    await page.waitForFunction(() => window.foxAnimationReview?.snapshot().loaded);
    const manifest = await page.evaluate(() => fetch('./manifest.json').then(r => r.json()));
    const results = [];
    for (const id of ['02', '03', '05']) {
        await page.locator(`[data-id="${id}"]`).click();
        for (const motion of ['idle', 'attack', 'cast']) {
            const entry = manifest.forms[id].motions[motion];
            await page.locator(`[data-motion="${motion}"]`).click();
            await page.waitForFunction(({ id, motion }) => {
                const s = window.foxAnimationReview.snapshot(); return s.loaded && s.id === id && s.motion === motion;
            }, { id, motion });
            const gpu = await page.evaluate(async entry => {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl');
                if (!gl) throw Error('No WebGL context');
                const image = new Image(); image.src = entry.sheet; await image.decode();
                const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                const framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Incomplete GPU upload');
                const pixels = new Uint8Array(image.width * image.height * 4);
                gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let opaque = 0; for (let n = 3; n < pixels.length; n += 4) if (pixels[n] > 32) opaque++;
                const error = gl.getError(); gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
                gl.getExtension('WEBGL_lose_context')?.loseContext();
                return { width: image.width, height: image.height, opaque, error };
            }, entry);
            if (gpu.error || gpu.opaque < 50000 || Math.max(gpu.width, gpu.height) > 2048) throw Error('Invalid GPU atlas ' + id + '/' + motion);
            if (!entry.playback.every((frame, i) => frame === i)) throw Error('Non-forward playback');
            const frame = motion === 'idle' ? 0 : motion === 'attack' ? 3 : 4;
            await page.evaluate(frame => window.foxAnimationReview.showFrame(frame), frame);
            await page.locator('#canvasHost').screenshot({ path: `${output}/review-${id}-${motion}-light.png` });
            results.push({ id, motion, gpu, frames: entry.frames, playback: entry.playback });
        }
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: output + '/review-gallery-tablet.png', fullPage: true });
    const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        controls: [...document.querySelectorAll('button')].map(b => ({ label: b.textContent.trim(), width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })),
    }));
    if (layout.overflow || layout.controls.some(c => c.width < 44 || c.height < 44)) throw Error('Tablet layout failure');
    return { date: new Date().toISOString(), source: 'Actual WebGL texture upload + framebuffer readback, gallery screenshots', results, layout };
}

import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { mkdir } from 'node:fs/promises';

for (const renderer of ['canvas', 'webgl']) test(`accepted companion keeps its damage and plays its complete attack — ${renderer}`, async ({ page }) => {
    await mkdir('artifacts/fox-companion-review', { recursive: true });
    await openSeededGame(page, false, {}, {}, {
        ownedPets: ['pet_catacomb_A'], activePet: 'pet_catacomb_A',
        unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 4,
    });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        g.scene.keys.MenuScene.scene.start('BattleScene', { enemyId: 'slime_green', returnScene: 'TownScene' });
    });
    await waitForScene(page, 'BattleScene');
    const state = await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__, s = g.scene.keys.BattleScene;
        const pet = s.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A');
        return {
            renderer: g.renderer.type, key: s.petSprite.texture.key,
            prefix: s.equippedPetDef.animPrefix, damage: s.equippedPetDef.damageMultiplier,
            baseDamage: pet.damageMultiplier, idle: s.petSprite.anims.currentAnim.key,
            portraitLoaded: g.textures.exists(`${pet.spriteKey}-portrait`),
            unusedCastLoaded: g.textures.exists('companion-fox-01-cast-sheet'),
            sheets: ['idle', 'attack'].map(motion => {
                const texture = g.textures.get(`companion-fox-01-${motion}-sheet`);
                const anim = g.anims.get(`companion-fox-01-${motion}`);
                return { key: texture.key, width: texture.source[0].width, height: texture.source[0].height,
                    frames: anim.frames.map((f: any) => Number(f.textureFrame)), repeat: anim.repeat };
            }),
        };
    });
    expect(state.renderer).toBe(renderer === 'canvas' ? 1 : 2);
    expect(state.key).toBe('companion-fox-01-idle-sheet');
    expect(state.idle).toBe('companion-fox-01-idle');
    expect(state.damage).toBe(state.baseDamage + 4);
    expect(state.portraitLoaded).toBe(true);
    expect(state.unusedCastLoaded).toBe(false);
    for (const sheet of state.sheets) {
        expect(Math.max(sheet.width, sheet.height)).toBeLessThanOrEqual(2048);
        expect(sheet.frames).toEqual(sheet.frames.map((_, i) => i));
        expect(sheet.repeat).toBe(sheet.key.includes('idle') ? -1 : 0);
    }
    if (renderer === 'webgl') {
        // A decoded image/texture key can still yield a black quad on the GPU.
        // Read the actual Phaser uploads, including alpha, rather than a new copy.
        const uploads = await page.evaluate(keys => {
            const g = (window as any).__LITTLE_MATH_GAME__, gl = g.renderer.gl as WebGLRenderingContext;
            const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            return keys.map(key => {
                const source = g.textures.get(key).source[0];
                const framebuffer = gl.createFramebuffer();
                try {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                        source.glTexture.webGLTexture, 0);
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Incomplete upload: ${key}`);
                    const pixels = new Uint8Array(source.width * source.height * 4);
                    gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    let opaque = 0, colored = 0, transparent = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (pixels[i + 3] > 32) {
                            opaque++;
                            if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40) colored++;
                        } else transparent++;
                    }
                    return { key, opaque, colored, transparent, error: gl.getError() };
                } finally {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
                    gl.deleteFramebuffer(framebuffer);
                }
            });
        }, state.sheets.map(sheet => sheet.key));
        for (const upload of uploads) {
            expect(upload.error, upload.key).toBe(0);
            expect(upload.colored, upload.key).toBeGreaterThan(50000);
            expect(upload.transparent, upload.key).toBeGreaterThan(50000);
            expect(upload.colored / upload.opaque, upload.key).toBeGreaterThan(0.8);
        }
    }
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport);
        await page.screenshot({ path: `artifacts/fox-companion-review/battle-${renderer}-${viewport.width}.png` });
    }
    // Exercise the production movement + animation handoff, keeping the target
    // alive so the scene cannot end halfway through the observed motion.
    await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        s.mathBoard.hide();
        s.battleState.phase = 'pet_attack';
        const frames: number[] = [];
        s.petSprite.on('animationupdate', (anim: any, frame: any) => {
            if (anim.key === 'companion-fox-01-attack') frames.push(Number(frame.textureFrame));
        });
        (window as any).__foxAttack = { frames, done: false };
        s.playPetMeleeAttack(0, 0, () => { (window as any).__foxAttack.done = true; });
    });
    await page.waitForFunction(() => (window as any).__foxAttack.done);
    const motion = await page.evaluate(() => ({
        frames: [...new Set((window as any).__foxAttack.frames)],
        animation: (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.petSprite.anims.currentAnim.key,
    }));
    expect(motion.frames).toContain(state.sheets[1].frames.at(-1));
    expect(motion.animation).toBe('companion-fox-01-idle');
});

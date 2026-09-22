import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Local saves only; mock the optional account service, so no DB migration is needed.
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8001';
const scenes = JSON.parse(readFileSync(new URL('../public/assets/data/scenes.json', import.meta.url))).scenes;
const host = (scene, id) => scenes[scene].ui.find(element => element.id === id);
const nameHost = host('CharacterSelectNewScene', 'characterNameInputHost');
const output = new URL('../artifacts/mobile-layout/', import.meta.url).pathname;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const profiles = [
    ['phone-webgl', { width: 915, height: 359 }, true, false],
    ['phone-canvas', { width: 915, height: 359 }, true, true],
    ['tablet-canvas', { width: 1024, height: 768 }, true, true],
    ['desktop-webgl', { width: 1440, height: 900 }, false, false],
];
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1, `${message}: ${actual} vs ${expected}`);

try {
    for (const [name, viewport, mobile, canvasRenderer] of profiles) {
        const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => { errors.push(error.message); console.error(`${name}: ${error.message}`); });
            await page.route('**/v1/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
            await page.goto(`${baseUrl}/?renderer=${canvasRenderer ? 'canvas' : 'webgl'}`);
            const waitScene = key => page.waitForFunction(key => window.__LITTLE_MATH_GAME__?.scene.isActive(key), key, { timeout: 60_000 });
            const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const capture = state => page.screenshot({ path: `${output}${name}-${state}.png`, scale: 'css' });
            async function tap(point) {
                const box = await page.locator('canvas').boundingBox();
                const x = box.x + point.x * box.width / 1280, y = box.y + point.y * box.height / 720;
                if (mobile) await page.touchscreen.tap(x, y);
                else await page.mouse.click(x, y);
                await settled();
            }
            async function checkAlignment(centered = true) {
                await settled();
                const state = await page.evaluate(() => {
                    const game = window.__LITTLE_MATH_GAME__;
                    return { canvas: game.canvas.getBoundingClientRect().toJSON(), dom: game.domContainer.getBoundingClientRect().toJSON(),
                        viewport: { width: visualViewport.width, height: visualViewport.height, left: visualViewport.offsetLeft, top: visualViewport.offsetTop } };
                });
                for (const key of ['x', 'y', 'width', 'height']) near(state.dom[key], state.canvas[key], `DOM/canvas ${key}`);
                assert.ok(Math.abs(state.canvas.width / state.canvas.height - 1280 / 720) < 0.001, 'uniform aspect ratio');
                if (centered) {
                    near(state.canvas.x + state.canvas.width / 2, state.viewport.left + state.viewport.width / 2, 'horizontal centering');
                    near(state.canvas.y + state.canvas.height / 2, state.viewport.top + state.viewport.height / 2, 'vertical centering');
                }
                const input = page.locator('#characterNameInput');
                if (await input.count()) {
                    const box = await input.boundingBox();
                    near(box.x + box.width / 2, state.canvas.x + nameHost.x * state.canvas.width / 1280, 'name frame x');
                    near(box.y + box.height / 2, state.canvas.y + nameHost.y * state.canvas.height / 720, 'name frame y');
                }
                return state.canvas;
            }

            await waitScene('MenuScene');
            assert.equal(await page.evaluate(() => window.__LITTLE_MATH_GAME__.renderer.type), canvasRenderer ? 1 : 2);
            await checkAlignment();
            await capture('menu');
            await tap(host('MenuScene', 'btnNewGameNoSave'));
            await waitScene('CharacterSelectNewScene');
            const input = page.locator('#characterNameInput');
            await input.waitFor();
            await checkAlignment();
            assert.ok((await input.boundingBox()).height >= 44, 'name touch target is at least 44 CSS px');
            await capture('name');
            if (mobile) await input.tap();
            else await input.click();
            assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, 6], 'tap selects the default name');
            await page.keyboard.type('Anežka123456');
            await page.keyboard.type('x');
            assert.equal(await input.inputValue(), 'Anežka123456', 'native typing respects the 12-character limit');
            await capture('focused-name');

            if (mobile) {
                const beforeKeyboard = await checkAlignment();
                // A desktop automation browser cannot open Android/iOS's real keyboard.
                // Model its visualViewport-only resize and scroll without changing innerHeight.
                await page.evaluate(() => {
                    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 180 });
                    Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 24 });
                    Object.defineProperty(visualViewport, 'offsetLeft', { configurable: true, value: 8 });
                    visualViewport.dispatchEvent(new Event('resize'));
                    visualViewport.dispatchEvent(new Event('scroll'));
                });
                const keyboardCanvas = await checkAlignment(false);
                near(keyboardCanvas.height, beforeKeyboard.height, 'keyboard preserves readable game scale');
                const box = await input.boundingBox();
                assert.ok(box.y >= 24 && box.y + box.height <= 24 + 180 - 11, 'name remains above the keyboard');
                await page.screenshot({ path: `${output}${name}-keyboard-viewport.png`, scale: 'css', clip: { x: 8, y: 24, width: viewport.width - 8, height: 180 } });
                await page.evaluate(() => {
                    for (const key of ['height', 'offsetTop', 'offsetLeft']) delete visualViewport[key];
                    visualViewport.dispatchEvent(new Event('resize'));
                });
                await checkAlignment();
            }
            await page.keyboard.press('Enter');
            assert.equal(await input.evaluate(el => document.activeElement === el), false, 'Done dismisses focus');
            await waitScene('CharacterSelectNewScene');
            assert.equal(await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')), null, 'Done does not accidentally start play');

            if (mobile) {
                await page.setViewportSize({ width: viewport.height, height: viewport.width });
                await page.waitForTimeout(150);
                await page.setViewportSize(viewport);
                await page.waitForTimeout(150);
                await checkAlignment();
                assert.equal(await input.inputValue(), 'Anežka123456');
                await capture('rotated-back');
            }
            await tap({ x: 743, y: 290 });
            await capture('boy-selected');
            await tap({ x: 711, y: 598 });
            await waitScene('BandSelectScene');
            assert.equal(await input.count(), 0, 'scene shutdown removes the HTML input');
            await tap({ x: 360, y: 440 });
            await tap({ x: 640, y: 650 });
            await waitScene('CharacterSelectNewScene');
            await input.waitFor();
            assert.equal(await input.count(), 1);
            assert.equal(await input.inputValue(), 'Anežka123456', 'difficulty return preserves the name');
            assert.equal(await page.evaluate(() => window.__LITTLE_MATH_GAME__.scene.keys.CharacterSelectNewScene.selectedCharacter), 'boy_knight');
            await checkAlignment();
            await capture('difficulty-return');
            await tap(host('CharacterSelectNewScene', 'Green_button'));
            await input.waitFor({ state: 'detached' });
            const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')));
            assert.equal(saved.player.name, 'Anežka123456');
            assert.equal(saved.player.characterType, 'boy_knight');
            assert.equal(saved.mathStats.masteryData.selectedStartBand, 'B');
            assert.deepEqual(errors, []);
            console.log(`${name}: centering, native typing, keyboard viewport, rotation, difficulty return and saved new game passed`);
        } finally { await context.close(); }
    }
} finally { await browser.close(); }

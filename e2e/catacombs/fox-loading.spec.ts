import { test, expect, waitForScene, openSeededGame } from '../arena/helpers/arena-harness';
import { openModule, tapNamed } from './helpers/observatory';

test('the guild decodes the painted cast and shield mural before entry and reuses them on retry', async ({ page }) => {
    const completed = () => page.evaluate(() => (window as any).observatoryDecodes as string[]);
    await page.addInitScript(() => {
        const log: string[] = (window as any).observatoryDecodes = [];
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = async function () {
            const prefix = '/assets/ui/catacomb-observatory/';
            const path = new URL(this.src, location.href).pathname;
            await decode.call(this);
            if (path.startsWith(prefix)) log.push(path.slice(prefix.length));
        };
    });
    await openSeededGame(page, false, {}, {}, { unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 1 });
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const state = GameStateManager.getInstance();
        state.loadSlot(0); state.getMasteryData()!.subAtoms.A1.state = 'mastery'; state.save();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene');
    });
    await waitForScene(page, 'GuildScene');
    await expect.poll(completed).toEqual(expect.arrayContaining(['actors/fox/adjust-0.webp', 'actors/fox/adjust-1.webp', 'actors/knight/idle-0.webp']));
    await tapNamed(page, 'catacombDoorway');
    await expect.poll(completed).toEqual(expect.arrayContaining(['mural-etch-shield.webp', 'mural-shield.webp', 'mural-star-sleep.webp', 'stage-room.webp']));
    const warm = await completed();
    expect(new Set(warm).size).toBe(warm.length);
    await tapNamed(page, 'catacombEnter'); await waitForScene(page, 'FoxLessonScene');
    const prompt = () => page.waitForFunction(() => !!(window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.round?.board.getActiveProblemSnapshot());
    for (let i = 0; i < 2; i++) {
        await prompt();
        const wrong = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene, p = s.queue[s.answers.length];
            return p.choices.findIndex((value: number) => value !== p.answer);
        });
        await tapNamed(page, 'observatoryChoice' + wrong);
        await page.waitForFunction(n => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length === n, i + 1);
    }
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'retry');
    await tapNamed(page, 'foxLessonRetry'); await prompt();
    expect(await completed()).toEqual(warm);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length)).toBe(0);
});

for (const renderer of ['canvas', 'webgl']) {
    test('cold painted observatory waits for both actors and releases its textures in ' + renderer, async ({ page }) => {
        const folder = '/assets/ui/catacomb-observatory/';
        const received = new Set<string>();
        page.on('response', response => {
            const path = new URL(response.url()).pathname;
            if (response.ok() && path.startsWith(folder)) received.add(path.slice(folder.length));
        });
        let allowSheet!: () => void;
        const held = new Promise<void>(resolve => { allowSheet = resolve; });
        const sheetRequested = page.waitForRequest('**/catacomb-observatory/actors/fox/adjust-1.webp', { timeout: 90_000 });
        await page.route('**/catacomb-observatory/actors/fox/adjust-1.webp', async route => {
            await held;
            await route.continue();
        });
        const entering = openModule(page, renderer);
        try {
            await sheetRequested;
            // The child can see the room while the sheets are downloading.
            // Questions and the whole-series clock wait together for the cast.
            await page.waitForFunction(() => !!(window as any).__LITTLE_MATH_GAME__?.scene.keys.CatacombTrialScene?.children.getByName('observatory-room'));
            const loading = await page.evaluate(() => {
                const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
                return { snapshot: r.board.getActiveProblemSnapshot(), elapsed: r.batch.elapsedMs };
            });
            expect(loading).toEqual({ snapshot: null, elapsed: 0 });
        } finally {
            allowSheet();
            await entering;
        }
        for (const file of ['stage-room.webp', 'stage-planet.webp', 'mural-rescue.webp', 'mural-etch-rescue.webp',
            'mural-star-sleep.webp', 'mural-star-lit.webp', 'actors/knight/idle-0.webp', 'actors/knight/motion.json',
            'actors/fox/motion.json', 'actors/fox/adjust-0.webp', 'actors/fox/adjust-1.webp']) {
            expect(received.has(file), file).toBe(true);
        }
        const before = await page.evaluate(() => {
            const game = (window as any).__LITTLE_MATH_GAME__;
            const scene = game.scene.keys.CatacombTrialScene;
            const objects = ['observatory-room', 'observatory-fox', 'observatory-knight', 'observatory-light', 'observatory-constellation']
                .map(name => scene.children.getByName(name));
            const [room, fox, knight] = objects;
            // Project two known points on the room painting into each actor's fixed cutout.
            const isPainted = (actor: typeof fox, x: number, y: number) => {
                const ctx = actor.texture.context as CanvasRenderingContext2D;
                const world = room.getBounds(), bounds = actor.getBounds();
                return ctx.getImageData(
                    Math.round((world.x + world.width * x/1440 - bounds.x) / bounds.width * ctx.canvas.width),
                    Math.round((world.y + world.height * y/900 - bounds.y) / bounds.height * ctx.canvas.height),
                    1, 1).data[3] > 150;
            };
            return { renderer: game.renderer.type, keys: objects.map(o => o.texture.key),
                visible: objects.every(o => o.visible && o.texture.key !== '__MISSING'),
                fox: isPainted(fox, 312, 520), knight: isPainted(knight, 250, 336) };
        });
        expect(before).toMatchObject({ renderer: renderer === 'canvas' ? 1 : 2, visible: true, fox: true, knight: true });
        await tapNamed(page, 'observatoryPauseButton');
        await tapNamed(page, 'observatoryExitButton');
        await waitForScene(page, 'GuildScene');
        expect(await page.evaluate(keys => keys.filter(key => (window as any).__LITTLE_MATH_GAME__.textures.exists(key)), before.keys)).toEqual([]);
    });
}

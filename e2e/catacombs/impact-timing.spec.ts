import { test, expect, waitForScene } from '../arena/helpers/arena-harness';
import { openModule, solve, tapNamed, waitForQuestion } from './helpers/observatory';

test('a correct answer lights its star only after the fox moves the mirror and the reflected ray lands', async ({ page }) => {
    await openModule(page);
    await page.evaluate(() => {
        const round = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        const { art } = round;
        const trace = (window as any).__muralTiming = { events: [] as { name: string; time: number; state: string }[] };
        const log = (name: string) => trace.events.push({ name, time: art.time, state: art.mural.gems[0].state });
        const release = art.stage.activate.bind(art.stage);
        art.stage.activate = async (...args: unknown[]) => {
            log('mirror starts');
            const result = await release(...args);
            if (result) log('ray arrives');
            return result;
        };
        const light = art.mural.light.bind(art.mural);
        art.mural.light = (...args: unknown[]) => { light(...args); log('star lit'); };
    });
    await solve(page);
    await waitForQuestion(page);
    const timing = await page.evaluate(async () => {
        const response = await fetch('/assets/ui/catacomb-observatory/actors/fox/motion.json');
        const take = await response.json();
        return { minimum: take.releaseFrame * 1000 / take.fps, events: (window as any).__muralTiming.events };
    });
    expect(timing.events.map((event: { name: string; state: string }) => [event.name, event.state])).toEqual([
        ['mirror starts', 'waiting'], ['ray arrives', 'waiting'], ['star lit', 'earned'],
    ]);
    expect(timing.events[1].time - timing.events[0].time).toBeGreaterThan(timing.minimum);
    expect(timing.events[2].time).toBe(timing.events[1].time);
});

test('leaving during the mirror movement cancels the old star and a new visit starts with empty sockets', async ({ page }) => {
    await openModule(page, 'canvas');
    await page.evaluate(() => {
        const round = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        (window as any).__abandonedArt = round.art;
    });
    await solve(page);
    await tapNamed(page, 'observatoryPauseButton');
    await tapNamed(page, 'observatoryExitButton');
    await waitForScene(page, 'GuildScene');
    const abandoned = await page.evaluate(() => {
        const w = window as any, art = w.__abandonedArt;
        return {
            earned: art.mural.gems.filter((gem: { state: string }) => gem.state !== 'waiting').length,
            released: art.keys.every((key: string) => !w.__LITTLE_MATH_GAME__.textures.exists(key)),
            pets: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets,
        };
    });
    expect(abandoned).toEqual({ earned: 0, released: true, pets: [] });
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.scene.start(
        'CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
    await waitForQuestion(page);
    await solve(page, false);
    await solve(page);
    await waitForQuestion(page);
    expect(await page.evaluate(() => {
        const w = window as any, r = w.__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        return { fresh: r.art !== w.__abandonedArt, states: r.art.mural.gems.slice(0, 3).map((g: { state: string }) => g.state),
            old: w.__abandonedArt.mural.gems[0].state, score: r.batch.correctCount };
    })).toEqual({ fresh: true, states: ['waiting', 'earned', 'waiting'], old: 'waiting', score: 1 });
});

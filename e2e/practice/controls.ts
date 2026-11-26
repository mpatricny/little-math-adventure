import type { Page } from 'playwright/test';

export async function tapPracticeControl(page: Page, name: string): Promise<void> {
    const pt = await page.evaluate(name => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const scene = game.scene.getScenes(true).at(-1);
        const find = (o: any): any => o.name === name && o.input?.enabled ? o : o.list?.map(find).find(Boolean);
        const button = name === 'nextProblem' ? scene.mathBoard.sequentialView.next.root
            : find(scene.children) ?? scene.sceneBuilder?.get(name);
        return button.getWorldTransformMatrix().transformPoint(0, 0);
    }, name);
    const box = (await page.locator('#game-container canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + pt.x * box.width / 1280, box.y + pt.y * box.height / 720);
}

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Navigate to game
  await page.goto('http://localhost:8007');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/Users/datamole/SimpleGame/visual-tests/game/step1-menu.png' });
  console.log('Step 1: Menu captured');

  // Click NOVÁ HRA button (approximately center of screen, where the button is)
  await page.mouse.click(640, 340);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/datamole/SimpleGame/visual-tests/game/step2-after-newgame.png' });
  console.log('Step 2: After NOVÁ HRA click');

  // Click on first save slot (upper area)
  await page.mouse.click(640, 250);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/datamole/SimpleGame/visual-tests/game/step3-character-select.png' });
  console.log('Step 3: Character select scene');

  await browser.close();
  console.log('Done!');
})();

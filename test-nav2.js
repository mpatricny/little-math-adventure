const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:8007');
  await page.waitForTimeout(5000);
  
  // Click NOVÁ HRA
  await page.mouse.click(640, 340);
  await page.waitForTimeout(2000);
  
  // Click on first save slot
  await page.mouse.click(640, 250);
  await page.waitForTimeout(3000);
  
  // Full resolution screenshot
  await page.screenshot({ 
    path: '/Users/datamole/SimpleGame/visual-tests/game/character-select-full.png',
    fullPage: false
  });
  console.log('Full resolution screenshot captured');

  await browser.close();
})();

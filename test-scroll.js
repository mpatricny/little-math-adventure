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
  
  // Take a cropped screenshot of just the top area with the scroll
  await page.screenshot({ 
    path: '/Users/datamole/SimpleGame/visual-tests/game/scroll-closeup.png',
    clip: { x: 100, y: 0, width: 1080, height: 300 }
  });
  console.log('Scroll closeup captured');

  await browser.close();
})();

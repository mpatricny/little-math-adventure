import { defineConfig } from 'playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'mathboard-runtime.spec.ts',workers:1,timeout:90000,
 outputDir:'../../artifacts/mathboard-runtime',reporter:'list',
 use:{baseURL:process.env.MATHBOARD_BASE_URL ?? 'http://127.0.0.1:8001',viewport:{width:1280,height:720},hasTouch:true,
  launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']},screenshot:'only-on-failure'},
});

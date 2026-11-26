import { defineConfig } from 'vite';
import path from 'node:path';
// Standalone presentation review. No save, account, telemetry or database setup.
export default defineConfig({root:process.cwd(),publicDir:'public',server:{host:'0.0.0.0',port:8013,strictPort:true,hmr:false,watch:null},
  resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},build:{outDir:'/private/tmp/lma-mathboard-reference-build',emptyOutDir:true,copyPublicDir:false,
    rollupOptions:{input:path.resolve(process.cwd(),'docs/design-drafts/mathboard-reference-v3/index.html')}}});

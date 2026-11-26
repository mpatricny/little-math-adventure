import { defineConfig } from 'vite';
import path from 'node:path';
// Isolated preview: no save middleware, auth client, analytics or database plugins.
export default defineConfig({root:process.cwd(),publicDir:'public',server:{host:'0.0.0.0',port:8013,strictPort:true,hmr:false,watch:null},
    resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},build:{outDir:'/private/tmp/lma-mathboard-workshop-build',
    emptyOutDir:true,copyPublicDir:false,rollupOptions:{input:path.resolve(process.cwd(),'docs/design-drafts/mathboard-workshop-v2/index.html')}}});

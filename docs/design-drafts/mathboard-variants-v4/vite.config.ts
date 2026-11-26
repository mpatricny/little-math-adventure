import {defineConfig} from 'vite';
import path from 'node:path';
// Standalone presentation review; no account, save-sync or database middleware.
export default defineConfig({root:process.cwd(),publicDir:'public',server:{host:'0.0.0.0',port:8013,strictPort:true,hmr:false,watch:{ignored:['**/review/**']}},
  resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},build:{outDir:'/private/tmp/lma-mathboard-variants-build',emptyOutDir:true,copyPublicDir:false,
    rollupOptions:{input:path.resolve(process.cwd(),'docs/design-drafts/mathboard-variants-v4/index.html')}}});

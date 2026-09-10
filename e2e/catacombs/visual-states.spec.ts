import {test,expect,openSeededGame,waitForScene} from '../arena/helpers/arena-harness';

for(const renderer of ['canvas','webgl'])test(`button geometry and text bounds ${renderer}`,async({page})=>{
    if(renderer==='canvas')await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:any[]){if(type.includes('webgl'))return null;return(old as any).call(this,type,...args);}as typeof old;});
    await openSeededGame(page);
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',{examType:'mastery_challenge',subAtomId:'E1'}));
    await waitForScene(page,'CatacombTrialScene');
    for(const width of [1280,1024]){
        await page.setViewportSize({width,height:width===1280?720:768});await page.waitForTimeout(200);
        const box=(await page.locator('canvas').boundingBox())!;
        const x=box.x+797*box.width/1280,y=box.y+573*box.height/720;
        for(const state of ['normal','hover','pressed','pointer-out']){
            if(state==='hover')await page.mouse.move(x,y);
            if(state==='pressed')await page.mouse.down();
            if(state==='pointer-out'){await page.mouse.move(0,0);await page.mouse.up();}
            await page.waitForTimeout(200);
            await page.screenshot({path:`artifacts/catacombs/${renderer}-${width}-${state}.png`});
            const issues=await page.evaluate(()=>{
                const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
                const host=s.sceneBuilder.getElementDef('catacombPrimary');
                const button=s.mathBoard.modal.list.at(-2);
                const issues:string[]=[];
                if(button.x!==host.x||button.y!==host.y||button.scaleX!==1||button.scaleY!==1)issues.push('Button root moved');
                for(const id of ['catacombTitle','catacombSubtitle','catacombBody','catacombStats']){
                    const t=s.mathBoard.modal.list.find((o:any)=>o.name===id),h=s.sceneBuilder.getElementDef(id),b=t.getBounds();
                    if(b.width>h.width||b.height>h.height||t.frame.source.resolution!==2)issues.push(id);
                }
                return issues;
            });
            expect(issues).toEqual([]);
        }
    }
});

import type Phaser from 'phaser';
import { ProblemObservation } from './ProblemObservation';
import { analytics } from './AnalyticsClient';
import { gameContext } from './SceneTelemetry';
/** Flow puzzles are real arithmetic choices, not mastery drills or individual drag counts. */
export function observeFlow(scene:Phaser.Scene,kind:string,question:string,choices:number[],correctAnswer?:string|number){
    const owner=gameContext(scene.sys.settings.key);if(owner)analytics()?.setContext(owner);
    const observation=new ProblemObservation({key:`water:${kind}:${question}`,question,choices,...(correctAnswer===undefined?{}:{correctAnswer}),source:'activity',context:`underwater_${kind}`,taskKind:'arithmetic'});
    const started=performance.now();scene.events.once('shutdown',()=>observation.abandon());
    return {answer:(selected:string|number,correct:boolean,assisted:boolean)=>observation.answer(selected,correct,performance.now()-started,assisted),
        abandon:()=>observation.abandon(),assist:()=>observation.assist('puzzle_hint')};
}

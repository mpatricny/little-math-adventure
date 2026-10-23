import type { Observation } from '../../server/src/contracts/analytics';
import { analytics, type GameContext } from './AnalyticsClient';
import { gameplayId, type CapturedGameplay, type GameplayAttempt } from './gameplayData';
import type { MathProblem } from '../types';
import { formatMathProblem } from '../utils/formatMathProblem';
import { gameContext } from './SceneTelemetry';

type ProblemInfo={key:string;question:string;choices:Array<string|number>;source:'mastery'|'comparison'|'activity';context:string;
    taskKind:'arithmetic'|'comparison';form?:string;skill?:string;demo?:boolean;correctAnswer?:string|number};
const answered=new Map<string,Array<{observation:Observation;info:ProblemInfo}>>();
export function observationKey(problem:MathProblem){const m=problem.comparisonMeta;return m?`comparison:${m.stage}:${m.leftValue}:${m.rightValue}`:
    problem.masteryKey??`activity:${problem.problemType}:${problem.operand1}:${problem.operator}:${problem.operand2}:${problem.operand3??''}`;}
export function observeMathProblem(problem:MathProblem,context:string,override?:GameContext){const c=analytics();
    if(!override&&c?.isEnabled()){const owner=gameContext(c.contextSnapshot()?.scene??'BattleScene');if(owner)c.setContext(owner);}
    const comparison=problem.problemType?.startsWith('comparison');return new ProblemObservation({
    key:observationKey(problem),question:formatMathProblem(problem,'question'),choices:problem.choices.map(v=>comparison?['<','=','>'][v]:v),
    correctAnswer:comparison?['<','=','>'][problem.answer]:problem.answer,
    source:problem.comparisonMeta?'comparison':problem.masteryKey?'mastery':'activity',context,
    taskKind:comparison?'comparison':'arithmetic',skill:problem.comparisonMeta?.stage??problem.masteryKey?.split(':')[0],form:problem.masteryKey?.split(':').at(-1),
    demo:problem.comparisonMeta?.diagnosticMode===true},override);}
export function observedChoice(problem:MathProblem,value:number){return problem.problemType?.startsWith('comparison')?['<','=','>'][value]:value;}
export class ProblemObservation {
    readonly trace:Observation|null;private done=false;private owner:GameContext|null;private qualityEpoch=0;
    constructor(private info:ProblemInfo,override?:GameContext){
        const c=analytics(),context=c?.contextSnapshot();this.owner=override??context??null;this.qualityEpoch=c?.clock.qualityEpoch??0;
        const owner=this.owner;
        this.trace=context&&owner&&c?.isEnabled()&&!info.demo?{presentationId:gameplayId(),profileId:owner.profileId,runId:context.runId,
            ...(c.sessionFor(owner.participants)?{playSessionId:c.sessionFor(owner.participants)}:{}),scene:context.scene,context:info.context,role:context.role,
            sourceRelease:context.release,presentedAt:Date.now(),question:info.question,choices:[...info.choices],
            ...(info.correctAnswer===undefined?{}:{correctAnswer:info.correctAnswer}),
            assisted:false,clockQuality:'observed',taskKind:info.taskKind}:null;
        if(this.trace){this.trace.role=owner!.role;void c?.whenSessionReady().then(()=>{const session=c.sessionFor(owner!.participants);
            if(session&&this.trace)this.trace.playSessionId=session;});c?.emit('problem_presented',{presentationId:this.trace.presentationId,question:info.question,choices:info.choices,
            context:info.context,taskKind:info.taskKind,role:this.trace.role,...(info.skill?{skill:info.skill}:{})},this.trace.profileId);
        }
    }
    assist(type:string){if(!this.trace||this.done)return;this.trace.assisted=true;analytics()?.emit('assistance_shown',{
        presentationId:this.trace.presentationId,type},this.trace.profileId);}
    answer(selected:string|number,correct:boolean,gameResponseTimeMs:number,assisted=false){
        if(!this.trace)return;
        if(this.done){if(this.trace.answeredAt)analytics()?.emit('problem_corrected',{presentationId:this.trace.presentationId,selected,correct},this.trace.profileId);return;}
        this.done=true;const c=analytics();
        this.trace.answeredAt=Date.now();this.trace.selected=selected;this.trace.correct=correct;
        this.trace.playSessionId??=this.owner?c?.sessionFor(this.owner.participants):undefined;
        this.trace.responseTimeMs=gameResponseTimeMs;this.trace.assisted||=assisted;this.trace.clockQuality=(c?.clock.qualityEpoch??0)>this.qualityEpoch?'uncertain':'observed';
        const trace=structuredClone(this.trace),info=this.info,context=this.owner;if(!context)return;
        if(info.source!=='activity'){const q=answered.get(info.key)??[];q.push({observation:trace,info});answered.set(info.key,q);
            if(answered.size>200)answered.delete(answered.keys().next().value!);}
        const snapshot:CapturedGameplay={id:trace.profileId,slotNumber:context.slot+1,savedAt:trace.answeredAt!,progress:{player:{name:context.name},mathStats:{}},attempts:[]};
        const attempt:GameplayAttempt={eventKey:`attempt:${trace.presentationId}`,source:info.source,sequenceIndex:null,timestamp:trace.answeredAt!,
            problemKey:info.key,context:info.context,correct,responseTimeMs:gameResponseTimeMs,assisted:trace.assisted,
            details:{observation:trace,...(info.form?{form:info.form}:{}),...(info.skill?{subAtomId:info.skill}:{})}};
        void c?.queueAnswer(snapshot,attempt).catch(()=>{});
    }
    abandon(reason='scene_left'){if(this.done||!this.trace)return;this.done=true;analytics()?.emit('problem_abandoned',{
        presentationId:this.trace.presentationId,reason},this.trace.profileId);}
}
export function consumeObservation(problemKey:string,legacyEventKey:string,context?:string):Observation|undefined {
    const q=answered.get(problemKey);if(!q?.length)return;
    const index=context?q.findIndex(x=>x.info.context===context):0;if(index<0)return;
    const [{observation}]=q.splice(index,1);const trace={...observation,legacyEventKey};
    void analytics()?.linkAnswer(trace.profileId,trace.presentationId,legacyEventKey).catch(()=>{});return trace;
}

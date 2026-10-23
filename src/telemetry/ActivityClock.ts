import { analyticsTiming } from '../../server/src/contracts/analytics';
export type ActivityState='web-active'|'game-active'|'loading'|'paused'|'hidden'|'unobserved';
export class ActivityClock {
    totalGameMs=0; totalWebMs=0; uncertain=false; qualityEpoch=0;
    private previous:{wall:number;mono:number;state:ActivityState}|null=null;
    sample(wall:number,mono:number,state:ActivityState) {
        const prior=this.previous;this.previous={wall,mono,state};if(!prior)return null;
        const delta=mono-prior.mono;
        if(delta<0||delta>analyticsTiming.maxTickGapMs||Math.abs((wall-prior.wall)-delta)>2000){this.uncertain=true;this.qualityEpoch++;return null;}
        if(prior.state==='game-active')this.totalGameMs+=delta;
        if(prior.state==='web-active')this.totalWebMs+=delta;
        return {start:prior.wall,end:wall,durationMs:delta,state:prior.state,uncertain:false,
            cumulativeMs:prior.state==='web-active'?this.totalWebMs:this.totalGameMs};
    }
}

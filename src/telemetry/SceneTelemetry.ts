import type Phaser from 'phaser';
import type { SaveSlotData } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { SaveSystem } from '../systems/SaveSystem';
import { analytics, type GameContext } from './AnalyticsClient';
import { gameplayId } from './gameplayData';

const menus=new Set(['MenuNewScene','MenuScene','SaveSlotScene','CharacterSelectNewScene','CoopSetupScene','BandSelectScene','PlacementScene']);
export function gameContext(scene:string,role?:'A'|'B'):GameContext|null {
    const game=GameStateManager.getInstance(),coop=CoopSessionManager.getInstance();
    const active=role??(coop.isCoopActive()?coop.getActivePlayer():'A');
    const slots=coop.isCoopActive()?[{role:'A' as const,slot:coop.getPlayerASlotIndex()},{role:'B' as const,slot:coop.getPlayerBSlotIndex()}]:
        [{role:'A' as const,slot:game.getActiveSlotIndex()}];
    const owners=slots.flatMap(p=>{if(p.slot===null||p.slot<0)return [];const save=SaveSystem.load(p.slot);
        return save?.player.gameplayProfileId?[{...p,slot:p.slot,profileId:save.player.gameplayProfileId,name:save.player.name}]:[];});
    const owner=owners.find(p=>p.role===active);if(!owner)return null;
    return {...owner,scene,participants:owners.map(p=>({role:p.role,profileId:p.profileId}))};
}
export function regionForScene(scene:string){return /Underwater|Silverpond/.test(scene)?'silverpond':/Forest|GuardianLair/.test(scene)?'forest':
    /Catacomb/.test(scene)?'catacombs':/Town|Guild|Forge|Shop|Workshop|Witch|Mana|Arena/.test(scene)?'mathoria':'story';}
export function prepareSceneTelemetry(scene:Phaser.Scene){
    const key=scene.sys.settings.key,c=analytics();if(!c)return;
    if(menus.has(key)){c.end('menu');return;}
    const owner=gameContext(key);if(owner){c.setContext(owner);void c.begin(owner).catch(()=>{});}
}
export function readySceneTelemetry(scene:Phaser.Scene){
    const key=scene.sys.settings.key,c=analytics();if(!c)return;
    c.setLoading(false);
    if(menus.has(key)){if(key==='MenuNewScene'||key==='MenuScene')c.menuReady(key);return;}
    const state=scene as unknown as {roomId?:string;encounterId?:string;returnScene?:string;mockBattle?:boolean};
    c.scene(key,regionForScene(state.returnScene??key),state.roomId);
    if(key==='BattleScene'&&!(scene as any).mockMode){const id=gameplayId();scene.registry.set('analyticsEncounter',id);
        scene.registry.set('analyticsEncounterId',state.encounterId??'legacy-battle');
        c.emit('encounter_started',{encounter:state.encounterId??'legacy-battle',scene:key},undefined,id);}
    const pause=()=>c.setPaused(true),resume=()=>c.setPaused(false);
    scene.events.on('pause',pause);scene.events.on('resume',resume);
    scene.events.once('shutdown',()=>{c.emit('scene_left',{scene:key},c.contextSnapshot()?.profileId);
        scene.events.off('pause',pause);scene.events.off('resume',resume);c.setPaused(false);});
}
export function finishEncounter(scene:Phaser.Scene,result:'victory'|'defeat'){
    const id=scene.registry.get('analyticsEncounter');if(!id)return;
    scene.registry.remove('analyticsEncounter');analytics()?.emit('encounter_finished',{result,scene:scene.sys.settings.key,
        encounter:scene.registry.get('analyticsEncounterId')??'legacy-battle'},undefined,id);
}
const progress=new Map<string,Map<string,string>>();
export function observeProgress(save:SaveSlotData){
    const id=save.player.gameplayProfileId;if(!id)return;
    const prior=progress.get(id),now=new Map<string,string>();
    for(const [skill,state]of Object.entries(save.mathStats.masteryData?.subAtoms??{})){
        now.set(skill,state.state);if(prior?.has(skill)&&prior.get(skill)!==state.state)
            analytics()?.emit('skill_changed',{skill,before:prior.get(skill),after:state.state,origin:'earned'},id);
    }
    const chapter=save.mathStats.masteryData?.comparisonChapter;if(chapter)now.set('comparison',chapter.status);
    if(prior?.has('comparison')&&prior.get('comparison')!==now.get('comparison'))
        analytics()?.emit('skill_changed',{skill:'comparison',before:prior.get('comparison'),after:now.get('comparison'),origin:'earned'},id);
    const story=save.player.storyProgress as unknown as Record<string,unknown>|undefined;
    for(const field of ['hasDefeatedVerdantGuardian','hasClaimedForestCrystal','hasInstalledForestCrystal','hasUnlockedSilverpond','hasFreedLakeFairy','hasWaterBreathingScale']){
        now.set(field,String(story?.[field]??false));if(prior?.has(field)&&prior.get(field)!==now.get(field)&&story?.[field])
            analytics()?.milestone(field,analytics()?.contextSnapshot()?.participants??[{role:'A',profileId:id}]);
    }
    progress.set(id,now);
}

import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { pick, pickPuzzle } from './puzzles/PuzzleRandom';
export type LightPoint = { x: number; y: number };
export interface LightChallenge {
    layoutVersion?: number;
    width: number; height: number; source: LightPoint; target: LightPoint; direction: LightPoint;
    mirrors: LightPoint[]; lamps: LightPoint[]; initial: number[]; allowedTurns?: number[];
}
// Retained only for loading old test fixtures. Production receives an explicit generated board.
export const LIGHT_MIRRORS: readonly LightPoint[] = [{x:2,y:2},{x:2,y:0},{x:5,y:0},{x:5,y:2}];
export const LIGHT_LAMPS: readonly LightPoint[] = [{x:3,y:0},{x:4,y:0}];
export const LIGHT_START=[3,1,2,0];
export const LEGACY_LIGHT:LightChallenge={width:7,height:3,source:{x:0,y:2},target:{x:7,y:2},direction:{x:1,y:0},mirrors:[...LIGHT_MIRRORS],lamps:[...LIGHT_LAMPS],initial:LIGHT_START};
export function traceUnderwaterLight(turns:readonly number[],c:LightChallenge=LEGACY_LIGHT) {
    const points:LightPoint[]=[c.source],lit:number[]=[];
    let {x,y}=c.source,dx=c.direction.x,dy=c.direction.y;
    const visited=new Set<string>();
    for(let step=0;step<(c.width+1)*(c.height+1)*4;step++) {
        x+=dx;y+=dy;if(x<0||x>c.width||y<0||y>c.height)break;
        points.push({x,y});const key=`${x},${y},${dx},${dy}`;if(visited.has(key))break;visited.add(key);
        const lamp=c.lamps.findIndex(p=>p.x===x&&p.y===y);if(lamp>=0&&!lit.includes(lamp))lit.push(lamp);
        if(x===c.target.x&&y===c.target.y)return{points,lit,reachesPearl:true,solved:lit.length===c.lamps.length};
        const i=c.mirrors.findIndex(p=>p.x===x&&p.y===y);if(i<0)continue;
        const turn=turns[i];
        if(turn===0)[dx,dy]=[-dy,-dx];else if(turn===1)[dx,dy]=[dy,dx];
        else if(turn===2&&dx!==0||turn===3&&dy!==0||![0,1,2,3].includes(turn))break;
    }return{points,lit,reachesPearl:false,solved:false};
}
export function lightSolutions(c:LightChallenge):number[][] {
    const result:number[][]=[];
    const allowed = c.allowedTurns ?? [0, 1, 2, 3];
    for(let code=0;code<allowed.length**c.mirrors.length;code++) {
        const turns=c.mirrors.map((_,i)=>allowed[Math.floor(code/allowed.length**i)%allowed.length]);
        if(traceUnderwaterLight(turns,c).solved)result.push(turns);
    }return result;
}
export function underwaterLightHint(turns:readonly number[],c:LightChallenge=LEGACY_LIGHT):{index:number;turn:number}|null {
    if(traceUnderwaterLight(turns,c).solved)return null;
    const solutions=lightSolutions(c).sort((a,b)=>a.filter((v,i)=>v!==turns[i]).length-b.filter((v,i)=>v!==turns[i]).length);
    const solution=solutions[0];if(!solution)return null;
    const index=turns.findIndex((v,i)=>v!==solution[i]);return index<0?null:{index,turn:solution[index]};
}
export const LIGHT_LAYOUT_VERSION = 2;
/** Older saved boards may contain disconnected mirrors; replace their payload and interaction state together. */
export function isCurrentLightChallenge(payload: unknown): payload is LightChallenge {
    return !!payload && typeof payload === 'object' && 'layoutVersion' in payload && payload.layoutVersion === LIGHT_LAYOUT_VERSION;
}

const pointKey = (p: LightPoint) => `${p.x},${p.y}`;

/** Ignore stretched spacing and vertical reflections when counting distinct optical layouts. */
export function lightLayoutKey(board: LightChallenge): string {
    const identity = (flip: boolean) => {
        const points = [board.source, board.target, ...board.mirrors, ...board.lamps]
            .map(p => ({ x: p.x, y: flip ? board.height - p.y : p.y }));
        const xs = [...new Set(points.map(p => p.x))].sort((a, b) => a - b);
        const ys = [...new Set(points.map(p => p.y))].sort((a, b) => a - b);
        const key = (p: LightPoint) => `${xs.indexOf(p.x)},${ys.indexOf(p.y)}`;
        return JSON.stringify([key(points[0]), key(points[1]), points.slice(2, 6).map(key).sort(), points.slice(6).map(key).sort()]);
    };
    return [identity(false), identity(true)].sort()[0];
}

/** Every board is a continuous four-bend route, with pearls on two different legs. */
export function lightPool():readonly LightChallenge[] {
    return lightBoards;
}
function makeLightBoards(): LightChallenge[] {
    const pool = new Map<string, LightChallenge>();
    const rows = [0, 1, 2, 3, 4], columns = [2, 4, 6];
    const spread = (c: LightChallenge) => (Math.max(...c.mirrors.map(p => p.y)) - Math.min(...c.mirrors.map(p => p.y))) * (c.width + 1)
        + Math.abs(c.mirrors[0].x - c.mirrors[2].x);
    // Construct the solution first. Each mirror is a bend between two aligned legs;
    // distinct entry/exit rows and a non-crossing route prevent pass-through shortcuts.
    for (const a of columns) for (const b of columns) {
        if (a === b) continue;
        for (const entry of rows) for (const middle of rows) for (const exit of rows) {
            if (new Set([entry, middle, exit]).size !== 3) continue;
            const source = { x: 0, y: entry }, target = { x: 8, y: exit };
            const mirrors = [{ x: a, y: entry }, { x: a, y: middle }, { x: b, y: middle }, { x: b, y: exit }];
            const vertices = [source, ...mirrors, target], points = [source], legs: LightPoint[][] = [];
            for (let i = 0; i < vertices.length - 1; i++) {
                const from = vertices[i], to = vertices[i + 1];
                const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y), leg: LightPoint[] = [];
                for (let x = from.x + dx, y = from.y + dy; ; x += dx, y += dy) {
                    points.push({ x, y });
                    if (x === to.x && y === to.y) break;
                    leg.push({ x, y });
                }
                legs.push(leg);
            }
            if (new Set(points.map(pointKey)).size !== points.length) continue;
            // Exclude the source leg. The two pearls must reward progress along different legs.
            for (let first = 1; first < legs.length; first++) for (let second = first + 1; second < legs.length; second++) {
                for (const one of legs[first]) for (const two of legs[second]) {
                    const board: LightChallenge = { layoutVersion: LIGHT_LAYOUT_VERSION, width: 8, height: 4,
                        source, target, direction: { x: 1, y: 0 }, mirrors, lamps: [one, two], initial: [0, 0, 0, 0] };
                    const key = lightLayoutKey(board), existing = pool.get(key);
                    // Spread equivalent copies over the board instead of crowding one corner.
                    if (!existing || spread(board) > spread(existing)) pool.set(key, board);
                }
            }
        }
    }
    if (pool.size < 20) throw new Error('Optical catalog has fewer than twenty distinct layouts');
    return [...pool.values()];
}
const lightBoards = makeLightBoards();
export function underwaterLightChallenge(p?:PuzzleProfile,rng:PuzzleRng=Math.random):LightChallenge {
    const board = pickPuzzle(lightBoards, rng), tier = p?.tier ?? 3;
    const allowedTurns = [0, 1, 2, 3].slice(0, tier + 1);
    const solution = lightSolutions(board)[0], starts: number[][] = [];
    // Two/three/four distinct mirrors must change at tiers 1/2/3. Draw uniformly
    // from all such starts; retries or repairing only a solved start bias the draw.
    for (let code = 0; code < allowedTurns.length ** board.mirrors.length; code++) {
        const turns = board.mirrors.map((_, i) => allowedTurns[Math.floor(code / allowedTurns.length ** i) % allowedTurns.length]);
        if (turns.filter((turn, i) => turn !== solution[i]).length === tier + 1) starts.push(turns);
    }
    // Saves and controls own their payload; callers must not mutate the shared catalog.
    return { ...board, source: { ...board.source }, target: { ...board.target }, direction: { ...board.direction },
        mirrors: board.mirrors.map(p => ({ ...p })), lamps: board.lamps.map(p => ({ ...p })), initial: [...pick(starts, rng)], allowedTurns };
}

import tuning from '../data/underwater-descent.json';
export const DESCENT = tuning;

export function descentHitHp(hp: number): number {
    return Math.max(Math.min(hp, DESCENT.minimumHp), hp - DESCENT.damage);
}

export function descentCollides(player: { x: number; y: number }, fish: { x: number; y: number; radius: number }): boolean {
    return Math.pow((player.x - fish.x) / (fish.radius + 25), 2)
        + Math.pow((player.y - fish.y) / (fish.radius + 40), 2) < 1;
}

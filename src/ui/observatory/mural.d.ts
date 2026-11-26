export type ObservatoryReward = 'rescue' | 'attack' | 'rune' | 'shield' | 'heal' | 'strike';
export const constellations: Record<ObservatoryReward, { label: string; color: string; points: [number, number][] }>;
export function pointsFor(reward: ObservatoryReward, count: number): [number, number][];
export function illustration(reward: ObservatoryReward, etched: boolean): string;
export function artUrl(name: string): string;

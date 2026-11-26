import type { ObservatoryReward } from './mural.js';

export function retainObservatoryAssets(): () => void;
export function warmObservatory(reward?: ObservatoryReward): void;
export function observatoryAssets(): {
    room(): Promise<HTMLImageElement>;
    mural(reward: ObservatoryReward): Promise<HTMLImageElement[]>;
};

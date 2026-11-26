export interface StagePoint { x: number; y: number }
interface StageOptions { color?: string; assisted?: boolean }
export function createStage(host: HTMLElement | null, surface?: {
    canvas: HTMLCanvasElement;
    paintActor?(name: 'knight' | 'fox', rect: readonly [number, number, number, number],
        draw: (ctx: CanvasRenderingContext2D) => void): void;
    painted(time: number, lightChanged: boolean): void;
}): {
    ready: Promise<void>;
    room: Promise<HTMLImageElement>;
    aimAt(point: StagePoint, options?: StageOptions): void;
    activate(point: StagePoint, options?: StageOptions): Promise<boolean>;
    setSky(fraction: number): void;
    setPaused(value: boolean): void;
    finish(passed: boolean): void;
    destroy(): void;
};

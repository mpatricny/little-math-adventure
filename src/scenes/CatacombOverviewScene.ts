import Phaser from 'phaser';
import type { PracticeTargetId } from '../types';
import { CatacombProgressOverlay, takeFoxReward, type FoxRewardArrival } from '../ui/CatacombProgressOverlay';

/** Keep the battle receipt asleep while the child visits their module or takes a trial. */
export class CatacombOverviewScene extends Phaser.Scene {
    private entry!: { targetId: PracticeTargetId; ownerSlot: number };

    constructor() { super({ key: 'CatacombOverviewScene' }); }

    init(data: typeof this.entry): void {
        if (data?.targetId) this.entry = data;
    }

    create(data?: { foxReward?: FoxRewardArrival }): void {
        const overview = new CatacombProgressOverlay(this, () => {
            this.scene.stop();
            this.scene.wake('VictoryScene');
        });
        const arrival = takeFoxReward(data);
        if (arrival) overview.show(arrival.target, arrival.slot, arrival.reward);
        else overview.show(this.entry.targetId, this.entry.ownerSlot);
    }
}

export type ForestGuardianReturnData = Record<string, unknown>;

export interface ForestGuardianJourneyPort {
    setObjectState(
        roomId: string,
        objectId: string,
        state: { interacted: boolean; defeated: boolean }
    ): void;
    getJourneyState(): { completed: boolean } | null;
    completeRoomJourney(): void;
}

/**
 * Persist the production forest-boss result before the story flow leaves the
 * journey scenes. Returns true only when this call completes the journey.
 */
export function completeForestGuardianJourneyProgress(
    journeySystem: ForestGuardianJourneyPort,
    returnData: ForestGuardianReturnData
): boolean {
    const roomId = typeof returnData.roomId === 'string'
        ? returnData.roomId
        : null;
    const defeatedObjectId = typeof returnData.defeatedObjectId === 'string'
        ? returnData.defeatedObjectId
        : null;
    if (!roomId || !defeatedObjectId) return false;

    journeySystem.setObjectState(roomId, defeatedObjectId, {
        interacted: true,
        defeated: true,
    });

    if (journeySystem.getJourneyState()?.completed === true) {
        return false;
    }

    journeySystem.completeRoomJourney();
    return true;
}

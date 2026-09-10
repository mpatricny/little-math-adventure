export type ForestRoomRouteDefinition = {
    sceneClass?: unknown;
};

export type ForestRoomRouteCatalog = {
    rooms?: Record<string, ForestRoomRouteDefinition>;
};

/**
 * Resolve the runtime scene for a room from forest-rooms.json.
 *
 * Keeping this lookup in one place prevents custom rooms from silently falling
 * back to ForestRoomScene when entered through a puzzle, save point, or another
 * custom room.
 */
export function resolveForestRoomSceneKey(
    catalog: ForestRoomRouteCatalog | null | undefined,
    roomId: string,
): string {
    const configuredScene = catalog?.rooms?.[roomId]?.sceneClass;
    return typeof configuredScene === 'string' && configuredScene.trim().length > 0
        ? configuredScene
        : 'ForestRoomScene';
}

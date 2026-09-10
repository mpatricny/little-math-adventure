export const BATTLE_MOCK_LAYOUT_SCENE = 'BattleScene';
export const BATTLE_MOCK_TARGET_ROTATION = 135;

export type BattleMockSpriteSpec = {
    hostId: string;
    texture: string;
    animation: string;
    scale: number;
};

export const BATTLE_MOCK_PLAYER_SPRITES = {
    heroA: {
        hostId: 'battleMockHero',
        texture: 'knight-idle-sheet',
        animation: 'knight-idle',
        scale: 1,
    },
    petA: {
        hostId: 'battleMockPet',
        texture: 'slime-sheet',
        animation: 'slime-idle',
        scale: 0.5,
    },
    heroB: {
        hostId: 'battleMockHeroB',
        texture: 'boy-knight-idle-sheet',
        animation: 'boy-knight-idle',
        scale: 1.35,
    },
    petB: {
        hostId: 'battleMockPetB',
        texture: 'pink-idle-sheet',
        animation: 'pink-idle',
        scale: 0.5,
    },
} as const satisfies Record<string, BattleMockSpriteSpec>;

export const BATTLE_MOCK_ENEMY_SPRITES = [
    {
        hostId: 'battleMockEnemy',
        texture: 'silverpond-frog-enemy-idle-sheet',
        animation: 'silverpond-frog-enemy-idle',
        scale: 0.42,
    },
    {
        hostId: 'battleMockEnemy2',
        texture: 'pink-idle-sheet',
        animation: 'pink-idle',
        scale: 1,
    },
    {
        hostId: 'battleMockEnemy3',
        texture: 'leafy-idle-sheet',
        animation: 'leafy-idle',
        scale: 1,
    },
] as const satisfies readonly BattleMockSpriteSpec[];

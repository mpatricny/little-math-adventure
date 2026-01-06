import { CharacterType } from '../types';

export interface PlayerSpriteConfig {
    idleTexture: string;
    attackTexture: string;
    idleAnim: string;
    attackAnim: string;
    walkAnim: string;
    defendAnim: string;
}

const SPRITE_CONFIGS: Record<CharacterType, PlayerSpriteConfig> = {
    'girl_knight': {
        idleTexture: 'knight-idle-sheet',
        attackTexture: 'knight-attack-sheet',
        idleAnim: 'knight-idle',
        attackAnim: 'knight-attack',
        walkAnim: 'knight-walk',
        defendAnim: 'knight-defend'
    },
    'boy_knight': {
        idleTexture: 'boy-knight-idle-sheet',
        attackTexture: 'boy-knight-attack-sheet',
        idleAnim: 'boy-knight-idle',
        attackAnim: 'boy-knight-attack',
        walkAnim: 'boy-knight-walk',
        defendAnim: 'boy-knight-defend'
    }
};

export function getPlayerSpriteConfig(characterType: CharacterType | undefined): PlayerSpriteConfig {
    return SPRITE_CONFIGS[characterType || 'girl_knight'] || SPRITE_CONFIGS['girl_knight'];
}

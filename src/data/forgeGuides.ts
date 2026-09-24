import type { GuidePage, GuideToken } from '../ui/VisualGuide';

export type ForgeOperation = 'merge' | 'split' | 'createFragment' | 'splitFragment' | 'refine' | 'createPrism';
const gem = (value: number, frame = 1): GuideToken => ({ texture: 'gemstone-icons', frame, value });

export const FORGE_GUIDES: Record<ForgeOperation, Omit<GuidePage, 'target'>> = {
    merge: { id: 'forge.merge.v1', title: 'SPOJIT', voiceId: 'vo.guide.forge.merge',
        before: [gem(2), gem(3)], after: [gem(5)], equation: '2 + 3 → 5' },
    split: { id: 'forge.split.v1', title: 'ROZDĚLIT', voiceId: 'vo.guide.forge.split',
        before: [gem(5)], after: [gem(2), gem(3)], equation: '5 − 2 → 3' },
    createFragment: { id: 'forge.createFragment.v1', title: 'VYTVOŘIT FRAGMENT', voiceId: 'vo.guide.forge.fragment',
        before: [gem(2), gem(3), gem(4)], after: [gem(9, 3)], equation: '2 + 3 + 4 → 9' },
    splitFragment: { id: 'forge.splitFragment.v1', title: 'ROZDĚLIT FRAGMENT', voiceId: 'vo.guide.forge.splitFragment',
        before: [gem(9, 3)], after: [gem(2), gem(3), gem(4)], equation: '9 − 2 − 3 → 4' },
    refine: { id: 'forge.refine.v1', title: 'ODSEKAT', voiceId: 'vo.guide.forge.refine',
        before: [gem(9, 3)], after: [gem(6, 3), gem(3)], equation: '9 − 3 → 6' },
    createPrism: { id: 'forge.createPrism.v1', title: 'VYTVOŘIT PRIZMA', voiceId: 'vo.guide.forge.prism',
        before: [gem(12), gem(13, 3)], after: [gem(5, 5)], equation: '12 + 13 − 20 → 5' },
};

import { PythiaWorkshopScene } from './PythiaWorkshopScene';

/**
 * Silverpond-themed production workshop. The legacy scene key is retained so
 * existing scene-editor data and saves remain compatible.
 */
export class SilverpondPythiaWorkshopMockScene extends PythiaWorkshopScene {
    constructor() {
        super({
            key: 'SilverpondPythiaWorkshopMockScene',
            layoutSceneKey: 'PythiaWorkshopScene',
            backSceneKey: 'SilverpondTownMockScene',
            backgroundTexture: 'silverpond-pythia-workshop-mock-bg',
            persistChanges: true,
        });
    }
}

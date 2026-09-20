import { DEV_TOOLS_ENABLED, IS_PILOT } from './config/buildVariant';
import { SceneAssetPlugin } from './systems/SceneAssetPlugin';
import { SceneAudioPlugin } from './audio/SceneAudioPlugin';
import { destroyGameAudio } from './audio/AudioDirector';
import Phaser from 'phaser';
import { setupMobile } from './utils/mobileSetup';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, SaveSlotData, SubAtomId } from './types';
import { mountRemoteControllerApp } from './remote/controllerApp';
import { isControllerMode, isTvMode } from './remote/remoteMode';

if (isControllerMode()) {
    mountRemoteControllerApp();
} else {
    void startGame();
}

async function startGame(): Promise<void> {
    const { GAME_SCENES } = IS_PILOT
        ? await import('./config/pilotScenes')
        : await import('./config/developmentScenes');
    setupMobile();

    const SAVE_DATA_PREFIX = 'littleMathAdventure_slot_';
    const T4_REPAIR_MARKER = 'littleMathAdventure_repair_t4_band_e_v1';

    function repairBrokenT4BandPlacement(): void {
        if (typeof localStorage === 'undefined') {
            return;
        }

        if (localStorage.getItem(T4_REPAIR_MARKER) === 'done') {
            return;
        }

        const targetBand: BandId = 'E';
        const targetIndex = ALL_BANDS.indexOf(targetBand);
        let repaired = false;

        for (let slotIndex = 0; slotIndex < 8; slotIndex++) {
            const key = `${SAVE_DATA_PREFIX}${slotIndex}`;
            const raw = localStorage.getItem(key);
            if (!raw) {
                continue;
            }

            try {
                const save = JSON.parse(raw) as SaveSlotData;
                const masteryData = save.mathStats?.masteryData;
                if (save.player?.name !== 'T4' || !masteryData?.bands || !masteryData?.subAtoms) {
                    continue;
                }

                if (masteryData.selectedStartBand === targetBand && masteryData.bands[targetBand]?.state !== 'locked') {
                    repaired = true;
                    continue;
                }

                for (let bandIndex = 0; bandIndex < ALL_BANDS.length; bandIndex++) {
                    const band = ALL_BANDS[bandIndex];
                    const isBeforeTarget = bandIndex < targetIndex;
                    const isTarget = band === targetBand;

                    masteryData.bands[band].state = isBeforeTarget ? 'secure' : (isTarget ? 'training' : 'locked');
                    masteryData.bands[band].gateExamBestMedal = isBeforeTarget ? 'bronze' : null;
                    masteryData.bands[band].bandMasteryChallengeResult = null;

                    for (const num of ALL_SUB_ATOM_NUMBERS) {
                        const subAtomId = `${band}${num}` as SubAtomId;
                        const subAtom = masteryData.subAtoms[subAtomId];

                        if (isBeforeTarget) {
                            subAtom.state = 'secure';
                            subAtom.successfulSolves = Math.max(subAtom.successfulSolves ?? 0, 20);
                            subAtom.examBestMedal = subAtom.examBestMedal ?? 'bronze';
                        } else if (isTarget && num === 1) {
                            subAtom.state = 'training';
                            subAtom.successfulSolves = 0;
                            subAtom.examBestMedal = null;
                        } else {
                            subAtom.state = 'locked';
                            subAtom.successfulSolves = 0;
                            subAtom.examBestMedal = null;
                        }

                        subAtom.fluencyChallengeResult = null;
                        subAtom.masteryChallengeResult = null;
                        subAtom.fightsSinceSeen = 0;
                    }
                }

                masteryData.selectedStartBand = targetBand;
                masteryData.currentPool = [];
                masteryData.currentPoolIndex = 0;
                masteryData.lastPoolProblems = [];
                masteryData.coopAutoPromotionBases ??= {};
                save.player.level = 1;
                save.timestamp = Date.now();
                localStorage.setItem(key, JSON.stringify(save));
                repaired = true;
            } catch (error) {
                console.warn('[main] Failed to repair T4 save band placement', error);
            }
        }

        if (repaired) {
            localStorage.setItem(T4_REPAIR_MARKER, 'done');
        }
    }

    if (DEV_TOOLS_ENABLED) repairBrokenT4BandPlacement();

    const forceCanvasRenderer = new URLSearchParams(window.location.search).get('renderer') === 'canvas';
    const config: Phaser.Types.Core.GameConfig = {
        plugins: { scene: [{ key: 'sceneAssets', plugin: SceneAssetPlugin, mapping: 'sceneAssets' }, { key: 'sceneAudio', plugin: SceneAudioPlugin, mapping: 'sceneAudio' }] },
        type: isTvMode() || forceCanvasRenderer ? Phaser.CANVAS : Phaser.AUTO,
        width: 1280,
        height: 720,
        parent: 'game-container',
        backgroundColor: '#2d2d2d',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: {
            activePointers: 2,
        },
        render: {
            antialias: true,
            roundPixels: false,
            transparent: false,
            powerPreference: 'high-performance',
        },
        dom: {
            createContainer: true
        },
        scene: GAME_SCENES,
    };

    const game = new Phaser.Game(config);
    game.events.once(Phaser.Core.Events.DESTROY, destroyGameAudio);
    if (DEV_TOOLS_ENABLED) (globalThis as any).__LITTLE_MATH_GAME__ = game;
}

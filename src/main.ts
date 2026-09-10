import { AudioSettingsScene } from './scenes/AudioSettingsScene';
import { SceneAudioPlugin } from './audio/SceneAudioPlugin';
import { destroyGameAudio } from './audio/AudioDirector';
import Phaser from 'phaser';
import { setupMobile } from './utils/mobileSetup';
import { BootScene, AssetLoaderScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MenuNewScene } from './scenes/MenuNewScene';
import { SaveSlotScene } from './scenes/SaveSlotScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { CharacterSelectNewScene } from './scenes/CharacterSelectNewScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { ArenaScene } from './scenes/ArenaScene';
import { SilverpondArenaMockScene } from './scenes/SilverpondArenaMockScene';
import { VictoryScene } from './scenes/VictoryScene';
import { WitchHutScene } from './scenes/WitchHutScene';
import { PythiaWorkshopScene } from './scenes/PythiaWorkshopScene';
import { SilverpondPythiaWorkshopMockScene } from './scenes/SilverpondPythiaWorkshopMockScene';
import { ShopScene } from './scenes/ShopScene';
import { SilverpondShopMockScene } from './scenes/SilverpondShopMockScene';
import { SilverpondGuildMockScene } from './scenes/SilverpondGuildMockScene';
import { GuildScene } from './scenes/GuildScene';
import { GuildExamMockScene } from './scenes/GuildExamMockScene';
import { TavernScene } from './scenes/TavernScene';
import { CrystalForgeScene } from './scenes/CrystalForgeScene';
import { SilverpondCrystalForgeMockScene } from './scenes/SilverpondCrystalForgeMockScene';
import { MathBoardDebugScene } from './scenes/MathBoardDebugScene';
import { TestingTownScene } from './scenes/TestingTownScene';
import { TestingWitchHutScene } from './scenes/TestingWitchHutScene';
import { AssetFactoryTestScene } from './scenes/AssetFactoryTestScene';
import { GuardianLairMockScene, GuardianLairScene } from './scenes/GuardianLairMockScene';
import { SilverpondTownMockScene } from './scenes/SilverpondTownMockScene';
import { SilverpondFairyRewardScene } from './scenes/SilverpondFairyRewardScene';
import { ArenaUiMockScene } from './scenes/ArenaUiMockScene';
import { BattleUiMockScene } from './scenes/BattleUiMockScene';
import { ForestCrystalRewardScene } from './scenes/ForestCrystalRewardScene';
import { ZyxRocketInterludeScene } from './scenes/ZyxRocketInterludeScene';
import { ZyxCrystalMachineScene } from './scenes/ZyxCrystalMachineScene';
import { ForestAdventureStartScene } from './scenes/ForestAdventureStartScene';
import { ForestMapScene } from './scenes/ForestMapScene';
import { ForestPuzzleScene } from './scenes/ForestPuzzleScene';
import { ForestRoomScene } from './scenes/ForestRoomScene';
import { LetterLockPuzzleScene } from './scenes/LetterLockPuzzleScene';
import { SpinLockPuzzleScene } from './scenes/SpinLockPuzzleScene';
import { ForestCampScene } from './scenes/ForestCampScene';
import { ForestRiddleScene } from './scenes/ForestRiddleScene';
import { ComicScene } from './scenes/ComicScene';
import { CrashSiteScene } from './scenes/CrashSiteScene';
import { BandSelectScene } from './scenes/BandSelectScene';
import { CatacombTrialScene } from './scenes/CatacombTrialScene';
import { ManaCollectionScene } from './scenes/ManaCollectionScene';
import { CoopSetupScene } from './scenes/CoopSetupScene';
import { TvPairingScene } from './scenes/TvPairingScene';
import { UnderwaterRoomScene } from './scenes/UnderwaterRoomScene';
import { UnderwaterDescentScene } from './scenes/UnderwaterDescentScene';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, SaveSlotData, SubAtomId } from './types';
import { mountRemoteControllerApp } from './remote/controllerApp';
import { isControllerMode, isTvMode } from './remote/remoteMode';

if (isControllerMode()) {
    mountRemoteControllerApp();
} else {
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

repairBrokenT4BandPlacement();

const config: Phaser.Types.Core.GameConfig = {
    plugins: { scene: [{ key: 'sceneAudio', plugin: SceneAudioPlugin, mapping: 'sceneAudio' }] },
    type: isTvMode() ? Phaser.CANVAS : Phaser.AUTO,
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
    scene: [BootScene, AudioSettingsScene, UnderwaterRoomScene, UnderwaterDescentScene, AssetLoaderScene, MenuScene, MenuNewScene, SaveSlotScene, CharacterSelectScene, CharacterSelectNewScene, BandSelectScene, TownScene, TestingTownScene, TestingWitchHutScene, BattleScene, ArenaScene, SilverpondArenaMockScene, VictoryScene, WitchHutScene, PythiaWorkshopScene, SilverpondPythiaWorkshopMockScene, ShopScene, SilverpondShopMockScene, GuildScene, GuildExamMockScene, SilverpondGuildMockScene, TavernScene, CrystalForgeScene, SilverpondCrystalForgeMockScene, MathBoardDebugScene, AssetFactoryTestScene, GuardianLairScene, GuardianLairMockScene, SilverpondTownMockScene, SilverpondFairyRewardScene, ArenaUiMockScene, BattleUiMockScene, ForestCrystalRewardScene, ZyxRocketInterludeScene, ZyxCrystalMachineScene, ForestAdventureStartScene, ForestMapScene, ForestPuzzleScene, ForestRoomScene, LetterLockPuzzleScene, SpinLockPuzzleScene, ForestCampScene, ForestRiddleScene, ComicScene, CrashSiteScene, CatacombTrialScene, ManaCollectionScene, CoopSetupScene, TvPairingScene],
};

const game = new Phaser.Game(config);
game.events.once(Phaser.Core.Events.DESTROY, destroyGameAudio);
(globalThis as any).__LITTLE_MATH_GAME__ = game;
}

import Phaser from 'phaser';
import { gameAudio, sfx, voice } from './AudioDirector';

export function sceneMusic(key: string, boss = false): string | null {
    if (key === 'AudioSettingsScene') return null;
    if (key === 'BattleScene') return boss ? 'm06_guardian' : 'm05_battle';
    if (key.startsWith('Underwater')) return 'm09_underwater';
    if (/Pythia|WitchHut|CrystalForge|ZyxCrystalMachine|ManaCollection|Catacomb|GuildExam/.test(key)) return 'm03_crystal_workshop';
    if (/FairyReward|ForestCrystalReward|ZyxRocket|CrashSite/.test(key)) return 'm10_zyx_hope';
    if (key.startsWith('Silverpond')) return 'm08_silverpond';
    if (/Camp|Tavern/.test(key)) return 'm07_rest';
    if (/Forest|LetterLock|SpinLock|GuardianLair/.test(key)) return 'm04_forest';
    if (/Town|Shop|GuildScene|ArenaScene|VictoryScene/.test(key)) return 'm02_mathoria';
    if (/Menu|SaveSlot|CharacterSelect|BandSelect|CoopSetup|TvPairing|Comic/.test(key)) return 'm01_starfall';
    return null;
}

const greetings: Record<string, string> = {
    ForestAdventureStartScene: 'vo.forest.enter', LetterLockPuzzleScene: 'vo.lock.intro', SpinLockPuzzleScene: 'vo.lock.intro',
    WitchHutScene: 'vo.pythia.welcome',
    SilverpondTownMockScene: 'vo.silverpond.enter',
    ZyxCrystalMachineScene: 'vo.machine.numbers',
};

export class SceneAudioPlugin extends Phaser.Plugins.ScenePlugin {
    private lastStep = 0;
    boot(): void {
        this.systems!.events.on(Phaser.Scenes.Events.CREATE, this.created, this);
        this.systems!.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
        this.systems!.events.on(Phaser.Scenes.Events.PAUSE, this.paused, this);
        this.systems!.events.on(Phaser.Scenes.Events.RESUME, this.score, this);
    }
    private created(): void {
        const scene = this.scene!; const key = scene.sys.settings.key;
        if (key === 'AudioSettingsScene') return;
        const audio = gameAudio();
        this.score();
        audio.preload(['ui.confirm', 'math.correct', 'math.retry', 'combat.hit', 'combat.swing', 'combat.block']);
        scene.input.on('gameobjectdown', this.clicked, this);
        scene.events.on('update', this.footsteps, this);
        if (greetings[key]) scene.time.delayedCall(600, () => voice(scene, greetings[key], true));
        const arenaCompleted = (scene as unknown as { victoryData?: { arenaCompleted?: boolean } }).victoryData?.arenaCompleted;
        if (key === 'ForestCrystalRewardScene' || (key === 'VictoryScene' && arenaCompleted)) {
            scene.time.delayedCall(800, () => sfx(scene, 'reward.milestone'));
        }
    }
    private score(): void {
        const scene = this.scene!, key = scene.sys.settings.key;
        if (key === 'AudioSettingsScene') return;
        const audio = gameAudio();
        const track = sceneMusic(key, Boolean((scene as unknown as { isBoss?: boolean }).isBoss));
        audio.setMusic(track);
        const ambient = key.startsWith('Underwater') || (key === 'BattleScene' && (scene as unknown as { returnScene?: string }).returnScene === 'UnderwaterRoomScene')
            ? 'amb.underwater' : /Silverpond/.test(key) ? 'amb.lake' : /Camp|Tavern/.test(key) ? 'amb.fire'
                : /Forest|CrashSite|Guardian/.test(key) ? 'amb.forest' : /Pythia|Witch|Forge|Machine/.test(key) ? 'amb.workshop' : null;
        audio.setAmbience(ambient);
    }
    private footsteps(time: number): void {
        const scene = this.scene!;
        if (time - this.lastStep < 460 || scene.time.paused || scene.sys.settings.key.includes('Underwater')) return;
        const moving = (objects: Phaser.GameObjects.GameObject[], depth = 0): boolean => objects.some(obj => {
            if (obj instanceof Phaser.GameObjects.Sprite && obj.visible && obj.anims.isPlaying && /walk/.test(obj.anims.currentAnim?.key ?? '')) return true;
            return depth < 2 && obj instanceof Phaser.GameObjects.Container && obj.visible && moving(obj.list, depth + 1);
        });
        if (moving(scene.children.list)) {
            this.lastStep = time;
            sfx(scene, /Forest|Crash|Guardian/.test(scene.sys.settings.key) ? 'step.grass' : 'step.stone');
        }
    }
    private clicked(): void { sfx(this.scene!, 'ui.confirm'); }
    private paused(): void { gameAudio().cancel(this.scene!); }
    private shutdown(): void {
        this.scene?.input?.off('gameobjectdown', this.clicked, this);
        this.scene?.events.off('update', this.footsteps, this);
        if (this.scene) gameAudio().cancel(this.scene);
    }
    destroy(): void {
        this.shutdown();
        this.systems?.events.off(Phaser.Scenes.Events.CREATE, this.created, this);
        this.systems?.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
        this.systems?.events.off(Phaser.Scenes.Events.PAUSE, this.paused, this);
        this.systems?.events.off(Phaser.Scenes.Events.RESUME, this.score, this);
        super.destroy();
    }
}

import { sfx, voice, gameAudio } from '../audio/AudioDirector';
import { acquirePuzzle, recordPuzzleAnswer } from '../systems/puzzles/PuzzleService';
import { sumPuzzle } from '../systems/puzzles/PuzzleCatalog';
import type { PuzzleInstance, SumPuzzle } from '../types/puzzles';
import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem } from '../systems/JourneySystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { getPlayerSpriteConfig, type PlayerSpriteConfig } from '../utils/characterUtils';
import { WalkingSceneHud } from '../ui/WalkingSceneHud';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import type { EnemyDefinition } from '../types';

type LairPhase = 'idle' | 'walking' | 'puzzle' | 'ritual' | 'transition';

type HostLayout = {
    x: number;
    y: number;
    depth: number;
    scale?: number;
    width?: number;
    height?: number;
};

type RitualCrystal = {
    root: Phaser.GameObjects.Container;
    surface: Phaser.GameObjects.Container;
    glow: Phaser.GameObjects.Graphics;
    value: number;
    selected: boolean;
};

type GuardianLairMockData = {
    mockBattleResult?: 'victory' | 'defeat';
    roomId?: string;
    fromDirection?: 'left' | 'right' | 'up' | 'down';
};

type RitualPuzzleData = {
    target: number;
    values: number[];
    healPercent: number;
    potionRefill: boolean;
    bossAttackReduction: number;
};

const DEFAULT_RITUAL_REWARDS = {
    healPercent: 20,
    potionRefill: true,
    bossAttackReduction: 1,
};
const CRYSTAL_FRAMES = [
    'ritual-purple',
    'ritual-green',
    'ritual-gold',
    'ritual-purple',
    'ritual-green',
    'ritual-gold',
];
const CRYSTAL_COLORS = [0xc970ff, 0x64e8e4, 0xffcd59, 0xff78c8, 0x76f2a4, 0xff9a55];
/**
 * Visual mock of the Guardian Lair ritual. The room uses the approved shrine
 * artwork; only ritual values and BattleScene inputs are mocked.
 */
abstract class GuardianLairRitualScene extends Phaser.Scene {
    private puzzleInstance!: PuzzleInstance<SumPuzzle>;
    private readonly gameState = GameStateManager.getInstance();
    private readonly journeySystem = JourneySystem.getInstance();
    private readonly isMockScene: boolean;
    private sceneBuilder!: SceneBuilder;
    private playerConfig!: PlayerSpriteConfig;
    private player!: Phaser.GameObjects.Sprite;
    private walkingHud!: WalkingSceneHud;
    private guardian!: Phaser.GameObjects.Sprite;
    private guardianDef!: EnemyDefinition;
    private altarInteractionZone!: Phaser.GameObjects.Zone;
    private altarIdleGlow!: Phaser.GameObjects.Arc;
    private hintText!: Phaser.GameObjects.Text;
    private ritualTargetText!: Phaser.GameObjects.Text;
    private ritualGlow!: Phaser.GameObjects.Graphics;
    private ritualButton!: MedievalActionButton;
    private ritualButtonEnabled = false;
    private crystals: RitualCrystal[] = [];
    private ritualData!: RitualPuzzleData;
    private phase: LairPhase = 'idle';
    private mockBattleResult?: 'victory' | 'defeat';
    private ritualAlreadyCompleted = false;

    protected constructor(sceneKey: string, isMockScene: boolean) {
        super({ key: sceneKey });
        this.isMockScene = isMockScene;
    }

    preload(): void {
        if (!this.cache.json.has('forestPuzzles')) {
            this.load.json('forestPuzzles', 'assets/data/forest-puzzles.json');
        }
    }

    init(data: GuardianLairMockData = {}): void {
        this.phase = 'idle';
        this.mockBattleResult = data.mockBattleResult;
        this.ritualAlreadyCompleted = !this.isMockScene
            && this.journeySystem.getObjectState('guardian_lair', 'puzzle_offering')?.completed === true;
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('GuardianLairScene');
        this.ritualData = this.loadRitualData();

        if (!this.isMockScene) {
            this.journeySystem.setCurrentRoom('guardian_lair');
        }

        this.createHint();
        this.createPlayer();
        this.createGuardian();
        this.setupAltarInteraction();
        this.createRitualPuzzle();
        this.setupGroundMovement();
        this.walkingHud = new WalkingSceneHud(this);

        if (this.ritualAlreadyCompleted) this.restoreCompletedRitual();

        this.input.keyboard?.on('keydown-ESC', () => {
            if (this.walkingHud.closeBook()) return;
            if (this.phase !== 'idle' && this.phase !== 'puzzle') return;
            if (this.isMockScene) {
                this.scene.start('MenuScene');
            } else {
                this.scene.start('ForestRoomScene', {
                    roomId: 'ancient_grove',
                    fromDirection: 'right',
                });
            }
        });

        if (this.mockBattleResult) {
            const result = this.mockBattleResult === 'victory'
                ? 'Strážce byl poražen. Svatyni můžeš zkusit znovu.'
                : 'Strážce odolal. Svatyni můžeš zkusit znovu.';
            this.showHint(result, this.mockBattleResult === 'victory' ? '#a8edb2' : '#ffb0a5', 3600);
        }

        this.cameras.main.fadeIn(250, 0, 0, 0);
    }

    private getHost(id: string, fallback: HostLayout): HostLayout {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id);
        return {
            x: host?.x ?? fallback.x,
            y: host?.y ?? fallback.y,
            depth: host?.depth ?? fallback.depth,
            scale: definition?.scale ?? fallback.scale,
            width: definition?.width ?? fallback.width,
            height: definition?.height ?? fallback.height,
        };
    }

    private loadRitualData(): RitualPuzzleData {
        const puzzles = this.cache.json.get('forestPuzzles');
        const config = puzzles?.puzzles?.crystal_offering;
        this.puzzleInstance = acquirePuzzle(this.isMockScene ? {} : this.journeySystem.getPuzzleStore(), 'guardian_lair:offering', 'sum_selection', p => sumPuzzle(p));
        const template = this.puzzleInstance.payload;

        return {
            target: template.target,
            values: template.values,
            healPercent: config?.successBonus?.healPercent ?? DEFAULT_RITUAL_REWARDS.healPercent,
            potionRefill: config?.successBonus?.potionRefill ?? DEFAULT_RITUAL_REWARDS.potionRefill,
            bossAttackReduction: config?.successBonus?.bossAtkReduction
                ?? DEFAULT_RITUAL_REWARDS.bossAttackReduction,
        };
    }

    private createHint(): void {
        const host = this.getHost('hintHost', { x: 640, y: 126, depth: 120 });
        this.hintText = this.add.text(host.x, host.y, '', {
            resolution: 2,
            fontSize: '21px',
            fontFamily: 'Georgia, serif',
            color: '#d8f5ea',
            fontStyle: 'bold',
            stroke: '#102019',
            strokeThickness: 5,
            align: 'center',
        }).setOrigin(0.5).setDepth(host.depth).setAlpha(0);
    }

    private createPlayer(): void {
        const host = this.getHost('roomPlayerHost', { x: 235, y: 555, depth: 10 });
        this.playerConfig = getPlayerSpriteConfig(this.gameState.getPlayer().characterType);
        this.player = this.add.sprite(host.x, host.y, this.playerConfig.idleTexture)
            .setScale(1)
            .setDepth(host.depth);
        if (this.anims.exists(this.playerConfig.idleAnim)) this.player.play(this.playerConfig.idleAnim);
    }

    private createGuardian(): void {
        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        const guardianDef = enemies.find(enemy => enemy.id === 'verdant_guardian');
        if (!guardianDef) throw new Error('verdant_guardian is missing from enemies.json');
        this.guardianDef = guardianDef;

        const host = this.getHost('roomGuardianHost', {
            x: 1035,
            y: 475,
            depth: 8,
            scale: guardianDef.scale ?? 1,
        });
        this.guardian = this.add.sprite(host.x, host.y, guardianDef.spriteKey)
            .setScale(host.scale ?? guardianDef.scale ?? 1)
            .setDepth(host.depth)
            .setAlpha(0.58)
            .setTint(0x64736c)
            .setFlipX(true);

        this.tweens.add({
            targets: this.guardian,
            alpha: 0.68,
            duration: 1700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private setupAltarInteraction(): void {
        const zone = this.sceneBuilder.getZone('altarInteractionZone')
            ?? { x: 640, y: 355, width: 350, height: 300 };
        const seal = this.getHost('altarSealHost', { x: 640, y: 283, depth: 12 });

        this.altarInteractionZone = this.add.zone(
            zone.x,
            zone.y,
            zone.width ?? 350,
            zone.height ?? 300,
        ).setDepth(seal.depth + 1).setInteractive({ useHandCursor: true });

        this.altarIdleGlow = this.add.circle(seal.x, seal.y, 67, 0x72ddd2, 0.035)
            .setStrokeStyle(2, 0x88eee0, 0.18)
            .setDepth(seal.depth)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets: this.altarIdleGlow,
            alpha: 0.56,
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.altarInteractionZone.on('pointerover', () => {
            if (this.phase !== 'idle') return;
            this.tweens.killTweensOf(this.altarIdleGlow);
            this.tweens.add({
                targets: this.altarIdleGlow,
                alpha: 1,
                duration: 150,
            });
        });
        this.altarInteractionZone.on('pointerout', () => {
            if (this.phase !== 'idle') return;
            this.tweens.killTweensOf(this.altarIdleGlow);
            this.tweens.add({
                targets: this.altarIdleGlow,
                alpha: 0.46,
                duration: 180,
                onComplete: () => {
                    if (this.phase !== 'idle') return;
                    this.tweens.add({
                        targets: this.altarIdleGlow,
                        alpha: 0.68,
                        duration: 1100,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut',
                    });
                },
            });
        });
        this.altarInteractionZone.on('pointerdown', () => this.walkToActivation());
    }

    private createRitualPuzzle(): void {
        const targetHost = this.getHost('ritualTargetHost', { x: 640, y: 283, depth: 22 });
        this.ensureRitualCrystalFrames();
        this.ritualGlow = this.add.graphics()
            .setPosition(targetHost.x, targetHost.y)
            .setDepth(targetHost.depth - 1)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setVisible(false);
        this.ritualGlow.fillStyle(0x84f2dc, 0.13);
        this.ritualGlow.fillCircle(0, 0, 80);
        this.ritualGlow.lineStyle(3, 0xbafff5, 0.5);
        this.ritualGlow.strokeCircle(0, 0, 70);

        this.ritualTargetText = this.add.text(targetHost.x, targetHost.y, '', {
            fontSize: '34px',
            fontFamily: 'Georgia, serif',
            color: '#f4df70',
            fontStyle: 'bold',
            stroke: '#17130b',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(targetHost.depth).setVisible(false);

        this.crystals = this.ritualData.values.map((value, index) => {
            const host = this.getHost(`ritualCrystal${index}Host`, {
                x: 530 + index * 55,
                y: index === 5 ? 430 : 361,
                depth: 25,
            });
            return this.createRitualCrystal(
                host,
                value,
                CRYSTAL_COLORS[index],
                CRYSTAL_FRAMES[index],
            );
        });

        const buttonHost = this.getHost('ritualButtonHost', {
            x: 720,
            y: 635,
            depth: 50,
            width: 300,
            height: 62,
        });
        this.ritualButton = new MedievalActionButton(this, {
            name: 'guardianRitualButton',
            x: buttonHost.x,
            y: buttonHost.y,
            depth: buttonHost.depth,
            width: buttonHost.width ?? 300,
            height: buttonHost.height ?? 62,
            label: 'PROVÉST RITUÁL',
            labelFontSize: 18,
            accent: 0x84f2dc,
            layout: 'text',
            frameTexture: 'zyx-dialog-action-frame-story',
            enabled: false,
            onClick: () => {
                if (this.ritualButtonEnabled) this.performRitual();
            },
        });
        this.ritualButton.label.setColor('#fff1b5').setStroke('#1b1008', 4);
        this.setRitualButtonEnabled(false);
        this.ritualButton.root.setVisible(false);
    }

    private setRitualButtonEnabled(enabled: boolean): void {
        this.ritualButtonEnabled = enabled;
        this.ritualButton.setEnabled(enabled);
        this.ritualButton.label.setColor(enabled ? '#fff1b5' : '#b7baa9');
    }

    private ensureRitualCrystalFrames(): void {
        const texture = this.textures.get('gemstone-icons-cropped-cropped');
        const frameSpecs: Array<[string, number, number]> = [
            ['ritual-purple', 132, 0],
            ['ritual-green', 132, 139],
            ['ritual-gold', 132, 278],
        ];
        frameSpecs.forEach(([name, x, y]) => {
            if (!texture.has(name)) texture.add(name, 0, x, y, 132, 139);
        });
    }

    private createRitualCrystal(
        host: HostLayout,
        value: number,
        color: number,
        frame: string,
    ): RitualCrystal {
        const glow = this.add.graphics();
        glow.fillStyle(color, 0.34);
        glow.fillEllipse(0, 0, 48, 54);
        glow.setAlpha(0.2);

        const gem = this.add.image(0, -2, 'gemstone-icons-cropped-cropped', frame).setScale(0.36);
        const numberPlate = this.add.circle(14, 17, 12, 0x15201c, 0.94)
            .setStrokeStyle(2, color, 0.95);
        const number = this.add.text(14, 17, String(value), {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#fff7d2',
            fontStyle: 'bold',
            stroke: '#291b0c',
            strokeThickness: 3,
        }).setOrigin(0.5);
        const surface = this.add.container(0, 0, [gem, numberPlate, number]);
        const root = this.add.container(host.x, host.y, [glow, surface])
            .setDepth(host.depth)
            .setSize(58, 64)
            .setVisible(false);

        const crystal: RitualCrystal = { root, surface, glow, value, selected: false };
        root.on('pointerover', () => this.setCrystalPresentation(crystal, true));
        root.on('pointerout', () => this.setCrystalPresentation(crystal, false));
        root.on('pointerdown', () => this.toggleCrystal(crystal));
        return crystal;
    }

    private setCrystalPresentation(crystal: RitualCrystal, hover: boolean): void {
        const surfaceY = crystal.selected ? -7 : hover ? -3 : 0;
        const glowAlpha = crystal.selected ? 0.95 : hover ? 0.58 : 0.2;
        this.tweens.killTweensOf([crystal.surface, crystal.glow]);
        this.tweens.add({
            targets: crystal.surface,
            y: surfaceY,
            duration: 130,
            ease: 'Cubic.easeOut',
        });
        this.tweens.add({
            targets: crystal.glow,
            alpha: glowAlpha,
            duration: 130,
        });
    }

    private setupGroundMovement(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.phase !== 'idle') return;
            if (this.input.hitTestPointer(pointer).length > 0) return;
            if (pointer.y >= 540 && pointer.y < 700) {
                this.walkTo(pointer.x, Math.min(pointer.y, 610));
            }
        });
    }

    private walkToActivation(): void {
        if (this.phase !== 'idle') return;
        const target = this.getHost('altarInteractionHost', { x: 465, y: 585, depth: 10 });
        this.phase = 'walking';
        if (!this.isMockScene) {
            this.journeySystem.setObjectState('guardian_lair', 'puzzle_offering', {
                interacted: true,
            });
        }
        this.altarInteractionZone.disableInteractive();
        this.tweens.killTweensOf(this.altarIdleGlow);
        this.tweens.add({ targets: this.altarIdleGlow, alpha: 0.18, duration: 220 });
        this.walkTo(target.x, target.y, () => this.openRitual(), false);
    }

    private walkTo(
        targetX: number,
        targetY: number,
        onComplete?: () => void,
        enableInputAfter = true,
    ): void {
        this.input.enabled = false;
        const dx = targetX - this.player.x;
        const dy = targetY - this.player.y;
        const duration = Math.max(180, Math.hypot(dx, dy) / 350 * 1000);

        this.player.setFlipX(dx < 0);
        if (this.anims.exists(this.playerConfig.walkAnim)) this.player.play(this.playerConfig.walkAnim);

        this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration,
            ease: 'Linear',
            onComplete: () => {
                if (this.anims.exists(this.playerConfig.idleAnim)) this.player.play(this.playerConfig.idleAnim);
                if (enableInputAfter) this.input.enabled = true;
                onComplete?.();
            },
        });
    }

    private openRitual(): void {
        voice(this, 'vo.forest.offering', true);
        this.phase = 'puzzle';
        this.input.enabled = true;
        this.showHint(
            `Vyber právě tři krystaly, jejichž hodnoty dají ${this.ritualData.target}.`,
            '#d8f5ea',
        );
        this.ritualGlow.setVisible(true).setAlpha(0);
        this.ritualTargetText
            .setVisible(true)
            .setAlpha(1)
            .setColor('#f4df70')
            .setText(String(this.ritualData.target));
        this.setRitualButtonEnabled(false);
        this.ritualButton.root.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.ritualGlow, alpha: 1, duration: 280 });
        this.tweens.add({
            targets: this.ritualButton.root,
            alpha: 0.5,
            duration: 240,
            delay: 220,
        });

        this.crystals.forEach((crystal, index) => {
            const host = this.getHost(`ritualCrystal${index}Host`, {
                x: 530 + index * 55,
                y: index === 5 ? 430 : 361,
                depth: 25,
            });
            crystal.selected = (this.puzzleInstance.state.selection as number[] | undefined)?.includes(index) ?? false;
            this.setCrystalPresentation(crystal, false);
            crystal.root
                .setVisible(true)
                .setAlpha(0)
                .setY(host.y + 18)
                .setInteractive({ useHandCursor: true });
            this.tweens.add({
                targets: crystal.root,
                alpha: 1,
                y: host.y,
                duration: 280,
                delay: index * 70,
                ease: 'Back.easeOut',
            });
        });
        this.setRitualButtonEnabled(this.crystals.filter(crystal => crystal.selected).length === 3);
    }

    private toggleCrystal(crystal: RitualCrystal): void {
        if (this.phase !== 'puzzle') return;
        const selectedCount = this.crystals.filter((candidate) => candidate.selected).length;
        if (!crystal.selected && selectedCount >= 3) {
            this.showHint('Nejdřív odeber jeden z vybraných krystalů.', '#ffd38a', 1500);
            this.tweens.add({
                targets: crystal.surface,
                x: { from: -3, to: 3 },
                duration: 45,
                yoyo: true,
                repeat: 3,
                onComplete: () => crystal.surface.setX(0),
            });
            return;
        }

        crystal.selected = !crystal.selected;
        this.puzzleInstance.state.selection = this.crystals.flatMap((candidate, index) => candidate.selected ? [index] : []);
        this.setCrystalPresentation(crystal, false);
        const updatedCount = this.crystals.filter((candidate) => candidate.selected).length;
        this.setRitualButtonEnabled(updatedCount === 3);
    }

    private performRitual(): void {
        if (this.phase !== 'puzzle') return;
        const selected = this.crystals.filter((crystal) => crystal.selected);
        if (selected.length !== 3) return;

        const sum = selected.reduce((total, crystal) => total + crystal.value, 0);
        recordPuzzleAnswer(this.puzzleInstance, sum === this.ritualData.target, false, this.isMockScene ? null : this.gameState.getPlayer());
        if (sum !== this.ritualData.target) {
            this.ritualTargetText.setColor('#ff9c8e');
            this.showHint('Pečeť nereaguje. Zkus jinou trojici.', '#ffb29f', 1800);
            this.cameras.main.shake(180, 0.002);
            this.time.delayedCall(520, () => {
                if (this.phase === 'puzzle') this.ritualTargetText.setColor('#f4df70');
            });
            return;
        }

        this.phase = 'ritual';
        this.crystals.forEach((candidate) => candidate.root.disableInteractive());
        this.setRitualButtonEnabled(false);
        this.showHint('Pečeť odpovídá. Strážce se probouzí…', '#9ff6b0');
        if (!this.isMockScene) this.applyProductionRitualSuccess();
        this.time.delayedCall(280, () => this.playRitual());
    }

    private applyProductionRitualSuccess(): void {
        if (this.ritualAlreadyCompleted) return;
        this.ritualAlreadyCompleted = true;
        this.journeySystem.setObjectState('guardian_lair', 'puzzle_offering', {
            interacted: true,
            completed: true,
            looted: true,
        });

        if (this.ritualData.healPercent > 0) {
            this.journeySystem.applyHeal(this.ritualData.healPercent);
        }

        if (this.ritualData.potionRefill) {
            const coop = CoopSessionManager.getInstance();
            if (coop.isCoopActive()) {
                coop.forBothPlayers(() => {
                    const player = this.gameState.getPlayer();
                    if (player.potions === 0) player.potions = 1;
                });
                coop.activatePlayerA();
            } else {
                const player = this.gameState.getPlayer();
                if (player.potions === 0) {
                    player.potions = 1;
                    this.gameState.save();
                }
            }
        }
        this.walkingHud.refresh();
    }

    private restoreCompletedRitual(): void {
        const awakenedHost = this.getHost('roomGuardianAwakenedHost', {
            x: this.guardian.x,
            y: this.guardian.y,
            depth: this.guardian.depth,
            scale: this.guardianDef.scale ?? 1,
        });
        this.altarInteractionZone.disableInteractive();
        this.tweens.killTweensOf([this.altarIdleGlow, this.guardian]);
        this.altarIdleGlow.setAlpha(0.72);
        this.guardian
            .clearTint()
            .setAlpha(1)
            .setScale(awakenedHost.scale ?? this.guardianDef.scale ?? 1)
            .setInteractive({ useHandCursor: true });
        const idleAnimation = `${this.guardianDef.animPrefix ?? this.guardianDef.id}-idle`;
        if (this.anims.exists(idleAnimation)) this.guardian.play(idleAnimation);
        this.guardian.on('pointerdown', () => {
            if (this.phase !== 'idle') return;
            this.guardian.disableInteractive();
            this.startRealBattle();
        });
        this.showHint('Pečeť je aktivní. Strážce čeká.', '#9ff6b0', 2400);
    }

    private playRitual(): void {
        this.input.enabled = false;
        const target = this.getHost('ritualTargetHost', { x: 640, y: 283, depth: 22 });

        this.crystals.forEach((crystal, index) => {
            this.tweens.add({
                targets: crystal.root,
                x: target.x,
                y: target.y,
                alpha: 0,
                duration: crystal.selected ? 620 : 260,
                delay: index * 65,
                ease: crystal.selected ? 'Cubic.easeInOut' : 'Sine.easeOut',
            });
        });

        this.tweens.add({
            targets: this.ritualGlow,
            scale: 1.22,
            alpha: 1.45,
            duration: 380,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
        });
        this.tweens.add({
            targets: [this.ritualTargetText, this.ritualButton.root],
            alpha: 0,
            duration: 420,
        });

        const light = this.add.circle(target.x, target.y, 18, 0x9ffff0, 0.82)
            .setDepth(40)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
            targets: light,
            scale: 10,
            alpha: 0,
            duration: 1050,
            delay: 380,
            ease: 'Cubic.easeOut',
            onComplete: () => light.destroy(),
        });

        this.time.delayedCall(720, () => this.awakenGuardian());
    }

    private awakenGuardian(): void {
        sfx(this, 'combat.phase');
        gameAudio().setMusic('m06_guardian');
        const awakenedHost = this.getHost('roomGuardianAwakenedHost', {
            x: this.guardian.x,
            y: this.guardian.y,
            depth: this.guardian.depth,
            scale: this.guardianDef.scale ?? 1,
        });
        this.tweens.killTweensOf(this.guardian);
        this.guardian.clearTint();
        const idleAnimation = `${this.guardianDef.animPrefix ?? this.guardianDef.id}-idle`;
        if (this.anims.exists(idleAnimation)) this.guardian.play(idleAnimation);

        this.tweens.add({
            targets: this.guardian,
            alpha: 1,
            scale: awakenedHost.scale ?? this.guardianDef.scale ?? 1,
            duration: 760,
            ease: 'Back.easeOut',
        });
        this.cameras.main.shake(520, 0.004);

        this.time.delayedCall(1250, () => this.moveToBattleSpawns());
    }

    private moveToBattleSpawns(): void {
        this.phase = 'transition';
        const playerSpawn = this.getHost('battlePlayerHost', { x: 267, y: 478, depth: 10 });
        const guardianSpawn = this.getHost('battleGuardianHost', {
            x: 899,
            y: 484,
            depth: 9,
            scale: this.guardianDef.scale ?? 1,
        });
        this.player.setDepth(playerSpawn.depth);
        this.guardian
            .setDepth(guardianSpawn.depth)
            .setScale(guardianSpawn.scale ?? this.guardianDef.scale ?? 1);

        let completedMoves = 0;
        const completeMove = () => {
            completedMoves++;
            if (completedMoves === 2) this.startRealBattle();
        };

        this.walkTo(playerSpawn.x, playerSpawn.y, completeMove, false);
        this.tweens.add({
            targets: this.guardian,
            x: guardianSpawn.x,
            y: guardianSpawn.y,
            scale: 1.2,
            duration: 820,
            ease: 'Sine.easeInOut',
            onComplete: completeMove,
        });
    }

    private startRealBattle(): void {
        this.phase = 'transition';
        this.cameras.main.fadeOut(260, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('BattleScene', {
                mode: 'journey',
                encounterId: 'forest-room-guardian-boss',
                returnScene: this.isMockScene ? 'GuardianLairMockScene' : 'ForestRoomScene',
                returnData: this.isMockScene
                    ? {}
                    : {
                        roomId: 'guardian_lair',
                        defeatedObjectId: 'boss_guardian',
                    },
                backgroundKey: 'guardian-lair-mock-bg',
                mockMode: this.isMockScene,
                storyVictory: 'forest-crystal',
                ritualBossAttackReduction: this.ritualData.bossAttackReduction,
            });
        });
    }

    private showHint(text: string, color: string, duration?: number): void {
        this.hintText.setText(text).setColor(color);
        this.tweens.killTweensOf(this.hintText);
        this.tweens.add({
            targets: this.hintText,
            alpha: 1,
            duration: 180,
            onComplete: duration
                ? () => this.tweens.add({
                    targets: this.hintText,
                    alpha: 0,
                    duration: 260,
                    delay: duration,
                })
                : undefined,
        });
    }
}

export class GuardianLairScene extends GuardianLairRitualScene {
    constructor() {
        super('GuardianLairScene', false);
    }
}

export class GuardianLairMockScene extends GuardianLairRitualScene {
    constructor() {
        super('GuardianLairMockScene', true);
    }
}

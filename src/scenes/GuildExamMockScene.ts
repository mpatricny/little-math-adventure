import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { createGuildExamBoard, createGuildExamRule } from '../ui/GuildExamTheme';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { EXAM_CONFIGS } from '../types';

type MockProblem = {
    question: string;
    choices: string[];
    answerIndex: number;
    solution: string;
};

type MockResult = MockProblem & {
    wasCorrect: boolean;
};

type MockPhase = 'overview' | 'problem' | 'feedback' | 'results';

type GuildExamMockHost = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

const ACCENT = 0xd5943c;
const MOCK_EXAM_CONFIG = EXAM_CONFIGS.sub_atom;
const TOTAL_PROBLEMS = MOCK_EXAM_CONFIG.itemCount;

const MOCK_PROBLEMS: MockProblem[] = [
    { question: '3 + 4 = ?', choices: ['6', '7', '8'], answerIndex: 1, solution: '3 + 4 = 7' },
    { question: '9 − 5 = ?', choices: ['3', '4', '5'], answerIndex: 1, solution: '9 − 5 = 4' },
    { question: '2 × 4 = ?', choices: ['6', '8', '10'], answerIndex: 1, solution: '2 × 4 = 8' },
    { question: '12 ÷ 3 = ?', choices: ['3', '4', '6'], answerIndex: 1, solution: '12 ÷ 3 = 4' },
    { question: '7 + ? = 12', choices: ['4', '5', '6'], answerIndex: 1, solution: '7 + 5 = 12' },
    { question: '14 − 6 = ?', choices: ['7', '8', '9'], answerIndex: 1, solution: '14 − 6 = 8' },
    { question: '3 × 5 = ?', choices: ['12', '15', '18'], answerIndex: 1, solution: '3 × 5 = 15' },
    { question: '18 ÷ 2 = ?', choices: ['8', '9', '10'], answerIndex: 1, solution: '18 ÷ 2 = 9' },
];

/**
 * Standalone presentation mock for the Guild exam. It owns its fixed problems,
 * score and navigation and never reads or writes player, mastery or save state.
 */
export class GuildExamMockScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private phase: MockPhase = 'overview';
    private problemIndex = 0;
    private results: MockResult[] = [];

    private overviewOverlay!: Phaser.GameObjects.Container;
    private trialOverlay!: Phaser.GameObjects.Container;
    private feedbackOverlay!: Phaser.GameObjects.Container;
    private resultsOverlay!: Phaser.GameObjects.Container;

    private questionCounter!: Phaser.GameObjects.Text;
    private problemText!: Phaser.GameObjects.Text;
    private answerButtons: MedievalActionButton[] = [];
    private progressDots: Phaser.GameObjects.Text[] = [];
    private progressFrames: Phaser.GameObjects.Arc[] = [];
    private feedbackSolution!: Phaser.GameObjects.Text;
    private resultsTitle!: Phaser.GameObjects.Text;
    private resultsMedal!: Phaser.GameObjects.Text;
    private resultsScore!: Phaser.GameObjects.Text;
    private resultEntries: Phaser.GameObjects.Text[] = [];

    constructor() {
        super({ key: 'GuildExamMockScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('GuildExamMockScene');

        this.createOverviewOverlay();
        this.createTrialOverlay();
        this.createFeedbackOverlay();
        this.createResultsOverlay();
        this.showOverview();

        this.input.keyboard?.on('keydown-ESC', () => this.leaveMock());
    }

    private getHost(id: string, fallback: GuildExamMockHost): GuildExamMockHost {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<GuildExamMockHost> | undefined;
        return {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
    }

    private getLocalHost(
        id: string,
        root: GuildExamMockHost,
        fallback: GuildExamMockHost,
    ): GuildExamMockHost {
        const host = this.getHost(id, fallback);
        return { ...host, x: host.x - root.x, y: host.y - root.y };
    }

    private createPhaseRoot(id: string, fallbackDepth: number): {
        root: Phaser.GameObjects.Container;
        host: GuildExamMockHost;
    } {
        const host = this.getHost(id, {
            x: 640,
            y: 360,
            width: 1280,
            height: 720,
            depth: fallbackDepth,
        });
        const root = this.add.container(host.x, host.y).setDepth(host.depth).setVisible(false);
        this.addExamBackdrop(root);

        const boardHost = this.getLocalHost('trialBoardHost', host, {
            x: 640,
            y: 360,
            width: 1080,
            height: 610,
            depth: fallbackDepth + 1,
        });
        root.add(createGuildExamBoard(this, {
            x: boardHost.x,
            y: boardHost.y,
            width: boardHost.width,
            height: boardHost.height,
            accent: ACCENT,
        }));

        return { root, host };
    }

    private addExamBackdrop(root: Phaser.GameObjects.Container): void {
        const dimmer = this.add.rectangle(0, 0, 1280, 720, 0x080b0d, 0.76).setInteractive();
        const vignette = this.add.graphics();
        vignette.fillStyle(0x000000, 0.28);
        vignette.fillRect(-640, -360, 1280, 74);
        vignette.fillRect(-640, 286, 1280, 74);
        vignette.lineStyle(2, ACCENT, 0.23);
        vignette.lineBetween(-520, -308, 520, -308);
        vignette.lineBetween(-520, 308, 520, 308);
        root.add([dimmer, vignette]);
    }

    private createOverviewOverlay(): void {
        const { root, host: rootHost } = this.createPhaseRoot('overviewOverlay', 200);
        this.overviewOverlay = root;

        const headerHost = this.getLocalHost('trialHeaderHost', rootHost, {
            x: 640, y: 103, width: 760, height: 74, depth: 203,
        });
        const title = this.add.text(headerHost.x, headerHost.y - 7, 'CECHOVNÍ ZKOUŠKA', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '38px',
            fontStyle: 'bold',
            color: '#3b210f',
            stroke: '#f5d88b',
            strokeThickness: 2,
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        const subtitle = this.add.text(headerHost.x, headerHost.y + 30, 'SAMOSTATNÝ UI MOCK • VÝSLEDKY SE NEUKLÁDAJÍ', {
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#6e4524',
            letterSpacing: 1,
        }).setOrigin(0.5).setResolution(2);
        root.add([title, subtitle, createGuildExamRule(
            this,
            headerHost.x,
            headerHost.y + 54,
            Math.min(720, headerHost.width),
            ACCENT,
        )]);

        const contentHost = this.getLocalHost('trialProblemHost', rootHost, {
            x: 640, y: 285, width: 820, height: 190, depth: 203,
        });
        const dialog = this.add.text(
            contentHost.x,
            contentHost.y - 45,
            'Předstup před cechovní radu.\nUkaž klidnou hlavu a přesné počítání.',
            {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: '24px',
                fontStyle: 'bold',
                color: '#3b210f',
                align: 'center',
                lineSpacing: 7,
                wordWrap: { width: contentHost.width },
            },
        ).setOrigin(0.5).setResolution(2);
        const description = this.add.text(
            contentHost.x,
            contentHost.y + 37,
            `ZKOUŠKA ZÁKLADNÍCH OPERACÍ\n${TOTAL_PROBLEMS} příkladů • medaile jen podle počtu správných odpovědí`,
            {
                fontFamily: 'Georgia, serif',
                fontSize: '18px',
                color: '#5f3a1c',
                align: 'center',
                lineSpacing: 6,
                wordWrap: { width: contentHost.width },
            },
        ).setOrigin(0.5).setResolution(2);
        root.add([dialog, description]);

        const medalsHost = this.getLocalHost('trialMedalsHost', rootHost, {
            x: 640, y: 452, width: 720, height: 82, depth: 204,
        });
        const medalNames = [
            `BRONZ\n${MOCK_EXAM_CONFIG.bronzeThreshold}+ SPRÁVNĚ`,
            `STŘÍBRO\n${MOCK_EXAM_CONFIG.silverThreshold}+ SPRÁVNĚ`,
            `ZLATO\n${MOCK_EXAM_CONFIG.goldThreshold}+ SPRÁVNĚ`,
        ];
        const medalColors = [0xb87333, 0xbfc7ce, 0xe0b33c];
        medalNames.forEach((name, index) => {
            const cardX = medalsHost.x + (index - 1) * (medalsHost.width / 3.15);
            const card = this.add.container(cardX, medalsHost.y);
            const plate = this.add.graphics();
            plate.fillStyle(0x2a180e, 0.92);
            plate.fillRoundedRect(-105, -34, 210, 68, 13);
            plate.lineStyle(2, medalColors[index], 0.95);
            plate.strokeRoundedRect(-105, -34, 210, 68, 13);
            const medal = this.add.circle(-72, 0, 22, medalColors[index], 1)
                .setStrokeStyle(3, 0x4b301a, 1);
            const star = this.add.text(-72, 1, '★', {
                fontFamily: 'Georgia, serif', fontSize: '22px', color: '#fff2be',
            }).setOrigin(0.5);
            const label = this.add.text(20, 0, name, {
                fontFamily: 'Georgia, serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color: '#f4ddb0',
                align: 'center',
            }).setOrigin(0.5).setResolution(2);
            card.add([plate, medal, star, label]);
            root.add(card);
        });

        const actionHost = this.getLocalHost('trialOverviewActionHost', rootHost, {
            x: 640, y: 585, width: 340, height: 82, depth: 205,
        });
        const startButton = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'VSTOUPIT DO ZKOUŠKY',
            accent: ACCENT,
            layout: 'text',
            labelFontSize: 21,
            onClick: () => this.startTrial(),
        });
        root.add(startButton.root);

        const cancelHost = this.getLocalHost('trialCancelHost', rootHost, {
            x: 1040, y: 105, width: 170, height: 54, depth: 205,
        });
        const cancelButton = new MedievalActionButton(this, {
            x: cancelHost.x,
            y: cancelHost.y,
            depth: cancelHost.depth,
            width: cancelHost.width,
            height: cancelHost.height,
            label: 'MENU',
            accent: ACCENT,
            layout: 'text',
            labelFontSize: 17,
            onClick: () => this.leaveMock(),
        });
        root.add(cancelButton.root);
    }

    private createTrialOverlay(): void {
        const { root, host: rootHost } = this.createPhaseRoot('trialOverlay', 200);
        this.trialOverlay = root;

        const headerHost = this.getLocalHost('trialHeaderHost', rootHost, {
            x: 640, y: 103, width: 760, height: 74, depth: 203,
        });
        this.questionCounter = this.add.text(headerHost.x, headerHost.y, 'OTÁZKA 1 Z 8', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#3b210f',
            stroke: '#f5d88b',
            strokeThickness: 1,
        }).setOrigin(0.5).setResolution(2);
        root.add(this.questionCounter);

        const progressHost = this.getLocalHost('trialProgressHost', rootHost, {
            x: 640, y: 165, width: 760, height: 48, depth: 204,
        });
        const gap = Math.min(52, progressHost.width / (TOTAL_PROBLEMS - 1));
        const startX = progressHost.x - ((TOTAL_PROBLEMS - 1) * gap) / 2;
        for (let index = 0; index < TOTAL_PROBLEMS; index++) {
            const x = startX + index * gap;
            const frame = this.add.circle(x, progressHost.y, 17, 0x2b190e, 1)
                .setStrokeStyle(2, 0x8b633a, 1);
            const dot = this.add.text(x, progressHost.y + 1, `${index + 1}`, {
                fontSize: '13px',
                fontFamily: 'Georgia, serif',
                fontStyle: 'bold',
                color: '#dcc79f',
            }).setOrigin(0.5).setResolution(2);
            root.add([frame, dot]);
            this.progressFrames.push(frame);
            this.progressDots.push(dot);
        }

        const problemHost = this.getLocalHost('trialProblemHost', rootHost, {
            x: 640, y: 305, width: 860, height: 150, depth: 204,
        });
        this.problemText = this.add.text(problemHost.x, problemHost.y, '', {
            fontSize: '72px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#2f1a0d',
            fontStyle: 'bold',
            stroke: '#f9e6ad',
            strokeThickness: 2,
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        root.add(this.problemText);

        ['answerButton1', 'answerButton2', 'answerButton3'].forEach((id, index) => {
            const host = this.getLocalHost(id, rootHost, {
                x: 320 + index * 320, y: 475, width: 292, height: 88, depth: 205,
            });
            const button = new MedievalActionButton(this, {
                x: host.x,
                y: host.y,
                depth: host.depth,
                width: host.width,
                height: host.height,
                label: '',
                accent: ACCENT,
                layout: 'text',
                frameTexture: 'guild-nav-frame-v2',
                labelOffsetX: host.width * 0.1,
                labelFontSize: 34,
                labelMaxWidth: host.width * 0.56,
                onClick: () => this.answer(index),
            });
            const badge = this.add.text(-host.width * 0.305, 1, ['I', 'II', 'III'][index], {
                fontFamily: 'Georgia, serif',
                fontSize: '20px',
                fontStyle: 'bold',
                color: '#d5943c',
                stroke: '#130c08',
                strokeThickness: 3,
            }).setOrigin(0.5).setResolution(2);
            button.root.add(badge);
            root.add(button.root);
            this.answerButtons.push(button);
        });

        const hintHost = this.getLocalHost('trialHintHost', rootHost, {
            x: 640, y: 575, width: 760, height: 42, depth: 204,
        });
        const hint = this.add.text(
            hintHost.x,
            hintHost.y + 2,
            'PŘESNOST ROZHODUJE  •  ESC SE VRÁTÍ DO MENU',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#6b4425',
                letterSpacing: 1,
            },
        ).setOrigin(0.5).setResolution(2);
        root.add([createGuildExamRule(this, hintHost.x, hintHost.y - 24, hintHost.width, ACCENT), hint]);
    }

    private createFeedbackOverlay(): void {
        const { root, host: rootHost } = this.createPhaseRoot('feedbackOverlay', 210);
        this.feedbackOverlay = root;

        const headerHost = this.getLocalHost('trialFeedbackHeaderHost', rootHost, {
            x: 640, y: 120, width: 780, height: 90, depth: 213,
        });
        const heading = this.add.text(headerHost.x, headerHost.y - 20, 'MISTROVA RADA', {
            fontFamily: 'Georgia, serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#6b4425',
            letterSpacing: 2,
        }).setOrigin(0.5).setResolution(2);
        this.feedbackSolution = this.add.text(headerHost.x, headerHost.y + 25, '', {
            fontSize: '40px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#276129',
            fontStyle: 'bold',
            stroke: '#e9cf83',
            strokeThickness: 2,
        }).setOrigin(0.5).setResolution(2);
        root.add([heading, this.feedbackSolution]);

        const visualHost = this.getLocalHost('trialFeedbackVisualHost', rootHost, {
            x: 640, y: 355, width: 820, height: 310, depth: 213,
        });
        const seal = this.add.graphics();
        seal.fillStyle(0x2f7333, 0.12);
        seal.fillCircle(visualHost.x, visualHost.y - 25, 92);
        seal.lineStyle(4, 0x477a35, 0.72);
        seal.strokeCircle(visualHost.x, visualHost.y - 25, 92);
        const check = this.add.text(visualHost.x, visualHost.y - 28, '✓', {
            fontFamily: 'Georgia, serif',
            fontSize: '92px',
            fontStyle: 'bold',
            color: '#39713a',
        }).setOrigin(0.5).setResolution(2);
        const explanation = this.add.text(
            visualHost.x,
            visualHost.y + 103,
            'Rozlož si úlohu na známé části a potom výsledek ověř.',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '18px',
                color: '#5f3a1c',
                align: 'center',
                wordWrap: { width: visualHost.width },
            },
        ).setOrigin(0.5).setResolution(2);
        root.add([seal, check, explanation]);

        const actionHost = this.getLocalHost('trialFeedbackActionHost', rootHost, {
            x: 640, y: 585, width: 310, height: 78, depth: 214,
        });
        const action = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'ROZUMÍM',
            accent: ACCENT,
            layout: 'text',
            labelFontSize: 21,
            onClick: () => this.advance(),
        });
        root.add(action.root);
    }

    private createResultsOverlay(): void {
        const { root, host: rootHost } = this.createPhaseRoot('resultsOverlay', 200);
        this.resultsOverlay = root;

        const headerHost = this.getLocalHost('trialResultsHeaderHost', rootHost, {
            x: 640, y: 115, width: 800, height: 110, depth: 203,
        });
        this.resultsTitle = this.add.text(headerHost.x, headerHost.y - 22, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#3b210f',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.resultsMedal = this.add.text(headerHost.x, headerHost.y + 25, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#d19a26',
            stroke: '#5c3718',
            strokeThickness: 2,
        }).setOrigin(0.5).setResolution(2);
        root.add([this.resultsTitle, this.resultsMedal]);

        const scoreHost = this.getLocalHost('trialResultsScoreHost', rootHost, {
            x: 640, y: 205, width: 720, height: 48, depth: 203,
        });
        this.resultsScore = this.add.text(scoreHost.x, scoreHost.y, '', {
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#68411f',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        root.add([this.resultsScore, createGuildExamRule(
            this,
            scoreHost.x,
            scoreHost.y + 29,
            scoreHost.width,
            ACCENT,
        )]);

        const gridHost = this.getLocalHost('trialResultsGridHost', rootHost, {
            x: 640, y: 355, width: 790, height: 220, depth: 203,
        });
        for (let index = 0; index < TOTAL_PROBLEMS; index++) {
            const col = index < 4 ? 0 : 1;
            const rowIndex = index % 4;
            const entry = this.add.text(
                gridHost.x - gridHost.width / 2 + col * (gridHost.width / 2) + 26,
                gridHost.y - gridHost.height / 2 + rowIndex * 55 + 27,
                '',
                {
                    fontFamily: 'Georgia, serif',
                    fontSize: '16px',
                    fontStyle: 'bold',
                    color: '#3f2a19',
                },
            ).setOrigin(0, 0.5).setResolution(2);
            root.add(entry);
            this.resultEntries.push(entry);
        }

        const rewardHost = this.getLocalHost('trialRewardHost', rootHost, {
            x: 640, y: 500, width: 820, height: 54, depth: 204,
        });
        const reward = this.add.text(
            rewardHost.x,
            rewardHost.y,
            'MOCK REŽIM  •  BEZ ODMĚNY  •  BEZ ZÁPISU DO PROFILU',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '18px',
                fontStyle: 'bold',
                color: '#5f3a1b',
                align: 'center',
                wordWrap: { width: rewardHost.width },
            },
        ).setOrigin(0.5).setResolution(2);
        root.add(reward);

        const messageHost = this.getLocalHost('trialResultMessageHost', rootHost, {
            x: 640, y: 545, width: 760, height: 42, depth: 204,
        });
        const message = this.add.text(
            messageHost.x,
            messageHost.y,
            '„Výborně. Zkoušku můžeš opakovat, aniž bys změnil postup hrou.“',
            {
                fontFamily: 'Georgia, serif',
                fontSize: '15px',
                fontStyle: 'italic',
                color: '#35637a',
                align: 'center',
                wordWrap: { width: messageHost.width },
            },
        ).setOrigin(0.5).setResolution(2);
        root.add(message);

        const actionHost = this.getLocalHost('trialResultsActionHost', rootHost, {
            x: 640, y: 605, width: 310, height: 76, depth: 205,
        });
        const action = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'ZPĚT DO MENU',
            accent: ACCENT,
            layout: 'text',
            labelFontSize: 20,
            onClick: () => this.leaveMock(),
        });
        root.add(action.root);
    }

    private showOverview(): void {
        this.problemIndex = 0;
        this.results = [];
        this.phase = 'overview';
        this.setVisiblePhase(this.overviewOverlay);
    }

    private startTrial(): void {
        this.problemIndex = 0;
        this.results = [];
        this.progressDots.forEach((dot, index) => dot.setText(`${index + 1}`).setColor('#dcc79f'));
        this.progressFrames.forEach(frame => frame
            .setFillStyle(0x2b190e, 1)
            .setStrokeStyle(2, 0x8b633a, 1));
        this.showProblem();
    }

    private showProblem(): void {
        if (this.problemIndex >= MOCK_PROBLEMS.length) {
            this.showResults();
            return;
        }

        this.phase = 'problem';
        this.setVisiblePhase(this.trialOverlay);
        const problem = MOCK_PROBLEMS[this.problemIndex];
        this.questionCounter.setText(`OTÁZKA ${this.problemIndex + 1} Z ${TOTAL_PROBLEMS}`);
        this.problemText.setText(problem.question).setColor('#2f1a0d');
        this.answerButtons.forEach((button, index) => {
            button.setLabel(problem.choices[index], 34).setEnabled(true);
            button.label.setColor('#3c210f');
        });
        this.progressDots[this.problemIndex].setColor('#fff4ca');
        this.progressFrames[this.problemIndex]
            .setFillStyle(ACCENT, 1)
            .setStrokeStyle(3, 0xeafaff, 0.9);
    }

    private answer(answerIndex: number): void {
        if (this.phase !== 'problem') return;
        const problem = MOCK_PROBLEMS[this.problemIndex];
        const wasCorrect = answerIndex === problem.answerIndex;
        this.results.push({ ...problem, wasCorrect });
        this.answerButtons.forEach(button => button.setEnabled(false));

        if (wasCorrect) {
            this.progressDots[this.problemIndex].setText('✓').setColor('#efffdc');
            this.progressFrames[this.problemIndex]
                .setFillStyle(0x2f7333, 1)
                .setStrokeStyle(3, 0xbbe59f, 1);
            this.problemText.setColor('#2f7333');
            this.time.delayedCall(320, () => this.advance());
            return;
        }

        this.progressDots[this.problemIndex].setText('✕').setColor('#ffe3d8');
        this.progressFrames[this.problemIndex]
            .setFillStyle(0x8d332a, 1)
            .setStrokeStyle(3, 0xf0a28d, 1);
        this.feedbackSolution.setText(problem.solution);
        this.phase = 'feedback';
        this.cameras.main.shake(180, 0.009);
        this.setVisiblePhase(this.feedbackOverlay);
    }

    private advance(): void {
        this.problemIndex++;
        this.showProblem();
    }

    private showResults(): void {
        this.phase = 'results';
        const correct = this.results.filter(result => result.wasCorrect).length;
        const tier = correct >= MOCK_EXAM_CONFIG.goldThreshold! ? 'gold'
            : correct >= MOCK_EXAM_CONFIG.silverThreshold! ? 'silver'
                : correct >= MOCK_EXAM_CONFIG.bronzeThreshold! ? 'bronze'
                    : 'none';
        const display = tier === 'gold'
            ? { title: 'ZLATÁ ZKOUŠKA!', stars: '★ ★ ★', color: '#8a5d08' }
            : tier === 'silver'
                ? { title: 'STŘÍBRNÁ ZKOUŠKA!', stars: '★ ★ ☆', color: '#56616a' }
                : tier === 'bronze'
                    ? { title: 'BRONZOVÁ ZKOUŠKA!', stars: '★ ☆ ☆', color: '#874918' }
                    : { title: 'ZKOUŠKA NEÚSPĚŠNÁ', stars: '☆ ☆ ☆', color: '#8b2f26' };

        this.resultsTitle.setText(display.title).setColor(display.color);
        this.resultsMedal.setText(display.stars);
        this.resultsScore.setText(`${correct} Z ${TOTAL_PROBLEMS} SPRÁVNĚ`);
        this.resultEntries.forEach((entry, index) => {
            const result = this.results[index];
            entry
                .setText(`${result.wasCorrect ? '✓' : '✕'}   ${result.solution}`)
                .setColor(result.wasCorrect ? '#28622b' : '#8b2f26');
        });
        this.setVisiblePhase(this.resultsOverlay);
    }

    private setVisiblePhase(visible: Phaser.GameObjects.Container): void {
        [this.overviewOverlay, this.trialOverlay, this.feedbackOverlay, this.resultsOverlay]
            .forEach(overlay => overlay.setVisible(overlay === visible));
    }

    private leaveMock(): void {
        this.scene.start('MenuScene');
    }
}

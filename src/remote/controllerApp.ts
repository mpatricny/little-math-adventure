import { getRelayUrlFromLocation, getRoomFromLocation } from './remoteMode';
import { RemoteInputService } from './RemoteInputService';
import { CONTROLLER_STYLES } from './controllerStyles';
import { comparisonObjectScale } from '../ui/ComparisonPresentation';
import { RemoteAction, RemoteCommand, RemoteControllerState, RemoteEnemyTarget, RemoteComparisonPrompt } from './types';

const service = RemoteInputService.getInstance();
const COMMAND_TIMEOUT_MS = 1800;
let pendingTimeout: number | null = null;

export function mountRemoteControllerApp(): void {
    document.body.innerHTML = '';
    installControllerStyles();

    const root = document.createElement('main');
    root.id = 'remote-controller-root';
    document.body.appendChild(root);

    renderConnecting(root);
    void connect(root);
}

async function connect(root: HTMLElement): Promise<void> {
    const room = getRoomFromLocation();
    if (!room) {
        renderManualJoin(root);
        return;
    }

    try {
        await service.connectController(room, getRelayUrlFromLocation());
        service.onState((state) => renderState(root, state));
        service.onClose(() => renderState(root, {
            screen: 'disconnected',
            title: 'Spojení ukončeno',
            subtitle: 'Znovu otevři odkaz z TV obrazovky.',
        }));

        if (!service.getCurrentState()) {
            renderState(root, {
                screen: 'waiting',
                title: 'Připojeno',
                subtitle: 'Sleduj TV obrazovku.',
            });
        }
    } catch (error) {
        renderState(root, {
            screen: 'disconnected',
            title: 'Nepodařilo se připojit',
            subtitle: error instanceof Error ? error.message : String(error),
        });
    }
}

function installControllerStyles(): void {
    document.getElementById('remote-controller-styles')?.remove();
    const style = document.createElement('style');
    style.id = 'remote-controller-styles';
    style.textContent = CONTROLLER_STYLES;
    document.head.appendChild(style);
}

function renderConnecting(root: HTMLElement): void {
    root.replaceChildren(
        createHeader('Číslokraj', 'Připojuji k TV…'),
        createStatus('Navazuji spojení.'),
    );
}

function renderManualJoin(root: HTMLElement): void {
    clearPendingTimer();
    root.dataset.pending = 'false';

    const input = document.createElement('input');
    input.className = 'remote-input';
    input.placeholder = 'KÓD Z TV';
    input.autocapitalize = 'characters';
    input.autocomplete = 'off';
    input.maxLength = 4;
    input.setAttribute('aria-label', 'Čtyřmístný kód z TV');

    const join = () => {
        const room = input.value.trim().toUpperCase();
        if (!room) return;
        const url = new URL(window.location.href);
        url.searchParams.set('room', room);
        window.location.href = url.toString();
    };

    const button = createButton('Připojit', () => join());
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') join();
    });

    root.replaceChildren(
        createHeader('Mobilní ovladač', 'Zadej čtyřmístný kód z TV.'),
        input,
        button,
        createStatus('TV i telefon musí být na stejné Wi-Fi.'),
    );
    input.focus();
}

function renderState(root: HTMLElement, state: RemoteControllerState): void {
    clearPendingTimer();
    root.dataset.pending = 'false';
    root.dataset.screen = state.screen;

    const children: HTMLElement[] = [createHeader(state.title, state.subtitle)];

    if (state.screen === 'home' || state.screen === 'feedback') {
        children.push(createActionGrid(root, state.actions));
    } else if (state.screen === 'battleTurn') {
        children.push(createEnemyList(root, state.enemies));
        children.push(createActionGrid(root, state.actions));
    } else if (state.screen === 'math') {
        children.push(state.comparison ? createComparisonCard(state.comparison) : createProblemCard(state.problem));
        children.push(createAnswerGrid(root, state.choices, state.comparison));
    } else if (state.screen === 'pairing' && state.room) {
        children.push(createCodeCard(state.room));
    }

    children.push(createStatus(getStatusText(state)));
    root.replaceChildren(...children);
}

function createHeader(title: string, subtitle?: string): HTMLElement {
    const wrapper = document.createElement('section');
    wrapper.className = 'remote-header';

    const h1 = document.createElement('h1');
    h1.textContent = title;
    wrapper.appendChild(h1);

    if (subtitle) {
        const p = document.createElement('p');
        p.textContent = subtitle;
        wrapper.appendChild(p);
    }

    return wrapper;
}

function createProblemCard(problem: string): HTMLElement {
    const card = document.createElement('section');
    card.className = 'remote-problem';
    card.textContent = problem;
    return card;
}

function createCodeCard(room: string): HTMLElement {
    const card = document.createElement('section');
    card.className = 'remote-code';
    card.textContent = room;
    return card;
}

function comparisonImage(name: string, flip = false): HTMLImageElement {
    const image = document.createElement('img');
    image.src = `/assets/ui/comparison/${name}.svg`;
    image.alt = '';
    if (flip) image.style.transform = 'scaleX(-1)';
    return image;
}

function createComparisonCard(prompt: RemoteComparisonPrompt): HTMLElement {
    const card = document.createElement('section');
    card.className = 'remote-problem remote-comparison';
    if (prompt.representation === 'arithmetic') {
        card.classList.add('remote-comparison-arithmetic');
        const side = (expression: string) => {
            const element = document.createElement('span');
            element.className = 'remote-comparison-side';
            element.textContent = expression.replace(/\s/g, '').replace(/\*/g, '×');
            return element;
        };
        const slot = document.createElement('div');
        slot.className = 'remote-comparison-slot'; slot.setAttribute('aria-label', 'Prázdné místo');
        card.append(side(prompt.leftExpression), slot, side(prompt.rightExpression));
        return card;
    }
    const operand = (value: number, left: boolean): HTMLElement => {
        const side = document.createElement('div'); side.className = 'remote-comparison-side';
        if (prompt.representation === 'size' || prompt.representation === 'count' || prompt.numberedObjects) {
            const pieces = document.createElement('div'); pieces.className = 'remote-comparison-pieces';
            const count = prompt.representation === 'size' ? 1 : value;
            if (prompt.representation === 'size') pieces.classList.add('size');
            for (let i = 0; i < count; i++) {
                const item = comparisonImage('apple');
                if (prompt.representation === 'size') item.style.width = `${comparisonObjectScale(value, left ? prompt.right : prompt.left) * 100}%`;
                pieces.appendChild(item);
            }
            side.appendChild(pieces);
            if (prompt.numberedObjects) { const numeral = document.createElement('b'); numeral.textContent = `${value}`; side.appendChild(numeral); }
        } else side.textContent = left && prompt.expression ? prompt.expression.replace('*', '×') : `${value}`;
        if (left && prompt.arithmeticHint !== undefined) { const hint = document.createElement('small'); hint.textContent = `= ${prompt.arithmeticHint}`; side.appendChild(hint); }
        return side;
    };
    const slot = document.createElement('div'); slot.className = 'remote-comparison-slot'; slot.setAttribute('aria-label', 'Prázdné místo');
    card.append(operand(prompt.left, true), slot, operand(prompt.right, false));
    return card;
}

function createAnswerGrid(
    root: HTMLElement,
    choices: { index: 0 | 1 | 2; label: string }[],
    comparison?: RemoteComparisonPrompt,
): HTMLElement {
    const grid = createGrid('answers');
    if (comparison) grid.classList.add('remote-comparison-answers');
    choices.forEach((choice) => {
        const button = createButton(choice.label, (button) => {
            sendCommand(root, button, { type: 'answerChoice', index: choice.index });
        }, 'answer', false, true);
        if (!comparison) { grid.appendChild(button); return; }
        button.setAttribute('aria-label', choice.label);
        const name = choice.label === '=' ? 'equal' : 'greater';
        const jaws = choice.label === '=' ? 'equal-jaws' : 'crocodile';
        button.replaceChildren(comparisonImage(comparison.crocodileChoices ? jaws : name, choice.label === '<'));
        const wrapper = document.createElement('div'); wrapper.className = 'remote-comparison-choice';
        const reminder = comparisonImage(jaws, choice.label === '<'); reminder.className = 'remote-comparison-reminder';
        reminder.style.visibility = comparison.showReminders ? 'visible' : 'hidden';
        wrapper.append(reminder, button); grid.appendChild(wrapper);
    });
    return grid;
}

function createActionGrid(root: HTMLElement, actions: RemoteAction[]): HTMLElement {
    const grid = createGrid('actions');
    actions.forEach((action) => {
        grid.appendChild(createButton(action.label, (button) => {
            sendCommand(root, button, action.command);
        }, action.disabled ? 'disabled' : 'primary', action.disabled, true));
    });
    return grid;
}

function createEnemyList(root: HTMLElement, enemies: RemoteEnemyTarget[]): HTMLElement {
    const list = createGrid('targets');
    enemies.forEach((enemy) => {
        const button = createButton(
            `${enemy.selected ? 'VYBRÁNO · ' : ''}${enemy.name}  ${Math.max(0, enemy.hp)}/${enemy.maxHp}`,
            (targetButton) => sendCommand(root, targetButton, { type: 'selectEnemy', index: enemy.index }),
            enemy.selected ? 'selected' : 'secondary',
            enemy.hp <= 0,
            true,
        );
        button.setAttribute('aria-pressed', String(enemy.selected));
        list.appendChild(button);
    });
    return list;
}

function createGrid(layout: 'answers' | 'actions' | 'targets'): HTMLElement {
    const grid = document.createElement('section');
    grid.className = 'remote-grid';
    grid.dataset.layout = layout;
    return grid;
}

function createButton(
    label: string,
    onClick: (button: HTMLButtonElement) => void,
    variant: 'primary' | 'secondary' | 'selected' | 'answer' | 'disabled' = 'primary',
    disabled = false,
    commandButton = false,
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'remote-button';
    button.dataset.variant = variant;
    button.dataset.command = String(commandButton);
    button.textContent = label;
    button.disabled = disabled;

    const release = () => button.classList.remove('is-pressed');
    button.addEventListener('pointerdown', () => {
        if (!button.disabled) button.classList.add('is-pressed');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('blur', release);
    button.addEventListener('click', () => onClick(button));
    return button;
}

function sendCommand(root: HTMLElement, source: HTMLButtonElement, command: RemoteCommand): void {
    if (root.dataset.pending === 'true') return;

    root.dataset.pending = 'true';
    source.dataset.pending = 'true';
    source.dataset.originalLabel = source.textContent ?? '';
    const pictureChoice = source.querySelector('img') !== null;
    if (!pictureChoice) source.textContent = 'Odesláno';

    root.querySelectorAll<HTMLButtonElement>('button[data-command="true"]').forEach((button) => {
        button.dataset.disabledBeforePending = String(button.disabled);
        button.disabled = true;
    });

    const status = root.querySelector<HTMLElement>('.remote-status');
    if (status) status.textContent = 'Čekám na TV';
    vibrate(24);
    service.sendCommand(command);

    clearPendingTimer();
    pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        root.dataset.pending = 'false';
        root.querySelectorAll<HTMLButtonElement>('button[data-command="true"]').forEach((button) => {
            button.disabled = button.dataset.disabledBeforePending === 'true';
            delete button.dataset.disabledBeforePending;
        });
        source.dataset.pending = 'false';
        if (!pictureChoice) source.textContent = source.dataset.originalLabel ?? source.textContent;
        if (status) status.textContent = 'Zkus znovu';
    }, COMMAND_TIMEOUT_MS);
}

function createStatus(text: string): HTMLElement {
    const status = document.createElement('div');
    status.className = 'remote-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = text;
    return status;
}

function getStatusText(state: RemoteControllerState): string {
    switch (state.screen) {
        case 'battleTurn':
            return 'Ovladač je připravený.';
        case 'math':
            return 'Vyber jednu odpověď.';
        case 'waiting':
            return 'Probíhá animace na TV.';
        case 'feedback':
            return 'Potvrď pokračování.';
        case 'disconnected':
            return 'Spojení s TV není aktivní.';
        case 'pairing':
            return 'Čekám na TV.';
        case 'home':
            return 'Ovladač je připojený.';
    }
}

function clearPendingTimer(): void {
    if (pendingTimeout === null) return;
    window.clearTimeout(pendingTimeout);
    pendingTimeout = null;
}

function vibrate(durationMs: number): void {
    try {
        navigator.vibrate?.(durationMs);
    } catch {
        // Haptics are optional and commonly blocked by browser settings.
    }
}

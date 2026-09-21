import { COMPARISON_CHOICE_SCALE } from '../ui/ComparisonPresentation';

export const CONTROLLER_STYLES = `
    :root {
        color-scheme: dark;
        --remote-bg: #171614;
        --remote-panel: #28241f;
        --remote-panel-strong: #332b20;
        --remote-border: #66583f;
        --remote-gold: #e8c861;
        --remote-gold-bright: #ffe18a;
        --remote-text: #f5f1e8;
        --remote-muted: #bdb5a7;
        --remote-green: #2f6e45;
        --remote-green-border: #69b57d;
        --remote-red: #7b3434;
        --remote-answer: #e4c85f;
        --remote-answer-text: #211d17;
    }

    * {
        box-sizing: border-box;
    }

    html,
    body {
        margin: 0;
        min-height: 100%;
        background: var(--remote-bg);
    }

    body {
        color: var(--remote-text);
        font-family: Arial, sans-serif;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        user-select: none;
    }

    #remote-controller-root {
        width: min(100%, 600px);
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0 auto;
        padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
            max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .remote-header {
        padding: 17px 18px;
        border: 1px solid var(--remote-border);
        border-left: 4px solid var(--remote-gold);
        border-radius: 8px;
        background: var(--remote-panel);
    }

    .remote-header h1 {
        margin: 0;
        color: var(--remote-gold-bright);
        font-family: Georgia, "Times New Roman", serif;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
        overflow-wrap: anywhere;
    }

    .remote-header p {
        margin: 9px 0 0;
        color: var(--remote-muted);
        font-size: 17px;
        line-height: 1.35;
        letter-spacing: 0;
    }

    .remote-problem,
    .remote-code {
        min-height: 116px;
        padding: 24px 18px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        text-align: center;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: 0;
    }

    .remote-comparison { grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr); gap: 12px; font: 700 42px Arial, sans-serif; }
    .remote-comparison-side { display: grid; justify-items: center; gap: 8px; }
    .remote-comparison-side small { font-size: 26px; color: #486b35; }
    .remote-comparison-slot { width: 48px; height: 64px; border: 2px dashed #917747; border-radius: 9px; }
    .remote-comparison-pieces { display: grid; grid-template-columns: repeat(3, 28px); min-height: 64px; gap: 3px; justify-content: center; align-content: center; }
    .remote-comparison-pieces img { width: 28px; height: auto; }
    .remote-comparison-pieces.size { width: 88px; height: 96px; display: flex; align-items: center; justify-content: center; }
    .remote-comparison-answers { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
    .remote-comparison-choice { display: grid; gap: 8px; justify-items: center; }
    .remote-comparison-reminder { width: 40px; height: 37px; object-fit: contain; }
    .remote-comparison-answers .remote-button { padding: 8px; min-height: 80px; }
    .remote-comparison-answers .remote-button img { width: ${58 * COMPARISON_CHOICE_SCALE}px; height: ${54 * COMPARISON_CHOICE_SCALE}px; object-fit: contain; }

    .remote-problem {
        background: #f4efe3;
        color: #241f19;
        border: 3px solid #c8ad55;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 42px;
    }

    .remote-code {
        background: var(--remote-panel-strong);
        color: var(--remote-gold-bright);
        border: 2px solid var(--remote-gold);
        font-size: 52px;
        letter-spacing: 0;
    }

    .remote-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 11px;
    }

    .remote-button {
        width: 100%;
        min-width: 0;
        min-height: 68px;
        padding: 14px 18px;
        border: 2px solid var(--remote-green-border);
        border-radius: 8px;
        background: var(--remote-green);
        color: #f4fff5;
        box-shadow: 0 4px 0 #173823;
        font: 700 23px/1.15 Arial, sans-serif;
        letter-spacing: 0;
        overflow-wrap: anywhere;
        text-align: center;
        cursor: pointer;
        transition: transform 70ms ease, filter 70ms ease, box-shadow 70ms ease, opacity 120ms ease;
    }

    .remote-button[data-variant="secondary"] {
        border-color: #85765e;
        background: #39342d;
        color: var(--remote-text);
        box-shadow: 0 4px 0 #171411;
    }

    .remote-button[data-variant="selected"] {
        border-color: var(--remote-gold-bright);
        background: #514221;
        color: #fff5c5;
        box-shadow: 0 4px 0 #241d0d;
    }

    .remote-button[data-variant="answer"] {
        border-color: #fff0a1;
        background: var(--remote-answer);
        color: var(--remote-answer-text);
        box-shadow: 0 4px 0 #746123;
        font-size: 27px;
    }

    .remote-button:not(:disabled):active,
    .remote-button.is-pressed {
        transform: translateY(3px) scale(0.99);
        filter: brightness(1.14);
        box-shadow: 0 1px 0 #171411;
    }

    .remote-button[data-pending="true"] {
        filter: brightness(1.18);
        border-color: #ffffff;
    }

    .remote-button:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
    }

    .remote-button:disabled {
        border-color: #514c43;
        background: #302e2a;
        color: #8f8980;
        box-shadow: none;
        cursor: default;
        opacity: 0.75;
    }

    .remote-input {
        width: 100%;
        min-height: 66px;
        padding: 14px 16px;
        border: 2px solid var(--remote-border);
        border-radius: 8px;
        background: #211f1b;
        color: var(--remote-text);
        font: 700 26px/1 Arial, sans-serif;
        letter-spacing: 0;
        text-align: center;
        text-transform: uppercase;
        user-select: text;
    }

    .remote-input:focus {
        border-color: var(--remote-gold);
        outline: 2px solid transparent;
    }

    .remote-status {
        min-height: 24px;
        margin-top: auto;
        padding: 4px 2px 0;
        color: var(--remote-muted);
        font-size: 15px;
        line-height: 1.3;
        letter-spacing: 0;
        text-align: center;
    }

    #remote-controller-root[data-pending="true"] .remote-status {
        color: var(--remote-gold-bright);
    }

    @media (min-width: 640px) {
        .remote-grid[data-layout="answers"] {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }
`;

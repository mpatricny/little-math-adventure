# TV Remote Protocol

This contract keeps the Samsung TV game authoritative. A controller never calculates combat, validates an answer, advances a turn, or owns player data. It renders the latest TV state and sends a small command describing player intent.

## Controller States

| State | Published by | Controller content | Valid commands |
| --- | --- | --- | --- |
| `pairing` | `TvPairingScene` | room code and connection status | none |
| `home` | `TvPairingScene` | training battle launch | `startTrainingBattle` |
| `battleTurn` | `BattleScene` | living enemies, selected target, attack and optional potion | `selectEnemy`, `attack`, `usePotion` |
| `math` | `BattleScene` through `MathBoard` | formatted problem and three answer choices | `answerChoice` |
| `feedback` | `BattleScene` or `VictoryScene` | correction, victory, or defeat action | `continue` |
| `waiting` | any active TV scene | non-interactive animation/transition status | none |
| `disconnected` | controller application | local connection failure | none |

## Command Handling

1. The phone gives immediate local feedback: pressed state, optional vibration, `Odesláno`, and a temporary input lock.
2. The relay forwards the command without interpreting it.
3. The active TV scene checks whether the command is valid for its current phase.
4. The TV publishes the next state. This state is the acknowledgement and unlocks the phone UI.
5. If no state arrives within 1.8 seconds, the phone unlocks and lets the player retry.

This prevents rapid taps from submitting two answers or advancing two scenes while keeping the combat state entirely on the TV.

## Fullscreen

Fullscreen is deliberately outside `RemoteCommand`. Browser fullscreen permission requires a user gesture in the TV browser itself, so `TvFullscreenController` reacts to the pairing-screen button or the Samsung remote `OK`/Enter key. Standard, WebKit, and Microsoft-prefixed APIs are contained in that adapter.

## Extension Rule

To add another game screen:

1. Add a controller state or reuse an existing generic state.
2. Add only intent-level commands to `src/remote/types.ts`.
3. Publish state from a narrow scene integration point.
4. Validate every command against the TV scene's current state before applying it.

Do not expose save data, combat calculations, or scene internals to the controller. A future hosted relay or Chromecast display can reuse this protocol without changing game rules.

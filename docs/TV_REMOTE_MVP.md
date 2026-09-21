# TV Remote MVP

Samsung-only MVP for running the game on a TV browser while a phone or tablet acts as the controller.

## Scope

- TV mode starts at `/tv`.
- Controller mode starts at `/controller`.
- A local WebSocket relay pairs one TV host with one or more controllers in the same room.
- The first playable flow is a single-player training battle.
- The existing battle system stays authoritative on the TV. The controller only sends commands and renders a simplified state.

## Local Run

Run both processes from the project root:

```bash
npm run remote:relay
npm run dev:tv
```

The relay prints local WebSocket addresses, for example:

```text
ws://192.168.3.10:8787
```

Open the TV app on the Samsung TV browser with the matching computer IP:

```text
http://192.168.3.10:8001/tv
```

Do not use `localhost` on the TV or phone. `localhost` would point to the TV or phone itself, not to the development computer.

The TV displays:

- a four-character room code,
- the controller URL,
- pairing status.

Press `OK` on the Samsung TV remote while the pairing screen is open to enter fullscreen. The same action is available through the fullscreen button in the upper-right corner. Fullscreen must be initiated on the TV itself because browsers require a local user gesture; a phone command cannot grant fullscreen permission to another device.

Open the displayed controller URL on a phone or tablet connected to the same Wi-Fi. If typing manually, use:

```text
http://192.168.3.10:8001/controller
```

Then enter the room code shown on the TV.

## Verification Flow

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

1. TV shows the pairing scene.
2. Phone connects and shows `Spustit tréninkový boj`.
3. Pressing that button starts `BattleScene` on the TV.
4. Phone shows the current enemy and an attack button.
5. Pressing attack opens the math question on the phone.
6. Selecting an answer sends it to the TV battle.
7. A pressed controller button moves visibly, triggers optional phone haptics, and remains locked until the TV publishes its next authoritative state.
8. Victory and defeat both return to the TV pairing menu without requiring mouse or touch input on the TV.

## Architecture

Remote code is intentionally isolated:

- `src/remote/` contains shared protocol types, relay client, controller app, and mode helpers.
- `src/remote/TvFullscreenController.ts` contains browser fullscreen compatibility and Samsung-oriented vendor fallbacks.
- `scripts/remote-relay.mjs` is the local pairing relay.
- `src/scenes/TvPairingScene.ts` owns TV pairing and training battle launch.
- `BattleScene`, `MathBoard`, and `VictoryScene` only expose/publish remote state at narrow integration points.

This keeps the current combat rules, turn order, math board, and victory flow unchanged.

The state and command contract is documented in `docs/TV_REMOTE_PROTOCOL.md`.

## Future Extension Points

- Chromecast or hosted web version can reuse the same controller protocol.
- A production relay can replace `scripts/remote-relay.mjs` without changing battle integration.
- Multi-controller support is already allowed at relay level, but the MVP only treats controllers as mirrors for the same single-player command stream.

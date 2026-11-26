# Local foreground play time — 17 November 2026

## Contract and scope

`PlayerState.playTime?: { version: 1; days: Record<string, number> }` stores measured
milliseconds by local calendar date (`YYYY-MM-DD`). It is independent of mastery,
answer response times, analytics consent, cloud sync and the database. No database
migration is needed for this frontend change.

`LocalPlayTime.recordPlayTime(player, fromMs, toMs)` adds only an observed interval.
It splits at local midnight using calendar boundaries, including daylight-saving
changes. An absent field/day remains unmeasured; no old session span or answer
timing is converted into play time. An explicitly measured zero interval can
create a zero day. DailyProgressSystem and its UI are owned by the parent task.

## Measurement rules

- The existing pure `ActivityClock` validates intervals. It accepts a maximum
  five-second sample gap and rejects a wall-clock/monotonic-clock disagreement
  greater than two seconds, so suspended timers and sleep are not reconstructed.
- One-second samples use monotonic elapsed time, even for a small wall-clock
  correction. There is no input idle cutoff: a child thinking about a long problem
  in the focused foreground game keeps accumulating time.
- The page must be visible and focused. Window/Phaser blur, hidden pages,
  `pagehide`, game/scene pause, sleeping scenes, loading and hidden scene surfaces
  stop measurement. Focus, visibility, `pageshow`, resume and scene creation
  establish a fresh active boundary.
- Setup, settings, boot/loading, explicit debug/mock previews and main menus are
  excluded. `PlayersHubScene` is explicitly excluded, as are its production
  `MenuNewScene` and `CoopSetupScene` keys. Production Silverpond scene keys that
  still contain “Mock” are not broadly excluded by their spelling.
- Both GameStateManager preview profiles are excluded. The previous real profile
  is checkpointed before entering a preview; preview play never reaches its save.
- Co-op credits both participating heroes for the entire common active interval,
  independently of the active A/B role, hero/pet turns, or which mana lane answers.

## Persistence and ownership

Samples are held in memory and saved every 15 seconds, and immediately at relevant
scene, page, pause, save, profile-load, reload, preview and co-op boundaries. Normal
page exit/reload checkpoints the remaining time. An abrupt process/OS failure
without a lifecycle event can lose up to the last 15 seconds; no time is invented
on the next load to fill that gap.

Each pending interval carries both slot index and stable profile ID. A deleted or
replaced slot cannot inherit the prior hero's interval. `SaveSystem.addLocalPlayTime`
reads a fresh snapshot and patches only the time field; it never writes the
singleton's potentially stale mana-lane statistics. Active-player synchronization
also changes only `playTime`. It does not activate a role or change mastery data.

Ordinary `SaveSystem.save` checkpoints time first, then merges the stored time
field for the same profile ID using the maximum per day. This prevents a detached
mana lane or an older hydrated player object from erasing time on its next save.
The incoming gameplay/statistics remain authoritative for that normal save.
Different profile IDs do not merge.

Checkpoint reentrancy is guarded. Pending intervals are removed before persistence
callbacks; a synchronous observer save/load cannot count them twice. If an
observer changes the active profile, the runtime samples the new context at the
same timestamp before returning. Blocked writes retain their pending interval for
a later successful checkpoint.

## Files

- `src/systems/LocalPlayTime.ts`: pure day accounting, shared-clock adapter and batching.
- `src/systems/LocalPlayTimeRuntime.ts`: browser/game lifecycle and profile ownership.
- `src/systems/LocalPlayTimeBridge.ts`: dependency-light checkpoint hooks.
- `src/types/index.ts`: only the new optional PlayerState field for this task.
- `src/main.ts`: start/stop independent of analytics consent.
- `src/systems/SaveSystem.ts`: fresh field-only time writes and stale-save merge.
- `src/systems/GameStateManager.ts`: load, swap, reload and preview boundaries.
- `src/systems/CoopSessionManager.ts`: common-session boundaries.
- `src/systems/SceneAssetPlugin.ts`: actual Phaser lifecycle boundaries.
- `src/ui/PauseMenu.ts`: existing clock pause/resume boundaries; no UI change.

## Verification

`TZ=Europe/Prague npx vitest run src/systems/__tests__/LocalPlayTime.test.ts src/systems/__tests__/LocalPlayTimeRuntime.test.ts src/systems/__tests__/SaveTransfer.test.ts src/systems/__tests__/CoopCasualMode.test.ts src/systems/__tests__/DailyProgressSystem.test.ts --exclude 'artifacts/**'`

Result: **68/68 passed**, including 24 new tests. The new checks cover local
midnight and both 23/25-hour DST days, invalid samples, sleep gaps, small/large
clock corrections, a ten-minute problem without clicks, independent/shared
profiles, pause/blur/hidden/pagehide, both previews, save export/import, delayed
checkpoint flush, stale detached mana saves, fresh-stat reload, replaced slots,
write guards and a reentrant save observer that loads another profile.

Targeted strict TypeScript compilation of all three new modules and both test
files passes when including `src/vite-env.d.ts`. Full-project `tsc` still reports
the repository's unrelated scene/test diagnostics; it is not a clean baseline.

Tests use in-memory storage and fake lifecycle events only. No browser, real
profile, backend or database was modified. There is no visible UI change in this
scope, so no new visual acceptance is claimed by these tests.

# Returning to an unfinished learning band without losing later progress

`MasteryData.requiredBand` is an optional, explicit repair field. It is not
inferred from a player name or applied automatically to existing saves.
Profiles without the field keep their normal highest-unlocked-band behavior.

When the required band is open, still `training`, and at or above the original
`selectedStartBand`, it takes priority in `getLearningBand` and
`getLearningFrontier`. Combat, mana and shop preparation use that same frontier.
Later sub-atoms and bands keep their states, medals, answers and counters.
Their exams and co-op promotions are temporarily unavailable; pending co-op
checkpoints, retry items and slow items are retained, not discarded.

Passing the required band's normal gate removes the requirement and clears
unanswered scheduling caches. The next frontier is selected from the preserved
later state. Resuming a previously fluent first atom must never demote it to
training. Save/reload and per-player co-op tracks preserve the field.

Do not use `PlacementInitializer.dropOneBand` for this repair: it deliberately
resets the previous and later bands for a different workflow. Do not move the
original placement forward either: hydration treats lower bands as placement
credit and would falsely complete the missing band.

## Preparing a device-specific repair

The browser origin owns the save. Obtain a fresh export from the actual device
and address after play has stopped; close all game tabs before applying it.
For a LAN development game, `/__learning-diagnostics` collects a read-only
snapshot and `/__learning-repair` applies the reviewed plan. These endpoints
are excluded from pilot builds.

Generate a **new** one-profile plan, supplying the reviewed slot and exact name:

```sh
node --import ./server/node_modules/tsx/dist/loader.mjs scripts/prepare-learning-return.mts \
  --input artifacts/save-diagnostics/snapshot.json \
  --output artifacts/save-diagnostics/new-return-plan.json \
  --slot 1 --player 'Profile name' --band D
```

The output is created exclusively (`wx`), never overwritten. The generator
refuses a completed target, a locked target, a target below placement, duplicate
slots, or a mismatched player. It preserves the whole input and only adds the
requirement plus resets unanswered scheduling caches in the proposed copy.

After isolated verification, archive the previous active `repair-plan.json`
and activate the reviewed plan. The guarded repair validates all math stats
against the fresh snapshot and also checks the gameplay profile ID when one is
available. It backs up before writing, checks for concurrent changes, verifies
the result, rolls back a failed write, and accepts retries without replacing the
first local backup. Any new play invalidates the old plan: export again.

Use an updated client when reopening the game; an older client ignores the
field. Never use a PostgreSQL report as a replacement for the live local save,
and never upload isolated QA copies under real telemetry identities.

## Verification

This client/save repair does not depend on a PostgreSQL migration. Server
telemetry verification is separate and requires checking its migration state.

```sh
npx vitest run --exclude 'artifacts/**' src/systems/__tests__/CoopCasualMode.test.ts
node --import ./server/node_modules/tsx/dist/loader.mjs --test \
  scripts/__tests__/learning-return.test.mts scripts/__tests__/learning-save-repair.test.mjs
```

Test a fresh device copy in an isolated context with telemetry blocked and
`X-Learning-QA: 1`. Check both Canvas and WebGL, solo and co-op, combat/mana/shop,
retained later achievements, normal gate completion and resumption, reload,
idempotency, stale-save refusal, rollback and unaffected other profiles.
Review screenshots using `UI_PRE_READER_GATES.md`; functional success is not
approval of existing text-heavy player UI.

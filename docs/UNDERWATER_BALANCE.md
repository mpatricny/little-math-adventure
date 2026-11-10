# Underwater battle balance — 4 November 2026

## Live production result

The complete underwater roster is now live, including **Pancéřový koník** and
**Runová loděnka**, their elite forms and the five stronger existing species.
The new species' real motion metadata, final encounter links and five existing
elite attack increases were promoted together. This report reads the actual
production catalog; there are no placeholder species or missing-art roster links.

The entry now matches the final Silverpond arena's pressure and duration:
**31.4 versus 30.0 damage received, over 7.9 versus 8.1 rounds** for the tide/steady
scenario. Later fights add different kinds of pressure: the optional wreck hits
harder, the gate takes longer, and the three-phase guardian extends both damage
and duration. This is not a claim that every metric increases in every room.

These are 500-seed, full-HP isolated fights with at most one potion per hero.
Co-op has two identical tide heroes; damage is the party total. Potions are
carried, never refilled, in the separate route audit below.

| Fight | Solo rounds | Solo damage | Co-op rounds | Co-op party damage |
|---|---:|---:|---:|---:|
| Final Silverpond arena | 8.1 | 30.0 | 5.9 | 19.9 |
| Shallows | 7.9 | 31.4 | 6.1 | 23.2 |
| Garden | 7.9 | 31.6 | 6.2 | 23.4 |
| Canal | 8.2 | 27.9 | 6.5 | 22.1 |
| Chamber | 9.0 | 29.8 | 7.1 | 23.0 |
| Wreck | 8.7 | 36.9 | 7.2 | 29.8 |
| Optional grotto | 8.1 | 25.0 | 6.4 | 19.1 |
| Gate | 9.8 | 27.6 | 7.9 | 22.3 |
| Guardian | 12.9 | 40.3 | 9.5 | 26.5 |

All arena and forest rosters/policies remain unchanged. The author's existing
pearl jellyfish **32 HP / 9 attack / 5 defense / 5–25 gold** is preserved. Free
healing, checkpoints, mathematical learning, preparation and save compatibility
remain in place. There is no new fee, required upgrade or accuracy gate.

## Production data and combat rules

`public/assets/data/enemies.json` is the only live enemy catalog.
`public/assets/data/encounters.json` owns rosters, order, policies and boss phases.
Existing encounter IDs and save progress keys stay stable. `rank: "elite"` selects
the shared gold/three-crystal crest. `baseEnemyId` preserves the original species'
pet unlock while the defeated variant retains its own history identity.

| Enemy | HP | Attack | Defense |
|---|---:|---:|---:|
| Hlubinný šupináč | 52 | 10 | 4 |
| Hlubinný mlok | 54 | 10 | 4 |
| Hlubinný rak | 60 | 10 | 5 |
| Hlubinný krunýřník | 58 | 10 | 5 |
| Hlubinná medúzka | 54 | 10 | 4 |
| Pancéřový koník | 48 | 9 | 3 |
| Hlubinný koník | 60 | 9 | 5 |
| Runová loděnka | 56 | 9 | 4 |
| Hlubinná loděnka | 60 | 9 | 5 |

| Room | Live solo roster |
|---|---|
| Shallows | Deep scalefish ×2 |
| Reed garden | Deep scalefish + deep axolotl |
| Sunken canal | Deep crab + armored seahorse |
| Current chamber | Deep turtle + rune nautilus |
| Postal wreck | Deep crab + deep axolotl |
| Optional glow grotto | Deep jellyfish + rune nautilus |
| Depth gate | Elite seahorse + elite nautilus |
| Lake heart | Three guardian phases |

Garden/canal are unordered branches. Chamber/wreck add sustained pressure;
the optional grotto stays near the branch tier. Gate elites have equal combat
stats, so either target order has the same outcome distribution. Their armor and
endurance take 9.8 rounds; they are not simply another attack-power increase.

Guardian phases are **52/10/4 → 56/10/3 → 60/9/5** (HP/attack/defense). Phase 2
adds 4 damage every second attack per defender; the grotto blessing removes that
bonus on the first strong wave for each defender. Existing 20% own-max-HP heals
after phases 1 and 2 are preserved. Phase 3 has no accuracy gate or time limit.
Defense is subtracted once per complete attack, and full correct attacks still
penetrate armor with the weaker audited attack-8 build.

Regular co-op fights retain the complete two-enemy roster and scale each HP by
**1.55, rounded up**. Attack, defense and order stay unchanged. Boss phases retain
**1.35** HP scaling. Forest append-last and arena policies keep their previous
behavior. This avoids the former underwater third enemy's additional burst
against a low-HP partner and gives that child another turn to recover.

Each co-op participant receives the full actual roster's gold pool, at least the
solo pool. The former extra third enemy's gold is intentionally gone; there is
no invisible reward source. Personal chest rewards are unchanged. Canonical base
links must reference a different unranked enemy; optional `frameTopInset` must be
nonnegative and finite. Balance promotion preserved live animation geometry.

## Reproduction and model limits

```sh
BALANCE_RUNS=500 node --import ./server/node_modules/tsx/dist/loader.mjs \
  scripts/underwater-balance.ts --json > artifacts/underwater/balance-applied-500.json

npm test -- --run src/simulation src/systems/__tests__/Underwater*.test.ts \
  src/systems/__tests__/EncounterCatalog.test.ts src/systems/__tests__/Combat*.test.ts \
  --exclude 'artifacts/**' --reporter=dot --silent
```

Database preflight: these audits and tests read local JSON, pure combat helpers
and mocked/local save state. They do not depend on a database or unapplied
analytics migrations. No database or player-save migration is required.

The live report is `artifacts/underwater/balance-applied-500.json`. A fresh
supplementary fluent route run is
`artifacts/underwater/balance-fluent-no-potion-routes-500.json`. Historical rejected
alternatives and their exact catalog snapshots remain under
`artifacts/underwater/balance-pressure-review/`; they are not runtime fallbacks.
`ProductionEncounterAdapter` supports explicit catalog injection for such audits;
the CLI defaults exclusively to live production JSON.

`CombatEncounterSimulator` reuses production attack compression, complexity,
defense, shield block, pet training and preparation helpers. Speed arithmetic is
shared with the actual HUD through `SpeedChargeSystem`. It models A, B, pet A,
pet B, then **every surviving enemy**. The legacy serial, one-enemy-at-a-time
`BattleSimulator` is not the evidence for this rebalance. A boss phase kill
interrupts remaining allied actions; the next phase attacks immediately. Co-op
enemies focus one alternating defender for the entire enemy round. Fallen heroes
skip attacks/pets and are not revived inside a fight. Phase healing uses each
living hero's own maximum HP.

Every isolated row uses seeds **1–500**, independent Mulberry32 streams, a
**120-round cap**, front/reverse targets, solo, equal co-op and asymmetric co-op.
The report includes 17 scenarios and 918 isolated rows, plus complete routes and
a synthetic arena-reference route. No sampled run hit the round cap. Outputs
include rounds, damage, healing, questions, potion use and individual fall rates.
Damage is accumulated received damage, including damage later healed.

A round means one opportunity for each living hero/pet followed by enemies,
except when victory or a phase transition interrupts it. It is not elapsed
screen time. No real child accuracy or learned progress is inferred.

| Build | HP / earned attack | Catalog equipment and pet |
|---|---|---|
| Legacy/weak B | 24 / 8 | Iron sword/shield, wolf |
| Tide | 32 / 12 | Tide sword/shield, scalefish pet |
| Pearl | 40 / 18 | Pearl sword/shield, crab pet |
| Depth gear | 32 / 12 | Depth sword/shield, crab pet |
| Old E2E fixture | 55 / 8 | Iron sword/shield, no pet |

These are explicit scenarios, not observed distributions or mandatory entry
stats. Players start at 10 HP/1 attack; silver/gold exams add 1 HP/1 attack while
bronze adds HP. Equipment/pet values are imported from production. The old
55-HP fixture's weak iron gear does not make it an expected-win build for the
final Silverpond arena.

`steady` means 85/80/85/85% hero/sword/pet/block first answers with swift independent
answers; `fluent` is 95/90/95/95%. `careful` is 90/85/90/90% slow, receiving neither
charge damage nor doubled shield blocks. Weak B uses 70/65/70/70% slow. Main rows
have no three-operand bonus, assistance, preparation or blessing. Other rows test
25% genuine three-operand questions, no pet/potion, ineligible mastery charges and
the blessing. Normal mastery-pool questions qualify for charges; fallback
questions without mastery/comparison metadata do not. The simulator supports the
underwater tidal mechanic and rejects unsupported boss abilities explicitly.
These abstractions do not replace child playtesting or visual review.

## Wins and weaker co-op partners

Solo tide/steady, front targets for potion rows; no-potion ranges cover both orders:

| Fight | Win, one potion | Win, zero potions |
|---|---:|---:|
| Final Silverpond arena | 92.4% | 62.0% |
| Shallows | 96.4% | 55.2% |
| Garden | 96.0% | 53.4–55.4% |
| Canal | 97.4% | 60.8–71.2% |
| Chamber | 96.4% | 49.6–54.2% |
| Wreck | 90.4% | 28.2–45.6% |
| Optional grotto | 98.6% | 57.8–76.8% |
| Gate | 96.8% | 70.6% |
| Guardian | 96.8% | 59.6% |

Equal tide co-op wins 99.8–100% of isolated no-potion fights, while receiving more
entry pressure than the arena. Extreme asymmetric co-op needs separate reporting:
with no potions, tide A plus weak B wins 65.2% in the final arena, 54.6% at entry,
44.2–51.6% in the chamber, 53.0% at the gate and 81.2% at the boss. With one potion
each, weak B falls in 71% of entry fights, 100% of chamber/gate fights and 94% of
boss fights; the source arena is 83%. **Party wins do not mean both children
survive.** This remains a material playtest limitation rather than an assumption
that the weaker child owns expensive equipment.

The accepted tuning raises only the five existing-species elite attacks to 10.
Increasing the gate elites to attack 10 or 68 HP substantially worsened weaker
co-op continuation and was rejected. The armor/endurance gate remains distinct.

## Checkpoints, consumables and economy

Routes derive encounter links from `underwater-rooms.json`, complete both branches
in both orders, and carry each hero's HP and potion flag between fights. Shallows
can reach the free hub spring; solved mechanisms and the unlocked gate spring
heal HP. Wreck has no heal, so a direct crossing carries damage into the next
branch. Optional grotto adds its battle and blessing. Descent removes 1 HP,
bounded at 1. Puzzle solving is assumed successful; no fake arithmetic result,
mastery or reward is awarded.

**Springs and mechanisms never refill potions.** A route begins with zero or one
potion per participant. Defeat restores HP at the real checkpoint and retains
previous wins, but never restocks a potion. Three attempts means at most two
retries of each uncleared fight, without replaying completed fights for rewards.

| Tide/steady mandatory route | No potions, uninterrupted | No potions, at most 3 attempts/fight | Mean retries |
|---|---:|---:|---:|
| Solo, garden first | 1.2% | 55.2% | 2.94 |
| Solo, canal first | 1.8% | 56.8% | 3.00 |
| Equal co-op, either order | 100.0% | 100.0% | 0.00 |
| Asymmetric, garden first | 4.6% | 59.6% | 2.97 |
| Asymmetric, canal first | 3.4% | 62.4% | 2.92 |

With one carried potion each, bounded solo completion is 61.8–64.2%; asymmetric
is 65.4–68.6%. Including both optional fights/direct wreck crossing, no-potion
bounded steady completion is 28.2–28.8% solo and 21.0–22.4% asymmetric. Those detours
are materially harder. Mean retries include runs stopped by the attempt cap.
No free heal at the wreck was invented to improve the figures.

With **the same tide stats/gear and fluent answers**, no-potion mandatory routes
finish 81.2–81.4% uninterrupted solo and 83.4–84.0% asymmetric. Within three attempts,
both reach 100% in these 500 seeds, averaging 0.19–0.22 retries. Including optional
fights reaches 99.4–100% with that retry ceiling; a direct wreck crossing often
requires a checkpoint retry. This demonstrates a viable route through accurate
play without expensive upgrades or repeated potion restocking, not a promise
about every child's accuracy. Pearl and depth-gear steady routes also reach 100%
within three attempts with fewer retries.

The synthetic comparator resolves the actual final arena wave at each same route
combat slot, retaining the same heals/retries. It is not a real game route or
copied roster. Tide/steady/no-potion/garden-first reaches 54.8% solo with 3.27
retries versus underwater 55.2% with 2.94; asymmetric reaches 81.4% with 2.45 versus
underwater 59.6% with 2.97. The asymmetric regression is real. For fluent profiles,
the reference route is 87.2% uninterrupted solo and 91.2% asymmetric, so underwater
is modestly harder at 81.2–81.4% and 83.4–84.0%. Both catalogs reach 100% within the
retry ceiling. These are complete-route probabilities, without silently restored
consumables between fights.

Guaranteed pre-boss copper per participant, derived from live enemy minima and
`underwater-rooms.json`:

| Rewards collected | Minimum copper |
|---|---:|
| Mandatory battles + two mandatory chests | 137 |
| Also optional wreck + both wreck chests | 187 |
| Also optional grotto | 211 |

The pearl set costs 401, the depth set 681 and one pearl shield 189. Those purchases
cannot be assumed from mandatory rewards. No new healing fee, potion charge,
progression gate, required shop detour or reward increase was introduced. Existing
chests still contain 39 copper in total. Each co-op participant gets a full pool.

## Verification boundary

**195 scoped tests in 22 source files passed** after joint production promotion.
The semantic entry regression now requires comparable arena pressure and duration,
rejects the weak base creatures and the former unadjusted two-enemy attacks, and
separately checks fair bounded no-potion continuation. It does not pin an exact
production composition, HP total or single-fight golden win rate. Other coverage
includes simultaneous enemies, shared damage/block/charge/complexity/preparation,
phase interruption/healing, per-defender waves/blessings, defense locks, catalog
injection/policy cloning, pet identity, frame geometry and route potion carry.

The command excludes `artifacts/**` because broad Vitest path matching can also
select a pre-existing incomplete commit snapshot there. Earlier stale forest-stat
goldens were replaced with production-derived expectations without modifying
those enemies. Existing repository-wide TypeScript issues outside this work are
not claimed fixed.

Visual acceptance is separate: apply `docs/UI_PRE_READER_GATES.md` and
`docs/ASSET_CREATION.md`, including desktop/tablet and Canvas/WebGL. The crest
communicates rank visually and short names remain runtime labels. Source motion,
registration and visual evidence are documented in
`docs/UNDERWATER_CREATURE_ANIMATIONS.md`. Numerical success does not approve
art, animation clipping, hover geometry or the rest of the game's older UI.

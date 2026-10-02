# Forest crystal recovery — 29 September 2026

## Cause and scope

Older co-op victories persisted `verdant_guardian_defeated` and the combat
rewards, but returned to the lair without the forest-crystal story checkpoint.
The inspected current tablet export contains that victory marker in both
profiles. Re-running combat or importing an older save is unnecessary.

The normal solo/co-op save-load path now resumes an unclaimed forest crystal
from the explicit victory marker or story flag. Claiming the crystal, installing
it and entering Silverpond each persist a checkpoint for both co-op participants.
Reloading after installation reopens the exit, not the machine puzzle. Later
story flags never roll back; a finished pilot resumes in Mathoria.

Recovery changes story flags only. It does not replay combat rewards, alter
learning progress or copy the backed-up player object over the current save.
No database migration is required. The tablet applies the checkpoint through
normal play after reloading the local game and selecting the two heroes.

## Focused verification

- `ForestCrystalProgression.test.ts` + `SilverpondProgressSystem.test.ts`: 13 passed.
- `e2e/coop/forest-guardian.spec.ts`: both targeted scenarios passed (normal
  victory and legacy recovery, about 19 seconds each); no full suite was run.
- An isolated browser loaded copies of the real tablet export. Before claiming,
  the only changed player field was `storyProgress`; both complete `mathStats`
  objects, inventories, equipment, levels and currencies remained unchanged.
- Browser checks covered reload before/after claiming, reversed co-op host order,
  the real machine puzzle and activation, reload after installation, and entry
  into Silverpond with both profiles retaining independent solo resume access.

Reviewed tablet-size Canvas images:

- `artifacts/release-recovery/eli-kitten-forest-crystal.png`
- `artifacts/release-recovery/eli-kitten-zyx-after-reload.png`
- `artifacts/release-recovery/eli-kitten-silverpond-exit-after-reload.png`
- `artifacts/release-recovery/eli-kitten-silverpond-recovered.png`

This is a persistence/routing repair, not a visual redesign or complete
pre-reader UI acceptance. Existing presentation limitations remain: Zyx's
dialogue uses multiline copy, and the Silverpond exit caption clips at the
right edge in Canvas. Its arrow remains clickable; the transition was verified.
Real tablet localStorage was not directly edited during validation. No release
or production deployment is included.

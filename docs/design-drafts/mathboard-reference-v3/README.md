# MathBoard: faithful reference slice

This replaces the rejected visual direction of `mathboard-workshop-v2`. It is
one playable arithmetic presentation, based directly on the author's approved
`training-modes-v1/03-mathboard-power-art.png` composition. The previous workshop
remains a functional inventory; its artwork is not approved.

## Run

```sh
npx vite --config docs/design-drafts/mathboard-reference-v3/vite.config.ts
```

Open <http://localhost:8013/docs/design-drafts/mathboard-reference-v3/index.html>.
The top `Předloha` button toggles the original design and pauses the scene while
it is obscured. `?renderer=canvas` exercises the Canvas fallback. The game canvas
contains only one optional word, `Celkem`; `Bez slov` hides it.

## What is implemented

- The actual shared `MathBoard` owns answers, timing, accumulated damage and the
  single callback after the full three-problem attack. The fixture is intentionally
  limited to one arithmetic variant while the art direction is reviewed.
- The original illustration supplies the parchment, dark leather/gold/blue-gem
  plaques, scenery and three characters. Its side scenery is cropped to the
  author's supplied 1326:941 viewport; the illustration is never stretched.
- Only the baked wooden answer row was removed by an image edit. A single wood
  frame was extracted/upscaled and normalized, then reused for all three answers.
  Frame, numeral and state mark move together inside stable hit targets.
- Runtime numerals are centered by their drawn ink. Correct/wrong outlines fit
  inside the wood bevel. A selected answer travels to the empty slot; wrong
  answers show the two groups of apples. Progress circles retain first answers.
- The current answer's strength and accumulated strength occupy the two original
  plaques. Correct damage transfers with a short particle and counting animation.
  The bottom arrow advances; the round arrow replays after completion.
- Existing speed-charge rules are retained: swift/lightning supply charges and
  four charges add one damage. No personal quick-time or economy rule is changed.
- All interactive and runtime content hosts, safe regions and the illustrated
  backdrop are in this preview's `scenes.json`, read through `SceneBuilder`.
  It does not replace the production scene catalog.

## Scope and isolation

This is a standalone visual approval slice, not a deployed BattleScene redesign.
The decorative plaques and static character art are still part of the reference
backdrop. They need separate assets before production scene-editor repositioning
or replacing the actors. No creature-motion approximation has been introduced.
Comparison, shield, pet and other variants remain pending visual approval of this
first screen. Do not treat the old navy-frame workshop as the design for them.

No database migration is required for these tests. The entry does not initialize
save synchronization, accounts, analytics, learning records or reward persistence.
The browser check verifies no API calls or localStorage writes.

## Font and asset sources

The bundled [Gelasio](https://github.com/google/fonts/tree/main/ofl/gelasio) is
metrics-compatible with Georgia, under the included SIL OFL license. It loads
before Phaser creates text, so Android does not silently substitute another serif.
`assets/Gelasio-OFL.txt` accompanies the unmodified font.
Generated bitmap provenance and normalization are recorded in `prompts.json`.

## Checks

`node docs/design-drafts/mathboard-reference-v3/review/verify.mjs` checks real
mouse and touch interactions, pointer-out cancellation, wrong-answer damage,
three answers and one completion, charge-based bonus damage, reset during an
animation, reference-view pause, Canvas text resolution and tablet target sizes.

`review/functional-review.json` is the machine report. `review/visual-review.json`
records the separately inspected pictures and limitations. Passing a browser
test does not constitute the author's visual approval.

# MathBoard workshop v2

**Visual direction rejected by the author on 2026-11-17.** Functional test
results below do not approve the artwork. The navy answer frames, spacious
composition and typography did not follow the approved concept. The corrective
single-screen review is in `../../mathboard-reference-v3/`.

This isolated workshop uses the production `MathBoard` to own first answers,
timings, batch progress, speed charges, and its one completion callback. Only its
presentation is replaceable. Production callers keep `SequentialMathView`.

`scenes.json` owns every static game-space host and safe area. The workshop loads
this separate catalog into `SceneBuilder`; it does not replace the game's scene
catalog. `catalog.ts` covers all runtime `MathProblem` forms and six comparison
stages. True/false is mentioned in old design prose but is not a current
`MathProblem` type, so it is not presented as an implemented game mechanic.

No database migration is needed for these checks: the preview has no save,
authentication, analytics or database middleware and runs on a separate origin.
It does not invoke mastery recording or rewards. Audio preferences alone can be
saved on this isolated origin when the reviewer enables sound.

The generated answer frame is a single source with fixed aspect-ratio end caps
and a straight stretchable center. Its number or symbol and feedback badge share
the same moving surface. Text is constructed at resolution 2 and optically
centered using its rendered alpha bounds. Root hit areas do not move.

The preview intentionally retains the current speed-charge rule (+1/+2 energy;
four energy yield one damage). A proposed personal baseline and direct +1 bonus
are not silently substituted here. Practice and exam screens show correctness;
preparation persistence and quest rewards remain owned by production systems.

Run the isolated server:

```sh
npx vite --config docs/design-drafts/mathboard-workshop-v2/vite.config.ts
```

Open `/docs/design-drafts/mathboard-workshop-v2/index.html` on port 8013.
`?renderer=canvas` forces Phaser's Canvas fallback.

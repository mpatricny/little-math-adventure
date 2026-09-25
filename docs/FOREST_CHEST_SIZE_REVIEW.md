# Forest chest size review — 25 September 2026

Scope: enlarge the existing forest word-lock overlay by 50%, as requested.
No puzzle generation, answer, reward amount, save format or database changes.
No database migration is needed for these presentation-only tests.

## Layout

- The canonical frame and letter-wheel templates use uniform scale 1.5.
  Frame bitmap bounds are 750 × 562.5 at the 1280 × 720 game resolution.
- Effective font sizes: riddle 15 → 22.5, title 18 → 27,
  submit 20 → 30, letters 32 → 48 game pixels.
- Reparented wheels retain their world scale. Their clickable apertures do not
  overlap adjacent wheels; submit and close targets also follow the enlarged UI.
- All six input targets are at least 44 CSS pixels at 1024 × 768.
- Overlay, content safe area, close target, feedback and reward have editor hosts
  in `scenes.json`. The existing frame's close icon is used without a duplicate X.
- Feedback and the reward fit between the riddle, wheels and submit button.
  Font texture/source resolution is checked in Canvas as well as WebGL.

## Verification

- `playwright test --config e2e/puzzles/playwright.config.ts chest-size.spec.ts
  --output=test-results/chest-size-side`: **2 passed**.
- `vitest run --dir src --maxWorkers 2
  src/systems/puzzles/__tests__/PuzzleCatalog.test.ts
  src/systems/puzzles/__tests__/PuzzleService.test.ts`: **40 passed**.
- Bounds checked for all 25 production riddles; the longest is used for visual
  review. Pointer interaction covers wrong answer, every wheel, close/reopen with
  letters retained, and successful completion with the reward visible.
- Playwright MCP could not acquire its already-used profile. An isolated CLI
  Playwright browser reused the running local server without touching the user's
  open browser or player storage.

The following screenshots were actually opened and visually inspected. Paths
are relative to the repository; generated screenshots are local artifacts:

- `artifacts/chest-size/desktop-webgl-normal.png`
- `artifacts/chest-size/desktop-webgl-hover.png`
- `artifacts/chest-size/desktop-webgl-pointer-out.png`
- `artifacts/chest-size/desktop-webgl-pressed-wrong.png`
- `artifacts/chest-size/desktop-webgl-selected.png`
- `artifacts/chest-size/desktop-webgl-success.png`
- `artifacts/chest-size/tablet-canvas-normal.png`
- `artifacts/chest-size/tablet-canvas-hover.png`
- `artifacts/chest-size/tablet-canvas-pointer-out.png`
- `artifacts/chest-size/tablet-canvas-pressed-wrong.png`
- `artifacts/chest-size/tablet-canvas-selected.png`
- `artifacts/chest-size/tablet-canvas-success.png`

## Remaining limitations

This is a size/readability correction, not full pre-reader approval. Applying
`UI_PRE_READER_GATES.md` still identifies the existing written riddle as requiring
reading: hiding its prose and muting audio removes the clue. Its wording and
letter-based mechanic were preserved in this narrowly scoped change. A visual
riddle redesign and demonstrated first interaction remain separate work. No new
disabled appearance was introduced; the existing solved-state interaction guard
remains in place. Physical tablet and phone portrait playtests were not run.

Changes are local only; nothing was committed, pushed or deployed in this task.

# Guild operation preview — 17 November 2026

`ExamPresentation.compact` now shows an arithmetic example instead of an isolated
operator followed by a range. For example, E2 shows `13 − 5` instead of `− 0–20`.
Addition and three-number skills use their own examples; mixed skills show one
addition and one subtraction. These are display samples, not live exam answers.

Validation:

- `ExamPresentation.test.ts` and `GuildHallLayout.test.ts`: 15 tests passed.
- Browser checks resolved every compact A1–E4 example against `ProblemDatabase`.
- All labels fit the existing editor host (194 × 42); largest measured text was
  142 × 31.35. Constructor and texture resolutions match.
- Reviewed the actual Mathoria and Silverpond screenshots in WebGL and Canvas
  at 1280 × 720 and 1024 × 768. The minus is between two operands, the percentage
  remains separate, and the text has clear contrast without clipping or overlap.
- Applied `UI_PRE_READER_GATES.md` to the changed display. Examples contain no
  words; audio was muted. Additional desktop/tablet captures hide all word labels.
- Database migrations are not needed for this frontend display change. Browser
  fixtures isolate saves, diagnostics and backend requests from real profiles.

Reviewed images in `artifacts/guild-operation-preview/`:

- `GuildScene-webgl-desktop.png`, `GuildScene-webgl-tablet.png`
- `GuildScene-canvas-desktop.png`, `GuildScene-canvas-tablet.png`
- `SilverpondGuildMockScene-webgl-desktop.png`, `SilverpondGuildMockScene-webgl-tablet.png`
- `SilverpondGuildMockScene-canvas-desktop.png`, `SilverpondGuildMockScene-canvas-tablet.png`
- `GuildScene-webgl-desktop-no-words.png`, `GuildScene-webgl-tablet-no-words.png`

Scope: this is a static preview label, so it has no hover, press, wrong-answer or
completion state. Comparison glyphs, gameplay and layout hosts are unchanged.
Tablet verification used an emulated viewport, not physical tablet hardware.
Playwright MCP was attempted but its shared browser profile was occupied; an
isolated local Playwright browser produced the reviewed captures instead.

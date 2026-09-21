# Povinná vizuální přejímka všech E2E sad

**BLOKUJÍCÍ PRAVIDLO: malé děti neumějí číst. ŽÁDNÝ DLOUHÝ TEXT NIKDE V UI.
Vysvětlení musí být obrázkové a názorné. `<`, `>` a `=` všude alespoň 2× větší.**

Všechny sady pod `e2e/` musí při přejímce projít
[UI_PRE_READER_GATES.md](../docs/UI_PRE_READER_GATES.md). Zelený test ani samotné
uložení screenshotu neschvalují srozumitelnost a vzhled. Zkontrolovat skutečné
screenshoty na desktopu/tabletu a v Canvas/WebGL, včetně chyb, nápovědy a dokončení.
Zapsat prohlédnuté obrázky, zjištěné problémy a neověřené podmínky.

Před testy ověřit závislost na databázových migracích. Krokodýlí kapitola používá
lokální save a jeho hydrataci, bez nové serverové databázové migrace.

## Krokodýl ve hře

`npx playwright test --config e2e/learning/comparison.config.ts` ověřuje skutečný
MathBoard, souboj, zkoušku i mobilní ovladač. Vizuální záznam a meze kontroly:
[COMPARISON_RUNTIME_REVIEW.md](../docs/COMPARISON_RUNTIME_REVIEW.md).

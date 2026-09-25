# Co-op útoky, most a návrat z tábora — 25. 9. 2026

## Herní pravidla

- Solo i co-op používají sílu aktuálního hrdiny. Základní počet úloh je
  `min(attack, 3)`; celá síla se mezi ně rozdělí. Meč přidává vlastní úlohu
  a vlastní sílu. Například útok 4 a zesílený meč 3 dávají `[2, 1, 1, 3]`.
- Žádný společný čítač výher, růst útoku podle délky co-op sezení ani jeho
  reset při novém sezení. Aréna, les, porovnávání, boss i fallback používají
  stejnou cestu přes `MasterySystem` a `CombatAttackSystem`.
- Bonus skutečných tříoperandových příkladů zůstává samostatný. Obrana se
  dál odečítá jednou od celého útoku; síla meče a mazlíčka se nerozděluje
  do základních úloh hrdiny.
- Most ukazuje jen „Doplň kameny“. Metadata vzoru se nezobrazují.
  Generátor obsahuje početní řady i opakování dvojic a trojic; test ověřuje
  jednoznačnost doplnění pouze z viditelných čísel, bez slovního pravidla.
  Stále je povinných pět pevných kamenů a obě chybějící pozice.

## Tábor → město → tábor

Tlačítko s domečkem v táboře i ve stanu zavolá
`JourneySystem.pauseRoomJourneyAtWaypoint()`, nikoli `abandonJourney()`.
Celá rozehraná výprava se uloží do volitelného pole
`player.suspendedForestJourney`. Patří konkrétnímu profilu, v co-opu hostiteli A;
samostatná výprava hráče B se nepřepisuje.

Při dalším vstupu do lesa se automaticky pokračuje na dosaženém odpočívadle.
Neplatí se další zásoby, neopakují se již vybrané truhly a zůstávají hotové
boje, hádanky, rozehrané puzzle instance i odměny. Léčení a nákupy z města
se nevracejí na staré hodnoty. Návrat funguje i po obnovení stránky ve městě
a po exportu/importu uložení. Po obnovení výpravy se pozastavený snapshot
spotřebuje, aby nešlo znovu přehrát staré odměny.

Rozsah je pozastavení výpravy během návštěvy města. Nejde o redesign
obecného ukládání aktivní výpravy při reloadu v libovolné lesní místnosti.
SQL/API se nemění, databázová migrace není pro tyto testy nutná.
Skutečná uložení Kitten ani Eli nebyla upravována.

## UI a vizuální kontrola

Nové hosty jsou v `scenes.json`; panel má samostatný safe inset 440×260
uvnitř původního rámu 500×320. Panel i zatemnění jsou nad walking HUD.
Tlačítka pohybují plochou a popiskem společně, klikací plocha zůstává pevná.
Tlačítka města, odpočinku a zavření mají na tabletu nejméně 44 CSS px.
Text používá konstruktorové `resolution: 2`.

WebGL zachovává existující dekorativní nine-slice. Canvas jej v této verzi
Phaseru nevykresluje, proto má lokální neprůhledný zelený panel s obrysem;
nejde o roztaženou bitmapu. To je záměrný vizuální rozdíl obou rendererů.

Skutečně prohlédnuté snímky podle `UI_PRE_READER_GATES.md`:

- `artifacts/forest-town/desktop-webgl-solo-hover.png`
- `artifacts/forest-town/desktop-webgl-solo-tent.png`
- `artifacts/forest-town/desktop-webgl-solo-tent-hover.png`
- `artifacts/forest-town/desktop-webgl-solo-tent-rested.png`
- `artifacts/forest-town/tablet-canvas-coop-pressed.png`
- `artifacts/forest-town/tablet-canvas-coop-pointer-out.png`
- `artifacts/forest-town/tablet-canvas-coop-tent-pressed.png`
- `artifacts/forest-town/tablet-canvas-coop-tent-pointer-out.png`
- `artifacts/forest-town/mcp-tablet-tent.png`
- `artifacts/forest-town/mcp-tablet-no-prose.png` — zvuk ztlumen, slova
  skryta: zůstává stan, srdce, zdraví, domeček a zavírací křížek.
- `artifacts/puzzles/bridge-two-desktop-webgl-normal.png`
- `artifacts/puzzles/bridge-two-desktop-webgl-one-filled.png`
- `artifacts/puzzles/bridge-two-desktop-webgl-wrong.png`
- `artifacts/puzzles/bridge-two-tablet-canvas-normal.png`
- `artifacts/puzzles/bridge-two-tablet-canvas-solved.png`

Žádná změna významu nápovědy, numerálů či porovnávacích znaků v souboji.
Kontrola se vztahuje na změněné prvky, nikoli na schválení veškerého staršího UI.

## Regresní testy

- `CombatAttackSystem`, `CoopCasualMode`, `CombatDamageSystem`,
  `ForestTownReturn`, `SaveTransfer`, `PuzzleBridge`: **79 testů prošlo**.
  Pokrývají útoky 1–100, zbraně, pořadí hráčů, nové sezení, zachování síly,
  checkpoint, jiný profil, dokončenou/neplatnou výpravu a přenos uložení.
- `e2e/coop/attack-power.spec.ts`: **oba renderery prošly**; skutečný BattleScene přes arénu a les,
  dva různí hráči, dvě výhry, restart a stejné profily v solo.
  Při souběhu prohlížečů jeden WebGL průchod překročil původní 8s čekání
  na úvod boje; s lokálním 30s limitem prošel opakovaný samostatný test.
- `e2e/coop/forest-camp.spec.ts`: **2 testy prošly**; obě cesty do města, reload, skutečná
  lesní šipka ve městě, zachované truhly/peníze/HP, dotykové cíle,
  zavření/odpočinek/disabled a blokování kliknutí skrz modal.
- `e2e/puzzles/puzzle-bridge.spec.ts`: **2 testy prošly**, oba renderery,
  dvojice i rostoucí řada, dvě mezery, chyba, úspěch a návrat.
- `e2e/learning/comparison-coop.spec.ts`: **3 testy prošly**; upravené fixture na tři základní
  úlohy; porovnávací obrany následují až za nimi. Rychlostní bonus se po
  čtyřech nábojích spotřebuje, není zaměněn za odstraněný čítač výher.
- `npm run build:pilot`: **prošlo**; existující upozornění na velikost chunků.

Kompletní sada `vitest run --dir src` není zelená. Sedm asercí mimo tuto
úpravu selhává v `EncounterCatalog`, `EnemyPresentationSystem`,
`GuildExamMockScene` a `UnderwaterCreatureAnimations` (aktuální katalog
nepřátel/prezentace, staré očekávání statického importu, animační metadata).
Katalogy rozpracované uživatelem nebyly měněny. Při souběžném zatížení
prohlížeči navíc dva generativní puzzle testy překročily 5s limit; samostatně
s omezením na dva workery všech jejich 18 testů prošlo. Projektový `tsc`
také hlásí další chyby; tento záznam netvrdí, že kompletní typová kontrola prošla.

Změny jsou lokální; tento krok neobsahuje commit, push ani nasazení.

## Následná oprava: strážce v co-opu

Co-op vítězství obcházelo `storyVictory: forest-crystal` a vracelo se přes
obecnou obrazovku vítězství do doupěte. Solo i co-op nyní volají společný
`finishForestCrystalVictory()` až po připsání odměn. Výprava se dokončí,
strážce se označí jako poražený a otevře se skutečná scéna krystalu.

Ověření pouze této opravy: `ForestCrystalProgression.test.ts` (3/3) a
`e2e/coop/forest-guardian.spec.ts` (1/1, tablet/Canvas). Test vstupuje přes
produkční doupě, nastaví konec poslední fáze s aktivním hráčem B, projde
skutečným vyhodnocením vítězství a kliknutím převezme krystal. Kontroluje
odměny obou profilů, dokončení výpravy a uložení příběhového postupu hostitele.
Kompletní sada nebyla pro tuto opravu spuštěna; migrace není potřeba.

Prohlédnuté snímky: `artifacts/forest-guardian/coop-crystal.png` a
`artifacts/forest-guardian/coop-crystal-claimed.png`. Krystal, jeho převzetí
a cesta dál jsou zobrazeny; strážce se nevrací. Vzhled existující odměnové
scény se neměnil (včetně příliš širokého popisku následné odchodové šipky).

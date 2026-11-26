# MathBoard: prvky a první funkční vzorky

## Společné vizuální prvky

| Prvek | Co musí zvládnout |
|---|---|
| Pergamen | Jeden zachovaný zdroj, bezpečné okraje, samostatné oblasti pro zadání, pomoc, odpovědi a patičku. |
| Ukazatel síly | Zdroj útoku, základní hodnota, nula při chybě, bonus rychlosti, aktuální přírůstek a součet tahu. |
| Odpovědní tlačítko | Jednotný zlatý rám a modrý povrch; číslo nebo znak; normální, hover, stisk, pointer-out, disabled, správně a chyba. Číslo i rám se pohybují spolu. |
| Zpětná vazba | Zelená fajfka a červený křížek jako vlastní značky, opravný vztah, obrázkové dopočítání, rušení starých animací. Barva není jediná informace. |
| Prázdné pole | Doplňované číslo nebo vztah bez předem vybrané odpovědi. |
| Obrázky | Jablka se stejným rozestupem; velikost 2:1; skupiny se správným počtem; číselný doprovod; oba směry krokodýla a rovnost. |
| Nápověda | Vyhrazený prostor nad všemi třemi volbami, připomenutí bez prozrazení správné strany, počítání aktivního času. |
| Ukázka | Přesun tlamy do prázdného místa, krmení větší stranou, obnovení pravdivého vztahu, párování při rovnosti. Nepřipisuje body. |
| Rychlostní energie | Čtyři výrazná políčka, +1/+2 energie a bod síly při naplnění podle současného pravidla hry. |
| Obrana | Štít, jeho síla, příchozí útok, běžný a rychlý blok. |
| Průběh sady | Jedna aktivní úloha; celá sada 1/3/6 úloh zůstává ve společném MathBoardu; značka každé první odpovědi a jediný callback dokončení. |
| Dva hráči | Portrét a číslo vlastníka, předání tahu po dokončení. |
| Zkouška | Výsledek správně/chybně, bez rychlostní energie a automatické nápovědy; katakombová ukázka má aktivní časový limit. |
| Ovládání | Dotyk, myš, klávesy 1–3, šipka pokračování, opakování, celá obrazovka; žádné dlouhé instrukce uvnitř hry. |

## Formáty zadání v katalogu

1. Sčítání: `2 + 3 = □`.
2. Odčítání: `7 − 3 = □`.
3. Násobení: `3 × 4 = □`.
4. Tři členy: `8 + 4 − 3 = □`.
5. Chybějící člen: `3 + □ = 7`.
6. Chybějící člen ve třech číslech: `8 − □ + 3 = 7`.
7. Výraz proti číslu: `2 + 3 □ 6`.
8. Dva výrazy: `12 + 3 □ 8 + 7`.
9. Tříčlenný výraz proti číslu: `12 + 5 − 3 □ 11`.
10. Velikost předmětů.
11. Počet předmětů.
12. Počet s čísly.
13. Samotná čísla.
14. Výraz s pomocí.
15. Samostatný výraz v krokodýlí kapitole.

Každý příklad lze kombinovat s kontextem útoku, meče, mazlíčka, obrany,
procvičování, přípravy meče, přípravy štítu, zkoušky, katakomb a co-op.
Jde o funkční vzorek odpovědního UI, nikoli o spuštění celé příslušné mise.
Odměny, uložené runy, mastery a otevření nové zkoušky spravují jejich produkční
systémy; workshop do nich nezapisuje.

## Vazba na současnou hru

- `src/ui/MathBoard.ts`: vlastní vyhodnocení, časy, celou sadu, rychlostní
  energii a jeden callback. Nový volitelný presentation factory zachovává
  původní vykreslování pro všechny produkční volající.
- `SequentialMathView.ts`: současný postupný MathBoard. Nový workshop nabízí
  větší středové zadání a odpovědi při zachování stejného řadiče.
- Původní řádky a dvě sloupce pro 4+ úloh zůstávají v produkci. Návrh používá
  postupnou prezentaci celé stejné sady; zmenšování písma kvůli další řádce
  se do nového rozvržení nepřenáší.
- `ComparisonProblemView.ts`, `ComparisonLearningSystem.ts` a
  `formatMathProblem.ts`: sdílené obrázky, lekce a celé výrazy.
- `PreparationTrainingOverlay.ts`: samostatný odběratel MathBoardu pro přípravu.
- `CatacombTrialUI.ts`, `ExamsOverlay.ts`, `GuildExamTheme.ts`: současné
  samostatné zkouškové povrchy. Workshop ukazuje jejich odpovědní kontext ve
  společném novém rozvržení; produkční integrace musí zachovat jejich skórování,
  životy, časové limity a majitele zkoušky.
- Mobilní ovladač dnes dostává tři volby a obě strany porovnání přes snapshot
  MathBoardu. Samostatný redesign jeho HTML není součástí této ukázky.

Historická zmínka o pravda/nepravda není současný typ `MathProblem`. Katalog
proto nepřidává novou herní mechaniku pod záminkou vizuální varianty.

Statické hosty jsou v místním `scenes.json` a používají `SceneBuilder`.
Generovaný rám, jeho prompt a přesná normalizace jsou v `prompts.json`.

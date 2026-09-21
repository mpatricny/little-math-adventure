# Sběr many — úprava 21. 9. 2026

Výpočet je společný pro živý ukazatel i závěrečné připsání:
`src/systems/ManaCollectionRewards.ts`.

| Správné odpovědi za jednu hru | Celkem many |
| --- | --- |
| 0 | 0 |
| 1 | 1 |
| 3 | 2 |
| 6 | 3 |
| 10 | 4 |
| 15 | 5 |
| 20, 25, 30… | 6, 7, 8… |

Nejde o sérii: chyba správné odpovědi nemaže. V coopu zůstává původní
společný součet a každý dostává celou společnou odměnu, i když jeho kanál
skončil dříve. Mana se stejně jako dříve připisuje jednou při dokončení hry;
průběžný ukazatel a animace zobrazují aktuálně vybojovanou odměnu.
Změna nepotřebuje databázovou migraci ani změnu formátu savu.

`ManaCollectionScene` počítá odměnu po každé správné odpovědi a předává ji
oběma `ManaPlayerLane`. Změna počtu spustí velký blesk s `+1`, částice,
modrý obrys kanálu a zvuk many. Efekt má vyhrazené místo mezi padajícími
příklady a tlačítkem; neblokuje druhého hráče. Po dokončení nebo opuštění
scény se odstraní i se svými tweens. Běžná správná odpověď má vlastní zvuk.

Hlavičky, úvod i výsledky používají skutečná jména z příslušných savů.
Výsledkové karty ukazují jen jméno, velkou zelenou fajfku a počet správných,
velkou ikonu many a získané množství. Fajfka má 84 px, mana 106 px, čísla
výchozí velikost 60 px. Výsledky mají samostatný bezpečný obsahový host;
rámeček i ikona many se zvětšují rovnoměrně. Text má konstruktorové
`resolution: 2`. Pozice, rozměry a hloubky nových prvků jsou v `scenes.json`.

Úvodní odstavce nahradila opakovaná obrázková ukázka: `1 + 1` sjede k `2`,
tlačítko naznačí stisk, řádek zezelená a objeví se první mana. Krátké názvy,
klávesy X/M a ikony života doplňují ukázku. Platí předčtenářské brány z
[UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md).

## Ověření

- 41 unit testů ve třech souborech: všechny hranice odměn, editorové hosty,
  dostatečné ikony a dotykové cíle, oddělené co-op učení a ukládání.
- Čtyři průchody skutečnou minihrou: sólo / coop × Canvas / WebGL. Dvacet
  správných odpovědí dává šest many. Dvojí vstup nezapočte odpověď dvakrát,
  chyby nesnižují odměnu, odměnu dostane i dříve vyřazený spoluhráč,
  opakované dokončení ani reload ji nepřipíše podruhé.
- Při co-op kontrole měla Alžběta Marie 5 správných a Matěj 15, každý získal
  6 many; původní zůstatky 7/11 přešly na 13/17 a zůstaly po reloadu.
- Pilotní sestavení `/tmp/lma-mana-pilot` prošlo. Celkový `tsc` stále hlásí
  starší chyby projektu; upravené runtime soubory many nemají diagnostiku.

Vizuálně prohlédnuté skutečné snímky v 1024 × 800 a 1280 × 800:

- [Obrázkový úvod](../artifacts/mana-qa/canvas-coop-intro.png).
- [Zisk many](../artifacts/mana-qa/canvas-solo-gain-1.png) a
  [společný zisk po vyřazení hráče](../artifacts/mana-qa/canvas-coop-gain-6.png).
- [Sólo výsledky](../artifacts/mana-qa/canvas-solo-results.png),
  [coop na tabletu](../artifacts/mana-qa/canvas-coop-results.png) a
  [coop WebGL](../artifacts/mana-qa/webgl-coop-results.png).
- Playwright MCP: [stisk](../artifacts/mana-qa/mcp-intro-pressed.png),
  [hover výsledků](../artifacts/mana-qa/mcp-results-hover.png) a
  [pointer-out / nulový výsledek](../artifacts/mana-qa/mcp-results-pointer-out.png).

Kontrola odstranila překryv srdíček s ukázkovým tlačítkem, odsadila karty
od ozdobných krajů a skryla staré „Konec!“ pod výsledky. Padající zadání
začíná uvnitř prvního řádku s krátkou pauzou na přečtení, aby nepřekrývalo
jméno hráče a první výsledek měl dostatečný čas na zastavení. V coopu je
náhled dalšího příkladu dole vedle efektu, aby se nekřížil s odpověďmi. Pro změněné prvky
nezůstala známá vizuální závada. Nejde o playtest s dětmi.

```sh
npx vitest run --exclude 'artifacts/**' src/systems/__tests__/ManaCollectionRewards.test.ts src/systems/__tests__/ManaCollectionPopupLayout.test.ts src/systems/__tests__/CoopCasualMode.test.ts
npx playwright test --config e2e/learning/mana.config.ts
npm run build:pilot
```

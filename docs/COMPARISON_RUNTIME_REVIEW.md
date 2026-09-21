# Vizuální a funkční kontrola krokodýla

21. 9. 2026. Kontrola skutečné hry po zapojení schváleného návrhu;
[popis chování](COMPARISON_IMPLEMENTATION.md). Nejde o kontrolu HTML prototypu.

## Oprava pergamenu v dalším arénovém souboji

Následný hlášený problém byl reprodukován ve druhém i třetím souboji bez
obnovení stránky. `Texture.add()` v Phaseru přepnul výchozí frame sdílené
textury `ui-math-board` z celého obrázku 1424 × 832 na první nově přidaný
roh 170 × 90. Spouštěčem bylo první zobrazení štítu nebo porovnávání.
Další instance běžného MathBoardu potom roztáhla tento roh na celou tabuli.

`SequentialMathView` nyní řeže výslovně z `__BASE` a po přidání dílů obnoví
celý obrázek jako výchozí frame. Oprava nemění layout, soubojové vyhodnocení
ani uložený postup. Databázová migrace není potřeba. Již otevřená hra
vyžaduje obnovení stránky kvůli starému kódu a textuře v paměti.

Nový regresní scénář před opravou selhal na rozměru i identitě textury.
Po opravě prošel v Canvas (1024 × 800) a WebGL (1280 × 800): tři navazující
souboje přes skutečnou obrazovku vítězství a arény, obrana v prvním a třetím,
porovnávání ve druhém. Kontroluje celý výchozí obrázek a devět platných
dílů bez přibývání framů. Pokračování čeká na připravenost ovládání ve hře,
nikoli pevnou prodlevu. Prošly také oba dosavadní scénáře rychlostního bonusu
a štítu a nový pilotní build (`/tmp/lma-parchment-pilot`).

Vizuálně prohlédnuto: [druhý souboj WebGL](../artifacts/comparison-game/webgl-parchment-arena-2.png),
[druhý souboj Canvas](../artifacts/comparison-game/canvas-parchment-arena-2.png),
[porovnávání](../artifacts/comparison-game/webgl-parchment-comparison-2.png),
[opakovaná obrana WebGL](../artifacts/comparison-game/webgl-parchment-shield-3.png)
a [Canvas](../artifacts/comparison-game/canvas-parchment-shield-3.png).
Další vytvoření tabule bylo přímo ověřeno přes Playwright MCP a
[jeho snímek](../artifacts/comparison-game/mcp-parchment-recreated.png).
Pergamen má celé okraje i střed; pro tuto opravu nezůstala vizuální závada.

## Následná vizuální úprava a štít

Podle připomínek autora jsou nestejná jablka v poměru 2:1 v obou rozměrech,
odpovědní tlamy a čisté znaky mají 90 % původní velikosti a první lekce má
o 30 % delší pohyby i pauzy. Čekání na nápovědu 4/8/16/24/vypnuto se nemění.

Patička obsahuje samostatný host bonusu. Rychlý běžný příklad doplní dosavadní
energii pod životy; dvě nejrychlejší odpovědi v ověřovacím scénáři naplnily
čtyři políčka a daly celkem 3 body síly (dva za úlohy, jeden za naplnění).
Štít používá stejný pergamen, jeden známý příklad a přehled příchozího útoku
a bloku. Ověřený štít síly 3 proti útoku 9 zablokoval 6/3/0 bodů při rychlé,
pomalé/chybné odpovědi; nezapsal dvojí odpověď ani útočnou rychlostní energii.
Další útok nezdědil obranné popisky ani bonus.

Prohlédnuté snímky této úpravy:

- [Zřetelně různé velikosti](../artifacts/comparison-game/canvas-stage-1.png),
  [menší tlamy při hoveru](../artifacts/comparison-game/canvas-hover-0.png),
  [čisté znaky](../artifacts/comparison-game/canvas-stage-4.png),
  [shodná velikost](../artifacts/comparison-game/canvas-equal-0.png).
- [Rychlostní bonus na tabletu](../artifacts/comparison-game/canvas-speed-bonus-0.png),
  [naplnění ukazatele](../artifacts/comparison-game/webgl-speed-bonus-1.png),
  [zadání obrany](../artifacts/comparison-game/canvas-shield-quick-question.png),
  [rychlá obrana](../artifacts/comparison-game/webgl-shield-quick-answer.png).

Dva nové scénáře rychlosti a štítu prošly v Canvas i WebGL. Celá rozšířená
sada deseti herních scénářů prošla. Po této úpravě prošlo také 18 cílených
unit testů, osm kontrol pilotního balíčku a pilotní
build. Změna nevyžaduje novou databázovou migraci.

## Provedené ověření

- 69 unit testů v osmi souborech: podpora 4/8/16/24/vypnuto, návrat po každé
  chybě, první odpovědi, hydratace starších savů, kapitola, co-op, zkoušky,
  katalog textur, poškození a obrana.
- Osm scénářů v `e2e/learning/comparison.spec.ts`: čtyři obrázkové kroky v
  Canvas/WebGL, skutečný útok s bonusovým příkladem meče a uložením postupu,
  oddělená podpora hráčů v co-op, pauza aktivního času, rušení starých callbacků,
  oba renderery zkoušky, mobilní obrázkové volby a shoda původního/postupného
  vyhodnocení sady. Dvojí vstup během zpětné vazby nezapisuje další odpověď.
- Rozšířené vizuální průchody zahrnují normální stav, hover, opuštění plátna,
  stisk přecházející do disabled, chybu, správnou odpověď, rovnost a dokončení
  sady. Testy používají 1280 × 800, tablet 1024 × 800 a ovladač 390 × 844.
- Osm kontrol pilotního balíčku a tři kontroly závislostí scén. Pilot skutečně
  obsahuje oba nové layouty a všech pět SVG, včetně přímého vstupu do cechu.
- `npm run build:pilot -- --outDir /tmp/lma-crocodile-pilot` prošel. Zůstávají
  dosavadní upozornění bundleru na velikost chunků a kombinované importy.
- Změna používá lokální save a jeho aditivní hydrataci; před testy byla
  ověřena absence potřebné serverové databázové migrace.

Prohlížečové testy běžely v izolovaném Chromium přes místně nainstalovaný
Playwright a vlastní Vite na portu 8017. Playwright MCP měl profil obsazený;
uživatelský profil ani server na portu 8001 nebyl ukončován. Fixture hlídá
výjimky prohlížeče a `console.error`.

## Prohlédnuté obrázky

Snímky se při testu obnovují v `artifacts/comparison-game/`. Kontrola sledovala
skutečné proporce, prázdný vztah, stejnou velikost počítaných kusů, shodu počtů
s číslem, oddělené oblasti tabule, společný pohyb symbolu s tlačítkem a text
omezený na krátké popisky. Příklady kontrolovaných snímků:

- [Úvod s tlamou](../artifacts/comparison-game/webgl-intro-mouth.png),
  [velikost na tabletu](../artifacts/comparison-game/canvas-stage-1.png),
  [počet](../artifacts/comparison-game/webgl-stage-2.png),
  [předměty a čísla](../artifacts/comparison-game/canvas-stage-3.png).
- [Nápověda nad třemi volbami](../artifacts/comparison-game/hints.png),
  [chybná první odpověď](../artifacts/comparison-game/canvas-wrong-3.png),
  [stisk a zablokované volby](../artifacts/comparison-game/webgl-pressed-disabled-2.png),
  [rovnost](../artifacts/comparison-game/canvas-equal-3.png),
  [dokončená sada](../artifacts/comparison-game/webgl-batch-complete-3.png).
- [Zkouška v Canvasu](../artifacts/comparison-game/canvas-exam-number.png),
  [zkouška s počty](../artifacts/comparison-game/webgl-exam-count.png),
  [obrázková oprava](../artifacts/comparison-game/canvas-exam-feedback.png),
  [výsledky](../artifacts/comparison-game/canvas-exam-results.png).
- [Mobilní nápověda](../artifacts/comparison-game/remote-hints.png),
  [mobilní předměty s čísly](../artifacts/comparison-game/remote-objects.png).

Kontrola zachytila a opravila přetrvávající hover po opuštění plátna, příliš
malou plochu tlačítka „Ukázka“, chybějící layouty v pilotním exportu,
nepodporovaný gradient pergamenu v Canvasu a diagonální šev ve WebGL.
Starý textový výpis výsledků kapitoly byl nahrazen osmi velkými značkami
a odměnami s ikonami. Mobilní počty mají rezervovanou výšku pro zarovnání
číslic. Bitmapy zachovávají poměr stran; pergamen používá autorovaný
9-slice. Texty používají konstruktorové `resolution: 2`; shoda rozlišení
textury a textového stylu je také ověřena v běžícím MathBoardu.

## Meze kontroly

`npx tsc --noEmit` zatím není zelený kvůli již přítomným chybám repozitáře
(mimo jiné nepoužité členy a nullable hodnoty v BattleScene a starší testové
typy). Nebyly zahrnuty do této úpravy. Cílené testy a produkční build prošly.

Jde o kontrolu implementace a vizuálního chování, nikoli o dokončený playtest
s dětmi. Předčtenářská pravidla zůstávají povinná pro celou hru; tato kontrola
nepotvrzuje splnění všech starších obrazovek mimo upravenou kapitolu.

## Opakování kontroly

```sh
npx playwright test --config e2e/learning/comparison.config.ts
npm run test:pilot-content
node --test scripts/__tests__/scene-assets.test.mjs
```

Do kapitoly vede vývojová zkratka hlavního menu **TEST: POROVNÁVÁNÍ**.
Po změně závislostí obrázků je vhodné restartovat starší běžící Vite, aby
obnovil manifest načítání scén. Produkční build jej vytváří znovu automaticky.

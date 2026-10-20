# Načítání runové lišky a dokončení tahu — 3. 10. 2026

Hlášení se týkalo první návštěvy katakomb: požadavek na atlas lišky skončil
`net::ERR_FAILED`, místo lišky se zobrazila chybějící textura a po odpovědi
zůstala zkouška v rozpracovaném tahu.

## Úprava

- `textures.json` odkazuje na `rune-fox-compact.webp`, 3584 × 3584 px,
  buňky 512 × 512 px a přesně 45 snímků. Čtyři prázdné buňky se neregistrují.
- Bezeztrátový WebP má 5 144 234 bajtů místo 7 240 124 bajtů původního PNG
  (o 28,95 % méně). `scripts/repack-rune-fox.py` kontroluje shodu všech RGBA
  pixelů po dekódování i shodu všech 45 snímků s původním atlasem.
- Zůstává standardní preload cílové scény. Katakomby vytvářejí sprity až po
  jeho dokončení a používají animace z `animations.json`.
- Odstraněny jednosnímkové náhradní animace z `CatacombTrialScene`.
- Listener dokončení útoku se připojí před `play()`, ke konkrétnímu klíči
  útoku. Návrat hrdiny začne po dopadu i dokončení animace, v libovolném pořadí.
  Listener zranění lišky se rovněž připojí před přehráváním, ke konkrétní animaci.
  Nevznikl časový náhradní callback, opakovací smyčka ani náhradní obrázek.

## Dokončené ověření

Tyto kontroly používají katalogy JSON a izolované místní uložené pozice;
nepotřebují databázovou migraci. Rozpracované serverové migrace se neměnily.
Pouze autentizační požadavek `/v1/me` je v herních testech stubovaný, protože
místní API vracelo nesouvisející 404. Obrázky se načítají ze skutečného serveru.

```sh
npx vitest run src/systems/__tests__/TextureCatalog.test.ts src/systems/__tests__/CatacombPetProgress.test.ts src/systems/__tests__/CombatDamageSystem.test.ts
node --test scripts/__tests__/scene-assets.test.mjs
npx playwright test --config e2e/catacombs/fox-loading.config.ts --workers 1 --reporter=line
npm run build:dev
```

Výsledek: 14 jednotkových testů, 5 testů závislostí scén, 6 herních testů
a vývojový build prošly. Herní sada ověřuje skutečný Canvas i WebGL,
pozdržený první požadavek na lišku, všech 45 snímků a kanonické animační
sekvence, další otázku po odpovědi, útok dokončený před dopadem, deset zásahů
a vítězství, uložení první záchrany, další návštěvu, chybnou odpověď i portrét
u Pythie. Používá skutečné kliknutí a skutečné animace. Mac používá Chromium
s Metalem; softwarové vykreslování s průběžným záznamem trace výrazně zpomalovalo
animace a způsobovalo vypršení původního osmivteřinového limitu testů.

## Vizuální kontrola

Prohlédnuté snímky:

- `artifacts/catacombs/loading-canvas-intro.png`
- `artifacts/catacombs/loading-canvas-next-question.png`
- `artifacts/catacombs/loading-canvas-tablet.png`
- `artifacts/catacombs/loading-webgl-next-question.png`
- `artifacts/catacombs/loading-webgl-tablet.png`
- `artifacts/catacombs/loading-canvas-victory.png`
- `artifacts/catacombs/loading-canvas-victory-tablet.png`
- `artifacts/coop-difficulty/fox-canvas-1280.png`
- `artifacts/coop-difficulty/fox-webgl-selected.png`
- `artifacts/catacombs/mcp-fox-webgl-intro.png`
- `artifacts/catacombs/mcp-fox-comparison-no-prose.png`
- `artifacts/catacombs/mcp-fox-comparison-next.png`
- `artifacts/catacombs/mcp-fox-comparison-tablet.png`

Liška a její portréty mají zachované proporce, průhlednost a celý obrys.
Na desktopu 1280 × 720 a tabletu 1024 × 768 nepřekrývají otázku ani ovládání.
Playwright MCP navíc prošel porovnávání s vypnutou hudbou, hlasem i efekty:
bez slovních popisků zůstaly dva porovnávané objekty/počty, prázdný vztahový
slot a tři velké volby `<`, `=` a `>`. Správná odpověď vedla na novou otázku
s HP 9/10 a skutečnou idle animací. Při pořizování kontrolních snímků byl
časovač pouze v této testovací kartě pozastaven; nejde o produkční změnu.
Pozice, rozměry, popisky a stavy ovládání se touto opravou neměnily.
Kontrola nepředstavuje nové schválení všech starších obrazovek celé hry.

## Meze diagnózy

Původní síťové selhání se nepodařilo znovu vyvolat: staré PNG se později
z místního serveru přeneslo celé a dekódovalo i v původním profilu Chrome.
Nejde tedy o prokázanou chybu názvu souboru ani doložený zásah offline cache.
Menší atlas omezuje přenos při prvním načtení; oprava pořadí událostí řeší
konkrétní doložený závod, který mohl nechat souboj čekat na již ukončený útok.
Původní uživatelská karta byla obnovena a její menu se načetlo. Uživatelské
uložené hry se nemazaly; diagnostická stránka a obě pomocné karty byly odstraněny.

# Vizuální kontrola v4

Kontrola podle `docs/UI_PRE_READER_GATES.md`, 18. listopadu 2026.

## Prohlédnuté snímky

- `review/01-ready-page.png`: celá stránka a ovládání náhledu.
- `review/01-ready.png` až `09-complete-impact.png`: hover, stisk,
  pointer-out, chybná odpověď, přesun bonusu, nová úloha s předchozím součtem,
  dokončení a zásah.
- `review/all-formats-{ready,correct,wrong}.png`: přehled všech 15 formátů.
  Jednotlivé snímky `format-*` umožňují kontrolu v plné velikosti.
- `review/format-expression-expression-ready.png`,
  `format-long-expression-wrong.png`: zachované operandy, prázdný vztah,
  přiměřený vložený znak a názorně dopočítané hodnoty.
- `review/format-count-ready.png`, `format-numbered-ready.png`:
  stejné velikosti kusů a přesná vazba čísla na počet.
- `review/mode-defense-{ready,correct,impact}.png`, `mode-coop-ready.png`:
  příchozí útok, štít, blok a vlastník tahu.
- `review/tablet-768-comparison.png`, `tablet-1024-wrong.png`,
  `tablet-touch.png`: velikost dotykových cílů a složitější oprava na tabletu.
- `review/canvas-*-{ready,correct}.png`: šest odlišných formátů v Canvasu,
  včetně doplňování, obou výrazů a obrázků s čísly.
- `review/comparison-hints.png`, `no-words.png`: společná nápověda nad všemi
  třemi volbami; ovládání bez slov a s vypnutým zvukem.
- `review/impact-*-{block,done}.png`: zásah, úplný blok, nula a poslední životy.

## Závěry kontroly

- Zachovaný jeden dřevěný rám pro všechny odpovědi a jejich stavy. Obraz i
  symbol se při stisku pohybují spolu, hit area zůstává na místě.
- Všechny bitmapy mají jednotné měřítko v obou osách. Pergamen ani zdobené
  rámy se neroztahují do nového poměru stran.
- Hráčské plátno neobsahuje slovní instrukce. Rozpoznání úspěchu a chyby
  podporují značky, nejen zelená/červená barva. Oprava přidává obrázky nebo
  dopočítané strany. Demo nemění výsledky ani poškození.
- Vztahy jsou velké na tlačítkách; po vložení odpovídají přibližně výšce
  sousedních číslic. V dopadu útoku je `=` kreslený stejným sdíleným glyph-em.
- Canvas používá konstruktorové `resolution: 2`; ověřena shoda stylu i zdroje
  textury. Nejmenší ovládací prvek má 48,65 CSS px; cíle byly ověřené v obou tabletech.
- Po vizuální kontrole byla odpovědní řádka posunutá o 8 bodů níž a zmenšené
  připomínky krokodýla. Mezi pomocí a dřevěným rámem zůstává mezera.
- Čísla pod obrázky ve třetí fázi byla zvětšena na 52 bodů.
- Pokračování po štítu používá štít; po útoku mazlíčka používá tlapku.
- Procvičovací boj má stejný útok a osobní bonus jako postupový boj.
  V přípravě zůstává vidět vybavení i runa, kterou odpověď doplňuje.

## Rozsah přijetí

Jde o funkční návrh k proklikání a autorské revizi. Kontrola nenahrazuje
pozorování malého dítěte při prvním setkání s animací součtu a blokování.
Produkční mise, načítání skutečné výbavy/postav a další regionální pozadí
nejsou tímto izolovaným náhledem integrované.

Postavy zůstávají ilustrací; animují se pouze UI vrstvy a účinky zásahu.
Nejsou zde uměle natahované ani morfované animace tvorů.

## Vykreslovací režimy

První headless průchod zvolil automaticky Canvas. Kontrola WebGL proto
explicitně zapíná ANGLE/SwiftShader a ověřuje `renderer.type === 2`; Canvas
varianta ověřuje `renderer.type === 1`. Snímek `review/webgl-ready.png` byl
prohlédnutý vedle odpovídajícího Canvas snímku. Nejde pouze o přepnutí URL.

Plný WebGL průchod dokončil 15 formátů, 10 kontextů, čtyři dopady, ukázky,
nápovědu, tabletové rozměry a následné Canvas příklady. Při inicializaci dalšího
mobilního kontextu na konci běhu nastal 30sekundový timeout. Samostatný mobilní
start ve WebGL a skutečný dotyk poté prošly bez chyby; příčina původního timeoutu
není prokázaná. Test nyní uzavírá první prohlížeč před mobilním průchodem a ukládá
výsledek desktopu předem. Závěrečné izolované kontroly jsou ve
`review/final-smoke.json`; úplný předchozí Canvas průchod je v
`review/functional-review.json`.

Závěrečný izolovaný průchod: WebGL 2, Canvas 1, dotyk WebGL 2; každý
zaznamenal právě jednu správnou odpověď a sílu 5. Žádné chyby stránky.
Přerušení stisku při chybné odpovědi obnovilo souřadnice povrchu na (0, 0).
Snímek `impact-normal-hp-loss.png` zachycuje −10 i konečných 10 životů.
# Kontrola dokončených kontextů — 18. listopadu

Zkontrolováno: pěst proti meči; příprava meče i štítu; cechovní zkouška;
katakomby. Skutečná kliknutí v 1024×768, správná odpověď, pokračování,
dokončení, WebGL a zavedení Canvasu. `review/context-review.json`: šest
kontextů, žádná pageerror, prázdné localStorage. Prohlédnuté snímky:
`context-shop.jpg`, `context-attack-tablet.png`, `context-prep-shield-correct.png`,
`context-exam-done.png` a živý katakombový chybný výsledek v Playwright MCP.
Opraveno umístění závěrečné značky mimo ozdobný kámen a společný ořez pěsti.
Celé player UI funguje bez slov a zvuku; počty/runa/pečeť/paw jsou živé vrstvy.
Samostatný build prošel. Projektový typecheck má tři starší chyby v
AssetFactory/JourneySystem, žádnou v souborech tohoto návrhu po odstranění
nepoužitého importu. Ukázka nemá závislost na databázových migracích.

Hranice: vizuální přijetí dospělým, nikoli playtest s dětmi. Produkční
integrace musí zachovat přesná pravidla existujících zkoušek a přípravy.


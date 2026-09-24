# Úpravy po hraní na tabletu — 24. 9. 2026

## Změny

- Mapa porovnávání už nezobrazuje pouze seznam lekcí. Ukazuje skutečné první
  odpovědi: správně/chybně, úspěšnost posledních 20 a medián času; u každého
  ze šesti kroků počty, úspěšnost a průměrný čas. Ukázky a diagnostika se
  nezapočítávají. Časy používají správné odpovědi do 20 sekund, stejně jako
  aritmetická mapa. Bez záznamů je čas/úspěšnost pomlčka, nikoli vymyšlená nula.
- Nové souhrnné čítače v `comparisonChapter.statistics` přežijí rotaci
  podrobné historie 400 odpovědí. Starší uložení se při první nové odpovědi
  doplní z dochovaných skutečných záznamů. Již smazané historické odpovědi
  ani jejich časy nelze zpětně rekonstruovat.
- Mana stojí přesně uprostřed patra a přeskočí na další. Patro trvá
  1000–900 ms, první má navíc 750 ms na přečtení příkladu. Timer se zruší
  po odpovědi, zastavení i zániku dráhy; každá co-op dráha má vlastní timer.
  Stejné skokové chování předvádí úvodní ukázka.
- Panel ke zkoušce má oddělené hosty nadpisu, baru, cíle a procent.
  Místo původních 10 px jsou údaje 26/32/34 px s konstruktorovým rozlišením 2.
  Pozice i hloubky zůstávají v `scenes.json` a společné pro oba cechy.
- Dostupné katakomby používají trvalé světlo `UnderwaterHotspot`, stejné jako
  podvodní průchody. Hover/stisk světlo zesílí, pointer-out vrátí běžné světlo,
  nikoli tmu. Zamčený nebo co-op vstup zůstává tmavý; podmínky vstupu se nemění.
- První osvobození lišky nepřidává bonus. Základ pochází z katalogu (nyní 6),
  další vítězství dává +1, i před připoutáním. Porážka a duplicitní callback
  bonus nepřidají. Již uložené bonusy se zpětně nesnižují.

Nejsou potřeba databázové migrace. Volitelné čítače jsou součástí existujícího
JSON uložení. Skutečné profily dětí nebyly při těchto kontrolách přepisovány.
Nesouvisející úprava `pets.json` byla ponechána beze změny.

## Ověření

- 119 cílených Vitest testů ve 13 souborech prošlo.
- 3 testy manifestu obrázků prošly.
- Všech 7 scénářů `e2e/learning/player-feedback.spec.ts` bylo úspěšně dokončeno
  v několika bězích: Canvas/WebGL statistiky a cech, Canvas/WebGL mana,
  Canvas/WebGL dvě celé zkoušky lišky s reloadem a porážkou, co-op mana.
- Testy používají izolované profily; zachycení API je omezené na kořen `/v1/`,
  aby neblokovalo skutečné obrázky ve složkách pojmenovaných `v1`.
  Čekání na ukázku/animaci se řídí herním stavem, ne krátkým pevným intervalem;
  software WebGL může postupovat pomaleji než reálný čas.
- `npm run build:pilot` prošel. `tsc --noEmit` stále vrací 142 již existujících
  diagnostik; po normalizaci čísel řádků je výsledek shodný s výchozím stavem.

## Vizuální kontrola

Snímky jsou v `artifacts/player-feedback/`. Ručně byly prohlédnuty zejména:

- `canvas-guild-mobile.png`, `webgl-guild-tablet.png`: větší údaje a oddělené
  oblasti baru, znamének a procent; bez překryvu se Zyxem.
- `canvas-comparison-tablet.png`, `webgl-comparison-mobile.png`: úplná tabulka
  šesti kroků, čitelné hodnoty, žádný překryv sloupců.
- `webgl-door-hover.png`, `webgl-door-pressed.png`, `webgl-door-out.png`,
  `webgl-door-disabled.png`: jasně odlišné dostupné a zamčené průchody;
  stabilní geometrie a světlo zachované po opuštění ukazatelem.
- `canvas-mana-correct.png`, `canvas-mana-wrong.png`, `webgl-mana-floor.png`,
  `webgl-mana-demo-success.png`, `coop-mana-independent.png`: příklad uprostřed
  patra, zachované názorné vyhodnocení a oddělené dráhy.
- `mcp-mana-demo-no-prose.png`: Playwright MCP, zvuk vypnutý a slova skrytá;
  výsledek ukazuje příklad u správného čísla, dotyk tlačítka a získanou manu.
- `canvas-fox-win-1.png`, `webgl-fox-win-2.png`: první síla 6, následně 6 → 7,
  zachované proporce lišky a bezpečné oblasti textu/tlačítka.

Rozlišení: desktop 1280×720, tablet 1024×768, mobil na šířku 844×390.
Jde o kontrolu rozměrů v prohlížeči, nikoli fyzický playtest na tabletu.
Nebyla provedena plošná přejímka starších textů ostatních částí hry; tato
kontrola není schválením všech obrazovek podle pre-reader checklistu.

Vývojový server na portu 8001 byl obnoven, protože původní běžící Vite držel
starý manifest obrázků. HMR zůstává vypnuté: změny se na tabletu načtou až
ručním obnovením stránky, ideálně po dokončení rozehrané aktivity.

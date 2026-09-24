# Číslokraj — názvosloví a playtestový feedback, 24. 9. 2026

Úplný název **Číslokraj: Tajemství krystalů** byl dohledán v původním úkolu
„Navrhni strategii vydání dema“. Krátká značka a svět jsou **Číslokraj**;
**Mathoria** je první městečko výpravy. Toto rozlišení používají web, menu,
titulky stránky, manifest, TV a mobilní ovladač. Technické identifikátory savů
zůstávají kompatibilní. Exportovaný soubor se jmenuje `cislokraj-postup-<datum>.json`.

Web nyní vysvětluje počítání skrze objevování a růst hrdiny. Titulek města
`MATHORIA · PRVNÍ MĚSTEČKO` má vlastní editorový prvek `TownScene.townTitle`;
jeho pozice a hloubka pocházejí ze `scenes.json`. Hlavní název, podtitul i název
města jsou runtime texty s konstruktorovým `resolution: 2`. Webové snímky menu
a města byly znovu pořízeny ze sestaveného pilotu.

## Ověření

- Před kontrolami ověřena závislost na migracích: změna je klientská a testy
  používají lokální savy a simulované odpovědi API. Databázová migrace není potřeba.
- `npm run build:pilot` prošel; zbývají dosavadní upozornění na velikost balíku
  a kombinaci statických/dynamických importů `MasterySystem`.
- 14 testů `SaveTransfer`, `MenuTransferAndFullscreen` a
  `InGameFullscreenAndTvSettings` prošlo. Devět testů balení pilotu prošlo.
- `npm run test:landing -- http://127.0.0.1:8012` prošel pro desktop a tablet,
  včetně přihlášeného/nepřihlášeného stavu a nedostupného API.
- Izolovaný Playwright otevřel skutečný pilot v rozměrech 1280 × 720 a
  1024 × 768, každý v Canvas i WebGL. Bez chyb JavaScriptu; stejné textové
  hranice a shodné rozlišení stylu i zdrojové textury. Název a podtitul se
  nepřekrývají; označení města nezasahuje do HUD ani budov.
- Ověřen anglický podtitul při zachování značky Číslokraj, TV titulek a přenos
  názvu do mobilního ovladače 390 × 844. Relay byl simulován v prohlížeči.
- Playwright MCP nemohl otevřít obsazený profil; použit samostatný Playwright
  prohlížeč bez zásahu do existujícího profilu. Testovací přístup k instanci hry
  byl vložen pouze do odpovědi pro tento prohlížeč, nikdy do produkčního kódu.

## Prohlédnuté snímky a rozsah vizuální kontroly

Snímky a přehledy jsou lokálně v `artifacts/brand-review/`:

- `desktop-webgl-review.png`, `desktop-canvas-review.png`,
  `tablet-webgl-review.png`, `tablet-canvas-review.png`: normální menu,
  hover, stisk, pointer-out, disabled, nový hráč, menu bez textů, město,
  město bez textů (zleva doprava, shora dolů).
- Samostatné snímky `desktop-webgl-menu-normal.png`,
  `desktop-canvas-menu-normal.png`, `desktop-webgl-town.png`,
  `tablet-canvas-town.png` pro kontrolu detailů a proporcí.
- `landing-desktop.png`, `landing-tablet.png` a odpovídající `*-hero.png`
  pro webový text, rozestupy a aktualizovanou galerii.
- `english-menu.png`, `tv-title.png`, `controller-connecting.png`,
  `controller-home.png` pro další výskyty značky.
- `results.json` obsahuje naměřené hranice a rozlišení herních titulků.

Aplikovány [brány pro nečtenáře](UI_PRE_READER_GATES.md): nové herní názvy
mají nejvýše tři slova, nepřidávají instrukce a nejsou nutné pro provedení akce.
Po skrytí slov a s vypnutým zvukem zůstávají hlavní herní ikony a budovy viditelné.
Nedošlo ke změně úloh, znamének, vyhodnocování ani ovládání. Správná/chybná
odpověď a dokončení se na měněné titulky nevztahují.

Toto je kontrola názvosloví a jeho zobrazení, ne přejímka celé hry pro nečtenáře.
Starší pomocné ovládání importu/exportu a zvuku stále spoléhá na popisky;
technický TV dialog a čekání ovladače obsahují delší instrukce. Tyto existující
nedostatky zůstávají mimo tuto úpravu a nejsou tímto review schváleny.
Delší webové vysvětlení je určeno rodičům. Produkční nasazení neproběhlo.

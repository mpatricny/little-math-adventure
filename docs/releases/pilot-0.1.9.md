# pilot-0.1.9 — srozumitelné zkoušky a opravy po hraní

## Změny

- Zkoušky a brány ukazují název dovednosti a velký nevyřešený příklad místo
  samotného kódu. Stejná identita zůstává během zkoušky i ve výsledku.
- Porovnávání má počty prvních odpovědí, úspěšnost a časy, včetně souhrnů
  jednotlivých kroků. Nové čítače přežijí zkrácení podrobné historie.
- Při sbírání many příklad přeskakuje mezi patry a na prvním patře má delší
  pauzu. Ukázka předvádí stejné chování; co-op dráhy mají nezávislé časování.
- Údaje postupu ke zkoušce jsou větší a dostupné katakomby trvale svítí.
- První osvobození lišky ponechá její základní sílu; bonus přidává až další
  vítězství. Již uložené bonusy se zpětně nesnižují.
- Explicitní oprava nedokončeného pásma umožňuje vrátit se k němu bez ztráty
  pozdějších dovedností. Nenasazuje se automaticky podle jména hráče; vyžaduje
  čerstvou zálohu a samostatně ověřený plán pro konkrétní uložení.

Audio příkladů je pouze [návrh](../audio/SPOKEN_PROBLEMS_PLAN_CS.md).
Neobsahuje nové nahrávky, automatické předčítání ani časovanou nápovědu.
Samostatná lokální změna parametrů lesního vlka není součástí tohoto vydání.

## Data a nasazení

Serverové schéma ani SQL migrace se nemění. Nová volitelná pole jsou součástí
stávajícího JSON uložení; vydání nepřepisuje skutečné profily dětí.
Frontend se sestavuje z čistého tagu `pilot-0.1.9`, nikoli z pracovního adresáře
s nezahrnutou změnou vlka. API a Doppler `prd.APP_RELEASE` používají tentýž
identifikátor vydání. Stávající pre-deploy kontrola migrací zůstává zapnutá.

## Ověření před vydáním

- Cílené funkční a vizuální kontroly jsou zaznamenané v
  [kontrole zpětné vazby](../PLAYER_FEEDBACK_2026_09_24.md) a
  [kontrole zkoušek](../EXAM_IDENTITY_REVIEW_2026_09_24.md).
  Zahrnují Canvas/WebGL, tabletové rozměry, skutečné odpovědi i chybnou odpověď,
  stavy ovládání a zobrazení bez slovních textů a zvuku. Nejde o fyzický tabletový playtest.
- Celá sada `src/systems/__tests__`: 366 úspěšných a 8 neúspěšných testů.
  Stejných 8 chyb bylo samostatně reprodukováno na čistém předchozím vydání
  `692f5e6` (`pilot-0.1.8`): `GuildExamMockScene` (1),
  `UnderwaterCreatureAnimations` (3), `EncounterCatalog` (1) a
  `EnemyPresentationSystem` (3). Tyto starší chyby toto vydání neopravuje.
- 24 testů opravy uložení, obsahu pilotu, manifestu obrázků a Cloudflare
  routování prošlo. 17 databázově nezávislých API testů a API build prošly;
  databázové integrační sady bez testovací databáze neběžely.
- Úplná klientská TypeScript kontrola má nadále 142 předchozích diagnostik;
  normalizované porovnání nezjistilo novou chybu. Produkční Vite build je
  samostatná kontrola a tento výsledek nenahrazuje.

Nejde o plošné schválení všech starších herních obrazovek podle pre-reader
pravidel. Konkrétní prohlédnuté snímky a omezení jsou uvedené v obou kontrolách.

## Nasazeno 24. 9. 2026

- Zdrojový commit `2fbecb6322b5274127a3a7ae79585c3ee5796035`, anotovaný tag
  `pilot-0.1.9`; obojí ověřeno na GitHubu. Tento následný záznam nemění build
  ani neposouvá release tag.
- Čistý tag: 78 cílených testů v devíti souborech prošlo.
  `npm run cloudflare:check` i Wrangler dry-run prošly: 332 souborů,
  největší 7 240 124 bajtů. Build obsahuje identifikátor `pilot-0.1.9`.
- Doppler `cislokraj/prd` a Railway `production/api`: změněn pouze
  `APP_RELEASE`, synchronizace hodnoty byla ověřena bez výpisu tajemství.
- Railway deployment `c5c182fa-ca24-434c-b4a8-538d3cc88155`: `SUCCESS`.
  Build a healthcheck prošly; pre-deploy zaznamenal
  `database.migrations_complete applied=[] total=4`.
- Cloudflare Worker `cislokraj-web`, version
  `1f3ae337-f0ac-4f81-9189-4d1d8b1d5ee2`. Nahrány čtyři změněné soubory;
  zbývajících 328 bylo již na serveru.
- `https://cislokraj.cz/` a `/hra/`: HTTP 200,
  `X-Cislokraj-Release: pilot-0.1.9`, `Cache-Control: no-cache`.
  SHA-256 servírovaných obou HTML, vstupního JavaScriptu, herního chunku,
  `scenes.json` a `pets.json` odpovídají čistému buildu.
- `https://api.cislokraj.cz/health` i `/ready`: HTTP 200 a release
  `pilot-0.1.9`. Produkční data hráčů nebyla ručně upravována.
- Playwright MCP: hlavní menu na produkci, desktop 1280 × 720 a tablet
  1024 × 768. Oba snímky byly prohlédnuty; menu, rámy a přihlášení se načetly
  bez překryvů, chyb JavaScriptu nebo chybějících obrázků. GET `/v1/me` vrací
  očekávané 401 v nepřihlášeném kontextu; bylo ověřeno skutečné API, nikoli
  simulované přihlášení. Zápisy do herního API byly v izolovaném QA prohlížeči
  blokovány a žádný zápis se při kontrole menu nepokusil odeslat.

Prohlédnuté produkční snímky jsou lokálně v
`artifacts/release-0.1.9-production-desktop.png` a
`artifacts/release-0.1.9-production-tablet.png`. Produkční smoke test je kontrola
načtení menu; podrobné herní scénáře byly ověřeny lokálně, jak je uvedeno výše.

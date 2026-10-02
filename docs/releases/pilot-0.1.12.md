# pilot-0.1.12 — pokrok, návody a návrat k lesnímu krystalu

## Obsah

- Ukazatel ke zkoušce započítá i první správné odpovědi v jednotlivých
  formách. Tři úspěšné příklady nové látky již ukazují 15 %, nikoli 0 %.
  Podmínky odemčení zkoušky se nemění.
- Úspěšná zkouška, která posune aktuální látku, zahodí nevyřešený zbytek
  staré připravené sady. Další útok naváže na novou látku bez čekání na
  vyčerpání až 50 starých příkladů. Historie odpovědí a opakování chyb zůstávají.
- Výslovné zavření obrázkového návodu křížkem uloží právě zobrazenou stránku
  jako viděnou. Nepotvrzuje další stránky ani návody jiného hrdiny; samotný
  odchod ze scény stále žádné potvrzení nevytváří.
- Starší uložená hra s doloženou porážkou lesního strážce pokračuje u
  nevyzvednutého krystalu. Příběhové kroky se uloží oběma hráčům v co-opu
  a reload po instalaci krystalu neopakuje stroj ani bojové odměny.

Rozpracovaná analytická administrace, její sběr událostí a SQL migrace
0005–0009 nejsou součástí vydání. Diagnostika pomalého načítání z 2. října
zatím neobsahovala hotovou opravu a toto vydání ji neprohlašuje za vyřešenou.

## Data a ověření

Před testy byl porovnán celý adresář `server/` s předchozím vydáním:
serverový kód a všechny čtyři stávající migrace jsou beze změny.
Opravy nepotřebují novou DB migraci. Testovací prohlížeče používají
samostatné QA profily a zachycené API požadavky; skutečné savy se neupravují.

- 61 cílených Vitest testů prošlo: pokrok ke zkoušce, změna látky, solo/co-op,
  příběhové checkpointy, pokračování uložené hry a zavření návodu.
- 32 Node testů prošlo: pilotní obsah, závislosti scén, offline build/worker
  a Cloudflare routování.

- Dva Playwright průchody lesním krystalem prošly (běžné vítězství a návrat
  staršího co-op savu přes reload). První souběžný pokus vypršel při startu
  lokální hry před testovanou logikou; samostatný opakovaný běh prošel bez
  změny kódu nebo testových podmínek (42,7 s a 29,5 s).
- Prošel celý `check-playtest-guidance.mjs`: skutečný křížek, další stránka,
  uchování po reloadu, oddělení hrdinů, ztlumená ukázka a zachování inventáře
  a výsledků při demonstraci.
- Produkční build a kontrola assetů prošly: 352 souborů, největší 7 240 124
  bajtů. Offline manifest má 344 zdrojů / 92 955 551 bajtů a revizi
  `2d54124052d71ed96c4196e7`. Existující varování o velikosti chunků zůstává.
- Izolovaný prohlížeč načetl hotový pilotní balíček bez výjimek; menu bylo
  vizuálně ověřeno na tabletu a vývojový globální objekt není publikovaný.
- Cloudflare dry-run prošel s již nainstalovaným Node 24; výchozí Node 20
  ve worktree nový Wrangler nepodporuje. Nebylo nutné instalovat nástroje.

Globální testovací sada ani úplná typová kontrola se pro tuto úzce vymezenou
opravu znovu nespouštějí.

## Vizuální přejímka

Použity brány `docs/UI_PRE_READER_GATES.md`. Rozložení a grafika se nemění.
Pokrok byl prohlédnut ve WebGL i Canvas na desktopu a tabletu, také bez
slovních popisků a se ztlumeným zvukem; záznam je v
`artifacts/zuzi-progress-2026-10-02/review.json`. Zachovány jsou poměry stran,
oddělené ovládací prvky a existující hosty Scene Editoru.
Podrobnosti návratu k lesnímu krystalu a jeho existující vizuální omezení
jsou v `docs/FOREST_CRYSTAL_RECOVERY_2026_09_29.md`. Toto vydání nepotvrzuje
plnou pre-reader přejímku starších dialogů a slovní hádanky celé hry.
Znovu prohlédnuty `artifacts/forest-guardian/coop-crystal.png`,
`artifacts/playtest-feedback/advanced-prism-no-prose-muted.png` a tabletový
Canvas snímek ukazatele s 15 %. Rám, obrázky a ovládání se nepřekrývají;
ukazatel odpovídá uloženým odpovědím. V průchodu bez prose je skrytý i znak
křížku (rozsah regulárního výrazu testu); samotný klik na křížek se ověřuje
v běžném zobrazení. Silverpond zůstává mimo veřejný pilot.

## Nasazení a návrat

Vydání se sestavuje z odděleného čistého commitu označeného anotovaným tagem
`pilot-0.1.12`. Cloudflare a Doppler `cislokraj/prd` dostanou shodný
`APP_RELEASE`; jiné produkční proměnné se nemění. Serverový zdroj zůstává
stejný, synchronizace Doppleru pouze znovu nasadí existující API s novou
identifikací vydání a se stávající pre-deploy kontrolou migrací.

Předchozí Cloudflare verze: `f409b03e-b0f5-4e71-bb43-4097ca24b1f3`.
Předchozí Railway deployment: `90d3419a-7fee-469c-ba9c-2ca2633a991c`.
Při návratu se obnoví `APP_RELEASE=pilot-0.1.11`; lokální savy ani data
účtů se nemažou.

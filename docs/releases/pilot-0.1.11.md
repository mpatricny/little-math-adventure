# pilot-0.1.11 — společné útoky a opravy lesa

## Obsah vydání

- Solo i co-op používají sílu právě hrajícího hrdiny, nejvýše tři základní
  příklady a samostatný příklad meče. Aréna a les mají stejná pravidla;
  společný čítač výher a růst útoku podle délky sezení jsou odstraněné.
- Most neprozrazuje vzor řady slovní nápovědou. Zachovává pět pevných kamenů
  a dvě mezery, které je nutné doplnit.
- Z odpočívadla lze odejít do města a vrátit se do stejné výpravy, i po
  obnovení stránky ve městě. Zůstávají odměny, hotové souboje a puzzle;
  další zásoby se neplatí. V co-opu patří výprava hostiteli A.
- Porážka poslední fáze lesního strážce v co-opu otevře scénu s krystalem
  místo návratu do doupěte. Odměny obou hráčů zůstávají zachované.
- Zámek lesní truhly je o 50 % větší, včetně písmen a dotykových cílů.
  Zachovává poměr stran rámu a pozice ze Scene Editoru.
- Opraven souběh přípravy textur na pozadí a vstupu do další scény: oba
  loadery dokončí práci, stejný klíč se ale do sdílené cache vloží jen jednou.
- Na výslovný požadavek zahrnout všechny hotové změny vydání obsahuje také
  aktuální autorské ladění houby, prastarého stromu a bossů v katalogu.
  Podvodní data zůstávají ve zdrojovém repozitáři; veřejný pilot nadále končí
  po lesním krystalu a Silverpond nepublikuje.

Sjednocení `ForestRoomScene` a starého `ForestMapScene` do jediné definice
cesty není součástí tohoto vydání a zůstává navazující prací.

Podrobnosti: [co-op a les](../COOP_ATTACK_FOREST_FIX_2026_09_25.md),
[velikost truhly](../FOREST_CHEST_SIZE_REVIEW.md).

## Data a ověření

Před testováním bylo ověřeno, že `server/` ani čtyři SQL migrace nemají změny
proti předchozímu vydání. Cílené testy nepotřebují databázi. Návrat z města
přidává pouze volitelné pole klientského uložení `suspendedForestJourney`.
Skutečné profily dětí se ručně neupravují.

- 122 cílených Vitest testů v devíti souborech — prošlo: síla útoků,
  co-op, obrana, návrat z města, přenos uložení, lesní krystal a puzzle.
- 32 Node testů — prošlo: výběr pilotního obsahu, závislosti scén,
  offline build/worker a Cloudflare routování.
- Dalších 10 cílených Vitest testů — prošlo: fronta stahování, předpověď
  dalších scén a souběh načítání obrázků/spritesheetů v obou pořadích.
  Čtyři nové případy před opravou reprodukovaly duplicitní zápis textury.
- Sedm cílených Playwright průchodů — prošlo: útoky v aréně/lese na obou
  rendererech (2), tábor → město → reload → tábor (2), strážce v co-opu
  a převzetí krystalu (1), zvětšený zámek truhly na obou rendererech (2).
  První průchod tábora odhalil duplicitní zápis textur a příliš časný klik
  testu na nově vytvořený modal. Regrese načítání byla opravena; test nyní
  čeká na skutečné zařazení tlačítka do vstupního systému Phaseru. Oba
  průchody tábora potom prošly bez ignorování chyb konzole.
- Pilotní build a Cloudflare kontrola — prošlo: 352 souborů, největší
  7 240 124 bajtů. Existující upozornění na velikost chunků zůstávají.
  Offline manifest: 344 souborů, 92 950 183 bajtů,
  revize `d70a4513bb5291e7aaef8306`.
- Cloudflare dry-run — prošlo, bez změny produkce.
- Izolovaný offline průchod sestaveného pilotu — prošlo: 22 počátečních
  assetů, zbytek stažený na pozadí v menu; kompletní aktualizace čeká bez
  reloadu. Po zavření a novém spuštění prohlížeče bez sítě prošlo menu →
  město → aréna → souboj, zůstal zachovaný testovací save i audio Range.
  Pomocný dev server sloužil pouze k vytvoření nového QA profilu. API testu
  bylo izolované; nešlo o skutečná uložení dětí. Síť nebyla uměle zpomalená.

Celá testovací sada se pro toto vydání znovu nespouští. TypeScript stále
hlásí 141 diagnostik; v upraveném načítání ani jeho novém testu nejsou žádné.
Předchozí známá selhání jsou popsána v navázaném záznamu co-op oprav;
tento release netvrdí, že je globální sada nebo typová kontrola plně zelená.

## Vizuální přejímka a omezení

Použity brány `UI_PRE_READER_GATES.md`. Znovu byly prohlédnuty
`artifacts/chest-size/tablet-canvas-normal.png` a
`artifacts/forest-town/tablet-canvas-coop-tent-pointer-out.png`;
dále `artifacts/chest-size/tablet-canvas-success.png` a desktopový panel
tábora ze záznamu prvního release testu. Další prohlédnuté stavy jsou
zaznamenané v navázaných dokumentech.
Tábor má oddělené ovládací prvky, obrázkové ikony a čitelný ukazatel zdraví.
Zvětšený zámek zachovává proporce, písmena i tlačítka se vejdou do rámu.

Stávající slovní hádanka stále vyžaduje čtení: po skrytí zadání a vypnutí
zvuku nelze odpověď odvodit. Nesplňuje tedy globální pre-reader podmínku.
Autor před nasazením výslovně schválil dočasnou výjimku pro tuto stávající
slovní hádanku v tomto vydání. Zvětšení zámku není obrázkový redesign
hádanky. Fyzický tablet ani Safari nebyly ověřeny.

## Nasazení a návrat

Zdroj je označen anotovaným tagem `pilot-0.1.11`. Nasazuje se čistý
commit; Cloudflare a Doppler `cislokraj/prd` mají shodný `APP_RELEASE`.
Serverový kód zůstává stejný; změna této jediné proměnné může přes stávající
synchronizaci spustit Railway redeploy se zachovanou pre-deploy kontrolou
migrací. Ostatní produkční proměnné se nemění.

Předchozí Cloudflare verze pro návrat je
`4d35e03d-93e7-4e3f-b6bc-02a79df4f43f` (`pilot-0.1.10`), předchozí Railway
deployment `e4133466-243f-44ae-899b-4515a7d46c8a`.
Návrat verze nesmí mazat lokální savy ani data účtů.

## Nasazeno 25. 9. 2026

- Zdrojový commit `4a87bf77313efa081c1bb60ea253f4e5bf94541a` a anotovaný
  tag `pilot-0.1.11` jsou pushnuté na GitHub. Při nasazení byl pracovní
  strom čistý a `HEAD` odpovídal tagu; release tag se dále neposouvá.
- Cloudflare verze `f409b03e-b0f5-4e71-bb43-4097ca24b1f3`, nahráno devět
  změněných souborů, 343 zůstalo beze změny. Obě produkční domény jsou
  připojené ke stejnému Workeru.
- `/` a `/hra/` vracejí HTTP 200 a `X-Cislokraj-Release: pilot-0.1.11`.
  SHA-256 obou HTML, vstupního JavaScriptu, katalogu scén, nepřátel a
  encounterů, offline manifestu i workeru odpovídají otestovanému buildu.
  `www.cislokraj.cz/hra/` přesměrovává 308 na kanonickou adresu.
  Nepřihlášený `/v1/me` správně vrací 401.
- Doppler `cislokraj/prd`: změněn pouze `APP_RELEASE=pilot-0.1.11`.
  Synchronizace spustila Railway deployment
  `90d3419a-7fee-469c-ba9c-2ca2633a991c`, stav `SUCCESS`; serverový zdroj
  je nezměněný. `/ready` vrací HTTP 200 a `pilot-0.1.11`.
  Pre-deploy ověřil `database.migrations_complete applied=[] total=4`.

Tento záznam je následný dokumentační commit, nikoli změna nasazeného kódu.
Produkční kontrola byla pouze HTTP čtení; žádné testovací savy ani herní
události se do produkčního API nezapisovaly.

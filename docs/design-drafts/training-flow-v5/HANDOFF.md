# Trénovat / Dál: propojený návrh

18. listopadu 2026. Návrh k posouzení, bez změn produkční hry a uložených pozic.

## Jedna cesta, jeden model

Galerie importuje `getReviewSession` z
`../shared/practice-journey.ts`. Katakomby a výherní obrazovky sdílejí jednu
instanci v paměti `window.top`. Výpočty připravenosti, osobního bonusu a síly
lišky přebírá tento model z runtime nad fiktivními profily.

- **Zyx** vysvětluje dvě cesty. Konkrétní modul vybírá dítě v katakombách.
- **Před bojem** se potvrzuje jen Trénovat / Dál. Volby obou dětí jsou nezávislé;
  sólo používá právě zvoleného vlastníka. Trénovat zůstává dostupné po mastery.
- **Výhra** čte `session.battle(owner)`. Bez výsledku ukáže prázdný stav.
  Mince a mana pocházejí z výsledku; rychlost před/po z jeho snapshotů.
  Klikací Cesta k lišce otevře stejný modul pro stejné dítě.
- **Liška** čte výsledek výzvy a aktuální vlastnictví. První úspěch znamená
  záchranu se skutečnou základní silou 6 a cestu **k Pythii**. Další úspěch
  ukazuje skutečné `attackBefore → attackAfter`, první posílení nyní 6 → 7.
  Navigace lišku nespoutává ani znovu neuděluje odměnu.

Dvě runy představují dvě současné výzvy ze `snapshot.trials). Nejsou další
měnou ani libovolným počtem nasbíraných kamenů. Běžná výhra sílu lišky nemění.

Lišty ukazují medián modulu v sekundách. Osobní bonus srovnává jednotlivé
formy s jejich vlastními referencemi; jeho procento proto neumisťujeme vedle
mediánů jako jejich změnu. Zobrazená mana je již vypočtená odměna.

## Vložení a navigace

`index.html?embedded=1&screen=victory&owner=B&targetId=B1` skryje ovládání
návrhu. Přijímá routy `victory`, `pet` a `before-battle` přes
`session.subscribe` i přímé `window.flowPreview.route(route)`.

Po dokončení bootstrapu je `window.flowPreview.ready === true` a okno
vyšle `flow-preview-ready`. Rodič musí předat první pending route až po
tomto bodě; samotný iframe load nezaručuje dokončený asynchronní modul.

Routy `catacombs` a `pythia` obsluhuje rodič. Samostatně otevřená galerie
pro ně vloží katakombový náhled do iframe, aby plná navigace neztratila
in-memory session. Jeho první URL nese owner/targetId; galerie čeká na
`catacombPreview.ready` / `catacomb-preview-ready`. Při návratu jej skryje.
Listenery se odhlašují na pagehide.

Do boje vyšle bublající DOM událost `preview:battle-ready`:
`{ players: [{ owner, mode, targetId }] }`. Otevře ukázku MathBoardu uvnitř
galerie a zachová session. Ukázka sama neuděluje výsledek boje. Explicitní
tlačítka **nad** hráčskou plochou simulují výsledek souboje, zkoušky, výzvy
a spoutání. Render ani změna vlastníka tyto simulace nikdy nespouštějí.

## Soubory a ověření

- `main.js`: prezentace snapshotů a navigace; `scenes.json`: statické hosty.
- `style.css`, `journey.css`: společný vzhled a nové vrstvy cesty.
- `assets/`, `prompts.json`: původní ilustrace; nové podklady lišty a jejich
  prompty popisuje následující oddíl. Pythia používá existující pozadí dílny.
- `review/journey-verify.mjs`: celý průchod, oba směry vložení, oba vlastníci,
  tabletové rozměry, chybějící zkouška, první záchrana, posílení, mastery,
  neměnnost odměny při navigaci a nulové zápisy do úložišť.
- `review/journey-verification.json`: výsledek aktuální kontroly.
- `review/journey-visual-review.json`: skutečně prohlédnuté snímky a omezení.
- `review/export.mjs`: aktualizovaný přehled čtyř obrazovek.

Starší `verification.json` a původní snímky dokumentují předchozí samostatnou
maketu. Jejich vypínání tréninku po mastery a pevné hodnoty odměn jsou překonané
touto revizí. Pro předání používat výhradně výsledky s prefixem journey.

## Vizuální revize výherní lišty — 18. listopadu

Na připomínku autora je „Cesta k lišce“ přepracovaná do stejného zlata,
tmavomodrého smaltu a safírů jako okolní UI. Finální podobu ukazuje
`review/journey-polish-desktop.png`; v propojené galerii ji zobrazí
**Ukázka lepšího výsledku**. Pravidla, výpočty a směrování zůstávají ve sdíleném modelu.

- `assets/journey-rail-v2.webp`: jeden celistvý rám, vždy `object-fit: contain`.
  Nenatahovat, nerozřezávat; čísla a ukazatel zůstávají samostatnými vrstvami.
- `assets/journey-lock-{closed,open}{,-active}.webp`: čtyři stavy ze společného
  atlasu, stejný výřez a plátno 256 × 256. Aktivní stav mění pouze světlo.
- `assets/journey-fox.webp`: stejná schválená liška, zmenšená na šířku 256 px
  pro čisté vykreslení v malém slotu; znovu se negenerovala.
- `assets/journey-prompts.json`: přesné prompty a použitý vestavěný `image_gen`.
  Zdroje jsou v `assets/journey-sources/`, opakovatelný export v
  `assets/build-journey-art.mjs`, rozměry v `assets/journey-normalization.json`.
- `scenes.json`, `victory → journey → regions`: samostatné oblasti příkladu,
  názvu, ukazatele, obou časů, zámku, šipky a lišky. Obsah respektuje safe inset;
  všechny vrstvy se při stisku pohybují uvnitř pevné klikací plochy.

Lišta přejde ze skutečné předchozí hodnoty na novou. Při prvním odemčení
se po jejím doběhnutí změní zámek a krátce se rozsvítí. Hover zesvětlí
sladěnou vrstvu zámku a lehce zvedne celý obsah. Pointer-out i disabled
vracejí povrch do výchozí polohy. Reduced motion ukáže konečný stav hned.
Plná lišta sama zámek neotevírá: modul bez zkoušky dál zůstává zamčený.

Průchod má 50 úspěšných kontrol a žádné runtime chyby. Ručně prohlédnuté
stavy a měření z desktopu i obou tabletových rozměrů jsou v
`review/journey-polish-review.json`. Zámek při šířce 768 px kreslí přibližně
36 CSS px na šířku; časy, velká porovnávací znaménka i liška mají vlastní prostor.

## Hranice návrhu

Nové vyšší rychlostní stupně, bonusy za udržení a odměna v obou režimech jsou
zatím návrh v `../../PRACTICE_JOURNEY_PROPOSAL.md`. Galerie je nepočítá.
Trénování po mastery je povolené v návrhu, ale produkční bonus pro tento případ
zatím není implementovaný. Simulátor není úplný souboj; pořadí úloh a výsledky
se řídí explicitními review akcemi.

Není zde databázová závislost ani potřebná migrace. Kontrola používá prohlížeč
s emulovaným dotykem; nejedná se o playtest dětí na fyzickém tabletu.
Budoucí produkční integrace má zachovat SceneBuilder, první odpovědi, skutečné
controllery a idempotentní odměny. Tento návrh jejich nasazení neschvaluje.

## Panel zachráněné lišky — 18. listopadu 2026

Sílu obklopuje plná zlatá/navy plaketa `assets/pet-power-frame.webp`.
Tlapka je samostatný medailon `pet-paw-normal.webp`, číslo a posílení 6 → 7
zůstávají runtime textem ze stejné odměny. Po posílení se krátce rozsvítí
medailon i nová hodnota. Dva skutečné runové stupně jsou větší, Pythiina
dílna dostala společný ilustrovaný rám. Nezavádí se třetí zkouška, schopnost
ani nový způsob připsání síly. Nové stupně vzhledu se řeší odděleným návrhem.

Statické hosty a safe inset: místní `scenes.json → pet`. Celé rámy i ikony
se vykreslují s původním poměrem stran. Zdroje a přesné prompty jsou v
`assets/pet-sources/`, `pet-prompts.json`, `doorway-prompt.json`; export
v `build-pet-art.mjs`, společné výřezy v `pet-normalization.json`.
Aktivní dvojice vznikly společně, ale pro malou geometrickou odchylku se
v runtime používá jediná normální silueta se světelným efektem.

Prohlédnuté výsledky: `review/pet-refined-desktop.png`,
`review/pet-refined-tablet.png`, `review/pet-upgrade-portrait.png` a průvodce
v `../catacombs-access-v1/review/fox-guide-refined-tablet.png`.
Automatický průchod má 50 úspěšných kontrol; žádná API ani storage změna.
Vizuální kontrola je z emulovaných viewportů, nikoli fyzický playtest s dětmi.

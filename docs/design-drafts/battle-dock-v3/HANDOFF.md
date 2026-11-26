# Bojový panel V3 — schváleno k integraci

Datum: 21. listopadu 2026.

**Aktualizace 22. listopadu:** Vizuální závěry původní přejímky níže nahrazuje
[oprava a nové porovnání s předlohou](../../BATTLE_DOCK_FIDELITY_REVIEW_2026_11_22.md).
Číselné kruhy zůstávají, značka dočasné pauzy `II` byla odstraněna. Nová
přejímka dokládá spojené jmenovky, obdélníkové záložky a opravené vnitřní okraje.

Uživatel po prohlédnutí konečného návrhu napsal: „Pecka, tohle vypadá dobře,
tak to zadej vedlejšímu chatu k integraci, je to fakt pěkné, tak ať se to povede“.
Toto schválení ukončuje předchozí pozastavení práce na vzhledu docku.

## Vizuální zdroje a jejich přednost

- `approved-owner-states.png` je konečný schválený návrh identity, pojmenovaných
  přepínačů a společného rámečku schopností. Má přednost před staršími návrhy.
- `approved-bottom-edge-context.png` ukazuje ukotvení do skutečné bojové scény
  a nízkou siluetu. Jeho starší anonymní přepínače mazlíčků jsou nahrazené
  pojmenovanými záložkami z konečného návrhu.
- Oba obrázky jsou koncepty vytvořené vestavěným `image_gen`. Kopie jsou
  uložené v projektu, aby integrace nezávisela na dočasném kontextu chatu.
  Původní soubory jsou `exec-d7797c88-a50d-4bf3-9ccd-f89c11271118.png`
  a `exec-a1e62125-4a3a-4f25-9cf2-e1d745daa354.png` pod
  `/Users/datamole/.codex/generated_images/01a0fd93-aaa3-7480-ad12-e42887b4550b/`.

## Vzhled, který zachovat

Nízký tmavomodrý smaltovaný panel navazuje přímo na spodní a pravou hranu
herního viewportu. Má tenkou zlatou horní hranu a šikmé levé rameno. Pod ním
není mezera s krajinou. Výšku proti původnímu plovoucímu návrhu snižuje
přibližně o čtvrtinu. Velký útok zůstává hlavní akcí, další ovládání je
v jedné řadě. Žádný vysoký ozdobný hrot ani prázdný černý obdélník.

Schválená jména se musí vejít i s reálným delším jménem. Rozšířit potřebný
host nebo upravit layout; žádné horizontální stlačení textu nebo zakrytí
maskou. Popisky „Tah Kitten“, „Pomoc od Eli“ a podobné jsou titulky
prezentačního listu, nepřidávat je jako další velké nápisy do hry.

## Chování a vlastnictví

1. **Levá část patří běžnému tahu.** Ukazuje portrét a skutečné uložené jméno
   hráče na tahu, doplňkové označení 1/2, jeho lektvar a hlavní akci. Tah
   přepíná hra; levá část není tlačítkem k přeskočení na jiného hráče.
2. **Tah mazlíčka zachovává jméno majitele.** Meč ve velkém tlačítku se změní
   na skutečného nasazeného mazlíčka daného hráče. Napevno nepoužívat lišku;
   musí fungovat také želva a ostatní mazlíčci. Zobrazená síla pochází
   z produkčního výpočtu, nikoliv z čísel v obrázku.
3. **Pravá část vybírá majitele liščích schopností.** Dvě pojmenované záložky
   Kitten/Eli v ukázce představují dynamická jména obou aktuálních hráčů.
   Aktivní záložka je výrazně vybraná. Obě záložky a všechny tři schopnosti
   jsou uvnitř jednoho společného rámečku. Nepoužívat starou šipku vedle
   neaktivní záložky. Číslo 1/2 znamená roli v co-op, nikoli index save slotu.
4. **Všechna tři tlačítka patří vybrané záložce.** Stav odemčení, účinek,
   použití a další dostupnost se přepínají společně podle majitele.
5. **Přepnutí schopností nemění běžný tah.** Na začátku běžného tahu se
   předvybere liška jeho majitele. Potom lze zvolit druhou lišku i mimo její
   vlastní tah, pokud aktuální bojový stav použití dovoluje. Časová aktualizace
   UI nesmí ruční výběr okamžitě přepsat zpět.
6. **Každá schopnost každé lišky má vlastní jedno použití za boj.** Změna
   záložky ani běžného tahu nic neobnovuje. Plný kamínek značí dostupné
   použití, prázdný spotřebované; neodemčená schopnost má zámek. Tyto stavy
   nejsou zaměnitelné. Dočasná nedostupnost během obrany rovněž není novým
   zamčením postupu.
7. **Štít a léčení pomáhají vlastní hráčce vybrané lišky.** Okamžitý zásah
   vybírá živého nepřítele. Schopnosti neberou běžný tah. Po celou obrannou
   sekvenci jsou nedostupné. Podrobné již navržené chování, pauza měření
   příkladu, atomické použití a obnova jsou v `docs/PRACTICE_JOURNEY_PROPOSAL.md`,
   oddíl „Použití schopností“.
8. **Identita se propojí s postavou v boji.** U životů postavy má být stejné
   jméno a označení 1/2. Barva vlastníka je doplňková; porozumění nesmí
   záviset jen na barvě nebo čtení. Solo používá skutečného jediného hráče.

Čtyři řádky schváleného listu jsou: tah Kitten / stále tah Kitten s vybranou
liškou Eli / tah Eli / tah lišky Eli. Stav spotřebovaného zásahu Eli je ve
všech posledních třech řádcích zachovaný. Čísla poškození 4, 5 a 9 i stavy
odemčení jsou ilustrativní. Nepřepisovat podle nich herní parametry ani savy.

## Produkční napojení

- Navázat na rozpracovaný `src/ui/BattleActionDock.ts`, potřebné adaptéry
  `src/scenes/BattleScene.ts`, `src/ui/BattleActorStatusHud.ts` a příslušné
  hosty v `public/assets/data/scenes.json`. Zachovat cizí rozpracované změny.
- UI se musí řídit skutečným stavem hry. Před integrací zjistit, které části
  liščích schopností už mají produkční model a které jsou pouze prototypem
  v `docs/design-drafts/fox-battle-v5/`. Chybějící kontrakt nebo neuzavřené
  vyvážení konkrétně nahlásit; netvrdit dokončení pomocí statických ukázek.
  Na ostatních částech integrace pokračovat.
- Stávající růst základního útoku lišky podle rychlosti zachovat. Neodemknout
  schopnosti automaticky jen kvůli prezentaci. Nereskalovat milníky vzhledu
  4/10/20/32 ani nepřidávat vlastní čísla pro vyvážení.
- Snímek konceptu nesmí být celým tlačítkem nebo screenshotovým pozadím UI.
  Použít sdílený rám, samostatné ikony a runtime text. Případné nové bitmapy
  připravit podle `docs/ASSET_CREATION.md`, včetně společné normalizace stavů.
- Statické prvky, rozměry a safe inset musí zůstat v `scenes.json`; pozice
  a hloubka přes SceneBuilder. Uniformní proporce, stabilní hit area,
  společný pohyb plochy a ikony při hover/stisku, text `resolution: 2`
  přímo v konstruktoru.
- Nezasahovat do skutečných rodinných savů. Používat izolované kopie a
  mockovaný save sync. Hlavní port 8001 nerestartovat během hraní; práce
  a vizuální ověření na samostatném portu. Nevynucovat refresh tabletů.

## Převzetí a kontrola

Před testy ověřit závislost na migracích. Pokud jsou nutné, upozornit před
spuštěním. Předchozí geometrický test rozpracovaného docku měl 13/14 úspěchů:
horní hover okraj útoku byl y605 proti safe hraně y606. Toto není schválené
hotové UI; kontrola se musí vztahovat k nové integraci.

Vyžadovat skutečně prohlédnuté Playwright snímky hry, nikoliv pouze průchod
testů nebo návrhové galerie. Platí `docs/UI_PRE_READER_GATES.md`.

- Desktop a tablet, Canvas i WebGL, solo i co-op.
- Tah obou hrdinek a jejich mazlíčků; skutečné portréty bez černých textur.
- Jiný majitel schopností než hráč na tahu, opakované přepínání a zachování
  počtů; vhodně různý stav a různá síla schopností pro obě hráčky.
- Aktivní, použitá, zamčená a dočasně nedostupná schopnost; celá obrana,
  výběr cíle, plné zdraví, pauza, konec boje a obnovení, pokud jsou součástí
  napojovaného produkčního systému.
- Normal/hover/pressed/pointer-out/disabled, stabilní klikání a cíle alespoň
  44 CSS px, čitelné delší jméno, žádné překryvy postav ani MathBoardu.
- Kontrola bez slov a bez zvuku: vybraný vlastník a příslušné akce jsou
  poznatelné i z portrétu, čísla a společného rámečku.

Po dokončení předat cesty ke skutečným screenshotům a k upraveným souborům,
provedené kontroly a přesně pojmenované zbývající limity. Vzhled porovnat
přímo se schválenými obrázky. Testy nenahrazují vizuální review.

## Dokončená integrace a přejímka — 21. listopadu 2026

Panel je zapojený do skutečné `BattleScene`. Přepnutí lišky mění její tři
schopnosti, běžný tah zůstává původnímu hráči. Na dalším tahu se výběr vrací
k jeho majiteli. Hlavní akce používá skutečného nasazeného mazlíčka, včetně
želvy; bez lišky se její panel nezobrazuje. Jména a označení 1/2 jsou také
u životů postav.

### Soubory a authoring

- `src/ui/BattleDockArt.ts`: společné rámy, stabilní hit area, stavové vrstvy
  a vyvážené zalomení dlouhých jmen při zachování velikosti písma.
- `src/ui/BattleActionDock.ts`, `src/ui/BattleFoxAbilityPanel.ts`: levá akce
  a samostatný výběr vlastníka schopností.
- `src/ui/BattleActorStatusHud.ts`: skutečné jméno a role u HP.
- `src/scenes/BattleScene.ts`: model schopností, volba cíle, efekty, obrana,
  pauza příkladu, uložení a obnovení bojových fází.
- `src/ui/PauseMenu.ts` a `src/ui/mathboard/MathBoardView.ts`: předání pauzy
  a editorový posun boardu nad nový panel.
- `public/assets/data/scenes.json`: všechny vnější hosty a jejich rozměry;
  vnitřní oblasti záložek a schopností jsou v `data.regions` příslušného hostu.
  Runtime čte hosty přes SceneBuilder. Spawn pointy zůstaly beze změny.
- `public/assets/ui/battle-dock-v3/`, `textures.json`, `assets.json`:
  registrované, transparentní, proporčně zachované bitmapové vrstvy.
  Samotný střed prázdné jmenovky používá kontrolovaný 3-slice.
- `scripts/build-battle-dock-assets.mjs` a `sources/normalization.json`:
  opakovatelná normalizace sdílených rámů a společných párů normal/active.

### Opravy ověřené v běžící scéně

Použití schopnosti a jeho výsledek se uloží před efektem. Selhání zápisu
nespotřebuje zásah ani nespustí navazující nepřátelský útok. Opakování zápisu
pokračuje jen po úspěchu. Rozpracovaná sada příkladů, přijatá odpověď,
zpětná vazba a osobní rychlostní reference se obnoví ze stejného checkpointu.
Výběr cíle, efekt, menu pauzy a TV propojení pozastaví aktivní čas příkladu.

Obnova rozlišuje rozpracovaný a již provedený přechod bosse, aby nevynechala
fázi ani znovu nevyléčila hráče. Již provedený zásah se při obnově neopakuje;
začátek dalšího nepřátelského kola tuto značku správně resetuje. Ukončení
kooperace nejdřív uzavře bojový checkpoint. Odměny se ukládají oběma hráčům
před závěrečnou animací výhry.

### Provedené kontroly

Databázová migrace pro tyto změny není potřeba. Testy používaly fiktivní
profily na izolovaném portu 8029; API a TV připojení byly nahrazené testovými
odpověďmi. Skutečné rodinné savy ani běžící port 8001 se neměnily.

**14/14 prohlížečových scénářů prošlo**, včetně dvou původních HUD regresí.
**23/23 jednotkových testů** rozvržení, odměn a postupu v aréně prošlo.

```sh
npx playwright test --config e2e/arena/battle-dock-v3.playwright.config.ts
npx vitest run src/systems/__tests__/BattleUiMockLayout.test.ts src/systems/__tests__/ArenaRewardSystem.test.ts src/systems/__tests__/ArenaProgressSystem.test.ts
```

Záznamy: `artifacts/battle-dock-v3/final-browser.log` a `final-unit.log`.
Původní HUD test nyní kontroluje rám V3 a kliká na skutečnou pozici útoku.
Typová kontrola celého rozpracovaného projektu stále není zelená: hlásí
dřívější nullable/unused chyby v BattleScene a dalších souborech. V nových
třídách panelu, PauseMenu ani upraveném MathBoardView diagnostiky nejsou;
úplný výpis je v `typecheck-final.log`.

### Skutečně prohlédnuté výsledné snímky

Všechny následující cesty jsou pod `artifacts/battle-dock-v3/`:

- `webgl-available.png`, `review-mcp/final-tablet.png`,
  `review-mcp/final-desktop.png`: výsledné běžné rozvržení.
- `webgl-math-other-owner.png`, `webgl-heal-effect.png`,
  `canvas-restored.png`, `canvas-defense.png`: jiný vlastník, správná příjemkyně
  léčení, obnovená odpověď a dočasná nedostupnost při obraně.
- `early-target-picker.png`, `three-enemy-targets.png`: čistý výběr cíle
  i během nájezdu boardu a tři oddělené dotykové cíle.
- `long-names-player_turn.png`, `long-names-player_b_turn.png`: celý maximálně
  dvanáctiznakový název, dvě vyvážené řádky u 12 W, Alexandrinka v hlavní
  jmenovce na jednom řádku. Rámy a prostor jsou větší; písmo se nezmenšuje.
- `hover-tablet.png`, `pressed-tablet.png`, `pointer-out-tablet.png`:
  společný pohyb rámu a obsahu, návrat bez nechtěného spuštění tahu.
- `solo-no-pet.png`, `solo-pet_catacomb_A.png`,
  `solo-pet_silverpond_mill_turtle.png`: skutečné solo varianty.
- `save-retry.png`, `no-words-tablet.png`: opakování neúspěšného zápisu
  a kontrola bez slovních popisků a se ztlumeným zvukem.

Prohlédnuty byly snímky 1280×720 a 1024×768 v Canvas i WebGL. Rámy,
texty a ovládání se ve schválených stavech nepřekrývají, žádná textura
nechybí. Schopnosti a záložky mají na tabletovém viewportu výšku hit area
59,2 CSS px, hlavní útok 83,2 px a volba nepřítele 64 px. Identitu vedle
jména nesou portréty a stejná čísla 1/2. Zámek, prázdný kamínek a symbol
dočasné pauzy mají odlišný význam i bez čtení.

Nezávislé review přes Playwright MCP je zapsané v
`docs/BATTLE_FOX_CORE_REVIEW_2026_11_21.md`, včetně nalezených a opravených
překryvů. Jde o přejímku tohoto panelu podle `docs/UI_PRE_READER_GATES.md`,
nikoliv všech starších obrazovek hry. Fyzický Samsung tablet nebyl připojený.

### Hranice dokončení

Získávání nových vyšších stupňů a jejich názorné první představení ještě
není zapojené. Staré savy proto nové schopnosti správně zobrazují zamčené;
kontrolní příklady mají výslovně udělené testové runy. Čísla 1/2 příspěvku
v `src/data/fox-abilities.json` zůstávají pracovním tuningem vedlejšího chatu.
Přejímka docku neznamená schválení tohoto vyvážení ani nových podob 02–05.

Checkpoint chrání jednotlivé použití schopnosti a provedený zásah; nejde
o transakční zamykání dvou současně hrajících karet ani o jedinou společnou
databázovou transakci všech profilových odměn. Test obnovy odměn ověřil reload
po zpracování výhry před koncem animace.

Nedošlo ke commitu, pushi ani restartu hlavního serveru. Integrační změny
zůstávají ve sdíleném rozpracovaném checkoutu; před případným nasazením je
nutné převzít celý navazující model a asset manifest z tohoto předání.

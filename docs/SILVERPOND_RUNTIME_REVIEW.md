# Silverpond: přechod, vybavení a mazlíčci

Kontrola 3. 10. 2026 na `http://127.0.0.1:8001`. Změny jsou v development
kapitole Silverpond; první region si ponechává vlastní nabídku vybavení.

## Plynulý přechod a obrázky

Po dokončení stroje patří všechny obrázky cílového města, včetně HUD, vybavení
a aktivních mazlíčků obou spoluhráčů, do běžného `preload()` rakety. Phaser
dokončí jejich načtení a dekódování před `create()`, takže při zobrazení
směrovky jsou již připravené. Kliknutí pouze uloží odemčení Silverpondu,
přehraje odchod a prolnutí do města. Původně přidaná vlastní promise a větev
pro opakování načítání byly na základě autorovy připomínky odstraněny.

Statická analýza závislostí už nezaměňuje obecné slovo `depth` za animační
prefix a nepřitahuje celý podvodní svět přes pomocné systémy ukládající postup.
Vlastní `UnderwaterRoomScene` si ponechává závislosti všech editorových místností.
Scény doplňují skutečné dynamické soupisky z EncounterCatalog a vybavení z katalogu.
Dílna načítá dostupné mazlíčky, chodící scény jejich idle a souboj potřebné animace.

Po změně generátoru je nutné restartovat Vite: při dodatečné kontrole běžící
localhost stále používal jeho starou verzi v paměti. Server byl obnoven na
stejném hostu a portu a jeho manifest byl porovnán s aktuálním generátorem.
Shoda je úplná (raketa 35 klíčů, Silverpond město 59 klíčů).

Třicet existujících Silverpond spritesheetů bylo přebaleno z dlouhých řádků
(až 7680 px) do mřížek nejvýše 2048 × 2048 px. Skript
`scripts/pack-silverpond-sheets.mjs` zachovává pořadí všech 275 snímků a ověřuje
shodu každého alpha a viditelného RGB pixelu po bezztrátovém exportu. Nevytváří
nový pohyb ani nemění individuální crop či proporce. Loader respektuje
`frameCount`, takže prázdná koncová políčka nejsou animačními snímky.
Náhledy nepřátel nyní rovnoměrně zapadají do původních řádků arény.

Původní přerušovaný pád se na začátku tohoto ověření nepodařilo reprodukovat.
Opravy řeší zjištěné pořadí načítání, nadbytečné závislosti a rozměry textur;
testy prokazují následný studený průchod a dokončení standardního preloadu
před sestavením scény, také při zpožděném souboru.

## Nové vybavení

Každá řada má meč i štít, samostatný průhledný obrázek a společný stávající
rámeček/ovládání. Ikony používají stříbro, modrý email, perly a tyrkysové krystaly.
Náhled v polici, nákupu i knize zachovává poměr stran; kniha načítá skutečný
`spriteKey` vybavení také při přepnutí A/B.

| Řada | Síla meče / bloku štítu | Cena meče | Cena štítu |
|---|---:|---:|---:|
| Přílivová | 4 | 105 | 96 |
| Perlová | 5 | 212 | 189 |
| Hlubinná | 6 | 357 | 324 |

Ceny jsou v měďácích. Nové vybavení navazuje na první tři stupně a používá
odečítání do 10; štíty také sčítání do 10. Dosavadní výpočet obrany a přípravy
se nemění.

Grafika vznikla vestavěným `imagegen`. Všech šest finálních souborů je v
`public/assets/items/silverpond/`; přesné prompty, zdrojová jména a jednotlivé
cílové cesty uchovává [prompts.json](design-drafts/silverpond-equipment/prompts.json).

## Mazlíčci a kovárna

Každý ze šesti regionálních nepřátel má nového mazlíčka v `pets.json`.
Odemčení používá existující stabilní ID poraženého nepřítele, proto funguje
i pro dříve uložené porážky. Souboj zapisuje tato ID v solo i co-opu.
Nabídka není podmíněna novým opakováním již vyhraného boje.

| Mazlíček | Nepřítel | Požadovaný krystal |
|---|---|---|
| Bublinka | Bublinový krab | úlomek (tier 2), 9 |
| Ploutvička | Stříbrná rybka | úlomek (tier 2), 12 |
| Krunýřek | Mlýnský krunýřník | úlomek (tier 2), 15 |
| Mloček | Axolotl z ruin | prizma (tier 3), 6 |
| Perlička | Perlová medúza | prizma (tier 3), 9 |
| Hloubek | Strážce hlubin | prizma (tier 3), 12 |

Platí přesný tier i hodnota. Stávající poplatek dílny v maně a mincích zůstává.
Přivázání znovu kontroluje živý nezamčený krystal a vlastnictví mazlíčka;
rychlé opakované dotyky během oslavy nespotřebují další prostředky.

Checkpoint `hasUnlockedSilverpond` nyní otevírá všechny dosavadní operace
kovárny včetně výroby prizmy, nejvyššího vyráběného tieru v současném UI.
Legacy odemčení přes původní bossy zůstává platné. Recept prizmy se nemění:
střep a úlomek s hodnotami alespoň 10, výsledek `a + b − 20`, tři many.
Zde ověřena skutečná výroba `14 + 18 − 20 = 12`.

## Vysvětlivky v Silverpondu

Regionální konfigurace vypíná známé ukázky v obchodě, aréně a Pythiině dílně,
připomínku pravidla cechovní zkoušky, legendu hodnot mincí, animaci placení
a blikání platebního tácku. Výběr mazlíčka bez vhodného krystalu už neotevírá
další vysvětlující okno. Platí to i pro profil s prázdným `seenGuides`;
potlačené stránky se nezapisují jako přečtené.

Kovárna v Silverpondu nabízí pouze ukázku `createPrism`, pokud ji hráč ještě
neviděl. Známé operace zůstávají použitelné bez dalších ukázek. První region
si ponechává původní vysvětlivky. Příběhové úkoly a zadání nových podvodních
hádanek zůstávají součástí postupu.

## Funkční ověření

Před testy byly prověřeny migrace. Tyto herní změny žádnou databázovou migraci
nepotřebují. Prohlížeče mají izolované profily a mock account/telemetry API;
nespouštějí nesouvisející rozpracované analytics migrace 0005–0009.

- `npm run build:dev`: prošel; běžné upozornění na velikost JS chunků.
  Po úpravě cen a vysvětlivek znovu prošel; log `artifacts/silverpond/build-guides.log`.
- Cílený Vitest: 34 testů v pěti souborech prošlo (`SilverpondContent`,
  `SilverpondProgressSystem`, `ForestCrystalProgression`,
  `UnderwaterCreatureAnimations`, `WeaponAttackProgression`). Při spuštění
  použít `--exclude 'artifacts/**'`, aby se netestovaly archivované kopie zdrojů.
- `node --test scripts/__tests__/scene-assets.test.mjs scripts/__tests__/pilot-content.test.mjs`:
  14 kontrol prošlo, včetně uzavření pilotních závislostí bez nového vybavení/petů.
- `npm run test:e2e:silverpond`: pět scénářů pro desktop WebGL 1280 × 720
  a tablet Canvas 1024 × 768. Po odstranění retry větve a restartu Vite prošlo
  všech deset kombinací: dva studené příběhové průchody a osm kontrol obchodu,
  kovárny/petů, arény a co-opu. Příběhový test ověřuje jeden standardní loader
  před `create()` a všechny městské textury přítomné již při vytvoření směrovky.
- Po úpravě cen a vysvětlivek prošly čtyři cílené E2E kombinace (nákupy a prázdná
  historie ukázek, vždy desktop WebGL a tablet Canvas). Nákupy prověřují částky
  105, 96 a 212, odlišnou platbu i uložení/reload; samostatný výběr ukazuje 357.
  Kovárna zobrazí pouze prizmu, zavření zapíše pouze tuto stránku, opakovaný vstup
  ji již neotevře a kovárna prvního regionu stále nabídne známé operace.
  Rozšířený průchod s aktivní cechovní zkouškou byl následně ověřen v obou
  rendererech; testovací profil musí mít příslušnou početní kapitolu odemčenou.
  Cílené `VisualGuide` a `SilverpondContent` mají dalších sedm úspěšných kontrol.
- Kontrola spritesheet metadat: 30 textur, 275 snímků, žádný rozměr přes 2048 px.
- `git diff --check`: prošel.
- Globální `npx tsc --noEmit` zůstává neúspěšný kvůli dosavadním diagnostikám
  projektu (mimo jiné nevyužité deklarace, obecný `GameObject.setVisible`
  a chybějící Node typy ve starších testech). Log: `artifacts/silverpond/typecheck-final.log`.

E2E zahrnuje získání lesního krystalu, skutečnou úlohu stroje a přechod bez reloadu;
zpožděnou cílovou texturu v nativním preloadu; šest lokálních
nabídek, chybnou platbu a tři nákupy; zachování vybavení po reloadu; výrobu prizmy;
odmítnutí nesprávného tieru a přivázání za tier 2/3; skutečné spuštění vodní arény;
produkční zápis výhry/odemčení; knihu vybavení a mazlíčka obou spoluhráčů.
Výhra arény je vyvolána produkčním victory handlerem po ověření soupisky a textur,
nejde o nový kompletní playtest početních tahů všech vln.

Pro studené regresní testy se vypíná pouze byte-only background prefetch.
Samotný Phaser loader, dekódování a přechody zůstávají produkční. Samostatný
izolovaný průchod se zapnutým běžným prefetch také prošel celým příběhovým
přechodem bez console/page chyb. Po přesunu do standardního preloadu byl
zopakován s výsledkem `PASS`, prázdným seznamem chyb i varování;
skript `artifacts/silverpond/story-reproduce.mjs`, aktuální log
`artifacts/silverpond/story-native-preload.log`.

## Vizuální přejímka

Použity [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md) a
[ASSET_CREATION.md](ASSET_CREATION.md). Zkráceny popisky příběhového přechodu
a města, odstraněn nadbytečný podnadpis odměny. Nové ikony neobsahují text.
Obchod ukazuje mince a cenu, pet nabídka obrázek a požadovaný krystal;
odpovídající slovní popisky byly při kontrole skryty a zvuk vypnut.

Nové `coinLegendHost` a `forgeEquationHost` jsou v `scenes.json` a jejich
pozice/hloubka se čtou ze SceneBuilder. Legenda má vlastní kontrastní plochu
a rezervu pro čtyři řádky; po autorově připomínce se zobrazuje pouze v prvním regionu.
Znak `=` legendy je proti původním 22 px zdvojený. Samostatný znak v rovnici
kovárny používá 90 px proti původním 34 px se scale 1.3; přiléhající čísla
46 px. Prohlédnuté vykreslení má znak zhruba ve výšce číslic, bez překryvu
voleb odpovědi. Nově upravené texty používají konstruktorové `resolution: 2`.
Totéž opravuje původní Canvas překryv HP/A v aréně.

Skutečně prohlédnuté PNG v `artifacts/silverpond/`:

| Oblast / stav | Snímky |
|---|---|
| Samotné nové assety | `equipment-preview.png` |
| Odměna a rozhovor | `desktop-webgl-forest-reward.png`, `desktop-webgl-zyx-dialogue.png` |
| Přechod | `desktop-webgl-rocket-exit.png`, `desktop-webgl-story-town.png`, `tablet-canvas-story-town.png` |
| Obchod, disabled / hover / stisk | `tablet-canvas-shop-no-words.png`, `desktop-webgl-buy-hover.png`, `tablet-canvas-buy-pressed.png` |
| Nové ceny bez vysvětlivek | `desktop-webgl-selected-sword_silverpond_pearl.png`, `tablet-canvas-selected-sword_silverpond_pearl.png`, `desktop-webgl-shop-price-357-no-guides.png`, `tablet-canvas-shop-price-357-no-guides.png` |
| Jen ukázka prizmy / bez slov | `desktop-webgl-prism-only-guide.png`, `tablet-canvas-prism-only-guide-no-words.png` |
| Výběr tvora bez vysvětlujícího okna | `desktop-webgl-pet-missing-crystal-no-guides.png` |
| Cechovní zkouška bez připomínky | `desktop-webgl-guild-exam-no-guides-no-words.png`, `tablet-canvas-guild-exam-no-guides.png` |
| Vybavení solo a co-op | `tablet-canvas-equipment-book.png`, `desktop-webgl-equipment-book-no-words.png`, `tablet-canvas-coop-book-b.png`, `desktop-webgl-coop-book-b.png` |
| Prizma, správná odpověď / hotovo | `desktop-webgl-prism-forge.png`, `tablet-canvas-prism-forge.png`, `desktop-webgl-prism-success.png` |
| Mazlíčci, nesprávný tier / přivázání | `tablet-canvas-pets-no-words.png`, `desktop-webgl-wrong-crystal.png`, `tablet-canvas-binding-prism.png`, `tablet-canvas-binding-fragment.png` |
| Aréna / souboj / nabídka po výhře | `desktop-webgl-arena.png`, `tablet-canvas-arena.png`, `tablet-canvas-arena-battle.png`, `desktop-webgl-pet-unlocked.png` |

Kontrola hodnotila proporce, kontrast počtů, samostatné oblasti obsahu,
normální/pointer-out stav, zakázané akce, hover/stisk, výběr, chybu a dokončení.
Root hit area nákupního tlačítka je stabilní, rám i label se pohybují společně.
Do existujících decorative rámů se nové ikony vejdou bez změny poměru stran.

Omezení: kontrola používá software WebGL a Canvas, nikoli fyzický tablet nebo
konkrétní GPU původního výpadku. Není to uživatelský playtest s dítětem ani nová
globální přejímka všech starších obrazovek/kovářských operací. Stávající dekorace
kovárny se mezi Canvas a WebGL liší; ověřená rovnice, volby a inventář jsou úplné
a použitelné v obou. Bezztrátové přebalení textur zvětšilo soubory na disku,
ale odstranilo dlouhé GPU rozměry a zachovalo schválené animační pixely.

## 17. října 2026: příprava všech budov před vstupem

Předchozí oprava řešila především raketu a příchod do města. Předpověď dalšího
načítání vynechávala čtyři interiéry Silverpondu a upřednostňovala boj a podvodní
svět. Navíc každý dokončený download znovu odsunul timer dekódování o 80 ms.
Souvislé stahování tak mohlo přípravu obrázků dlouho odkládat.

- Příprava obrázků začíná automaticky v menu podle aktivního savu. Instalace
  offline workeru dál čeká na gesto. Budovy vlastní oblasti mají přednost.
- Downloady neodsouvají už naplánované dekódování. Příprava se obnoví i po
  dokončení jiného loaderu, například zvuku, bez čekání na další download.
- Stahování a dekódování používají stejný seznam jako běžný preload, včetně
  výbavy a mazlíčků obou hráčů. Rozbalují se nejprve menší místní obrázky;
  spekulativní limit místní oblasti je 192 MiB, ostatních scén 64 MiB.
- Při úplně studeném startu běžný preload města dokončí i zbývající obrázky
  všech registrovaných místních budov. První načtení oblasti tedy může chvíli
  trvat; po zobrazení města dveře další obrázky nepotřebují. Platí i v Mathorii.
- Aréna připraví místní náhledy a idle animace podle EncounterCatalog.
  Bojové pohyby patří do BattleScene. Složení, statistiky ani odměny se nemění.
- Kontroly postupu v CatacombPetProgress, ForestCrystalProgression a
  CrystalSystem už nepřidávají celé animace lišky a lesního bosse do chodícího
  HUD. Statický seznam města klesl z 15,76 na 4,65 MiB a z 195,61 na 33,57 MiB
  rozbalených pixelů. Jde o samotný seznam města, nikoli součet celé oblasti.

Oprava vznikla ve větvi `codex/fix-silverpond-loading`, oddělený Vite běží na
portu 8005 s vlastní cache. Testy používají smyšlené postavy, blokují účetní API
i dev-save endpoint. Běžící hra na 8001 a její uložené pozice se nepřepisují.
Tyto kontroly pracují s lokálními soubory; databázová migrace není potřebná.

Ověření:

- `vitest run src/loading/__tests__`: 15 kontrol včetně souvislého přísunu
  downloadů, automatického startu a dočasně zaměstnaného loaderu.
- `node --test scripts/__tests__/scene-assets.test.mjs`: 6 kontrol manifestu.
- Dosavadní `silverpond.spec.ts`: 12 průchodů v desktop WebGL a tablet Canvas.
- `loading.spec.ts`: 6 úspěšných průchodů. Ověřuje všech pět skutečných dveří v co-op, vybavení obou
  hráčů, budovy Mathorie a přípravu interiérů ještě v menu bez prvního kliknutí.
  U dveří kontroluje i nulové nové požadavky na obrázky.
- `npm run build:dev`: úspěšný build. Globální `tsc --noEmit` stále hlásí
  dřívější chyby mimo změněné soubory; v upravených souborech nejsou diagnostiky.

Vizuálně prohlédnuty `artifacts/loading/desktop-webgl-door-0.png` až `-4.png`
a odpovídající `tablet-canvas-door-0.png` až `-4.png` (obchod, dílna, kovárna,
cech a aréna). Pozadí, výbava, mazlíčci a náhledy jsou přítomné. Posouzeny byly
i souhrny `desktop-doors-review.jpg` a `tablet-doors-review.jpg`. Změna nepřidává
texty ani nové čekací dialogy a nemění ovládání či rozvržení. Platí předchozí
omezení Canvas dekorací; fyzický Samsung nebyl k tomuto ověření dostupný.

## 20. října 2026: menší animační sada a viditelné načítání

Živý server na portu 8001 stále běží z `main`. Předchozí opravy zůstaly
v `codex/fix-silverpond-loading` na izolovaném portu 8005. Tento rozdíl vysvětluje,
proč se při hraní znovu objevilo čekání u dveří. Sloučení a restart živé hry
čekají na výslovné potvrzení autora.

Další nalezené příčiny velké paměti:

- Generátor považoval názvy cílových scén v navigaci za požadavek na jejich
  grafiku. Nyní přebírá další rozvržení jen při skutečném použití `buildScene`
  nebo konfigurace rozvržení. Datové vazby podvodních místností se zachovávají.
- Pomocná funkce pro pozice bossova HUD přitahovala celý `UnderwaterUI`.
  Přesun do `SceneLayoutHost` odstranil ze souboje například atlas Zyxe.
- Procházení celých záznamů vybavení vyhodnotilo `shopCity: "silverpond"`
  jako animační prefix a načetlo i vílu. Vybavení nyní přidává pouze `spriteKey`.
- Aréna připravuje idle skutečně nabízených voleb; drobné obrázky ostatních
  vln používají statické portréty. Nedostupné arény se předem nerozbalují.
- Karty mazlíčků v dílně a u čarodějnice používají původní první snímek jako
  samostatný bezztrátový WebP. Aktivní společník a skuteční bojovníci si
  ponechávají animace. Liščí náhled potřebuje 1 MiB místo celého atlasu 49 MiB.
- Budoucí animační soubory lze stáhnout do cache, ale spekulativní příprava
  je mimo místní budovy nerozbaluje do textur. Při souboji se nedekódují.

`scripts/extract-actor-portraits.mjs` vytváří 17 portrétů. Kontrola porovnává
rozměry, každý alpha pixel a každý viditelný RGB pixel s prvním snímkem zdroje.
Padding, poměr stran a schválený pohyb se nemění. Při změně zdrojového atlasu
je potřeba portréty přegenerovat; pixelová kontrola odhalí zastaralý náhled.
Pilotní export zahrne pouze portréty postav, jejichž zdroj už do pilotu patří.

### Zpomalení nebo chyba sítě

Při nedokončeném preloadu je vidět animovaný krystal, ukazatel průběhu a krátký
popisek „Načítání“. Vrstva používá HTML, nepotřebuje stáhnout žádný svůj obrázek
a mizí až po vytvoření scény a prvním vykreslení. Pozice a hloubky jsou
v `SceneLoadingOverlay` v `scenes.json`.

Chybějící textura zabrání vytvoření neúplné scény. Velká kruhová šipka
s popiskem „Znovu“ opakuje pouze chybějící soubory. Pohyb povrchu při hoveru
a stisku zahrnuje rámeček i symbol, hit area zůstává pevná. Ověřeno je také
zachování uložené postavy a matematického pokroku při chybě a opakování.
První studený vstup do oblasti může čekat na zbývající soubory; jakmile se
objeví město, všech pět dveří Silverpondu má potřebné obrázky připravené.

### Měření a kontrola

Stejná zmrazená kopie profilu, katalog a pořadí
menu → Silverpond → obchod → město → aréna → souboj se třemi raky:

| Verze | Odhad rozbalených textur |
|---|---:|
| Živý `main` na 8001 | 545,1 MiB |
| Opravená větev na 8005 | 289,4 MiB |

Pokles je přibližně 47 %. Jde o součet šířka × výška × 4 přes unikátní
texturové zdroje, nikoli celkovou RAM nebo skutečně změřenou GPU paměť Samsungu.
Počet textur může kvůli malým portrétům vzrůst, přesto výrazně klesne jejich
velikost. Měření začíná v novém prohlížeči; neprokazuje stejnou spotřebu po
projití všech regionů. Přerušovaný pád fyzického tabletu není reprodukovaný.
Aktuální katalog má tři raky po 30 HP; starší měření přímého vstupu do souboje
v `MOBILE_LAYOUT_REVIEW.md` popisuje jiný okamžik a jinou trasu.

Před kontrolami byly ověřeny závislosti na migracích. Změna pracuje s herními
soubory a lokálními savy, žádná databázová migrace není potřebná.

- 24 E2E průchodů Silverpondu: desktop WebGL a tablet Canvas, nulové nové
  požadavky na obrázky u dveří, pomalý i chybující preload, portréty, nákupy,
  kovárna, aréna a co-op.
- 16 E2E průchodů obnovy: nečinnost, otočení, ztráta kontextu, fullscreen,
  souběh pauz a zachování savů.
- Po posledním zúžení závislostí vybavení znovu prošly čtyři průchody
  náhledů/nákupů a dva souboje s vybavením Silverpondu po nečinnosti.
- 18 Vitest kontrol načítání a 17 Node kontrol portrétů, manifestu a pilotu.
- Vývojový i pilotní build prošly. Známé upozornění na velikost JS chunků zůstává.
- TypeScript: 140 existujících diagnostik před i po změně, žádná nová.
  Celý projekt tedy zatím nemá čistý typecheck.

Vizuálně prohlédnuty `artifacts/loading/desktop-webgl-pet-portraits.png`,
`tablet-canvas-pet-portraits.png`, `desktop-webgl-slow-no-words.png`,
`tablet-canvas-retry-pressed.png`, normální/hover/pointer-out stavy opakování
a následný kompletní obchod. Kruhový pohyb, průběh a šipka zůstávají viditelné
bez slovních popisků a zvuku; žádný nový stav nepřidává dlouhý text.
Portréty drží původní proporce a vejdou se do dosavadních rámů. Platí
`UI_PRE_READER_GATES.md`; fyzický Samsung ani dětský playtest nebyly dostupné.
Nejde o nové schválení ostatních původních obrazovek.
Závěrečná kontrola přes Playwright MCP na 8005 potvrdila portrét lišky bez
celého atlasu, animaci aktivní želvy a nepřítomnost vílí animace. Snímek
ve výchozím workspace: `.playwright-mcp/loading-final-portraits-tablet.png`.

Připravený integrační patch se odvozuje od pracovního snapshotu `f31ced5`.
Kontrola proti současným souborům `main` nenašla konflikty. Tři soubory
ladění (`encounters.json`, `enemies.json`, `pets.json`) se při integraci
zachovají z hlavní větve. Patch nezahrnuje skutečné savy, privátní měření ani
ostatní rozpracované změny. Před použitím je nutné znovu ověřit aktuální hashe
cílových souborů; samotný patch zatím nebyl aplikovaný.

## Schválené sloučení s aktuálním main

Autor 20. října schválil sloučení, commit a push. Výsledný herní commit navazuje
na `85c9669` z GitHubu a zahrnuje opravy z `codex/fix-silverpond-loading` až po
`7db1196`. Zachovává i mezitím vydané opravy úvodu z pilotu 0.1.13: přípravu
komiksu a místa havárie, opakování přerušených požadavků a jejich původní testy.
Pro uloženou postavu v Silverpondu dál mají přednost místní budovy.

Výchozí pracovní snapshot obsahoval také rozpracovanou analytiku. Souhrnný
commit proto přebírá herní opravy, lokální synchronizaci dev savů a dokončené
Silverpond soubory, na kterých oprava závisí. Analytické stránky, události,
serverové změny a migrace 0005–0009 zůstávají lokálně rozpracované. Smíšené
soubory mají v commitu pouze herní část; jejich analytické doplňky zůstávají
v hlavní pracovní kopii. Aktuální ladění nepřátel a mazlíčků je zachované.

Čistá kopie obsahu určeného pro commit byla sestavena odděleně a testována
na portu 8006. Prošly vývojový i pilotní build, 36 Node kontrol manifestu,
portrétů, diagnostiky a offline workeru, 20 Vitest kontrol načítání a všech
26 kontrol savů. Znovu prošlo všech 24 průchodů Silverpondu. Ověření této
integrace nepotřebuje databázi ani novou migraci.

Před zápisem do hlavní pracovní kopie se porovnávají hashe dotčených souborů
i ostatních rozpracovaných změn. Uložené hry, měřicí profily a výstupy testů
nejsou součástí commitu. GitHub push sám nepublikuje novou verzi webu.

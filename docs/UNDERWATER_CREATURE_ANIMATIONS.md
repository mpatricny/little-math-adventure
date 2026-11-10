# Podvodní tvorové — produkční animace

8. září 2026. Dokončení po výslovném schválení vzdáleného AutoSprite zpracování uživatelem.

## Zapojení do hry

- Perlová medúzka: klidové vznášení, útok, reakce na zásah a porážka.
- Strážce hlubin: klid, reakce na zásah, porážka a tři různé útoky. Fáze v `encounters.json` vybírají `depth-guardian-attack`, `depth-guardian-attack-tide` a `depth-guardian-attack-crystal`.
- Nové útoky mají opt-in `holdUntilComplete`: návrat nepřítele čeká na skutečné dokončení animace, včetně blokování a třetího krystalového efektu. Starší tvorové ponechávají původní časování.
- Data textur, animací, nepřátel a editorových assetů odkazují na stejné produkční soubory v `public/assets/sprites/silverpond/`. Aliasy hurt/death odkazují na defend/defeat.
- Světlo interakce se kreslí za tvorem, ne přes jeho barvy. Nové výškové okraje `frameTopInset` (medúzka 80 px, strážce 58 px) odečítají průhlednou část snímku při připojení bojového HUD. SceneBuilder zůstává autoritou layoutu.
- Větší hosty v jeskyni a srdci kompenzují společné průhledné okraje. Osvobozený strážce má vlastní přátelskou animaci a oddělené hosty nad cestou; viz navazující úprava níže.

Nezměněny bojové statistiky, pravidla odměn ani save schéma. Tato integrace nevyžaduje databázovou migraci.

## Skutečný zdroj pohybu

Deset Sorceress `imagine-1.5` image-to-video zdrojů je v `artifacts/sorceress/underwater-finalists/`. Před extrakcí byly posouzeny kamera, anatomie, okraje i extrémy pohybu a efektů. Postup nepoužívá deformování statického obrázku, morphing ani převod starého spritesheetu na falešné video.

AutoSprite změnil barevnost strážce a hlásil 30 FPS, zatímco fyzické zdrojové video má 24 FPS. Proto produkce používá původní video RGB a pouze zarovnanou AutoSprite alfu. Zarovnání bylo změřeno podle siluet; klíčování chrání aktuální pevné jádro těla a omezuje zelený okraj podle aktuálního zdrojového snímku. Nespoléhá na neodpovídající vzdálené časové metadata.

Vzorkování skutečného zdroje: Every 4 při 24 FPS → 6 FPS. Jedna společná transformace pro všechny pohyby daného tvora, nikdy nezávislé ořezávání snímků. Finální canvas je vždy 512 × 512. Společné čtvercové výřezy z pracovních 512px zdrojů: medúzka `(8,18,491,501)`, strážce `(22,24,488,490)`.

| Pohyb | Unikátní snímky | Přehrávání |
|---|---:|---|
| Idle, oba tvorové | 13 každý | Vpřed/zpět, bez opakování krajního snímku |
| Attack, oba tvorové | 9 každý | Jednorázově |
| Defend, oba tvorové | 7 každý | Jednorázově |
| Defeat, oba tvorové | 9 každý | Jednorázově |
| Vodní útok strážce | 9 | Jednorázově |
| Krystalový útok strážce | 13 | Včetně doznění celého efektu |

Celkem 98 unikátních snímků, deset WebP spritesheetů, přibližně 3,8 MB. RGB je komprimované, alfa zůstává přesná.

## Reprodukce a artefakty

- `scripts/sorceress-underwater-finalists.mjs`: vzdálené generování a keying s uloženými ID úloh; manifest `jobs.json` předchází duplicitnímu účtování po nejistém výsledku. API klíč se nevypisuje ani neukládá do manifestu.
- `scripts/inspect-underwater-key-alignment.py`: kontrola shody vzdálených masek se skutečnými zdrojovými snímky.
- `scripts/build-underwater-finalist-sheets.py`: lokální extrakce, konzervativní klíčování, společný canvas, kontaktní přehledy a animované náhledy.
- `scripts/verify-underwater-finalist-sheets.py`: read-only kontrola všech výsledných snímků, přesné alfy, bezpečného odstupu od okrajů a HUD insetu.
- `artifacts/sorceress/underwater-finalists/production.json`: zdrojové snímky, alfa mapování, výřezy a produkční soubory. Ve stejné složce jsou `*-frames`, přehledy na světlém/tmavém podkladu a `*-preview.webp`.

## Vizuální kontrola a testy

Otevřeny a posouzeny kontaktní přehledy všech deseti výsledných pohybů včetně prvního, posledního a extrémních snímků. V herním přehrávání zkontrolovány všechny klipy na desktopu 1280×720 a skutečném Canvas rendereru 1024×768; celý co-op souboj navíc v Canvasu 1280×800. Proporce zůstávají jednotné, těla ani efekty nejsou useknuté, ovládání není překryté.

První herní kontrola odhalila světlo překrývající barevnost strážce a HUD ukotvený k průhlednému okraji. Obojí bylo opraveno a vizuální testy zopakovány. Výsledné obrazy v `artifacts/underwater/`: `creature-*-world/idle/attack/attack-tide/attack-crystal/hurt/death.png`, dále `finale-false/true-battle.png`, obě mezifáze, osvobozený strážce a odměna. Ze závěrečného běhu byly přímo posouzeny svět s nepřátelským strážcem, všechny jeho útoky, klid/zásah/porážka obou tvorů, útok medúzky, obě co-op mezifáze a osvobozený strážce.

- Produkční kontrola: **98/98 snímků prošlo**, přesná alfa a bezpečné okraje.
- Registrace animací, prezentace nepřátel a podvodní layout: **20 testů / 3 soubory prošly** v závěrečném cíleném běhu.
- **4 E2E scénáře prošly v jednom běhu**: všechny pohyby desktop/Canvas a celý skutečný boss v sólo/co-opu. Test kontroluje dokončení všech tří fázových útoků, správné odměny a reload před vyzvednutím krystalu. Sólo zaznamenalo 58, co-op 102 skutečných odpovědí při testovacím vybavení, nikoli při simulaci bojového výsledku.
- **Samostatný skutečný souboj s medúzkou prošel**, včetně návratu postavy na místo střetu.
- Závěrečný `npm run build` prošel; přetrvávají upozornění na velikost chunku a smíšený import MasterySystem.
- Celkový souběžně měněný workspace není celý zelený: poslední `npm test -- --silent --reporter=dot --maxWorkers=2 --testTimeout=30000` měl **340 úspěšných / 1 neúspěšný test**. Selhal `PuzzleCatalog.test.ts:22` (očekávané odmítnutí katalogu s 19 položkami), mimo integraci animací. Katalog puzzlů nebyl v této práci měněn. Starší běh zachytil překrytí flow karet; aktuální samostatný layout test již prošel. Tyto výsledky nejsou tvrzením o prvním bezchybném běhu celé sady.

Testy používají izolované profily. Běžící hra na 8001 ani editor na 5173 nebyly restartovány, skutečné savy nebyly měněny. Fyzický Samsung nebyl ovládán; Canvas test není tvrzením o testování konkrétního zařízení.

## Osvobozený strážce — přátelský pohyb a volná cesta

Navazující oprava po playtestu: původní statická ilustrace se překrývala s hráčem vráceným správně na místo střetu. Hráčův návrat ani uložené souřadnice se proto nemění. Strážce po výhře plave z `calmGuardianArrivalHost` do samostatného `calmGuardianHost`, vlevo a výše od místa boje. Celý jeho snímek je nad pohybovou cestou včetně bublin hráčů a mimo krystal. Pozice, velikost i hloubka zůstávají v `scenes.json`.

- Nové skutečné video vychází z `guardian-calm.webp`, nikoli z nepřátelského idle. Přátelská tvář, mrkání, pokyvování hlavy a samostatný pohyb ploutví/ocasu. Zdroj prošel kontrolou před extrakcí: 49 snímků, 24 FPS, 960×960, minimální okraj 182 px.
- Stejný Sorceress + AutoSprite workflow, 13 unikátních 512px snímků při 6 FPS, společný výřez `(126,120,437,431)`. Jedna forward/reverse smyčka bez duplicitních krajních snímků. Klidný tělesný pohyb pochází z videa; tween pouze přemisťuje celého tvora ve světě.
- Produkce: `public/assets/sprites/silverpond/depth-guardian-friendly-idle.webp`. Registrace jako samostatné NPC, ne nový bojový nepřítel. Šablona `characters.npcs.depth_guardian_friendly`; animace `depth-guardian-friendly-idle`.
- Při návratu z čerstvého vítězství proběhne 2,2sekundové odplutí. Reload nebo další návštěva zobrazí strážce přímo v jeho přátelském idle; prezentace nepřepisuje save ani znovu neuděluje odměnu. Nouzové chybějící animaci zůstává klidná ilustrace ve správném prostoru, nikoli chybová textura.
- Pro reprodukci použij `scripts/prepare-friendly-guardian-reference.py` a u generování, kontroly, stavby a validace stávajících `*-underwater-*` skriptů příznak `--friendly`. Oddělené zdroje a manifest: `artifacts/sorceress/underwater-friendly-guardian/`.
- Posouzeny zdrojový kontaktní přehled, jednotlivé první/poslední/extrémní snímky a všechny vyextrahované snímky na světlém i tmavém podkladu. Automatická kontrola přesné alfy a odstupu od okrajů prošla pro všech **13 snímků**.

Save schéma se nemění; před testy ověřeno, že tato úprava nevyžaduje databázovou migraci.

Závěrečné ověření této úpravy: **23 cílených unit testů / 3 soubory, 4 E2E scénáře a produkční build prošly**. E2E zahrnuje celý sólo boj se skutečnými 58 odpověďmi a předáním příznaku čerstvého vítězství, dále odplutí, měnící se snímky idle, oddělení od hráčů/krystalu, průchod pod strážcem, starší save, vyzvednutí krystalu a reload v desktopu 1280×720, Canvas 1024×768 a co-op Canvas 1280×800. Otevřeny a vizuálně posouzeny `friendly-desktop-departing/resting/swim-under.png`, `friendly-tablet-resting.png` a `friendly-coop-tablet-loaded/swim-under.png` v `artifacts/underwater/`; žádný přesah strážce do hráčů, názvu místnosti, ovládání nebo krystalu. Celá ostatní unit sada nebyla v této navazující úpravě spouštěna znovu. Fyzický tablet ani skutečné savy se nepoužívaly; původní server 8001 zůstal běžet.

## Rozšíření 4. listopadu 2026 — dva nové druhy

Pancéřový koník (`armored-seahorse`) a Runová loděnka (`rune-nautilus`) mají vlastní
kanonické ilustrace a skutečný pohyb z image-to-video. Zdroje, schválení přesných
bajtů a výrobní manifest jsou v `artifacts/sorceress/underwater-expansion/`.
Původní nepřátelé v aréně používají své dosavadní animace. Silnější podvodní
varianty sdílejí animaci svého druhu a jednotný zlatý znak se třemi fialovými
krystaly; znak nevyžaduje čtení ani rozlišování barev.

Osm původních úloh Sorceress `imagine-1.5`, 720p, požadovaná délka 1 s, vrátilo
49 skutečných snímků při 24 FPS a 960 × 960. Oba původní útoky byly celé
zamítnuty: bublina koníka a průsvitný paprsek loděnky překročily levý okraj.
Zůstávají archivované v historii manifestu. Dvě samostatně schválená opakování
v2 používají kompaktní fyzický útok bez emitovaného efektu. Ostatních šest
zdrojů se znovu negenerovalo. Každý výsledný zdroj prošel nezávislou kontrolou
všech 49 snímků, extrémů a úplného přehrání před klíčováním.

| Druh | Idle | Attack | Defend | Defeat | Společný výřez z 512px zdroje |
|---|---|---|---|---|---|
| Koník | 0–48 / 13 | 12–44 / 9 | 0–24 / 7 | 16–48 / 9 | `(60,76,434,450)` |
| Loděnka | 0–48 / 13 | 0–40 / 11 | 0–24 / 7 | 16–48 / 9 | `(59,71,437,449)` |

Tabulka uvádí inkluzivní zdrojové okno / počet snímků. Všechny pohyby používají
Every 4 → 6 FPS, společné čtvercové plátno 512 × 512 a původní RGB videa.
Idle běží vpřed/zpět bez zdvojení krajních snímků. Celkem jde o 78 snímků
v osmi horizontálních WebP souborech, quality 88 / method 6 / přesná alfa.

AutoSprite opět hlásil vlastní čas 30 FPS. Alfa se proto páruje podle obou
časových základen a shody siluet monotónním zarovnáním. Stejná statická póza
nesmí svévolně přetáhnout všechny pozdější masky na jeden starý snímek.
Prahová shoda siluet zůstává nad 0,90; skutečné vybrané masky dosáhly nejméně
0,975. Po společné změně velikosti se odstraňuje pouze zbytková zelená složka
průsvitného okraje. Alfa, červený/modrý kanál a všechny plně neprůhledné
pixely zůstávají beze změny; zlatá a tyrkysová paleta uvnitř těla se nepřebarvuje.

Reprodukce:

- `sorceress-underwater-expansion.mjs`: předem zapisovaný žurnál každé placené
  operace, zamykání procesu, bezpečné pokračování, odlišení odmítnuté HTTP
  odpovědi od nejistého výsledku, explicitní verzovaná opakování.
- `inspect-underwater-expansion-videos.py`: všechny nativní snímky, Every 4,
  nativní extrémy, SHA256, kontrola rozměrů a skutečného FPS.
- `build-underwater-expansion-sheets.py`: původní RGB, konzervativní alfa,
  monotónní zarovnání, jedna transformace celé rodiny a lokální despill okrajů.
- `verify-underwater-expansion-sheets.py --assets-only --receipt`: všechny
  snímky a přesná WebP alfa před změnou registrů. Bez `--assets-only` navíc
  ověřuje oba registrované nepřátele a jejich HUD inset.
- `prepare-underwater-expansion-review.py`: samostatné přehrávání přesných
  PNG při 6 FPS, první/poslední snímek, světlé/tmavé pozadí a kontaktní listy.
- `register-underwater-expansion.mjs`: vyžaduje zvlášť schválené zdroje,
  extrahované výsledky, úspěšný kontrolní manifest a aktuální schválený
  bilanční rozdíl. Změna bajtů nebo živých sestav schválení zneplatní.

Každý druh poskytuje `idle`, `attack`, `attack-anim`, `defend`, `hurt`,
`defeat` a `death`. Oba aliasy útoku mají `holdUntilComplete`; zásah sdílí
defend a smrt sdílí defeat. Průhledná výška pro bojové HUD je 21 px u koníka
a 45 px u loděnky, změřená přes všechny pohyby. Pozice světových tvorů i znaků
zůstávají samostatně upravitelné v `scenes.json`.

Pro E2E je sdílený `e2e/helpers/isolated-dev-profile.ts` zapojen před startem.
Dev savy existují jen v paměti daného prohlížeče, analytika je zakázána a celý
backendový prostor `/v1/**` je lokálně zachycen. Tyto souborové katalogy a
izolované herní testy nevyžadují databázovou migraci; souběžné analytické
migrace serveru se při této práci nespouštějí.

Závěrečná kontrola rozšíření:

- `verify-underwater-expansion-sheets.py` prošel po registraci pro **78/78**
  snímků. Samostatné srovnání všech 78 PNG před/po despillu potvrdilo stejnou
  alfu, červený/modrý kanál a neprůhledné RGBA. Přesný schválený výrobní SHA256
  je `c153af0f1509b7adacd5a699a2cac596ddbd5a2879d82ddf02b509e095dfed9a`.
- Cílený Vitest běh `UnderwaterEnemyRanks`, `EnemyUnlockSystem`,
  `UnderwaterCreatureAnimations`, `UnderwaterLayout`: **25/25 testů**.
- `LMA_E2E_BASE_URL=http://127.0.0.1:8014 npx playwright test --config
  e2e/underwater/playwright.config.ts underwater-expansion-animation.spec.ts`:
  **3/3 scénářů**. Desktop WebGL sólo a tablet Canvas sólo vyhrály bránu každý
  se 49 skutečnými odpověďmi; Canvas co-op s hráčem A ve výbavě tide a slabším
  B s 24 HP, železnou výbavou a vlkem použil 82 odpovědí. Testy ověřují celé
  klipy, skutečné klidové snímky ve všech čtyřech dotčených místnostech,
  katalogové HP včetně co-op ×1,55, výhru, zpřístupnění pokračování a návrat.
  Zaznamenané základní ID jsou historie osvobození; nové adoptovatelné
  mazlíčky tato práce nevytváří.
- Playwright MCP navíc prošel skutečným vstupem do brány, útokem a odpovědí
  při skrytých slovech a zcela vypnutém zvuku, poté celým sólo bojem,
  vítězstvím a návratem. Cesty všech pozorovaných API, dev-save a diagnostických
  požadavků odpovídaly lokálním mockům; žádný neodešel na backend.
- Posouzené herní obrazy jsou v `artifacts/underwater/new-species-*`:
  obyčejní tvorové v kanálu/komoře/jeskyni, obě silné varianty u brány,
  svět i boj v desktopu/Canvasu a jednotlivé pohyby. Samostatně
  `new-species-mcp-pre-reader-world/battle.png` a
  `new-species-mcp-victory.png`. Průhledné okraje, ploutve, chapadla,
  odstupy HP a znaky zůstávají čitelné. U brány má znak přes celou rodinu
  pohybů nejméně 10,97 / 11,30 px od viditelného těla; v idle 11,64 / 11,85 px.
- `npm run build:dev` **prošel**. Jde o Vite development build, nikoli o
  úplný TypeScript typecheck. Dřívější celoprojektový typecheck ve sdíleném
  workspace měl nesouvisející chyby a v tomto závěrečném běhu se neopakoval.
  Přetrvávají upozornění na velikost chunku, smíšený import MasterySystem
  a anotace závislosti zod. Celá ostatní testovací sada se neopakovala.

Dvě opravy testovacího harnessu nesměšovat s chybou produkce: API mock musí
odpovídat kořenovému `/v1/`, nikoli také obrázkům v `assets/.../v1/`; stisk
pokračování čeká na skutečné zpřístupnění výsledkové obrazovky po 1,5 s.
Finální společný běh tří scénářů proběhl po obou opravách. Testovalo se na
izolovaných profilech; fyzický tablet ani skutečné savy se nepoužily.

## Kontrola umístění v Bráně hlubin — 7. listopadu 2026

V `UnderwaterDepthGate` se hosty `guardianHost`, `guardianRankHost`,
`guardianEscortHost` a `guardianEscortRankHost` posunuly společně o 60 px výš
na dlážděnou plochu. Kontrola proběhla na desktopu 1280 px (WebGL, sólo)
a tabletu 1024 px (Canvas, co-op): klidové snímky, hover, vypnutý zvuk
a skryté slovní popisky. Skutečné kliknutí otevřelo boj se dvěma nepřáteli;
oba renderery načetly znaky hodnosti, bez chyb stránky. Všechny API a save
požadavky zůstaly zachycené v izolovaných kontextech.

Snímky kontroly: `artifacts/underwater/gate-platform-final-20261107-{desktop,tablet-coop}-{0,1,2,pre-reader,hover}.png`.

Parent i Astra finální umístění vizuálně schválili. Ocas i chapadla zůstávají
na horní dlažbě s rezervou před hranou; znaky mají odstup od tvorů a nevznikly
nové kolize s portálem, kelpem ani HUD. Astra posoudila všech deset snímků.

První kontrola na dlouho běžícím serveru 8001 ukázala chybějící znaky kvůli
zastaralému virtuálnímu manifestu assetů. Čerstvý server 8014 je načetl správně;
runtime se kvůli tomu neměnil. Úprava layout JSON nevyžaduje databázovou
migraci; širší testovací sada nebyla pro tento posun potřeba ani spuštěna.

## Černý obdélník na tabletu — 9. listopadu 2026

Fotka ze Zatopeného kanálu ukázala vykresleného kraba a černý obdélník místo
koníka. Nové listy měly šířku až 6656 px; starší Silverpond listy už používaly
mřížky do 2048 px. Nešlo o dřívější chybějící znak ve virtuálním manifestu.

Izolovaný WebGL test emuloval limit 4096 px a nadlimitní upload skutečně nechal
odmítnout nativním GL voláním (INVALID_VALUE 1281, žádný náhradní černý obrázek).
Phaser přesto hlásil existující texturu. RenderTexture readback koníka měl
neprůhledné rohy 255, barevný podíl 0 a shodu alfa masky pouze 0,2295;
screenshot odpovídal fotografii. Nativní desktopový limit tohoto testu byl
8192 px; nejde o přímé měření fyzického tabletu.

Všech osm nových listů se bezeztrátově přebalilo do řádkových mřížek:
idle 2048×2048, attack/defeat 2048×1536, defend 2048×1024. Každý z 78 snímků
zachovává přesně celé dekódované RGBA, včetně neviditelného RGB. Původní
schválené soubory zůstaly nezměněné. Nové cesty `*-gpu2048.webp` obcházejí
staré obrazové cache. Indexy, 6 FPS, aliasy, geometrie postav a savy se nemění.
Builder nyní přímo vytváří omezené mřížky; registrar odmítá široké stripy.
Verifier umí srovnat aktuální mřížku s historickým schváleným zdrojem.

Kontroly:

- `npx vitest run scripts/__tests__/creature-sheet-size.test.ts`: **9/9**,
  všech 71 registrovaných spritesheetů do 4096 px, Silverpond do 2048 px,
  plus přesná shoda osmi sekvencí a jejich pořadí s původními soubory.
- `verify-underwater-expansion-sheets.py`: **78/78** snímků, původní alfa,
  bezpečné okraje a přesné RGBA aktuálních registrovaných mřížek.
- `underwater-gpu-creatures.spec.ts`: **2/2**, WebGL s limitem 4096 px co-op
  a Canvas sólo při 1024×768. Zatopený kanál → Proudová komora → Brána hlubin,
  skutečné kliknutí do boje v každé místnosti, renderované první/poslední
  snímky všech osmi motion textur. Po opravě žádný odmítnutý upload,
  idle alfa IoU 1 a průhledné rohy 0. Tyto grafické scénáře netvrdí výhru boje.
- Cílený `UnderwaterCreatureAnimations.test.ts`: **9/9**; `npm run build:dev`
  prošel. Build nenahrazuje celoprojektový TypeScript typecheck; přetrvávají
  dosavadní upozornění na velikost chunků, import MasterySystem a anotace zod.

Důkazy jsou v `artifacts/underwater/gpu-20261109/`: `before-sheets.json`,
`packing.json`, černý původní svět a GPU readback v `repro-before/`, opravené
světy/boje, pixelové metriky a audity uploadů. Testy používají izolované
profily a před startem lokálně zachycují API/dev-save/diagnostické požadavky;
skutečné postupy hráčů nečtou ani nemění. Pro grafické soubory a tyto testy
nejsou potřeba databázové migrace. Fyzický tablet tento automatický běh nepoužil.

Nezávislá rodičovská kontrola přes Playwright MCP poté prošla přímo běžící server
8001 s novým izolovaným co-op profilem a vynuceným limitem uploadu 4096 px:
Zatopený kanál, Komora proudů, Světélkující jeskyně a Brána hlubin, vždy kliknutí
na tvora a vstup do skutečného BattleScene. Oba nové druhy měly alfa IoU 1,
průhledné rohy a žádný odmítnutý upload či chybu stránky. Posouzeny byly snímky
`artifacts/underwater/root-nov9-live8001-gpu4096-*-world.png` a `*-battle.png`.
Astra nezávisle schválila opravené siluety, průhlednost, proporce a zachované
vyšší umístění tvorů v Bráně. Server už poskytoval nové cesty bez restartu;
localhost i stávající LAN adresa odpovídaly HTTP 200. Testy nepřepisovaly savy,
aktuální katalog byl před i po práci chráněn soukromou místní zálohou.

### Zvonkový hlavolam ze stejného playtestu

Původní generátor přidával nejzápornější distraktory, i když nešlo provést
jejich první krok. Nová nabídka pro 6 → 2 je například `−3, −2, −1, +1`.
Každá karta je použitelná ze startu a má možné pokračování druhou kartou;
vybírají se blízké alternativy. Dvě různě obsazená místa zůstávají nutná.
Začátečníci bez odčítání si zachovávají původní podporu +0 kvůli malému číselnému
oboru. Rozpracovaná uložená úloha se negeneruje znovu a její indexy se nemění.

Nadpis je „Dva kroky“, operace jsou přímo na perlách a prázdné sloty i připravený
zvon mají krátký pohybový signál bez změny dotykových ploch. Cílená sada prošla
**103/103 testů v pěti souborech**, včetně 35 nových regresních případů a otevření
starého nedokončeného payloadu přes `acquirePuzzle`. Globální TypeScript kontrola
sdíleného workspace má dosavadní nesouvisející chyby; změněné puzzle soubory
neměly diagnostiku.

Parent proklikal chybu 6 → 3 → 1 a opravu 6 → 3 → 2 v co-op s vypnutým zvukem
a skrytými slovními popisky na desktopu WebGL a tabletu WebGL/Canvas. První chyba
zůstala zaznamenaná jako chyba; postupová perla přibyla až po správném výsledku.
Skutečně otevřené a Astrou schválené podklady jsou
`artifacts/underwater/root-nov9-bell-tablet-{normal,selected,wrong,correct}.png`,
`root-nov9-bell-tablet-canvas-{normal,empty-cue,wrong,correct}.png` a
`root-nov9-bell-desktop-webgl-{normal,empty-cue,wrong,correct}.png`.
Canvas a desktop `empty-cue` navíc skrývají i dynamicky vzniklou slovní nápovědu.
Tato kontrola neznamená přímý test konkrétního fyzického tabletu.

# R2 — audit a sjednocení vysvětlujících panelů

**Autorské review 13. 11. 2026 zamítlo předchozí estetické schválení.** Starší
výsledky níže zůstávají historií ověření, nikoli platným vizuálním přijetím.
Aktuální opravu a samostatné důkazy popisuje závěrečná revize R2.

Datum: 12. 11. 2026. Implementace Astra; nezávislé finální vizuální review provedl
koordinující agent proti `UI_REFRESH_REQUIREMENTS_2026_11_12.md` a
`UI_PRE_READER_GATES.md`. Tento dokument rozlišuje prohlédnuté snímky od funkčních
kontrol; netvrdí, že ostatní starší obrazovky celé hry prošly novou přejímkou.

## Výsledek implementace

`src/ui/GuideConfirmButton.ts` je sdílené potvrzení: jeden zelený smaltovaný rám
se zlatým okrajem, velká kreslená fajfka a runtime `OK`. Zdrojem je imagegen asset
`public/assets/ui/learning-refresh-v1/guide-confirm-frame-v1.png` (500 × 200),
prohlédnutý před zapojením; prompt a původ uchovává
`docs/ui-refresh-2026-11-12/IMAGEGEN_PROMPTS.md`. Silverpond používá stejný
komponent s již existujícím modrým smaltovaným rámem
`silverpond-fairy-action-normal`.

Úplný bitmapový rám má jednotné měřítko. Rám, fajfka i popisek jsou v jednom
vnitřním kontejneru; hover a stisk pohybují jen tímto povrchem. Kořenový hit area
má stálou pozici, velikost i měřítko a využívá Phaser `setSize` + automatický
`setInteractive`. Pointer-out a deaktivace okamžitě vracejí povrch do klidu.
Potvrzení se před callbackem zablokuje; dvojklik nemůže přeskočit další stránku.
Zánik kořene i scény zruší jeho animace a posluchač shutdown. Text je vytvářen
s `resolution: 2`, fajfka není textový znak a zůstane vidět při skrytí slov.

Viditelné ovladače a jejich rozměry jsou hosty v `scenes.json`. U sdílených
návodů odstraněny `guideReplayHost`, `guideNextHost`, `guideCloseHost`; přidány
`guideConfirmHost`, `guideShieldHost`, `guideSafeAreaHost`. PictureDialog má
samostatný sdílený `PictureDialogOverlay`, zařazený i do pilotního manifestu.
Rocket dialog má nově nezávislé hosty portrétu, jména, ilustrace, titulku,
krystalu a bezpečného obsahu. Ilustrace i dekorativní krystal zachovávají poměr
stran. Potvrzení Silverpond questu a rakety je celé uvnitř skutečného vnitřku
rámu; jeho hit box kontroluje také browser test.

## Úplný inventář auditu R2

| Produkční tok | Původní stav | Výsledek / hranice |
|---|---|---|
| ShopScene — úvod, broušení meče, nabití štítu | Znovu + další/fajfka + křížek | Jedno `OK`; tři obrazové stránky, přípravná ukázka zůstává izolovaná od nákupu a run. |
| CrystalForgeScene — merge, split, createFragment, splitFragment, refine, createPrism | Stejné tři akce | Jedno `OK` na každé odemčené stránce; výběr předváděné operace je zachován. |
| SilverpondCrystalForgeMockScene (produkční regionální varianta) — createPrism | Sdílený VisualGuide | Stejné `OK`, modrý regionální rám; nepřidává návody vypnuté konfigurací této scény. |
| ArenaScene — osvobození tvorů | Sdílený VisualGuide | Jedno `OK`, obrázky a rovnice zachovány; tlačítko nezahajuje boj. |
| PythiaWorkshopScene — nový mazlíček | Sdílený VisualGuide | Jedno `OK`; potvrzení nikoho nekoupí ani nesváže. |
| PythiaWorkshopScene — chybějící přesný krystal | Sdílený VisualGuide, dočasná rada | Jedno `OK`; dynamický příklad zachován, `persist=false` zachová opakovatelnost rady. |
| CrashSiteScene — zklidnění slizu a cesta do arény | PictureDialog, zavření klepnutím na panel, pozadí nebo klávesu | Jedno `OK` pod obrázky; vstupní zablokování a postupné objevení obrázků; žádný tap-anywhere ani uniklý klávesový handler. |
| ComicScene — šest příběhových obrázků | Přeskočit + klepnutí kdekoli + klávesové přeskočení | Jedno velké `OK`; původní časované střídání a pohyb ilustrací zachovány; během přechodu je ovladač vypnutý. |
| GuildScene a SilverpondGuildMockScene — názorná oprava chybné odpovědi | `PŘESKOČIT` měněné na `ROZUMÍM` | Jedno `OK`, dostupné po dokončení animace; původní pauza zkouškového timeru a další příklad zachovány. |
| SilverpondQuestDialog — víla (3 stránky), potopení, zachráněný krystal | DÁLE / HOTOVO | Stejná jediná fajfka + `OK`; 1,2s obrazové zdržení není závislé na hlasu; opětovné otevření resetuje stav. |
| SilverpondFairyRewardScene — poděkování, šupina, předvedení dýchání | DÁLE / PŘIJMOUT / DÁLE | Stejné jedno `OK` ve všech třech fázích. Schopnost je jako dříve přidělena při vstupu, potvrzení pouze vede příběhem a označí zhlédnutí. |
| ZyxRocketInterludeScene — návrat lesního krystalu | DÁLE / JDEME | Stejné jedno `OK` pro tři obrazové stránky; skutečný stroj následuje až potom. |
| UnderwaterRoomScene — úvod se šupinou | Malá šipka dolů | Velké modré `OK`; zachováno předvedení ponoření při pokračování. |
| ZyxRocketInterludeScene — připravované další město | Dlouhý informační text + návrat | Krátký nadpis, město/přesýpací hodiny a jediné modré `OK`. |

### Zachované významové volby a další prohlédnuté toky

Tyto ovladače nejsou souběžné varianty „zavřít návod“ a nesmějí být odstraněny:

- `CatacombTrialScene.createIntroOverlay`: zahájit konkrétní zkoušku / vrátit se.
- `ManaCollectionScene.showIntroOverlay`: hrát minihru / vrátit se. Názorná
  tichá ukázka zastavení na výsledku zůstává a při zániku ruší své časovače.
- `GuildScene` a `ExamsOverlay`: volba zkoušky, zahájení, návrat a výsledky.
  Pouze vložená obrazová oprava odpovědi používá nové potvrzení.
- `PreparationTrainingOverlay`: skutečné řešení příkladů a dokončení/opuštění
  přípravy; není to nehodnocený návod. Jeho callbacky přidělují reálné runy.
- `ForestCrystalRewardScene`: `VEZMI KRYSTAL` je skutečné převzetí odměny a
  dokončení milníku, nikoli potvrzení vysvětlení.
- `UnderwaterUI.dialog`: obnovení po chybě načítání, návrat do menu a volba
  „k lodi / ještě prozkoumat“ po skutečném získání krystalu. Volby zachovány;
  nadbytečné odstavce nahrazeny krátkým názvem a obrazovými symboly.
- Smazání profilu, nákupy/příprava, opuštění výpravy a nabídka lehčí obtížnosti
  v `TownScene.showStruggleDialog` zůstávají skutečnými rozhodnutími.
- `MathBoard` / `SequentialMathView`: integrovaná automatická krokodýlí ukázka
  má vlastní předvedení a návrat k novému příkladu. Neobsahuje souběžné
  zavřít/znovu/potvrdit; nápověda v samostatné úloze zůstává podporou učení.
  Kurikulum, first-answer pravidla, časy, dávka útoku a damage nebyly změněny.
- Obrazové nápovědy u hádanek a podvodních mechanismů, trvalý klíč hodnot mincí,
  recepty v TavernScene a krátký automatický `UnderwaterChestReward` jsou
  nemodální součásti zadání / účtenky. Nemají potvrzovací navigaci k odstranění.
- Technické nastavení TV/účtu a inventáře/statistiky nejsou vysvětlující herní
  panely R2. Jejich ostatní případné starší vizuální nedostatky tato přejímka
  nepotvrzuje jako vyřešené.

## Životní cyklus a ochrana herního stavu

`VisualGuide` povolí potvrzení až po původních 3,3 s, respektive 6,5 s přípravné
ukázky. Zaznamená pouze skutečně dokončenou aktuální stránku; zavření scény
neoznačí neviděné stránky. Potvrzení mění pouze `seenGuides` původního hráče,
pokud je stále aktivní a `persist=true`. Všechny časovače a tweens ukázky se
ruší při změně stránky i zániku. `PictureDialog` má vlastní audio scope,
ruší všechny pohyby a časovače a po shutdown nespouští příběhový callback.

Modalní vstupní clona i potvrzovací tlačítko zastavují propagaci pointer eventu.
Test sleduje také globální input handler scény a potvrzuje nulový průchod
kliknutí. `TrialFeedbackVisualizer` nyní vlastní všechny své časovače a
animace; pozdní dokončení starší opravy nemůže aktivovat potvrzení nové opravy.
Nové helpery nevytvářejí matematické pokusy, mastery, přípravu, nákupy ani damage.

## Testy a preflight

Před ověřováním zkontrolovány `package.json`, Vitest konfigurace, serverové
migrační soubory a použitý e2e harness. Tyto testy používají frontend a
izolované lokální save fixtures; nevolají databázové integrační testy a
nepotřebují aplikované DB migrace. Nebyla aplikována žádná migrace ani změněn
uživatelský skutečný save.

- `npx vitest run src/systems/__tests__/VisualGuide.test.ts src/systems/__tests__/GuildExamLayout.test.ts src/systems/__tests__/UnderwaterLayout.test.ts --exclude 'artifacts/**'`: **20/20 prošlo**.
- `npx vitest run src/systems/__tests__/SilverpondProgressSystem.test.ts --exclude 'artifacts/**'`: **6/6 prošlo** po konečné úpravě dialogových hostů.
- První spuštění bez `--exclude` navíc našlo archivní kopii testu v
  `artifacts/releases/.../workspace-before-sync`; ta nemá úplný zdrojový strom.
  Produkční tři soubory prošly už při tomto spuštění, archiv byl následně
  výslovně vyloučen.
- `node --test scripts/__tests__/scene-assets.test.mjs`: **10/10 prošlo**, včetně všech vstupních bodů nového potvrzení.
- `node --test scripts/__tests__/pilot-content.test.mjs`: **9/9 prošlo**,
  včetně integrity zdrojových katalogů.
- První úplný `npx playwright test --config e2e/guides/playwright.config.ts`:
  **6/6 prošlo**, desktop 1280×720 WebGL a tablet 1024×768 Canvas.
  Ověřil jediný ovladač, skutečný asset, shodné scaleX/scaleY, text resolution,
  disabled/hover/pressed/pointer-out, společný povrch, dvojklik, blokování
  podkladu, tiché dokončení všech shop stránek, stejný kompletní stav hráče
  kromě seenGuides, opakované otevření, shutdown uprostřed ukázky a PictureDialog.
- Následný běh `--grep 'shop:|other production'` prošel na tabletu **2/2**.
  WebGL při souběžné zátěži softwarového GPU dvakrát překročil původní 15s
  čekání na dokončení časované ukázky. Po zvýšení pouze testovacího timeoutu
  na 60 s prošel opakovaný WebGL běh **2/2**. Produkční trvání ukázek se nemění.
- Finální `npx playwright test --config e2e/guides/playwright.config.ts --grep 'other production|comic has'`:
  **4/4 prošlo**, oba renderery. Pokrývá arénu, Pythii, cechovní opravu,
  tři stránky Silverpond questu, tři stránky víly, tři stránky rakety,
  podvodní úvod a komiks. Kontroluje i celou potvrzovací oblast uvnitř insetu,
  jediný callback opravy, dokončení příběhů, Comic → CrashSite → znovu Comic.
  Tím prošlo všech pět různých browser scénářů ve dvou rendererech;
  dílčí běhy jsou uvedeny jednotlivě, nejde o tvrzení jednoho společného běhu.
- Opakovaný `--grep 'comic has'`: **2/2 prošlo**; snímky nyní čekají na konec
  úvodního zatmívání kamery, aby přejímka hodnotila plně viditelný obrázek.
- `npx tsc --noEmit`: globální kontrola zůstává neúspěšná na existujících
  chybách napříč scénami a testy (například nullable playerB v aréně, nevyužité
  legacy členy, node:fs typy testů). Znovu spuštěno po finálních změnách;
  změněné komponenty a scény R2 žádnou chybu nehlásily.

Pomocné playtest skripty a starší Silverpond e2e převedeny na nový host;
audit textu ve `story-audio.spec.ts` nyní převádí lokální safe box textu přes
matici jeho vizuálního kontejneru stejně jako produkční `auditUnderwaterLayout`.
Celá širší Silverpond sada se v rámci tohoto R2 průchodu znovu nespouštěla.

Vite měl v existujícím dlouho běžícím procesu starý virtuální asset manifest;
prosté znovunačtení stránky nestačilo. Browser testy používají nový server na
portu 8036 (`reuseExistingServer: false`). Nový manifest obsahuje potvrzovací
rám u všech vstupních scén a PictureDialog má svou původní 9-slice texturu.

## Vizuální důkazy a zjištění

Prohlédnuty jednotlivé zdrojové assety nového zeleného rámu, původního
medieval rámu a modrého Silverpond ovladače. Skutečně prohlédnuté screenshoty:

- `artifacts/ui-refresh/guides/desktop-webgl-shop-out.png`
- `artifacts/ui-refresh/guides/desktop-webgl-picture-dialog.png`
- `artifacts/ui-refresh/guides/desktop-webgl-shop-no-words-muted.png`
- `artifacts/ui-refresh/guides/desktop-webgl-shop-disabled.png`
- `artifacts/ui-refresh/guides/desktop-webgl-shop-hover.png`
- `artifacts/ui-refresh/guides/desktop-webgl-shop-pressed.png`
- `artifacts/ui-refresh/guides/tablet-canvas-shop-out.png`
- `artifacts/ui-refresh/guides/tablet-canvas-ArenaScene.png`
- `artifacts/ui-refresh/guides/tablet-canvas-PythiaWorkshopScene.png`
- `artifacts/ui-refresh/guides/desktop-webgl-PythiaWorkshopScene.png`
- `artifacts/ui-refresh/guides/tablet-canvas-guild-correction.png`
- `artifacts/ui-refresh/guides/desktop-webgl-silverpond-quest-1.png`
- `artifacts/ui-refresh/guides/desktop-webgl-silverpond-quest-2.png`
- `artifacts/ui-refresh/guides/desktop-webgl-silverpond-quest-3.png`
- `artifacts/ui-refresh/guides/tablet-canvas-silverpond-quest-2.png`
- `artifacts/ui-refresh/guides/tablet-canvas-fairy-2.png`
- `artifacts/ui-refresh/guides/desktop-webgl-rocket-1.png`
- `artifacts/ui-refresh/guides/tablet-canvas-rocket-1.png`
- `artifacts/ui-refresh/guides/tablet-canvas-underwater-intro.png`
- `artifacts/ui-refresh/guides/desktop-webgl-comic.png`
- `artifacts/ui-refresh/guides/tablet-canvas-comic.png`

Na těchto snímcích je fajfka jednoznačná i při skrytém „OK“, akce netvoří
konkurenční navigaci, ilustrace mají stejné proporce a texty zůstávají krátké.
Při review se zpřesnil inset footeru: potvrzení se posunulo výše do bezpečného
obsahu původního rámu; nadpis a rovnice mají oddělená místa. U Silverpond questu
se ilustrace posunula vlevo a potvrzení do samostatného pravého sloupce;
pět teček v ukázce víly i šupina → dítě mají volné místo. U rakety přestal
ovladač zasahovat do spodního okraje. Finální snímky na uvedených cestách
obsahují opravené rozložení.

Koordinující agent nezávisle přijal cechovní opravu a podvodní úvod na Canvasu
a konečné WebGL snímky Silverpond questu a rakety. Ostatní vygenerované snímky
mají podpůrnou hodnotu; samotné vytvoření screenshotu není přejímka.
Neprováděl se dětský uživatelský playtest ani úplná vizuální přejímka všech
starších obrazovek mimo vyjmenovaný rozsah R2.

## Revize R2 po autorské korekci — 13. 11. 2026

Autor správně označil portrét Zyxe za posunutý vpravo. Předchozí kontrola
posoudila celé plátno postavy a nedostatečně ověřila skutečný střed medailonu.
Oprava mění společný optický origin animace **i** chybné editorové hosty.

### Měření a změny

- Zdrojový rám `zyx-dialog-frame.png` má 1200 × 320 px. Souvislá tmavá výplň
  medailonu má po oddělení zlatého obvodu hranice x49–234, y74–258, tedy střed
  (141,5; 166). Při jednotném měřítku 1180/1200 je střed v questu (189,14; 520,9)
  a u rakety (189,14; 573,9). Dřívější host x217 byl zhruba o 28 px vpravo.
- Zkontrolováno všech 30 snímků `spritesheet-zyx-transparent2-sheet`, každý
  na původním 341 × 341 plátně. Průměr jejich alpha-vážených středů při prahu
  alpha >32 je (168,3677; 182,7697). Nový `ZyxDialogPortrait.ts` z těchto hodnot
  používá **jeden společný origin** pro celou animaci a jednotné měřítko.
  Nedošlo k ořezu, deformaci ani nezávislému posouvání jednotlivých snímků.
- `silverpondQuestPortraitHost` nyní (189; 521), `zyxDialoguePortraitHost`
  (189; 574); oba jmenné hosty mají x189. Postava i „ZYX“ tak odpovídají
  skutečnému medailonu. Podvodní úvod i opakovaně používaný
  `UnderwaterUI.dialog()` sdílejí stejný optický origin svého Zyxe.
  Dvouvolbové podvodní dialogy zachovávají obě herní volby. Postavy stojící
  přímo ve scéně si ponechaly origin u chodidel; malá dvojice Zyx + krystal
  ve `ForestCrystalRewardScene` nemá medailon a není tímto centrovaným
  portrétovým kontextem.
- `PictureDialog` žádného Zyxe ani tento medailon neobsahuje; jeho obrázkový
  obsah se neměnil. Viditelný odstup potvrzení od původního 9-slice rámu
  zůstává kontrolovaným případem v novém browser průchodu.
- Audit ornamentů odhalil malý spodní odstup také u cechovní opravy a
  podvodního úvodu: `trialFeedbackActionHost` posunut z y585 na y562,
  `modalConfirmHost` z y544 na y512. Velikost, hit area, chování a způsob
  vykreslování tlačítek se nemění. Quest, raketa, obchod, aréna, Pythie a
  samostatná akce víly mají oddělené místo; jejich potvrzení se dále neposouvalo.
- Skutečná kontrola Canvasu odhalila navíc chybějící rám `PictureDialog`:
  nativní Phaser `NineSlice` má v instalované verzi `renderCanvas = NOOP`.
  Původní textura a původní řezy 41/57/45/50 se nyní skládají z devíti
  obyčejných `Image` stejným sdíleným algoritmem jako `MedievalPanel`.
  Rohy se nedeformují, mění se pouze střed a rovné lišty. Dosavadní vzhled
  `createMedievalPanel` zůstává matematicky stejný. Žádný bitmapový podklad
  nebyl upraven.

### Nové ověření

Znovu přečteny pravidla, `ASSET_CREATION.md`, pre-reader gates a autorská korekce.
Před testy ověřeny migrace a fixture harness: jde o frontend s izolovanými
lokálními savy, bez závislosti na databázové migraci. Skutečné savy se nemění.

- Cílené `GuildExamLayout`, `UnderwaterLayout`, `SilverpondProgressSystem`:
  **21/21 prošlo**.
- `node --test scripts/__tests__/scene-assets.test.mjs`: **10/10 prošlo**.
- Po sdílení devítidílného rendereru `VisualGuide.test.ts`: **5/5 prošlo**.
- Nový `e2e/guides/portrait-centering.spec.ts` porovnává centroidy skutečných
  alpha pixelů všech snímků s výplní medailonu zjištěnou flood-fillem původního
  rámu. Cílem testu není host/origin převzatý z implementace. Kontroluje
  průměrné vystředění pod 1 px, prostor každého snímku uvnitř medailonu,
  jednotné měřítko a neměnný origin. Pořizuje celé obrazy i detailní výřezy
  se zastavenými snímky 0, 5 (máchnutí), 10 (náklon) a 23 (klidová fáze).
- První měření odmítlo odhad y522/y575, protože se od přesné výplně lišil
  o 1,10 px. Hosty se opravily o jeden pixel; tolerance testu se nezměnila.
- Konečný desktop WebGL průchod portréty a dialogovými mezerami: **2/2 prošlo**
  za 1,9 minuty. Canvas dokončil všechna portrétová měření a snímky, ale
  první spojený test později skončil na chybě nové podvodní fixture
  (neinicializované `storyProgress`). Po opravě fixture prošla oddělená
  kontrola zbývajících Canvas dialogů **1/1** za 20,3 s. Přijaté portrétové
  snímky se na pokyn koordinátora zbytečně neopakovaly.
- Průměrná odchylka skutečného alpha středu v obou rendererech a obou
  medailonech je x −0,142 px, y +0,100 px. Všech 30 siluet zůstává uvnitř
  82,43 % normalizovaného vnitřního poloměru medailonu; přirozený náklon
  animace se zachoval.
- Nový samostatný test `PictureDialog` porovnává skutečně vykreslený pixel
  horního rámu se stejnou scénou, v níž je skrytý pouze rám. Zachytí tak
  původní Canvas NOOP, i kdyby geometrie objektu stále odpovídala očekávání.
  Finální průchod tímto testem v desktop WebGL a tablet Canvas:
  **2/2 prošlo** za 34,3 s, včetně normálu/hover/stisku/pointer-out a
  snímku opakovaně používaného podvodního dialogu s oběma herními volbami.

Zdrojové měření a kontaktní náhled:
`artifacts/ui-refresh-v2/guides/zyx-alpha-measurements.json`,
`artifacts/ui-refresh-v2/guides/zyx-idle-frames-0-5-10-15-20-29.png`.
Skutečně vizuálně zkontrolované finální snímky jsou v
`artifacts/ui-refresh-v2/guides/`: pro `tablet-canvas` i `desktop-webgl`
`quest-frame-0`, `quest-portrait-5/10/23`, `rocket-frame-0`,
`rocket-portrait-5/10/23`, dále cechovní potvrzení a podvodní úvod v normálu
a při stisku. Zkontrolovány byly také WebGL cechovní hover a všechny čtyři
samostatné fáze portrétu. Postava, oči i jméno nyní tvoří vyváženou kompozici
v medailonu; mávnutí ani náklon se nedotýkají obvodu. Cechovní a podvodní
potvrzení mají mezeru vůči skutečným ornamentům i při stisku. Všechny běhy
měly ztlumený zvuk; vysvětlení tvoří obrázky a krátké titulky.

Koordinátor nezávisle prohlédl vlastní MCP detail Zyxe a nové Canvas detaily
questu, celou raketu a stisk v cechu; opravené vystředění a tyto mezery přijal.
Jde o nové interní review, nikoli tvrzení, že autor změnu již schválil.
Opravený `PictureDialog` byl následně skutečně prohlédnut v obou rendererech:
`desktop-webgl-picture-dialog.png`, `tablet-canvas-picture-dialog.png`
a příslušné `-hover`, `-pressed`, `-out` varianty. Původní rám nyní na Canvasu
opravdu existuje, rohy si zachovávají proporce a pod zeleným OK zůstává
zřetelná mezera. `desktop-webgl-underwater-choice-portrait.png` a
`tablet-canvas-underwater-choice-portrait.png` dokládají společný optický
origin i zachování dvou samostatných herních voleb s odstupem od spodní lišty.
Opravy nemění nákupy, mastery, damage ani ukládání postupu. Neproběhl dětský
uživatelský playtest; předchozí autorem odmítnuté estetické schválení se
tímto dokumentem neobnovuje automaticky.

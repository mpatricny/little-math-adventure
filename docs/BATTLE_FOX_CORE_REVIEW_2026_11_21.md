# Liščí schopnosti a obnova příkladu — předání 21. 11. 2026

## Stav předání

Schválený vzhled a pravidla vlastníků jsou v
`docs/design-drafts/battle-dock-v3/HANDOFF.md`. UI chat převzal integraci
do BattleScene, vykreslení panelu, bojové efekty a konečnou vizuální přejímku.
Tento dokument potvrzuje rozsah samostatně ověřeného modelu a MathBoardu.
Není schválením celé rozpracované integrace BattleScene.

Před testy byla ověřena závislost na migracích: jde o klientský model,
volitelná pole JSON savu a vykreslení. Databázová migrace není potřebná.
Rodinné savy ani hlavní server na portu 8001 nebyly při těchto kontrolách měněny.

## Model a ukládání

- `FoxAbilitySystem`: samostatné síly a jedno použití každé schopnosti pro A/B.
  Zámek, spotřebované použití, plné zdraví, obrana, pauza, konec boje a výběr
  živého cíle mají odlišný stav. Přímý zásah používá společný výpočet poškození.
- `BattleFoxAbilitySession`: společný záznam použití, HP, nepřátelských instancí
  a dat potřebných pro obnovení. Změna se uloží před efektem. Neúspěšný zápis
  nespotřebuje schopnost. Revize odmítá postupně provedený zastaralý zápis;
  není to zámek transakce mezi dvěma současnými kartami prohlížeče.
- Po úspěšné schopnosti nebo `applyIncomingDamage` musí scéna nejdřív převzít
  vrácené `combat`, teprve potom animovat a znovu ukládat. Jinak by staré živé HP
  přepsalo novou hodnotu. Běžné změny boje používají `checkpointCombat()`.
- Zbytek příchozího poškození po běžném bloku spotřebuje nejdřív liščí štít,
  potom nejvýše jednu užitečnou runu z obchodu. Scéna nesmí zároveň spustit
  původní větev spotřeby runy.
- `SaveSystem.writeFoxAbilityCheckpoint` ověřuje profil, předchozí revizi,
  existující ochranu zápisů a skutečné uložení. Použitý živý hostitelský profil
  dostane nový checkpoint i do paměti, aby ho následný běžný save nezahodil.

Starý útok lišky zůstává beze změny. Nové runy nejsou automatickou migrací
starých savů. `awardFoxRune` přijímá doklad po dokončení nového stupně;
ověření a získávání těchto nových stupňů ještě není zapojené. Běžné staré
savy proto nové schopnosti zatím mají zamčené. Pracovní nastavení v
`src/data/fox-abilities.json` přidává za I jeden bod a za II nahrazuje příspěvek
dvěma body. Příspěvky modulů se sčítají. Toto je konzervativní výchozí tuning,
nikoli tvrzení o uživatelem schváleném konečném vyvážení. Milníky vzhledu
zůstávají 0/4/10/20/32.

## MathBoard a osobní rychlost

- `suspend(reason)` a `resume(reason)` oddělují pauzu hráče a schopnost.
  Obnoví se až po zrušení všech důvodů a návratu do viditelné karty.
  Stojí čas příkladu, nápověda, přechod a prezentační animace.
- `exportCheckpoint()` vrací JSON aktuální sady nebo `null`, když board není
  aktivní. `restoreCheckpoint(saved, options)` obnovuje otázku, přijaté
  odpovědi, zpětnou vazbu, poškození, časy a asistenci. Přijatou odpověď
  neposílá znovu do callbacku ani znovu nepřidává rychlostní bonus.
- `setCheckpointChangedCallback` přichází po dopočtení celé odpovědi a při
  posunu. Starší callback první odpovědi nastává před výpočtem poškození.
  Samotné obnovení nový checkpoint callback nevyvolává.
- Runtime callback dokončení váže scéna znovu před obnovením. Uložené objekty
  Phaseru ani closure nejsou součástí checkpointu. Dokončení už potvrzené
  v checkpointu se nevyvolá podruhé.
- `PersonalBattleBonuses.exportCheckpoint/restoreCheckpoint` zachová pro A/B
  původní rychlostní reference, zvolený modul, dílčí výsledky a stav vyplacení
  many. Scéna ukládá tento stav spolu s MathBoardem do `combat.resumeData`.

## Provedené kontroly

50 testů modelu, atomického combat checkpointu, zápisu savu, přenosu savů,
výpočtu poškození a původního růstu lišky prošlo. Dalších 26 testů ověřilo
osobní bonusy a validaci MathBoard checkpointu. Dva Playwright testy na
izolovaném portu 8032 prošly ve WebGL i Canvas:

- dva současné důvody pauzy a zachování aktivního času;
- obnovení přijaté správné odpovědi bez dalšího bonusu;
- stejná druhá otázka, dosavadní poškození a časy;
- právě jedno dokončení celé sady i po obnovení;
- obnovení chybné odpovědi při porovnávání v obraně, bez nového pokusu.

Příkazy:

```sh
./node_modules/.bin/vitest run src/systems/__tests__/FoxAbilitySave.test.ts src/systems/__tests__/SaveTransfer.test.ts src/systems/__tests__/BattleFoxAbilitySession.test.ts src/systems/__tests__/FoxAbilitySystem.test.ts src/systems/__tests__/CombatDamageSystem.test.ts src/systems/__tests__/CatacombPetProgress.test.ts
./node_modules/.bin/vitest run src/ui/mathboard/__tests__/checkpoint.test.ts src/systems/__tests__/PersonalBattleBonuses.test.ts
./node_modules/.bin/playwright test --config e2e/practice/fox-checkpoint.playwright.config.ts
```

TypeScript stále hlásí chyby v jiných rozpracovaných souborech (např.
ArenaScene). Při kontrole nebyly diagnostiky v novém modelu liščích schopností,
jeho typech, SaveSystem helperu ani upraveném MathBoardu a osobních bonusech.
Celý projekt tedy nemá zelenou typovou kontrolu.

## Vizuální review a omezení

Skutečně prohlédnuté snímky pod `artifacts/fox-checkpoint/review/`:

- `webgl-restored-question.png`: zadání je po obnovení viditelné, vztah prázdný;
- `webgl-restored-feedback.png`, `canvas-restored-feedback.png`: součet síly,
  přijatá odpověď a pokračovací akce;
- `webgl-restored-comparison-block.png`, `canvas-restored-comparison-block.png`:
  špatná volba má křížek, správný vztah je předvedený, blok zůstává nula;
- `mcp-muted-restored-question.png`, `mcp-muted-restored-feedback.png`:
  nezávislý průchod Playwright MCP na 8027 se skrytými slovy a vypnutým zvukem.

Přejímka MathBoardu podle `docs/UI_PRE_READER_GATES.md`: v kontrolovaných
stavech nejsou slovní návody, úloha i oprava jsou čitelné z čísel, velkých
znaků a stavových symbolů. Vložený vztah má srovnatelnou výšku s číslicemi,
volby se vejdou do tlačítek a nepřekrývají se. Při review byl odhalen a opraven
neviditelný příklad po zrušení vstupní animace a také značka odpovědi zamrzlá
na nulové průhlednosti. Automatické testy samotné tuto vizuální přejímku
nenahrazovaly.

MCP snímky z dlouho běžícího 8027 navíc odhalily chybějící nově přidané
textury docku (`battle-dock-round-v3`, `square`, `tab`, hlava lišky).
Na čerstvě spuštěném 8032 se stejné textury zobrazily správně. UI chat dostal
konkrétní nález k ověření jeho asset manifestu. Tyto MCP snímky proto nejsou
schválením docku. Výsledná BattleScene, obnovení jejích bojových fází,
kooperace, efekty a všechny stavy nového panelu ještě vyžadují její integrační
testy a závěrečné vizuální review. Fyzický tablet Samsung nebyl připojen.

## Navazující review integrace přes Playwright MCP

Nezávislé review proběhlo na portu 8029 v izolovaném kontextu
`battle-dock-final-review`. Fiktivní profily byly převzaty z integračních testů;
všechny `/v1`, dev-save a diagnostické požadavky byly zachycené mocky před
spuštěním hry. Rodinné savy ani hra na 8001 se této kontroly neúčastnily.
Ani tato klientská kontrola nepotřebovala databázovou migraci.

Skutečně prohlédnuté snímky v `artifacts/battle-dock-v3/review-mcp/`:

- `tablet-a.png`, `tablet-a-bfox.png`, `tablet-b-turn.png`: nízký panel,
  jména, portréty a vlastník schopností. Klik na lišku B zachoval běžný tah A.
- `tablet-heal-hover.png`, `tablet-heal-pressed.png`,
  `tablet-b-heal-used.png`: léčení zvýšilo pouze HP B z 18 na 19;
  použití A zůstalo dostupné. Prázdný drahokam odlišuje spotřebovanou akci.
- `tablet-b-pet.png`, `desktop-b-pet.png`: při tahu mazlíčka zůstal vlastník B
  a hlavní akce zobrazila skutečně vybavenou lišku.
- `tablet-full-hp.png`, `tablet-attack-pressed.png`,
  `tablet-pointer-out.png`: dočasně nedostupné léčení a společný pohyb
  povrchu tlačítka. Odtažení drženého ukazatele vrátilo povrch na Y=0,
  zrušilo stisk a nespustilo útok.
- `tablet-target.png` zachytil chybu: starý popisek tahu překrýval ikonu
  výběru cíle. UI chat opravil skrývání popisku a běžných indikátorů.
  `canvas-target-fixed.png` potvrzuje opravu po novém načtení kódu.
- `tablet-math-resumed.png`, `canvas-reloaded.png`,
  `canvas-math-no-words.png`: návrat k zadání po zrušení výběru cíle,
  reload v Canvas a kontrola s vyprázdněnými slovními popisky a vypnutým
  zvukem. Zadání se po dokončení nájezdu zobrazilo s alpha=1; zrušení
  nespotřebovalo přímý zásah a obnovilo aktivní čas příkladu.

Kontrolované rozměry byly 1024×768 a 1280×720. Na menším viewportu mají
schopnosti i přepínače vlastníka výšku klikací plochy 59,2 CSS px, hlavní
útok 83,2 px a výběr nepřítele 64 px. Cíle nepřátel se nepřekrývaly.
V kontrolovaných stavech nebyly černé ani chybějící textury a dekorativní
rámy si zachovaly proporce. Canvas byl ověřen jako skutečný renderer typu 1.

Dále byly vizuálně prohlédnuty integrační snímky
`solo-pet_catacomb_A.png`, `solo-pet_silverpond_mill_turtle.png`,
`canvas-defense.png` a `canvas-restored.png` v nadřazené složce:
zamčené schopnosti mají zámky, želva má vlastní portrét bez cizího panelu
liščích schopností, obrana dočasně pozastaví dostupné schopnosti a obnovená
přijatá odpověď je viditelná.

Při review kódu byly UI chatu předány a následně v kódu ověřeny opravy
obnovy fáze bosse, stavů zásahu na začátku dalšího kola, selhání zápisu,
uzavření checkpointu před ukončením kooperace, pauzy MathBoardu a uložení
odměn před koncem animace výhry. Integrační testy těchto scénářů vlastní
UI chat v `e2e/arena/battle-dock-v3.spec.ts`.

Rozsah přejímky: ovládání a vykreslení nového panelu v uvedených stavech.
Odemykání nových stupňů rychlosti a názorné první představení nových
schopností tím nejsou schválené ani označené za dokončené. Nejde o test
na fyzickém Samsung tabletu.

Závěrečné snímky `long-names-player_turn.png` a
`long-names-player_b_turn.png` byly znovu prohlédnuté po úpravě skutečných
jmenovek a jejich místa v řadě. Dvanáct W je rozdělených na dvě vyvážené
řádky, Alexandrinka se vejde do hlavní jmenovky celá na jeden řádek.
Velikost písma zůstává 22/18, rámečky nezasahují do sousedních ovládacích
prvků. `early-target-picker.png` potvrzuje čistý výběr cíle i bezprostředně
po otevření MathBoardu. Dva finální cílené testy v
`artifacts/battle-dock-v3/final-insets-browser.log` prošly: pauza včetně návratu
z TV propojení, selhání zápisu a opakování, ukončení kooperace; dále všechny
čtyři tahy s dlouhými jmény.

Nezávislý MCP byl následně znovu načtený s posledním layoutem.
`review-mcp/final-tablet.png` a `review-mcp/final-desktop.png` potvrzují
rozvržení běžných jmen v obou velikostech bez přetečení a chybějících textur.
Tím jsou konkrétní vizuální nálezy tohoto review uzavřené. Závěrečný log
`artifacts/battle-dock-v3/final-browser.log` potvrzuje 14/14 integračních
testů včetně obou rendererů, tří cílů, solo variant, kooperace, checkpointů
a původních regresí battle HUDu. Plná typová kontrola projektu nadále není
zelená, jak je uvedeno výše. Tato přejímka nezahrnuje nasazení na hlavní server.

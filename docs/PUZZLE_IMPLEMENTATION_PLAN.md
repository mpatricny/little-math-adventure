# Implementační plán: adaptivní puzzly s náhodným výběrem

Stav: implementováno; výsledky ověření a grafický audit jsou v [PUZZLE_IMPLEMENTATION_AUDIT.md](PUZZLE_IMPLEMENTATION_AUDIT.md).
Datum: 2026-09-08. Podklad: [audit současné implementace](PUZZLE_GENERATION_AUDIT.md).

## 1. Výsledné chování a cílová pestrost

Každé nové přidělení dobrodružného puzzlu náhodně vybere zadání z vlastní rodiny.
Přípustná matematika vychází z dovedností hráče; logická náročnost také z jeho
výsledků v dané rodině. Region určuje téma a dostupné mechaniky.

Plán pokrývá oba lesní mosty, původní mapové puzzly, produkční svatyni Strážce,
lesní a podvodní zamčené truhly, kalibraci v Zyxově raketě a všechny současné
podvodní mechanismy. Bojové příklady, sběr many a zkoušky si zachovají své
procvičování početních faktů.

**Opakování je povolené. Cíl: nejvýše přibližně 5 % pravděpodobnost, že další
nově přidělené zadání bude stejné jako předchozí zadání daného typu.**
Při rovnoměrném nezávislém výběru s vracením platí `P(opakování) = 1 / N`.

| Počet skutečně odlišných vhodných zadání | Šance na bezprostřední opakování |
|---|---|
| 20 | 5 % |
| 50 | 2 % |
| 100 | 1 % |

Minimem je 20 variant **po aplikaci všech filtrů**: rodina/podvarianta, pásmo,
odemčené dovednosti, logická obtížnost, fáze, jazyk a layout. Pro generované
početní rodiny mířit na 50–100+ tam, kde to dovolují pravidla. Autorské slovní
či světelné pooly musí mít alespoň 20 vhodných variant pro každý podporovaný
profil; jedna varianta může být použitelná pro více profilů.

Pět procent není pravděpodobnost, že hráč někdy během celého hraní uvidí něco
znovu. Například u 20 stejně pravděpodobných variant a pěti různých dříve
viděných zadání je šance trefit některé z těchto pěti 25 %. Tento plán nemá
celoživotní zákaz opakování ani filtr podle minulých zadání.

### Výchozí rozhodnutí

- Každé nové zadání losovat nezávisle z aktuálně vhodných kandidátů. Varianty
  se nespotřebovávají a pool se hraním nevyčerpá.
- Pořadí tlačítek, jiný obrázek, seed ani pouhá změna distraktorů se nepočítají
  jako další skutečné zadání při měření velikosti poolu.
- Chybná odpověď, animace ani změna mastery nepřelosují rozehrané zadání.
  Opětovné otevření a návrat z boje během téže výpravy obnoví jeho instanci.
- Odměny a průchod zůstávají vlastností místa. Opakované procvičování nesmí
  znovu udělit jednorázový bonus nebo příběhový předmět.

## 2. Společné komponenty

Následující tabulka zachovává původní návrh. Ve výsledné implementaci jsou generátory a deduplikace přímo v `PuzzleCatalog.ts`, `WaterPuzzleCatalog.ts` a příslušných `Underwater*Problems.ts`; nevznikly samostatné `generators/` ani `PuzzleIdentity.ts`. Náhodný výběr je v `PuzzleRandom.ts`, adaptace výsledků a životnost instancí v `PuzzleService.ts`. Světelné konfigurace vznikají konečným generátorem v `UnderwaterLightPuzzle.ts`; slovní pool je v `puzzles/words.json`.

| Komponenta | Umístění | Odpovědnost |
|---|---|---|
| Typy | `src/types/puzzles.ts` | Rodiny, payloady, profil, instance, výsledky |
| Matematická pravidla | `src/systems/MathSkillRules.ts` | Pravidla sdílená s `ProblemDatabase`, včetně přechodu přes desítku |
| Profil a adaptace | `src/systems/puzzles/PuzzleDifficulty.ts` | Čistá funkce nad explicitními mastery daty a výsledky rodiny |
| Katalog | `src/systems/puzzles/PuzzleCatalog.ts` | Generátory, autorské pooly, validátory a podporované layouty |
| Generátory | `src/systems/puzzles/generators/` | Generování od řešení, injektovaný zdroj náhody |
| Identita obsahu | `src/systems/puzzles/PuzzleIdentity.ts` | Sloučení ekvivalentních kandidátů a měření pestrosti poolu, bez hráčské historie |
| Výběr a instance | `src/systems/puzzles/PuzzleService.ts` | Rovnoměrný výběr vhodné varianty, stabilní instance během pokusu |
| Tuning a autorské pooly | `public/assets/data/puzzles/` | Nastavení adaptace, slovní hádanky, slova a světelné konfigurace |

Scéna předá rodinu, místo/fázi, explicitní profil hráče a kapacitu layoutu.
Služba vrátí instanci nebo popsanou chybu konfigurace. Chybějící podporu
profilu nesmí maskovat původní pevné zadání.

`scenes.json` zůstává zdrojem pozic, hloubek, hostů a bezpečných obsahových oblastí.
Puzzle katalog obsahuje logická data. Existující `puzzleId` v místnostech/cestě
se mapuje na definici požadavku; zachovat stabilní světová ID.

## 3. Obtížnost a rodiny

### Odvození profilu

1. Načíst mastery správného hráče explicitně, bez závislosti na náhodném aktuálním
   stavu singletonu. Ošetřit stav, kdy jsou všechna pásma zvládnuta: zůstat na
   nejvyšších dostupných dovednostech, nespadnout na A.
2. Z číselného pásma a odemčených dílčích dovedností určit přípustné operace,
   formy a mezivýsledky. D/E zachovat ve významu aktuálního výukového systému;
   odstranit paralelní podvodní definici E do 30. Jednodušší již zvládnuté kroky
   smějí být součástí komplexního zadání.
3. Náročnost rodiny řídit odděleně: počet mezer, kroků, větví, nabídek a míra
   opory. Prostorové a slovní úlohy mají vlastní stupně, nikoli umělé matematické
   příklady vydávané za důkaz mastery.
4. Počáteční tuning: 3 logické stupně. Vyhodnocovat 6 prvních odevzdaných odpovědí
   na různá zadání rodiny; po 5 samostatných úspěších z 6 zvýšit o jeden dostupný stupeň,
   po alespoň 3 neúspěšných prvních odpovědích snížit. Po vyhodnocení sbírat nové okno.
   Nápověda není samostatný úspěch, pouhé zavření není chyba. Práh je v JSON,
   je to výchozí herní tuning k ověření, nikoli ověřené pedagogické optimum.
5. Tempo manipulace nesmí samo snižovat matematickou úroveň. První verze adaptace
   používá první odpověď a asistenci; čas ukládá pro pozdější vyhodnocení.

| Rodina | Použití | Generování / pool a pravidla |
|---|---|---|
| `sequence` | Oba mosty, mapový most | Ilustrované mosty vždy 7 pozic, 5 čísel a 2 mezery; doplnit oba kameny. Počítání do 10 je zde povoleno i začátečníkům do 5; alternativou jsou opakované dvojice/trojice. Mapový most má vlastní obecnou řadu. Doplnění musí být určitelné z viditelných čísel a uvedeného pravidla. |
| `balance` | Váhy | Vygenerovat pravdivou rovnost, skrýt operand; jediné správné číslo |
| `true_equation` | Výběr cesty | Vygenerovat jednu pravdivou a ostatní nepravdivé rovnice; pouze osvojené operace |
| `sum_selection` | Oběť, svatyně, raketa | Generovat součet a nabídku; respektovat požadovaný počet předmětů; přijímat všechny kombinace odpovídající viditelnému pravidlu |
| `word_riddle` | Lesní truhly | Ručně ověřený pool hádanek, jazyk, délka a slovní náročnost; jednoznačná odpověď |
| `word_cipher` | Podvodní truhly | Pool slov + nové početní indicie; odlišné výsledky pro jednoznačné seřazení |
| `sequential_changes` | Zvon, pumpa | Dvě podvarianty se společnými pravidly pro průběh; validovat každý mezivýsledek a použitelnost karet |
| `reverse_changes` | Podvodní zpětné počítání | Postup dopředu vytvoří cíl, hráč hledá začátek; oddělit lineární a rozdělenou fázi |
| `branching_changes` | Podvodní proudy | Společný krok a větve, validace všech větví a nabízených řešení |
| `routing` | Potrubí | Generovat starty, změny a platné přepojení; odvodit cíle; prohledáním ověřit jediné řešení |
| `light_network` | Světelná jeskyně | Začít ověřeným poolem různých topologií; parametrizovaný tracer, pouhé jiné natočení nezvyšuje kapacitu poolu |

Pro slovní pool první verze preferuje 4písmenné odpovědi v lese a 5písmenná slova
v podvodním světě, podle stávajících ovladačů. Délka musí být validační podmínka,
ne tiché oříznutí. Parafráze stejné hádanky nezvyšuje počet variant v poolu.
U šifer měnit cílová slova i početní indicie; jiná úplná sada početních indicií
může být jiným zadáním. Kontrolovat i opakovaná písmena a povolenou abecedu.

## 4. Náhodnost, kapacita a stabilita pokusu

### Náhodný výběr

1. Získat vhodné validní kandidáty a seskupit je podle skutečného obsahu.
2. Losovat rovnoměrně mezi odlišnými zadáními. U více šablon nejprve rovnoměrně
   vybraná šablona a potom její varianta může vytvořit silné zkreslení. Preferovat
   společný pool nebo vážit šablony počtem jejich unikátních kandidátů a ošetřit
   překryvy mezi nimi.
3. Až po výběru zadání náhodně promíchat nabídky a počáteční polohy ovladačů.
4. V produkci použít běžný herní zdroj náhody (například `Math.random`) přes
   injektované rozhraní. Neodvozovat seed pouze z pásma, místnosti nebo počtu
   pokusů. Pro reprodukovatelné testy předat deterministický zdroj.
5. Generování musí mít konečný limit práce. U malých prostorů enumerovat validní
   kandidáty. U větších doložit rozložení výsledků; pokud generátor opakovaně
   odmítá neplatné varianty, nesmí skončit nekonečnou smyčkou ani první pevnou
   šablonou. Použít předem validovaný vhodný pool.

Pro rovnoměrný pool stačí doložit alespoň 20 unikátních vhodných kandidátů
s pravděpodobností `1/N`. Pokud by výběr nebyl rovnoměrný, musí i nejčastější
zadání splnit `max(p_i) <= 0,05`; samotný počet kandidátů nestačí. Při stabilním
rozdělení je průměrná pravděpodobnost shody dvou nezávislých výběrů
`sum(p_i²)`. Tyto metriky platí pro nová přidělení, nikoli obnovení téhož pokusu.

Kapacitní report musí uvádět rodinu/podvariantu × profil × fázi × layout,
počet validních obsahově odlišných kandidátů a rozložení výběru. Nejprve ověřit
malé domény A, omezený počet kamenů, délky slov a společný profil kooperace.
Při méně než 20 možnostech rozšířit kompatibilní šablony nebo layout při stejné
obtížnosti. Nesplněnou kapacitu označit v reportu; nepovažovat ji za splněný 5%
cíl. Takové místo musí být před dokončením dopracováno, ne obejito automatickým
odemčením nebo obtížnější matematikou.

U výběru do součtu identita zahrnuje násobnosti, počet výběrů a platné kombinace;
nabídka měnící řešitelnost je významová změna. U světla sloučit do jedné skupiny
čistě otočené či přeznačené kopie. Není potřeba ukládat tyto identity k hráči.

### Stabilita a minimální stav

- Po vylosování držet úplný payload instance a její výběry, fázi, asistenci a
  první odpověď. Scénový redraw, chybné řešení ani změna pásma ji nepřegenerují.
- V lese uchovat instanci ve stavu aktuální výpravy podle místnosti/objektu;
  vyřešený most po boji obnoví stejná čísla a kameny. Nová výprava může losovat
  znovu. Současný `JourneySystem` je v paměti: tento plán nepřidává obecné
  checkpointy výprav ani příslib jejich obnovení po úplném reloadu aplikace.
- V podvodním světě využít existující ukládaný postup. Přidat pouze aktuální
  rozpracované instance a omezené výsledky potřebné pro adaptaci, aby uložená
  fáze odpovídala konkrétnímu zadání. Obnova používá payload, ne samotný seed.
- Volitelné výsledky rodin a rozpracovaný stav kompatibilně inicializovat při
  načítání starých savů. Export/import přenese tato data; preview/testMode
  zůstává izolovaný od produkčních slotů.
- Společný puzzle má jednu instanci a profil vhodný pro oba hráče. Individuální
  tah (například zvon) používá profil řešitele. Správnost, čas a asistenci
  nepřipisovat automaticky druhému hráči jako jeho samostatný výukový výkon.
- Zachovat stávající kontroly jednorázových odměn a odemčení. Dvojitý callback,
  návrat do scény ani nová procvičovací varianta nesmějí udělit bonus podruhé.

Není potřeba trvalá historie zobrazených zadání, její migrace, rezervace variant,
atomické přidělování do dvou slotů ani zvláštní chování při vyčerpání. Nezávislý
náhodný výběr může opakovat i bezprostředně; nic jej podle minulosti neblokuje.

## 5. Etapy implementace

Každá etapa tvoří samostatný přezkoumatelný celek. Přepnutá scéna má vždy jedinou
produkční cestu k zadání; po přepnutí odstranit její pevný fallback.

| Etapa | Změny | Závislost | Podmínka dokončení |
|---|---|---|---|
| P0 — Kontrakty a kapacity | Rodiny, obsahové identity, layouty, kapacitní prototyp a profily | Audit | Každé místo má ověřenou cestu k alespoň 20 vhodným variantám |
| P1 — Náhodný výběr a instance | `PuzzleService`, rovnoměrný sampler, stav pokusu, adaptace, coop a preview | P0 | Ověřené rozložení výběru; rozehraná instance se nemění během pokusu |
| P2 — Matematika a generátory | Sdílená pravidla, adaptace, sequence/balance/true_equation/sum_selection | P0–P1 | Generátory pro podporované profily jsou řešitelné, v rozsahu a mají změřenou kapacitu |
| P3 — Les a raketa | Mosty, `ForestPuzzleScene`, produkční Strážce, Zyxův stroj | P2 | Všechny vstupní cesty používají službu; návrat z boje i jednorázové odměny fungují |
| P4 — Truhly | Slovní pool, šifry, oba lesní overlaye a podvodní truhly | P1–P2 | Dostatečné pooly a nové indicie, validní délky, abeceda a diakritika |
| P5 — Podvodní početní mechanismy | Zvon, pumpa, zpětné úlohy, proudy, potrubí | P1–P2 | Generované fáze, správné mastery řešitele, perzistence a průchod celou kapitolou |
| P6 — Světlo | Pool topologií, parametrizovaný tracer a renderer, prostorová náročnost | P0–P1 | Každá konfigurace ověřena řešičem i vizuálně; funguje nápověda |
| P7 — Společné ověření | Integrační průchody, UI, kapacita, úklid dat a dokumentace | P3–P6 | Splněna celá akceptační matice níže |

Po P1 lze souběžně připravovat slovní/světelné pooly a početní generátory.
Integraci do `UnderwaterRoomScene` provádět koordinovaně; P4/P5/P6 sdílejí stejný
soubor a stav instance. Jeden pracovní proud vlastní výběr, druhý generátory,
další jednotlivé scénové adaptéry po stabilizaci kontraktů.

### Konkrétní integrační úpravy

- `ForestRiddleScene`: nahradit `PUZZLE_CONFIGS` instancí, odvozovat z ní hodnoty
  kamenů, mezery a distractory. Pro nejnižší pásma přidat kratší aktivní řadu se
  samostatným layoutem v `scenes.json`; zbytek mostu zůstane průchozí dekorací.
- `ForestPuzzleScene`: převést lokální losování tří šablon na společnou službu;
  konfigurace místa si ponechá odměny, čas a pravidla, payload dodá služba.
- `GuardianLairMockScene`: změnit sdílenou produkční implementaci, nikoli pouze
  preview; odstranit závislost na `templates[0]` a `DEFAULT_RITUAL` pro obsah.
- `ZyxCrystalMachineScene`: nahradit `NUMBER_OPTIONS` a `TARGET_SUM`, identifikovat
  výběry ID předmětů místo hodnoty, pokud rodina povolí dvě stejné hodnoty.
- Truhly: předávat uloženou instanci; obsah otáčecích koleček a pořadí indicií
  obnovovat společně s řešením. Zachovat jednorázové otevření truhly.
- Podvodní generátory: vstupy rozšířit o instanci/profil/zdroj náhody; existující
  evaluátory znovu využít po odstranění vazeb na pevné konfigurace. Hints musí
  pracovat s konkrétním payloadem, ne s původní skrytou odpovědí.
  Znovuotevření již dokončeného mechanismu pro procvičování požádá o nové zadání;
  znovuotevření rozehraného obnoví původní. Dokončený mechanismus neodměňuje znovu.
- `UnderwaterLightPuzzle` v `systems` i `ui`: vstupem budou zdroj, cíl, lampy,
  počáteční směr, rozměry mřížky, zrcadla a jejich dovolené orientace. Nápověda
  nesmí předpokládat právě čtyři zrcadla a 256 stavů. Umístění na mřížce se vykreslí
  uvnitř scény definovaného hostu; dekorativní rám se nedeformuje.
- Data a dokumentace: odstranit aktivní číselné šablony nahrazené generátory;
  ponechat místo nich pravidla/odkazy. Ověřit mapování ID i starší mapovou cestu.

## 6. Ověření a akceptace

Před každým testováním prověřit potřebu migrací. Volitelný stav pokusu a výsledky
pro adaptaci vyžadují kompatibilní inicializaci; historie opakování se nemigruje.
Serverová DB migrace se podle současného kódu neplánuje. Staré savy jsou testovací
vstup, ne ručně přepsaná data uživatele.

| Oblast | Povinné ověření |
|---|---|
| Pestrost | Alespoň 20 skutečných variant po všech filtrech, bez nafukování počtu seedy, pořadím a kosmetikou |
| Náhodnost | Deterministicky ověřit rovnoměrné mapování RNG na kandidáty, váhy šablon a překryvy; frekvenční report jako doplňková kontrola |
| Generátory | Enumerace malých prostorů a alespoň 1 000 seedů na podporovaný profil u větších; řešitelnost ověřená nezávislým řešičem, ne jen vrácenou odpovědí |
| Matematika | Všechny dosažitelné kroky určené pravidly zadání, platná cílová řešení a jejich mezivýsledky; počty správných možností a žádné nepodporované násobení |
| Adaptace | Začátečník, pokročilý, vše zvládnuto, změna mastery, série chyb a asistence, stabilita rozehrané instance |
| Stav pokusu | Zavření/otevření, návrat z boje, nová výprava, uložené podvodní fáze, export/import, starý save, zachování payloadu po změně generátoru |
| Kooperace | Různá pásma, společný puzzle, individuální řešitel vs. divák, přepnutí A/B, odchod hráče |
| Chybný pool | Prázdný či příliš malý vhodný pool, duplicity, nevalidní kandidáti; bez nekonečné smyčky nebo náhrady těžším příkladem |
| Odměny | Dvojitý callback, reload po odpovědi a před přechodem; bonusy i příběhové předměty pouze podle původních pravidel |
| Obraz | Desktop 1280×720 a tablet 1024×768, Canvas i WebGL, krajní hodnoty a nejdelší podporované lokalizace |

Rozšířit stávající Vitest testy podvodních evaluátorů a savů, přidat testy
`src/systems/puzzles/__tests__/`. Přidat cílené Playwright průchody lesa/rakety/truhel
do `e2e/puzzles/` a rozšířit existující `e2e/underwater/`. Očekávání odvozovat
z pravidel a načtené instance, ne přepsat testy na jinou pevnou řadu.

Vizuální kontrola musí skutečně posoudit snímky: normální, hover, pressed,
pointer-out, disabled, vybrané/správné, chybné, asistované a dokončené stavy.
Ověřit bezpečné oblasti, poměr stran bitmap, hit areas a text `resolution: 2`
nastavený v konstruktoru. Dodržet `docs/ASSET_CREATION.md`, `UnderwaterTheme`
a existující styl; nové obrázkové assety nejsou podmínkou tohoto plánu.

Statistické testy nesmějí vyžadovat, aby malý vzorek měl přesně 5 % opakování
nebo žádná opakování. Hlavní důkaz je konstrukce sampleru a kapacita poolu;
report frekvencí používá pevné testovací seedy a přiměřenou statistickou toleranci.

Výstupem P7 je report výsledků testů, kapacit a rozložení výběru plus seznam
prohlédnutých snímků s případnými limity. Samotný build či počet nasnímaných screenshotů nestačí.
Po cílených kontrolách spustit produkční build a relevantní regresní sady;
opakovat je až při dalších změnách nebo novém zjištění.

## 7. Hotovo znamená

- Všechna místa uvedená v auditu získávají obsah přes společnou službu.
- Zadání odpovídá podporovaným dovednostem i kapacitě UI.
- Každý podporovaný kontext má alespoň 20 obsahově odlišných vhodných zadání;
  rovnoměrný výběr dává nejvýše 5% šanci bezprostředního opakování.
- Produkční výběr není pevný ani deterministicky cyklický podle pásma či scény.
- Rozehraná instance zůstává během pokusu a podporovaných návratů stabilní.
- Kooperace, staré savy, preview a jednorázové odměny mají ověřené chování.
- Funkční, kapacitní i vizuální akceptace mají doložené výsledky.

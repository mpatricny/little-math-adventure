# Adaptivní puzzly: implementace a audit UI

Datum: 8. 9. 2026. Navazuje na [plán](PUZZLE_IMPLEMENTATION_PLAN.md) a [vstupní audit](PUZZLE_GENERATION_AUDIT.md).

## Výsledek

Produkční dobrodružné puzzly používají společný profil dovedností, generované katalogy nebo slovní pool. Každé nové zadání se losuje nezávisle a rovnoměrně z vhodných variant. Nejmenší ověřený pool má 21 významově odlišných zadání: nejvyšší pravděpodobnost bezprostřední shody je 4,76 %. Neexistuje historie blokující opakování. Zavření a opětovné otevření rozehraného puzzlu obnovuje tentýž pokus a jeho ovladače.

Grafická kvalita není všude stejná. Podvodní puzzly mají použitelný společný vizuální styl; lesní minihry a písmenové zámky potřebují další výtvarnou práci. Níže jsou konkrétní nálezy, nikoli obecné schválení všeho UI.

### Oprava po herním ověření: oba kamenné mosty

Uživatel upřesnil závaznou podmínku: na všech pěti pevných kamenech musí být čísla a hráč musí doplnit **oba** chybějící kameny. Původní zkracování řady na jednu mezeru kvůli rozsahu do 5 porušilo smysl obrázku i puzzlu; nebylo správným kompromisem. Podmínka i povinnost zeptat se před podobným oslabením herního pravidla jsou nyní výslovně v `AGENTS.md`.

Oba mosty používají samostatný katalog se **sedmi pozicemi**, pevnými indexy 0/2/3/4/6 a mezerami 1/5. Nabízí vzestupné početní řady a opakování dvojic/trojic. Uživatel výslovně povolil početní řady do 10 i hráči, který zatím počítá do 5; tato výjimka platí pouze pro ilustrované mosty. Příklady pro začátečníka: `4, ?, 6, 7, 8, ?, 10`, `1, ?, 3, 1, 2, ?, 1` a `1, ?, 1, 2, 1, ?, 1`. Každá chybějící hodnota opakovaného vzoru je rozpoznatelná z viditelných kamenů. Stejné dvě odpovědi znamenají dva samostatné kameny v nabídce.

Pool má podle profilu **30–276 různých úplných řad**, začátečník 30 (okamžitá shoda nanejvýš **3,33 %**). Náhodnost neovlivňuje počet kamenů ani mezer. Payload `layoutVersion: 2` nahrazuje starou zkrácenou instanci i její jednopolový stav. Návrat do místnosti zachovává nové zadání, částečné vyplnění i hotový most bez další odměny. Dva kameny se stejnou hodnotou se po návratu správně rozdělí do obou mezer. Zamítnutý pokus ihned vyčistí uložené umístění.

Ověření: **369 jednotkových testů ve 48 souborech a produkční build prošly**. Testy katalogu ověřují všech 30 profilů; cílené testy také úplnost všech pěti popisků, obě mezery, dostatečný počet fyzických odpovědí a určitelnost doplnění. Dva scénáře `e2e/puzzles/puzzle-bridge.spec.ts` prošly i po finální úpravě instrukce: desktop WebGL / tablet Canvas, oba mosty, stará instance, dva stejné kameny, řada do 10, první kámen bez odemčení, chyba, oprava a návrat bez další many. Stávající širší UI test používá nově společný helper doplňující obě mezery. `tsc --noEmit` oproti předchozímu stavu nemá nové diagnostiky; zůstávají dříve zaznamenané chyby pracovního stromu. Logy jsou v `tmp/bridge-two-stones-fix/`.

Vizuální kontrola odhalila také delší instrukci zakrytou ukazatelem many. Její host je nyní pod HUDem a text má tmavý obrys. Očíslováno je všech pět pevných kamenů i celá nabídka; po vyřešení všech sedm pozic. Příklady: [opakující se dvojice](../artifacts/puzzles/bridge-two-desktop-webgl-normal.png), [jeden kámen nestačí](../artifacts/puzzles/bridge-two-desktop-webgl-one-filled.png), [dva stejné kameny po návratu](../artifacts/puzzles/bridge-two-desktop-webgl-return.png), [řada do 10 na tabletu](../artifacts/puzzles/bridge-two-tablet-canvas-normal.png), [tablet po doplnění](../artifacts/puzzles/bridge-two-tablet-canvas-return.png). Opakovaná trojice byla navíc vyřešena skutečným přetažením přes Playwright MCP v izolovaném preview bez zápisu hráčských slotů.

### Oprava po herním ověření: Požehnání perly

Uživatel správně odhalil zásadní chybu původního světelného generátoru: stačil průchod dvěma ze čtyř zrcadel a nevyřešený počáteční stav. Zbylá zrcadla mohla být mimo použitelnou trasu a některé starty vyžadovaly jen jednu změnu. Původní testy řešitelnosti a rozměrů to neodhalily; dřívější schválení tohoto puzzlu bylo nedostatečné.

Generátor nyní nejprve sestaví souvislou trasu se čtyřmi odrazy. Všechna čtyři zrcadla leží na jejích zatáčkách, trasa se nekříží a malé perly jsou na dvou různých úsecích za prvním zrcadlem. Pool obsahuje **48 významově odlišných rozložení** po odstranění kopií vzniklých pouhým změněním rozestupů nebo svislým zrcadlením. Rovnocenné varianty využívají větší část hrací plochy. Každé rozložení má jediné řešení i při povolení všech čtyř natočení; odstranění libovolného zrcadla jeho řešení zničí.

Stupně 1/2/3 vyžadují na začátku změnit **2/3/4 různá zrcadla** a nabízejí 2/3/4 natočení. Jediná změna tedy nové zadání nevyřeší. Rozložení i přípustné počáteční konfigurace se losují rovnoměrně; okamžitá shoda rozložení má pravděpodobnost **1/48 ≈ 2,08 %**. Tato změna nepřidává historii neopakování.

Payload světla má `layoutVersion: 2`. Při dalším otevření se starší uložené zadání vymění současně s jeho zastaralými natočeními a stavem nápovědy. Nové zadání se pak standardně zachová i přes úplný reload. Ostatní puzzly, výsledky hráče a již získané požehnání zůstávají zachované; odměna se neudělí znovu. Databázová migrace není potřeba.

Ověření opravy: **352 testů ve 47 souborech a produkční build prošly**. Po závěrečném rozšíření rozestupů znovu prošlo všech šest cílených optických testů a dva nové prohlížečové scénáře v `e2e/puzzles/puzzle-light.spec.ts`. Kontroly pokrývají všech 48 × 256 konfigurací, nutnost každého zrcadla, nápovědy, obtížnost, 1 500 náhodných startů, nepřekrývání, opravu starého savu, skutečné kliky, zamítnutí pokusu po jediné opravě, reload a neopakování odměny. Samostatný Playwright MCP průchod v izolovaném preview vyřešil i trasu vracející paprsek doleva; kontrola rozměrů prošla a nevznikl žádný uložený slot. Logy: `tmp/light-route-fix/`.

Ruční vizuální kontrola finálních snímků zahrnula normální stav, hover, stisk, odjezd ukazatele, chybný pokus, dokončení a zablokované ovladače na **1280×720 WebGL** i **1024×768 Canvas**. Paprsek navazuje na všechna čtyři zrcadla, obě malé perly svítí na trase a text nezasahuje do ovládání. Příklady: [desktop před řešením](../artifacts/puzzles/light-route-desktop-webgl-normal.png), [jediná oprava nestačí](../artifacts/puzzles/light-route-desktop-webgl-one-mirror-still-wrong.png), [desktop vyřešený](../artifacts/puzzles/light-route-desktop-webgl-solved.png), [tablet vyřešený](../artifacts/puzzles/light-route-tablet-canvas-solved.png), [zpětně vedená trasa](../artifacts/puzzles/light-route-mcp-winding-solved.png). Zbývající drobný nález P3: stisk samotného zrcadla zatím nemá vlastní vizuální odezvu odlišnou od hoveru.

`tsc --noEmit` dál hlásí existující chyby pracovního stromu. Oproti předchozímu výpisu nevznikla diagnostika v upraveném puzzle kódu; souběžně přibyl nesouvisející test `ManaCollectionPopupLayout.test.ts` s chybou přetypování. Tato oprava neřešila dříve zaznamenaný navigační problém kanálu popsaný níže.

## Pokrytí a zdroje zadání

| Místo / obrazovka | Nový zdroj |
|---|---|
| Oba lesní mosty v `ForestRiddleScene` | `bridgePuzzle`: vždy 7 pozic, 5 očíslovaných kamenů a 2 mezery; početní nebo opakující se řada |
| Mapový číselný most | `sequencePuzzle`: proměnlivá délka, krok a chybějící členy |
| Lesní váhy | `balancePuzzle`: dvě rovné hodnoty, skrytý operand |
| Lesní výběr cesty | `truthPuzzle`: jedna pravdivá a dvě nepravdivé rovnice |
| Krystalová oběť, svatyně Strážce, Zyxova kalibrace | `sumPuzzle`: vybrat právě tři ze šesti předmětů; přijímá všechny správné kombinace |
| `SpinLockPuzzleScene` i `LetterLockPuzzleScene` | 25 českých hádanek se čtyřpísmennou odpovědí, promíchané možnosti koleček |
| Podvodní truhly včetně poštovní varianty | 25 pětipísmenných slov + nové početní indicie s pěti různými výsledky |
| Zvon | Dva platné kroky, čtyři promíchané karty |
| Proudy | Dvě větve se společným prvním krokem, šest karet |
| Pumpa | Tři kroky, odvozené mezivýsledky a možnosti ventilů |
| Zpětné počítání | Lineární i rozdělená fáze, ověřený začátek proudu |
| Potrubí | Proměnlivé zdroje a změny; úplné ověření všech osmi konfigurací přepínačů |
| Světelná jeskyně | 48 tras přes všechna čtyři zrcadla, jediné řešení, 2–4 nutné změny podle stupně |

Sběr many, bojové příklady a jiné procvičování jednotlivých početních faktů zůstávají u svého výukového systému. Scénář, odměny a světové identifikátory míst nejsou součástí náhodného zadání.

### Jak se mění obtížnost

- Číselná pásma sdílejí pravidla s `ProblemDatabase`: A do 5, B do 8, C do 10, D do 20 bez přechodu přes desítku, E do 20 s přechodem. Odčítání se nabízí až s odemčenými dílčími dovednostmi. Stav „všechna pásma zvládnuta“ zůstává na E.
- Každá rodina má vlastní stupeň 1–3. Okno šesti prvních odpovědí zvýší stupeň při alespoň pěti samostatných správných odpovědích, sníží při alespoň třech chybách. Potom začne nové okno. Nápověda se nepovažuje za samostatný úspěch a pouhé zavření není chyba.
- Oprava téhož zadání může dokončit světový úkol, ale nepřidává další výukový úspěch. Čas se ukládá, rychlost manipulace obtížnost nesnižuje.
- Stupeň ovlivňuje zejména délky řad a počet mezer, velikost změn, počet možností písmen, dostupná natočení zrcadel a počet nutných změn ve světelném puzzlu. Některé rodiny mají pevnou vizuální strukturu (např. šest krystalů a tři volby); tam se matematika přizpůsobuje hlavně pásmem. Slovní zásoba zatím nemá samostatnou diagnostiku čtenářské úrovně.
- Společné co-op zadání používá průnik dovedností a nižší stupeň obou hráčů. Individuální zvon používá profil právě řešícího hráče. Výsledky se nepřipisují automaticky spoluhráči ani se nevydávají za zvládnutý jednotlivý matematický fakt.

### Kde systém rozšiřovat

`src/types/puzzles.ts` definuje profil, rodiny a serializovatelnou instanci. `PuzzleDifficulty.ts` obsahuje pravidla vhodnosti, `PuzzleService.ts` životnost instancí a adaptaci, `PuzzleRandom.ts` rovnoměrný výběr. Generátory a deduplikace jsou v `PuzzleCatalog.ts`, `WaterPuzzleCatalog.ts` a příslušných `Underwater*Problems.ts`. Prostorové zadání řeší systémový `UnderwaterLightPuzzle.ts`.

Tuning je v `public/assets/data/puzzles/tuning.json`, slovní obsah v `puzzles/words.json`. Nová rodina potřebuje generátor/pool, ověření řešení a kapacity, renderer a napojení prvního pokusu. Do katalogu nepatří pozice HUDu; hosty zůstávají v `scenes.json` a čtou se přes `SceneBuilder`.

Nepoužívané pevné početní šablony byly odstraněny z `forest-puzzles.json` a `underwater-puzzles.json`, stejně jako pevná slova v podvodních místnostech. Lesní katalog ponechává pravidla místa a odměny; podvodní konfigurace pouze cenu a prodlevu nápovědy. Staré světelné rozložení zůstává jako explicitně označená regresní testovací fixture; produkční UI vyžaduje předané vygenerované zadání.

## Pestrost a náhodnost

Kapacita byla ověřena pro 30 profilů: A–E × odčítání zamčené/odemčené × stupeň 1–3. [Strojový report](../artifacts/puzzles/capacity.json) obsahuje jednotlivé profily. Tabulka uvádí minimum a maximum napříč nimi.

| Pool / podvarianta | Počet odlišných zadání | Nejvyšší šance okamžité shody |
|---|---:|---:|
| Most s pevným obrázkem | 30–276 | 3,33 % |
| Obecná řada | 29–1 824 | 3,45 % |
| Váhy | 91–10 164 | 1,10 % |
| Výběr pravdivé rovnice | 21–462 | 4,76 % |
| Součet tří ze šesti | 23–1 174 | 4,35 % |
| Dva lineární kroky / zpětná lineární fáze | 30–1 970 | 3,33 % |
| Tři kroky pumpy | 75–19 910 | 1,33 % |
| Zvon | 23–965 | 4,35 % |
| Rozdělená zpětná fáze | 70–8 820 | 1,43 % |
| Proudy | 74–14 560 | 1,35 % |
| Potrubí | 80–1 680 | 1,25 % |
| Světlo | 48 | 2,08 % |
| Lesní hádanky | 25 | 4,00 % |
| Slova podvodní šifry | 25 + další variabilita indicií | ≤4,00 % |

Pořadí tlačítek, počáteční natočení ani samotná změna nesprávných možností nenavyšují vykazovanou kapacitu. U součtů se porovnávají skutečné platné kombinace hodnot; u světla se normalizuje rozestup i zrcadlené kopie. Větší prostory proudů a potrubí mají konečný předem validovaný výběr kandidátů, runtime losuje rovnoměrně z výsledného poolu. Nedostatečný pool skončí popsanou chybou, nikoli pevným náhradním zadáním.

Používá se `Math.random` přes injektovatelnou funkci, promíchávání Fisher–Yates. Test se 100 000 losováními ověřuje rozložení a přibližně 5% četnost sousedních shod u poolu velikosti 20. To není 5% šance na jakékoli opakování během celého života hráče; ta s počtem odehraných zadání roste.

## Ukládání a návaznost na hru

Volitelné `player.puzzleProgress` ukládá úplný payload, interakční stav, první odpověď, asistenci a omezené výsledkové okno. Staré savy tato data dostanou při prvním použití. Export/import je přenáší. Nejsou potřeba databázové migrace; ukládání hry je v localStorage.

Podvodní ovladače ukládají i dílčí změny, které mohou spotřebovat událost ukazatele. Pozorování stavu používá proxy pouze na straně UI; samotný save zůstává obyčejný serializovatelný objekt kompatibilní se `structuredClone`. Úplný reload obnoví stejné zadání i nastavení ventilů. Co-op zachovává vlastní výsledky každého hráče.

Lesní instance žijí ve stávající paměťové výpravě `JourneySystem`. Návrat do místnosti zachovává zadání a vyřešený most. Nová výprava losuje znovu. Tato změna nepřidává obecný checkpoint celé lesní výpravy po úplném reloadu aplikace. Zyxova rozpracovaná kalibrace se ukládá do hráčova stavu.

Jednorázové odměny nadále hlídají světová ID. Procvičení obnoveného podvodního mechanismu může dát jiné zadání, ale nemá znovu udělit jeho původní odměnu. Preview a testovací režimy jsou izolované od skutečných uložených slotů.

## Původní ověření přestavby před opravou světla

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

- `npm test -- --maxWorkers=2 --testTimeout=30000`: **46 souborů, 347 testů prošlo**. Zahrnuje kapacitu všech profilů, 10 000 generovaných průchodů, správnost a přípustnost mezivýsledků, řešitelnost potrubí, světlo/nápovědy, adaptaci, první chybu, staré savy, export/import a serializaci interakcí.
- Matice UI v `e2e/puzzles/puzzle-ui.spec.ts`: **4 průchody prošly**, pásma A/E, desktop 1280×720 a tablet 1024×768, skutečný WebGL i vynucený Canvas. Skutečné kliky a drag-and-drop řeší most, čtyři lesní minihry, svatyni, raketu, oba zámky a sedm podvodních povrchů. U podvodních puzzlů také chyba, oprava a zavření/obnovení.
- Další test ověřil **Prastarý most**, umístění instrukce svatyně pod HUD a všech 25 textů v písmenovém zámku; prošel. Snímky nejdelšího textu a konečného umístění jsou uvedeny níže.
- `puzzle-persistence.spec.ts`: **3 průchody prošly**. Smíšený co-op E/A a připsání výsledku pouze řešiteli; přesná obnova rozehrané pumpy po úplném reloadu; nové procvičovací zadání bez opakované odměny a vyřešení generované poštovní šifry. [Poštovní varianta](../artifacts/puzzles/final-postal-chest-normal.png).
- V běžícím prohlížeči prošla kontrola rozměrů tehdejších **80 světelných rozložení bez chyby**. Tato kontrola neověřovala nutnost všech zrcadel ani minimální počet změn; katalog byl později nahrazen opravou popsanou nahoře.
- `npm run build`: **prošel**. Zůstává existující upozornění Vite na velikost společného JS balíku.
- `tsc --noEmit` není v tomto pracovním stromu zelený již před změnou. Po normalizaci čísel řádků nevznikla nová diagnostika v puzzle kódu; během souběžné práce přibyla nesouvisející chybějící deklarace `node:fs` v `UnderwaterCreatureAnimations.test.ts`. Původní a konečný výpis jsou v `tmp/puzzle-implementation/tsc-{before,final}.txt`.

Dalších **5 testů prošlo**: světlo a jeho ovladače na desktopu i Canvas tabletu, skutečná prodleva a platba nápovědy, účtování hráči B v co-opu, pumpa a její stavy tlačítka. Ručně prohlédnuty také [stisk](../artifacts/underwater/finale-false-light-run-pressed.png), [návrat ukazatele mimo tlačítko](../artifacts/underwater/finale-true-light-run-out.png), [zamčená nápověda](../artifacts/underwater/interaction-hint-locked.png) a [placená nápověda](../artifacts/underwater/interaction-hint-used.png).

### Otevřený nález z širšího průchodu

**P1: návrat z kanálu k vraku může nereagovat.** V `underwater-branches.spec.ts`, scénář `sp_reed_garden first`, prošel skutečný boj, vygenerovaný proud, oprava s nápovědou, uložení a následný vstup do vraku a kanálu. Klik na již odemčený pravý průchod v kanálu poté neprovedl návrat. Timeout se opakoval i s čekáním na konec odkrývání a dalším 500ms odstupem. Uložený stav měl `garden-current` v `restoredMechanisms` a `sp_sunken_canal:garden` v `revealedPassages`; modal i příznaky přesunu/odkrývání byly vypnuté. Mechanismus evidoval dva pokusy a jednu asistenci, jak měl.

Samostatné otevření stejného odemčeného kanálu a klik na průchod v izolovaném prohlížeči prošly. Problém tedy vyžaduje sled návštěv; přesná příčina nebyla určena. Navigační logika nebyla touto přestavbou měněna. Tento širší test **neprošel** a celou podvodní cestu proto nepovažuji za bezchybnou. Reprodukce a stav jsou v `tmp/puzzle-implementation/branch-final.txt`, [snímek selhání](../artifacts/puzzles/known-navigation-failure.png). Doporučený další zásah: ověřit lifecycle vstupů a klikacích oblastí při opakovaném restartu `UnderwaterRoomScene`.

Souhrn ověření změny: **347 jednotkových testů, 13 dokončených prohlížečových scénářů a produkční build prošly; jeden širší navigační scénář zůstává nevyřešený.** Nejde o tvrzení, že jsou všechny testy celého pracovního stromu zelené.

## Vizuální audit

Byly skutečně prohlédnuty normální stavy všech výše uvedených typů na desktopu a tabletu a reprezentativní chybové, vybrané a dokončené stavy. Snímky nejsou jen výstupem automatické kontroly. Veškeré vygenerované varianty nebyly ručně proklikány; početní správnost a obecné rozměrové podmínky kontrolují testy. Ukázky níže odkazují na konkrétně prohlédnuté snímky.

### Opravené při implementaci

| Nález | Změna / důkaz |
|---|---|
| Raketa potřebovala šest nezávislých nabídek a správnou práci se stejnými hodnotami | Šest hostů a rozlišení předmětů podle indexu; menší karty, ostrý text se správným rozlišením. [Tablet po kalibraci](../artifacts/puzzles/A-webgl-1024-rocket-correct.png) |
| Nové světelné topologie mohly zasahovat do spodních akcí a feedbacku | Vymezená hrací oblast, menší zrcadla, samostatný řádek feedbacku. [Tablet po vyřešení](../artifacts/puzzles/E-canvas-1024-lightPuzzle-correct.png) |
| U šifry nápověda/její cena zasahovala do pravé indicie | Oba hosty přesunuty do patičky. [Desktop](../artifacts/puzzles/final-word-hint-desktop.png), [tablet](../artifacts/puzzles/final-word-hint-tablet.png); aktuální snímky prohlédnuty a kontrola rozměrů prošla. |
| Zvon potřeboval čtyři dobře rozmístěné karty | Čtyři hosty, odstraněné nepoužívané dvě pozice. [Zvon na tabletu](../artifacts/puzzles/E-canvas-1024-bellPuzzle-normal.png) |
| Most měl prázdné kameny, jedinou mezeru a instrukci pod HUDem | Pevná struktura 5 očíslovaných kamenů + 2 mezery, pravidlo pod HUDem. [Lesní most](../artifacts/puzzles/bridge-two-desktop-webgl-normal.png) |
| Změna „o nulu“ se mohla zobrazit jako −0 | Jednotné +0 ve zvonu a proudech |
| Instrukce svatyně zasahovala pod HUD | Host přesunut z y=72 na y=126, text má korektní konstruktorové rozlišení. [Desktop](../artifacts/puzzles/final-guardian-desktop.png), [tablet](../artifacts/puzzles/final-guardian-tablet.png); kontrola umístění pod HUD prošla. |

Další textová kontrola: [nejdelší hádanka na desktopu](../artifacts/puzzles/final-long-riddle-desktop.png) a [na tabletu](../artifacts/puzzles/final-long-riddle-tablet.png). Text se vejde, ale malý panel a nízký kontrast zůstávají výtvarným problémem.

### Zbývající grafické slabiny

| Priorita | Obrazovka | Zjištění a doporučení |
|---|---|---|
| P2 | Svatyně Strážce | Krystaly jsou malé dotykové cíle; šestý je pod řadou a působí jinak než ostatní. Zvětšit celou šestici, sjednotit rozložení a oddělit nabídku od tří slotů oltáře. |
| P2 | `SpinLockPuzzleScene` | Malý panel a tmavé písmo na tmavém dřevě, zejména na tabletu; navíc dva vizuální symboly zavření. Zvětšit obsah při zachování poměru stran a zvýšit kontrast. [Důkaz](../artifacts/puzzles/E-canvas-1024-SpinLockPuzzleScene-normal.png) |
| P2 | `LetterLockPuzzleScene` | Prototypový plochý panel, emoji a geometrické šipky se rozcházejí se stylem hry. Převést na společný rám a hosty editoru. [Důkaz](../artifacts/puzzles/E-canvas-1024-LetterLockPuzzleScene-normal.png) |
| P2 | Čtyři mapové lesní minihry | Ploché kameny, váhy a tlačítka; zelené instrukce mají slabší kontrast na členitém lese. Sjednotit rámování, typografii a samostatnou plochu pro zadání. [Váhy](../artifacts/puzzles/E-canvas-1024-balance_scale-normal.png), [cesty](../artifacts/puzzles/E-canvas-1024-path_choice-normal.png), [oběť](../artifacts/puzzles/E-canvas-1024-crystal_offering-normal.png) |
| P3 | Raketa | Nové číselné karty a držák krystalu jsou jednodušší než detailní obraz stroje. Při dalším výtvarném průchodu sjednotit materiály a okraje. [Důkaz](../artifacts/puzzles/A-webgl-1024-rocket-correct.png) |
| P3 | Podvodní mechanismy | Zvon, pumpa a proudy používají prosté kruhové akce, šifra a světlo zdobené tlačítko; sjednotit rodinu ovladačů. [Proudy](../artifacts/puzzles/E-canvas-1024-currentPuzzle-normal.png), [potrubí](../artifacts/puzzles/E-canvas-1024-routingPuzzle-normal.png) |
| P3 | Pumpa | Chybu sděluje zejména barevná řada mezivýsledků; pomohlo by lokální označení místa rozporu. [Chybný pokus](../artifacts/puzzles/E-canvas-1024-pumpPuzzle-wrong.png) |

Jde o audit existujícího stylu a nutných úprav pro variabilní obsah, nikoli kompletní redesign. Početní profil je odvozený z aktuální hry; prahy adaptace jsou výchozí tuning a je vhodné je dále ověřit při hraní s dětmi.

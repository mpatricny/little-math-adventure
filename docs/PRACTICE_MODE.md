# Trénovat / Dál: runtime a rozhraní UI

**Aktualizace 22. 11.** V cechu dítě klepne u Zyxe na Trénovat nebo Dál a tím
uloží výchozí režim pro svůj profil. Před bojem lze režim jednorázově změnit.
V co-op má každé dítě vlastní řádek a společné „Do boje“ zahájí souboj.
Konkrétní tréninkový modul si dítě může vybrat v katakombách.

Ověření předchozí integrace z 21. 11.: 51 testů výběru, zásobníku a limitů 0/1; 7 průchodů
předbojového UI a cílené opakování po výměně ikony. Canvas i WebGL,
samostatný hráč i co-op, tabletové rozměry, skrytá slova, dokončení a přerušení
úvodu, uložený i neplatný cíl. Prohlédnuté snímky a přehled jsou v
`artifacts/practice-choice-review/`, finální MCP obraz je
`mcp-choices-final.png`. Nové soubory nemají TypeScript diagnostiky;
celkový `tsc --noEmit` stále hlásí 134 dřívějších chyb projektu.
Žádná databázová migrace není potřeba. Fyzický Android nebyl připojený.

## Chování

Volba patří jednomu dítěti. `progress` pokračuje v dosavadním výběru příkladů;
`practice` procvičuje vybranou odemčenou dovednost i po mistrovství. Výběr může
obsahovat starší pásmo, ale respektuje původní umístění hráče, odložená pásma
a postup úvodní kapitoly porovnávání. Zamčenou dovednost nelze zvolit.
Automatická volba postupuje v pořadí učiva od prvního otevřeného modulu pod
stupněm Legenda. Ruční výběr v katakombách má přednost i po dosažení Legendy.
Jsou-li všechny otevřené moduly na Legendě a žádný není ručně vybraný, hra
nabídne Dál. Trénink sám znovu neudělí odměnu za starou zkoušku.

`BattleScene` používá vybraný cíl pro hlavní útok, meč, obranu i mazlíčka,
včetně soubojů s bossy. Zachovává počet otázek, sílu jednotlivých zdrojů,
první odpovědi a běžné vyhodnocení. Volba nemění složení nepřátel. Úvodní
porovnávání zůstává ve svém vyučovacím kroku; pozdější procvičování porovnávání
střídá čísla a výrazy, bez udělení zkoušky nebo opakování hotového úvodu.

Procvičování má vlastní zásobu nezodpovězených příkladů, střídá dostupné formy
a přednostně vybírá chyby a pomalé úlohy. Běžný zásobník pro `progress` se
volbou nemaže. Prohlédnutí přehledu ani změna režimu nepřipisuje pokrok či
odměny. Nová volba ovlivňuje až další generovanou sadu, nikdy právě zobrazenou.

### Omezená sada a nula / jednička (17. 11.)

V pásmech F–H dostává dítě vždy jen tolik dalších úloh, kolik potřebuje právě začínající tah. Režimy Trénovat a Dál sdílejí osobní postup uvnitř etapy. Nové číselné úlohy mají čtyři odpovědi vedle sebe. [Metodika nových pásem](LEARNING_SYSTEM.md#pasma-fgh)

Tréninkový zásobník pásem A–E má 20 úloh a patří výhradně zvolenému modulu. V samostatném
sčítání a odčítání dítě doplňuje výsledek nebo chybějící číslo. Nabízené
číselné odpovědi zůstávají v rozsahu pásma. Smíšené a tříčlenné moduly ponechávají vlastní
povolené operace. U malého modulu se mohou známé příklady opakovat. Generátor
kvůli naplnění zásobníku nepřechází do jiného modulu nebo pásma.

`src/data/practice.json` určuje horní limity: nejvýše jedna úloha s hodnotou
0 v každých 20 po sobě vydaných tréninkových úlohách a s hodnotou 1 v každých
10. Nejde o procenta za jeden souboj: evidence se zachovává přes jednotlivé
bojové zdroje, nové zásobníky, načtení savu i přepnutí režimu nebo modulu.
Každé dítě má vlastní evidenci. Chyby ve frontě opakování limity neobcházejí.

Počítají se přesné číselné hodnoty operandů a správného výsledku, včetně
chybějícího členu; čísla 10 a 11 se nepočítají jako hodnoty 0 a 1. Náhodné
nesprávné odpovědi se nepočítají. Kódy porovnávacích znamének 0/1/2 nejsou
číselnými členy příkladu. Porovnávání ponechává všechny tři vztahy, své učební
kroky a názorné ukázky; obrázková velikost jednoho předmětu není číselná úloha
s jedničkou. Žádné ukázky ani pomoc se tím nepřeskakují.

## Starší návrh ovládání (nahrazen návrhem celé cesty)

Aktuální návrh je v `docs/design-drafts/practice-choice-v2/index.html`.
Je to izolovaný HTML prototyp s herními obrázky, vlastním `scenes.json`
a pamětí pouze po dobu otevření stránky. Neimportuje ukládání skutečných profilů.

- Hlavní místo volby je **Zyx v cechu**. Ukáže dva směry a u trénování konkrétní
  modul. Detail katakomb již není hlavním místem přepínání režimu.
- Aréna zůstává vizuálně beze změny. Podle upřesnění z 18. listopadu se až
  těsně před soubojem otevře samostatný obrázkový modal Trénovat / Dál.
  Schválený obrázek je v `design-drafts/catacombs-access-v1/pre-battle-approved.png`.
- Tentýž modal patří i před první sadu mimo arénu. Do potvrzení neběží čas
  ani nepřátelská akce. V dalším průběhu souboje zůstane jen značka.
- Před soubojem se přepíná režim; nový konkrétní modul se vybírá u Zyxe.
- Co-op má vlastní řádek a uloženou volbu pro každé dítě. Společné Do boje
  potvrdí obě viditelné volby a teprve potom zahájí boj.
- Po dokončení všech dostupných modulů je trénování označené ✓ a neaktivní.
  Nové dostupné učivo možnost vrátí. Při běžném přepnutí do trénování je třeba
  zachovat naposledy zvolený platný modul; rozhraní to již zajišťuje přes
  `lastTargetId` a v přehledu vrací výsledný platný `practiceTargetId`.

Následující odměny jsou **implementované od 18. listopadu 2026**:

- Osobní rychlý útok: +1 za správnou první samostatnou odpověď rychlejší než
  obvyklý čas dítěte. Reference je posledních 10 správných samostatných odpovědí
  stejného modulu a formy, nejméně 5; zmrazí se na začátku souboje. Pauzy,
  názorné ukázky, opravy a neplatné časy do reference nepatří. Bez odpočítávání.
- MathBoard ukazuje sílu příkladu, přenos základní síly a samostatný rychlostní
  přírůstek `⚡ +1`; chybná první odpověď dává 0. Osobní bonus funguje v obou
  režimech. Předaná animovaná deska v4 je zapojená do produkčního souboje,
  přípravy vybavení, cechovní zkoušky a katakombové výzvy. Rozsah integrace
  a ověření je v `MATHBOARD_RUNTIME_REVIEW_2026_11_18.md`.
- Mince zůstávají stejné za stejný souboj.
- Mana: +1 jednou po vítězství za měřitelné osobní zlepšení v trénování,
  po alespoň pěti samostatných odpovědích a při alespoň 90% přesnosti prvních
  odpovědí. Časy se mají porovnávat s referencí odpovídající formy, ne přímo
  mezi různě těžkými úlohami. Hranice je 10 %; průměrují se poměry času
  k vlastní referenci dané formy. Chybné a asistované první odpovědi zhoršují
  přesnost. Dlouhá správná odpověď se nevyřadí z průměru a tím nemaskuje
  potíže. Nulový či neplatný aktivní čas bonus many pro souboj zablokuje.

Zyxovy obrázkové karty v cechu reagují přímo na dotyk. Předbojová volba
načte výchozí režim každého dítěte. Jednorázová změna platí do konce souboje.

### Rozhraní bonusů

`PersonalBattleBonuses` pořídí samostatný snímek pro A/B až v
`BattleScene.beginConfirmedBattle`, po potvrzení režimů a před prvním příkladem.
`MathBoard.setPersonalBonusCallback` volá jeho `answer` jednou u první odpovědi,
také při chybě nebo obraně. Vrací `{damage, baselineMs, quick}`. Přímé +1
nahrazuje staré nasčítání čtyř rychlostních dílků v produkčním boji. Platí pro
hrdinu, meč i mazlíčka; obrana zachovává vlastní pravidla rychlého bloku.
Obrana nepřítele se dál odečítá jednou z kompletního útoku.

Nastavení je v `src/data/personal-bonuses.json`. Reference vynechává chyby,
asistenci, syntetické pokusy, nejistý čas, vodní mechanismus a neplatné časy.
Osobní reference přijímá aktivní časy až do dvou minut, aby se ocenilo i
zlepšení pomalejšího dítěte, například z 30 na 27 sekund. Dvacetisekundové
okno dokladů pro mistrovství se pro tento motivační bonus nepoužívá.
Porovnávání odděluje jednotlivé výukové fáze. Zkouška ani demonstrace
nezíská bojový bonus. Informace o asistenci se ukládá i bez online analytiky.

`claim` připíše manu přes ManaSystem. Číslo souboje a nový zůstatek se uloží
společně. VictoryScene čte už připsané odměny ze zprávy od BattleScene.

### Výhra po tréninku

**Dřív a Teď** ukazují osobní čas ve zvoleném modulu před začátkem souboje
a po poslední odpovědi. Z posledních 20 platně měřených pokusů se vezme medián
správných samostatných odpovědí. Rozdíl je v sekundách a odpovídá oběma zobrazeným
časům. Při prvním měření nebo po obnovení staršího souboje zastoupí chybějící
údaj pomlčka. Osobní bonus za tempo se zobrazuje zvlášť u symbolu many.

**Cesta k lišce** přebírá časový cíl a stav zámku z následující výzvy
v katakombách. Klepnutí otevře tento modul pro stejné dítě. Po zavření přehledu
se dítě vrátí k výsledku souboje. V kooperaci lze přepnout portrét a zobrazit
odměny druhého dítěte. Tlačítko **Dál** pokračuje do další vlny nebo příběhové
scény. Po tréninku u lesního strážce tak následuje předání jeho krystalu.

Měření zůstává svázané se soubojem v `practiceReward.journey`, v kooperaci
v `practiceRewardA.journey` a `practiceRewardB.journey`. Přepnutí portrétu
i návrat z katakomb používají stejné hodnoty a nepřipisují další odměnu.

Snímky z vizuální kontroly jsou v `artifacts/practice-victory-review/`.
`solo-finished-wave.png` zachycuje dokončenou vlnu. Připravené testovací
profily pokrývají také odemčení s manou (`mcp-solo-bonus.png`), reakci
lišty na ukazatel (`mcp-journey-hover.png`, `mcp-journey-pressed.png`,
`mcp-journey-pointer-out.png`) a tabletový rozměr s vypnutým zvukem
a skrytými slovy (`mcp-tablet-no-words.png`). První měření v porovnávání
a pozdější pomalejší odpovědi zachycují `mcp-tablet-first-comparison.png`
a `mcp-tablet-slower.png`. Kontrola proběhla v prohlížeči.

Úplný redesign v `docs/design-drafts/arena-reference-v3/index.html` je odložený;
uživatel výslovně zvolil zachování arény. Návrh vstupu do katakomb a přehledu
modulů k doladění je v `docs/design-drafts/catacombs-access-v1/index.html`.

## Rozhraní pro UI

```ts
import { PracticeSystem } from '../systems/PracticeSystem';

const overview = PracticeSystem.getOverview();       // aktuální dítě
const playerA = PracticeSystem.getOverview('A');       // v co-op, bez přepnutí
PracticeSystem.setMode('practice', 'B2', 'A');         // vrací boolean
PracticeSystem.setMode('practice');                   // doporučený cíl
PracticeSystem.setMode('progress');
PracticeSystem.markIntroductionSeen();                // až po předvedení
```

`'A'` a `'B'` jsou platné pouze během co-op. Metody pro neexistujícího hráče
vrátí `null` nebo `false`; nezvolí jiný profil. Změna v co-op se uloží do
správné pozice a zachová původně aktivní dítě. Přehledy nikdy nepřepínají
aktivního hráče. Pro izolovaný vizuální prototyp lze použít čisté funkce
`getPracticeOverview(data, level)` a `setPracticeSelection(data, mode, target)`
nad testovací kopií dat, bez `PracticeSystem` a jeho skutečného ukládání.

Přehled obsahuje:

- `selection`: `{ mode: 'progress' }` nebo `{ mode: 'practice', targetId }`.
- `practiceTargetId`: platný ručně vybraný modul, jinak první otevřený pod Legendou.
  Je dostupný i při režimu Dál; bez dostupného trénování je `undefined`.
- `available`, `allMastered`, `remainingCount`.
- `targets`: všechny dostupné cíle, včetně mistrovství (`completed: true`).
- `recommendations`: nejvýše tři cíle, seřazené podle skutečné blízkosti zkoušky.
- `introductionAvailable`: první předvedení od úrovně 5 nebo při postupu do
  vyššího pásma s nedokončeným starším učivem; potlačí ho `introductionSeen`.
- `introductionSeen`: zda dítě skutečně dokončilo názorné uvedení volby.
  `allMastered` popisuje staré mistrovství a neznamená zákaz trénování.
  `remainingCount` počítá jen dosud nedokončené cíle.

Cíl má `targetId`, `state` a `readiness`. To obsahuje typ nejbližší zkoušky
(`fluency_challenge` / `mastery_challenge`), `prerequisiteMet`, `ready`,
`percentage` a čtyři podmínky: `speed`, `accuracy`, `solves`, `forms`.
Každá podmínka vrací `value`, `target`, `progress` v rozsahu 0–1 a `met`.

- Rychlost je v **milisekundách**; hodnota `null` znamená, že nejsou platné časy.
  Nezobrazovat ji jako 0 sekund. `progress` roste, když se čas zkracuje.
- `accuracy` je poměr 0–1, `solves` a `forms` jsou počty.
- Rychlostní hranice sama nezaručuje odemčení. Dveře mohou otevřít až
  `readiness.ready`. Podle nového návrhu UI ukazuje jen rychlost; klik na
  zámek názorně vysvětlí aktuální překážku (zkouška / další trénink), bez
  tabulky ostatních metrik a bez Podrobností.
- Hotová rychlost s nehotovými ostatními podmínkami zůstává pod celkovými 100 %.
- `prerequisiteMet=false` typicky znamená, že nejprve chybí základní zkouška.

`MasterySystem.checkFluencyEligibility`, `checkMasteryChallengeEligibility`
a `checkComparisonChallengeEligibility` používají stejný `getCatacombReadiness`
jako UI. Dosavadní hranice rychlosti, počty a přesnost zůstávají zachované.
Nulové, záporné, nečíselné a delší než dvacetisekundové časy ani čas vodního
zvonového mechanismu nevytvářejí důkaz rychlosti. Aritmetika používá posledních
20 odpovědí (10 pro formu), kapitola porovnávání své dosavadní souhrnné okno.

## Uložení a kompatibilita

Nové volitelné pole `mathStats.masteryData.practice` obsahuje režim, cíl,
potvrzení úvodu, vlastní nezodpovězený zásobník a `recentNumberMasks` pro limity
nuly a jedničky. Starší save bez tohoto pole
znamená `progress`. Pozorování starého savu ho nemění. Původní evidence,
medaile, statistiky, výbava a odměny se nepřepisují. Server již ukládá celý
JSON profilu, takže databázová migrace není potřeba.

## Kontrola a hranice této změny

Ověřeno 17. 11. 2026 po úpravě limitů: 112 jednotkových a integračních testů
v osmi souborech (všech 20 početních modulů, průběžná okna, save, změna režimu
a všechny kroky porovnávání). Databázová migrace není potřeba: jde o volitelná
pole uvnitř stávajícího JSON profilu, bez nové tabulky či sloupce.
Prohlížečový test volá skutečné generátory `BattleScene` a kontroluje čtyři
bojové zdroje, co-op, bossy, zachování síly a úvod porovnávání. Používá izolované
profily a server bez synchronizace uložených her.

Proklikávací návrh byl zkontrolován při šířkách 1280, 1024 a 768 px. Prohlédnuté
snímky v `docs/design-drafts/practice-choice-v2/review/`: `guild-1280.png`,
`arena-1280.png`, `board-1024.png`, `coop-768.png`, `no-words-768.png`,
`mastered-768.png`, `pressed.png`, `pointer-out.png` a `confirmed-768.png`.
Po opravě menších tlačítek nemá žádný aktivní cíl pod 44 CSS px; obrázky se
načetly a konzole nehlásila chyby. Rám zachovává poměr stran, pohyb tlačítka
zahrnuje jeho povrch i obsah a hit area zůstává na místě. Co-op čeká na oba
hráče a dokončené trénování nelze vybrat. Podrobnosti jsou v `review/checks.json`.

Tato kontrola schvaluje rozložení prototypu, nikoli celé produkční UI:
první názorné předvedení dotyku Zyxem a ověření s dítětem ještě chybí. Návrh
neobsahuje nové odpovídání na MathBoardu ani odměny, takže jejich správné/chybné
stavy neposuzuje. Jde o HTML, Canvas/WebGL ověření náleží až Phaser integraci.

```sh
npx vitest run --exclude 'artifacts/**' \
  src/systems/__tests__/PracticeProgress.test.ts \
  src/systems/__tests__/PracticeNumberLimits.test.ts \
  src/systems/__tests__/PracticeSystem.test.ts \
  src/systems/__tests__/CoopCasualMode.test.ts \
  src/systems/__tests__/ComparisonLearningSystem.test.ts \
  src/systems/__tests__/MasteryThresholds.test.ts \
  src/systems/__tests__/CombatLearningRules.test.ts \
  src/systems/__tests__/PreparationSystem.test.ts
npx playwright test --config e2e/practice/playwright.config.ts
```

Vizuální ovládání a předvedení Zyxem je třeba propojit s prací UI chatu.
Tento krok neprohlašuje nové UI za vizuálně přijaté. Při propojení musí projít
`docs/UI_PRE_READER_GATES.md`, včetně obrázkové obsluhy bez slov a zvuku.
`ready` vyjadřuje splnění učebních podmínek, nikoli změnu dosavadního omezení
vstupu do osobních katakomb během co-op. Přechod do osobní zkoušky musí UI
řešit odděleně a zachovat majitele.

Bonusy mají samostatné testy `PersonalBattleBonuses.test.ts` a průchod skutečnou
deskou, vítězstvím a uložením v `e2e/practice/bonus-ui.spec.ts`. Vizuální kontrolu
a omezení zaznamenává `docs/PRACTICE_BONUS_REVIEW_2026_11_18.md`.
Celoprojektový TypeScript check má nadále chyby mimo tuto mechaniku;
nové moduly procvičování a bonusů diagnostiku nemají.

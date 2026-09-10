# Audit generování puzzlů

Historický vstupní audit. Přestavba již proběhla; aktuální stav, testy a snímky UI shrnuje [audit implementace](PUZZLE_IMPLEMENTATION_AUDIT.md).

Datum: 2026-09-08. Statická revize implementovaných scén, jejich volajících míst,
datových katalogů, výukového systému a ukládání. Tento dokument je návrh přestavby;
runtime nebyl změněn ani vizuálně testován. Budoucí oblasti zmíněné jen v designu
nejsou implementované puzzly.

**Aktualizace zadání:** Po tomto auditu uživatel zrušil zákaz opakování.
Aktuální [implementační plán](PUZZLE_IMPLEMENTATION_PLAN.md) používá nezávislý
náhodný výběr a alespoň 20 skutečně odlišných vhodných variant pro nejvýše 5%
šanci bezprostředního opakování. Níže uvedené nálezy v kódu zůstávají podkladem;
původní návrhy trvalé historie, rezervací a vyčerpání jsou překonané a nemají
být implementovány.

## Současný stav

| Místo / rodina | Zdroj a chování | Adaptace a opakování |
|---|---|---|
| Lesní most + starý most | `src/scenes/ForestRiddleScene.ts:108`, `PUZZLE_CONFIGS`: řady 2–14 po 2 a 3–21 po 3; pevné mezery i distraktory | Bez mastery; stejné zadání pro danou místnost |
| Most v původní mapové cestě | `public/assets/data/forest-puzzles.json`, `number_bridge` | 3 šablony, náhodný výběr bez historie |
| Rovnováha | Stejný katalog, `balance_scale` | 3 pevné rovnice, bez mastery |
| Výběr správné cesty | Stejný katalog, `path_choice` | 3 sady, včetně násobení mimo nynější databázi sčítání/odčítání |
| Krystalová oběť v obecném puzzle overlayi | Stejný katalog, `crystal_offering`; `ForestPuzzleScene.ts:132` | 3 sady se součty 15/20/18, náhodný výběr |
| Produkční svatyně Strážce | `src/scenes/GuardianLairMockScene.ts:160`, `loadRitualData()` | Vždy `templates[0]`, tedy součet 15; produkční `GuardianLairScene` sdílí implementaci s mockem |
| Lesní zamčená truhla | `forest-rooms.json:126`; `ForestRoomScene.ts:1121` → `SpinLockPuzzleScene` | Pevná hádanka s odpovědí STUL; náhodná jsou pouze písmena koleček |
| Starší písmenkový overlay | `src/scenes/LetterLockPuzzleScene.ts` | Také přijímá pevnou odpověď; registrován, ale nalezené produkční volání lesní truhly používá SpinLock |
| Raketa / kalibrace krystalu | `src/scenes/ZyxCrystalMachineScene.ts:30` | Vždy 3 čísla z [1,2,4,5] do součtu 10; bez mastery |
| Podvodní zvon / perlový tok | `src/systems/UnderwaterBellProblems.ts:16` | Bere mastery pásmo a `ProblemDatabase`; výběr indexem `(attempt*7+3)%pool.length`, bez historie zadání |
| Podvodní proudy | `src/systems/UnderwaterCurrentProblems.ts:13` | Pevné starty a plán pro každé pásmo, deterministické karty |
| Podvodní pumpa | `src/systems/UnderwaterPumpProblems.ts:5` | Pevné hodnoty pro každé pásmo; náhodný seed mění možnosti a počáteční nastavení, ne cílová měření |
| Podvodní zpětné počítání | `src/systems/UnderwaterReverseProblems.ts:5` | Přesně 3 pevné fáze na pásmo |
| Podvodní přepojování potrubí | `src/systems/UnderwaterRoutingProblems.ts:25` | Ověřuje jediné řešení, ale čísla jsou pevná a produkční volání neposílá seed, takže výběr je pro pásmo stejný |
| Podvodní světlo / zrcadla | `src/systems/UnderwaterLightPuzzle.ts:1` | Pevná geometrie, lampy i počáteční natočení, bez adaptace |
| Podvodní šifrové truhly | `src/systems/UnderwaterWordCipher.ts:4`, `underwater-rooms.json` | Slova KOTVA a PERLA, fallback PROUD; výpočty odvozené z pásma, ale pro stejné vstupy vždy stejné |

Původní mapová cesta odkazuje na všechny čtyři typy z `forest-puzzles.json`
v `forest-journey.json`. Je třeba pokrýt jak její `ForestPuzzleScene`, tak samostatné
produkční místnosti. Samotná úprava JSON poolu neopraví mosty ani svatyni.

Sběr many (`ManaPlayerLane`), zkoušky (`CatacombTrialScene`) a bojové/tréninkové
příklady již mají vlastní výběr z výukových dat. Jejich cílené opakování početních
faktů není totéž jako opakování celého dobrodružného puzzlu. Doporučení je zachovat
jejich tréninkové chování; stejný součet může být součástí jiného nového puzzlu.

## Co lze využít a co chybí

- `MasterySystem.getCurrentBand()`, `getFrontierSubAtom()`, stavy dílčích dovedností
  a `problemRecords` poskytují vhodnější základ než bojová síla či navštívený region.
- `ProblemDatabase` generuje katalog příkladů podle pásem a forem. Je potřeba
  sdílet jeho pravidla, nikoli vytvořit další nezávislé limity v puzzle JSON.
- Podvodní tuning E má rozsah až 30 (například pumpa končí na 28), zatímco
  `ProblemDatabase` pracuje pro E do 20 s přechodem přes desítku. Ani D není
  pouze libovolné počítání do 20: rozlišuje počítání bez přechodu.
- `getCurrentBand()` po zvládnutí všech pásem vrací fallback A. Nový výběr musí
  výslovně řešit tento koncový stav, aby zkušenému hráči neresetoval obtížnost.
- `UnderwaterProgress` ukládá počty pokusů, fáze a dokončení; ne obsah zobrazených
  zadání. `JourneySystem.roomStates` je stav aktuální výpravy, ne trvalá historie.
- `MasteryData.lastPoolProblems` řeší sousední tréninkové pooly, nikoli celoživotní
  unikátnost puzzlů. Nelze jej použít jako jedinou ochranu.
- Zvon zaznamenává do mastery první neasistovanou odpověď. Ostatní mechanismy
  evidují světové pokusy; prostorové řešení nelze vydávat za vyřešený početní fakt.
- Savování hráčského postupu používá `SaveSystem` a `localStorage`, včetně exportu
  a importu. Nová historie musí být součástí save dat a načítání starých savů.

## Doporučená architektura

1. **Katalog rodin a šablon.** Rodiny: posloupnost, rovnováha, pravdivá rovnice,
   výběr do součtu, slovní hádanka, početní šifra, postupné změny, zpětné změny,
   větvené proudy, přepojování a světelná síť. Každá má vlastní pool/generátor,
   předpoklady dovedností, rozsah složitosti a validátor. Oběť i raketa mohou
   sdílet rodinu výběru do součtu s jiným počtem dostupných kamenů.
2. **Profil obtížnosti.** Oddělit číselný rozsah a osvojené operace od logické
   náročnosti (počet kroků, mezer, větví, distraktorů). Region určuje téma a
   odemčené mechaniky; mastery určuje přípustnou matematiku. Nedávné samostatné
   výsledky dané rodiny upravují logickou náročnost. Čas na manipulaci nesmí být
   automaticky hodnocen stejně jako rychlost jednoduchého početního příkladu.
3. **Generování od řešení.** Nejprve vytvořit platný průběh, potom skrýt část
   zadání a doplnit distraktory. Ověřit všechny mezivýsledky, existenci řešení a
   počet řešení odpovídající pravidlům rodiny. U světla a slovních hádanek začít
   ručně zkontrolovaným poolem, postupně přidat validované generátory.
4. **Společná služba výběru.** Scény požádají o instanci podle rodiny, hráče a
   místa. Služba vyfiltruje obtížnost a historii a vrátí data. Scéna pouze vykreslí
   a vyhodnotí interakci; odměny a příběhové podmínky zůstanou navázané na místo.
5. **Trvalá historie.** Verze formátu, kanonické klíče již viděných zadání,
   rozpracované instance a samostatné výsledky podle rodiny. Zapsat vystavení
   při prvním zobrazení, ne až při úspěchu. Bez úspěšného uložení nelze slíbit
   ochranu napříč reloadem; dnešní `SaveSystem.save()` chybu pouze zaloguje.
6. **Kooperace.** Pro společný puzzle vyloučit historii obou hráčů a zaznamenat
   zobrazení oběma. Pro individuální úlohu použít profil řešitele; společnou
   obtížnost konzervativně odvodit z dovedností obou. Sdílené řešení nesmí
   automaticky udělit oběma nezávislý mastery úspěch.

## Přesná pravidla neopakování

- Klíč popisuje skutečné zadání: rodinu, hodnoty, mezery, omezení nebo topologii.
  Nezahrnuje náhodný seed, pořadí nabídek, grafický motiv, místnost ani verzi
  generátoru jako způsob obejití deduplikace. Kanonikalizace je specifická pro
  rodinu; kde pořadí nese význam, musí být zachováno.
- Pouhá změna distraktorů nebo přeházení tlačítek není nové základní zadání.
- Návrat z boje, reload nebo opětovné otevření má obnovit tutéž rozpracovanou
  instanci. To je pokračování rozehraného puzzlu, nikoli jeho nové přidělení.
  Doslovný zákaz i takového znovuzobrazení by znamenal zahazovat rozpracované
  řešení; doporučená interpretace je zákaz opětovného přidělení.
- Konečný pool se při neomezeném hraní vyčerpá. Ani programatický generátor
  s omezenou obtížností nemá nekonečně mnoho odlišných zadání. Nikdy potichu
  nerecyklovat: rozšířit podporované varianty ve stejné obtížnosti, nabídnout
  jinou vhodnou rodinu, nebo pro povinnou bránu navrhnout náhradní průchod bez
  opakovaného puzzlu. Nezvyšovat obtížnost pouze kvůli vyčerpání.
- Staré savy neobsahují úplnou historii. Známá pevná zadání lze konzervativně
  označit podle postupu, ale minulou náhodně zvolenou šablonu nelze spolehlivě
  rekonstruovat. Přesná garance začne evidencí nového systému a platí v rámci
  zachovaného profilu; smazání či obnovení staré zálohy historii vrací zpět.

## Postup přestavby a ověření

1. Sdílené typy, pravidla obtížnosti, výběr, kanonické klíče a kompatibilní
   rozšíření savů. Otestovat deduplikaci napříč relacemi, export/import, selhání
   zápisu, kooperaci, obnovení instance a konečné vyčerpání.
2. Lesní mosty, všechny čtyři původní rodiny, produkční svatyně a raketa.
3. Oba písmenkové overlaye a podvodní šifry s ověřenými slovními pooly.
4. Podvodní početní mechanismy, pak prostorové světlo. Zachovat existující
   vyhodnocovací funkce tam, kde přijímají obecná data; světlo dnes potřebuje
   parametrizovat i geometrii, nestačí promíchat natočení.
5. Před testováním změn prověřit migrace. Pro tuto statickou revizi nebyly
   spuštěny testy; změna puzzle historie bude vyžadovat kompatibilní inicializaci
   savů, nikoli z dosud prozkoumané cesty postupu serverovou databázovou migraci.
6. Automaticky ověřit generátory napříč pásmy a větším počtem seedů, řešitelnost,
   přípustné mezivýsledky, unikátnost, délky slov a kapacitu poolů. Nenahrazovat
   validaci pouhým snapshotem několika konkrétních čísel.
7. Před viditelnými změnami přečíst `docs/ASSET_CREATION.md`. Zachovat hosty,
   pozice a hloubky v `scenes.json`. SpinLock dnes zobrazí maximálně 4 kolečka,
   podvodní šifra požaduje 5 písmen a most má 7 míst: generátor musí respektovat
   kapacitu UI nebo musí být layout vědomě rozšířen. Sedmičlenná rostoucí řada
   s celočíselným krokem alespoň 1 se například nevejde do rozsahu A (0–5).
8. Vizuálně prověřit skutečně generované krajní hodnoty a dlouhé texty na desktopu
   i tabletu, všechny interakční stavy, Canvas a WebGL. Žádné UI zde zatím nebylo
   změněno ani schváleno vizuální kontrolou.

# Číslokraj — plán jednoduché administrace návštěvnosti a hraní

Datum návrhu: 29. 9. 2026. Aktualizace 1. 10. 2026: **UI je implementováno
v pracovním stromu; zatím není nasazeno do produkce.** Stav, ověření a
postup zapnutí jsou v úvodu [technického plánu](ANALYTICS_IMPLEMENTATION_PLAN.md).

Cíl: otevřít jednu adresu, okamžitě vidět souhrn a jedním až dvěma kliknutími
dojít ke konkrétnímu hráči, hernímu sezení a jeho příkladům. Běžná práce nesmí
vyžadovat Railway, SQL, terminál ani export. Tento plán rozpracovává bod 4
[release plánu](CISLOKRAJ_RELEASE_PLAN.md) a nahrazuje SQL report jako cílový
způsob prohlížení dat.

Navazující [technický plán implementace](ANALYTICS_IMPLEMENTATION_PLAN.md)
rozepisuje schéma databáze, kontrakty API a událostí, konkrétní soubory,
pořadí nasazení a malou cílenou testovací sadu.

## 1. Jak se do přehledu dostanu

- Produkční adresa bude **`https://cislokraj.cz/admin/`**; lze ji uložit do záložek.
- Po přihlášení oprávněného správce se na webu u účtu zobrazí **Statistiky**.
  V dětském herním menu nepřibude analytické ovládání.
- Pokud jsem již přihlášený přes Google, otevře se rovnou Přehled. Jinak uvidím
  jedinou přihlašovací obrazovku; po Google přihlášení se vrátím do administrace.
- Přístup má pouze výslovně povolený Google účet správce. Běžné přihlášení
  rodiče samo o sobě přístup ke všem hráčům nedává.
- První verze je pro čtení a analytické označování testovacích úseků. Neumožňuje
  upravovat savy, přidělovat odměny, mazat hráče ani spouštět SQL.

Oprávnění se kontroluje na serveru u každého administrátorského endpointu,
ne jen skrytím odkazu. Seznam povolených Google identit bude v serverové
konfiguraci Doppleru; nepoužijeme veřejný klíč v URL ani heslo v JavaScriptu.
Pro první nasazení je potřeba potvrdit konkrétní správcovský účet. Další role,
pozvánky a správa týmu nejsou součástí první verze.

## 2. Navigace a společné ovládání

Šest položek menu; detaily jsou vnořené, nezvětšují hlavní navigaci:

```text
Statistiky Číslokraje
├── Přehled
├── Návštěvnost
│   └── Detail webové návštěvy
├── Hráči
│   └── Detail hráče → jeho hraní a příklady
├── Hraní
│   └── Detail sezení → časová osa a odpovědi
├── Účty
│   └── Detail účtu → propojené herní profily
└── Stav dat
```

**Horní lišta:** období `Dnes / Včera / 7 dní / 30 dní / Vlastní`, označení prostředí,
výběr `Běžné hraní / Testování / Vše`, tlačítko Obnovit a čas posledního načtení.
Produkce a posledních sedm kalendářních dní včetně dneška budou výchozí.
Časové pásmo je viditelně **Praha**; dnešní neúplný den je označený. Srovnání
se předchozím obdobím používá stejně dlouhý interval, nikoli celý včerejšek proti
části dneška. Databáze uchovává UTC, hranice dnů a letní čas řeší API jednotně.

Produkční přehled čte pouze produkční DB; místní vývoj má vlastní instanci
s výrazným označením DEV, ne přepínač, který smíchá obě databáze. Výchozí
souhrny vyřadí potvrzené testy. Označení „Dospělý“ oddělí jeho početní výkon
od učebních výsledků dětí, ale nevyřadí legitimní návštěvu rodiče či Google
registraci z návštěvnosti. Neoznačené hraní se nevydává za prokazatelně dětské.

**Filtry konkrétní stránky:** zařízení, verze hry, solo/co-op, oblast, dovednost,
stav ukončení, případně hledání profilu. Pokročilé filtry jsou sbalené.
Filtry se přenášejí do detailu a ukládají do URL; Zpět vrátí původní tabulku,
řazení i stránku. Detail konkrétního hráče/sezení má vlastní stabilní adresu.

**Vzhled:** lehká HTML administrace, ne další Phaser scéna. Barevně naváže na
Číslokraj, ale místo ozdobných herních rámů použije čitelné tabulky, karty a
jednoduché grafy. Desktop má levé menu, tablet sbalitelné menu, telefon
jednosloupcové souhrny a rozbalovací řádky. Minimum 44px dotykové cíle, čitelné
písmo, žádné informace dostupné jen po najetí myší. Pravidla pro nečtenáře
zůstávají závazná pro případné zásahy do hry; tato administrace je pouze pro dospělého.

Výchozí obnovování viditelného přehledu po 30 sekundách, nikoli neustálý stream.
Viditelně rozlišit `Načítání`, `Bez záznamů`, `Ještě neměříme`, `Neúplná data`
a `Chyba načtení`. Nedostupné API nikdy neznamená nulu hráčů.

## 3. Obrazovka Přehled

**Otázka:** Přicházejí lidé, spouštějí hru a opravdu hrají?

### Rozložení shora dolů

1. Šest souhrnných karet ve dvou řadách; každá je proklikávací:

   | Karta | Hlavní číslo za období | Doplňující údaj / proklik |
   |---|---|---|
   | Návštěvnost | Počet webových návštěv | Měření návštěvníci; otevře Návštěvnost |
   | Kliknutí na Hrát | Počet kliknutí | Počet návštěv s kliknutím a jejich podíl |
   | Google registrace | Nové SSO účty | Celkem účtů k poslednímu načtení; otevře Účty |
   | Hráči | Profily s alespoň jednou odpovědí | Nové profily a celkem herních profilů; otevře Hráče |
   | Hraní | Zahájená herní sezení | Celkový a mediánový měřený čas hraní |
   | Příklady | Zodpovězená zadání | Správnost první odpovědi a počet chyb |

2. Dva malé časové grafy se společným rozsahem: návštěvy/kliknutí a
   aktivní hráči/zodpovězená zadání. Klik na den omezí podrobnosti na daný den.
3. Přechod od webu ke hraní: **návštěva webu → klik Hrát → načtené menu →
   spuštěný herní profil → první odpověď**. U každého kroku počet a procento
   vůči předchozímu kroku; klik ukáže odpovídající návštěvy.
4. Vedle přechodu krátký přehled **Poslední zaznamenaná místa**: město, aréna,
   lesní hádanka, strážce… Počty sezení, jejich stav a proklik na seznam.
5. Posledních deset hraní: začátek, hráč/hráči, délka, počet příkladů,
   poslední místo, stav. Celý řádek vede na detail sezení.

V konverzním přehledu zůstává jednotkou **návštěva**, nikoli střídavě návštěvník,
účet a dítě. Obsahuje jen návštěvy, které měly webový vstup ve vybraném období;
pozdější kroky musí patřit k téže návštěvě a nastat do konce sledovaného okna.
Probíhající návštěvy budou označené. Přímé otevření `/hra/` a návraty hráčů mají
samostatný řádek, nejsou neúspěšné návštěvy landing page.

**Google přihlášení je samostatná větev**, protože lze hrát anonymně. Není
povinným krokem mezi kliknutím na Hrát a první odpovědí. Nový hráč a obnovení
existujícího profilu se také rozlišují.

## 4. Obrazovka Návštěvnost

**Otázka:** Odkud návštěvy přicházejí, co si prohlížejí a kolik jich přejde do hry?

- Nahoře: návštěvy, měření unikátní návštěvníci, zobrazení stránek,
  medián/průměr měřené aktivity na webu, kliknutí Hrát a přechody do hry.
- Graf po dnech, u Dnes po hodinách. Webový čas se nemíchá s časem hry.
- Tabulka zdrojů: přímý/nezjištěný, odkazující doména, povolené UTM kampaně;
  návštěvy, kliknutí, návštěvy s první odpovědí. Žádné úplné cizí URL s osobními parametry.
- Tabulka stránek: vstupy, zobrazení, aktivní čas, návštěvy s kliknutím Hrát.
  Samostatně landing a hra; administrační a OAuth callback stránky se nezapočítají.
- Tabulka tlačítek Hrát: umístění v horním menu, úvodní části a dalších sekcích;
  celkové kliky versus unikátní návštěvy s klikem. Opakované klikání nezvýší konverzi.
- Rozpad počítač/tablet/telefon a nový/vracející se měřený prohlížeč.
- Dole seznam návštěv, stránkovaný po 25: čas, zdroj, zařízení, webový čas,
  klik Hrát, načtení hry, spuštěné hraní. Neobsahuje seznam IP adres.

**Detail návštěvy** je boční panel, na telefonu celá stránka. Ukáže posloupnost
stránek a významných akcí, webový čas a odkazy na vzniklá herní sezení. Pokud se
návštěvu nepodařilo propojit s profilem, uvede to; nic nedohaduje podle jména nebo IP.

Část bez klientského měření lze později doplnit agregovanými serverovými počty
požadavků. Ty se musí jmenovat **HTTP požadavky**, nikoli unikátní návštěvníci:
cache, boti a offline provoz z nich dělají jinou veličinu. První verze nebude
míchat čísla z Cloudflare a vlastních událostí do jednoho zdánlivě přesného součtu.

## 5. Obrazovka Hráči

**Otázka:** Kolik herních profilů skutečně hraje, co procvičují a kam se dostaly?

Jeden řádek = jeden logický herní profil, nikoli jeden Google účet nebo save slot.

| Sloupec | Co zobrazuje |
|---|---|
| Hráč | Herní přezdívka a krátké ID pro rozlišení stejných jmen |
| Účet | Propojený rodičovský účet / Bez přihlášení |
| Poprvé / naposledy | První doložené hraní a poslední herní aktivita, nikoli čas uploadu |
| Hraní a čas | Sezení a měřený čas ve zvoleném období |
| Příklady | Počet v období; celkový počet je zvlášť v detailu |
| Správnost | První odpovědi; vždy i jmenovatel, např. 42/48 |
| Učení | Srozumitelná dovednost a pásmo; herní level je oddělený |
| Poslední místo | Oblast, místnost/boj, poslední známý výsledek |

Výchozí řazení podle posledního hraní. Rychlé volby: Noví, Vracející se,
Bez odpovědí, S chybou, Co-op. Hledání podle přezdívky nebo krátkého ID.

### Detail hráče

Hlavička: přezdívka, krátké ID, účet/anonymní, první a poslední aktivita,
startovní pásmo a aktuální dovednost. Důsledně oddělit **počáteční umístění**,
**získaný pokrok** a **současný stav savu**.

Čtyři záložky:

1. **Souhrn:** odpovědi a čas za období/celkem, aktivní dny, návraty,
   poslední zaznamenané místo a poslední uložený checkpoint. Poslední snapshot
   může být novější než poslední hraní — oba časy budou viditelné.
2. **Učení:** tabulka dovedností se srozumitelnými názvy, počtem zadání,
   prvními správnými odpověďmi, pomocí, mediánem aktivního času správných
   odpovědí a stavem zvládnutí. Rozpad forem, rozsahů a porovnávacích kroků.
   Vývoj ukazovat pro srovnatelné úlohy; přeskočené kapitoly neoznačit jako odehrané.
3. **Hraní:** všechna sezení tohoto profilu, partner v co-opu, čas,
   počet příkladů, start/konec a získané milníky. Klik vede na Detail sezení.
4. **Příklady:** chronologický seznam všech dostupných zadání tohoto hráče,
   filtrování podle dne, sezení, dovednosti, chyby a pomoci. Zde lze dohledat
   i starou historii, kterou nedokážeme přiřadit k přesnému sezení.

U co-opu profil ukazuje vlastní odpovědi, nikoli součet obou dětí. Společně
strávený čas označíme jako společný; čas, kdy profil skutečně odpovídal,
je jiný údaj. Součet časů dvou účastníků nesmí být vydáván za délku jednoho hraní.

## 6. Obrazovka Hraní — seznam sezení

**Otázka:** Co se odehrálo při jednotlivých návštěvách hry?

Nahoře počet sezení, součet/medián času a počty podle stavu. Každý řádek obsahuje:

- začátek a konec, případně poslední kontakt;
- profil nebo oba spoluhráče, solo/co-op;
- měřený čas hry a celkovou délku mezi začátkem a koncem;
- odpovědi, první správné/chybné odpovědi;
- začátek → poslední doložené místo;
- verzi hry, zařízení a stav ukončení;
- značku Test, Dospělý nebo Neurčeno, pokud se týká sezení/jeho části.

Stavy: **Probíhá**, **Pozastaveno**, **Ukončeno hráčem**, **Zaznamenaná chyba**,
**Bez potvrzeného konce**, **Historický odhad**. Čerstvý heartbeat potvrzuje
kontakt aplikace, nikoli přítomnost člověka. Absence heartbeatů sama o sobě
nedokazuje pád ani úmyslný odchod.

Filtry mimo společnou lištu: solo/co-op, hráč, scéna/oblast, stav, verze,
sezení s chybou, sezení bez první odpovědi. Dokončení arény/lesa je milník,
nikoli automaticky konec sezení.

### Detail sezení

```text
Hraní / datum a čas                     [hráči] [režim] [verze]
Čas hry | délka návštěvy | příklady | správnost | stav

ČASOVÁ OSA                         POSLEDNÍ DOLOŽENÝ STAV
Město → Aréna → Souboj → ...        Místo, akce, čas
milníky, pauzy, loading, chyby      Uložení a synchronizace

[Všichni] [Hráč A] [Hráč B]        [Jen chybné] [S pomocí]
Čas | místo | zadání | odpověď | výsledek | čas řešení
```

- **Časová osa:** vstupy do scén a místností, boje a jejich výsledek, hádanky,
  zkoušky, odměny a změny dovedností. Pauza, skrytí karty a načítání mají
  vlastní úseky. Názvy jako „Les — Strážce“, ne samotné technické ID scény.
- **Poslední doložený stav:** poslední scéna, rozehrané zadání, poslední akce,
  poslední úspěšný save a přijetí dat. Například „Strážce poražen; převzetí
  krystalu nezaznamenáno“ — důkaz mezery, ne automatický závěr proč vznikla.
- **Příklady:** skutečné znění, dostupné možnosti, zvolená odpověď, správná
  odpověď, první pokus/opravný krok, čas řešení, pomoc a kontext
  útok/meč/štít/mazlíček/mana/zkouška. Rozkliknutí ukáže podrobnosti a další pokusy.
- **Co-op:** společná osa událostí, dvě jasně oddělené série odpovědí. Klik
  na hráče filtruje jen jeho úlohy; milníky společného boje se neopakují dvakrát.
- **Technické údaje:** sbalená sekce s vydáním, chybovým fingerprintem,
  loadingem a stavem přenosu. Bez tokenů, cookies a úplného exportu savu.
- **Označení testu/dospělého:** celé sezení nebo časový úsek s důvodem,
  potvrzením rozsahu a možností vrácení. Mění pouze analytický filtr,
  nikdy samotný herní postup. Identita správce a změna se auditují.

Nejde o videozáznam obrazovky, sledování pohybu prstu ani záznam klávesnice.
U starých aritmetických záznamů skutečně zvolenou odpověď nemáme — UI musí
ukázat „Nezaznamenáno“, ne ji dopočítat ze správnosti.

## 7. Obrazovka Účty

**Otázka:** Kolik lidí se zaregistrovalo přes Google a jaké profily jsou k účtům propojené?

- Karty: nové Google registrace, celkem Google účtů, účty s hraním v období,
  účty bez propojeného herního profilu. Počet všech herních profilů je vedle,
  ne zaměněný za počet účtů.
- Jednoduchý graf nových registrací po dnech.
- Tabulka: interní ID účtu, maskovaný e-mail, registrace, poslední doložené
  přihlášení, počet propojených hráčů, poslední jejich aktivita.
- Detail: jednoznačná identita účtu, seznam propojených herních profilů a
  odkazy na jejich detaily. Žádná automatická představa „jeden účet = jedno dítě“.

Registrace vzniká až potvrzeným vytvořením Google účtu na serveru. Kliknutí na
Google ani další přihlášení nejsou další registrace. Zrušený login a chyba
autorizace jsou samostatné události. Účet rodiče nesmí být odvozován pouze ze
sdíleného zařízení; historické přiřazení se nemění podle aktuálně přihlášeného člověka.

## 8. Obrazovka Stav dat

**Otázka:** Můžu zobrazeným číslům věřit a co v nich chybí?

- Poslední přijatá událost, zdraví příjmu a poslední úspěšná agregace.
- Pokrytí: od kdy se měří web, čas, herní sezení, odpovědi a scény.
- Počty přijatých, platných, duplicitních, testovacích a konfliktních záznamů.
- Dostupná data podle verze klienta; počet starých klientů bez nové instrumentace.
- Sezení bez konce, opožděné/offline uploady, podezřelý čas klienta a chybějící vazby.
- Historické profily se stejnou identitou a výsledek jejich analytického sjednocení.
- Záznam změn označení Test/Dospělý a výjimky vyžadující kontrolu.

Na hlavním přehledu stačí krátké upozornění a proklik sem. Nikdy nehlásit
„všechna data synchronizovaná“ — frontu na odpojeném zařízení server nevidí.
Slabá návštěvnost sama o sobě není porucha sběru.

## 9. Přesný význam metrik

| Pojem | Definice a ochrana proti chybnému součtu |
|---|---|
| Měřený návštěvník | Náhodná analytická identita prohlížeče, pokud je její použití povolené. Není to spolehlivý počet lidí; více zařízení nelze automaticky spojit. |
| Webová návštěva | Souvislá návštěva napříč webem a hrou; nová po 30 minutách neaktivity. Samotné periodické odesílání dat neudržuje návštěvu aktivní. |
| Zobrazení stránky | Skutečně zobrazený dokument/route; ne každý request assetu, prefetch či opakovaný upload. |
| Klik Hrát | Aktivace konkrétního odkazu/tlačítka. Vedle celkových kliků také počet návštěv alespoň s jedním klikem. |
| Konverze na klik | Návštěvy landing page s klikem / měřené návštěvy landing page; jmenovatel je vždy uveden. |
| Google účet / registrace | Jedinečný serverově ověřený Google účet / jeho první vznik. Anonymní řádky `player_accounts` nejsou SSO účty. |
| Herní profil / hráč | Jedna identita rozehrané hry. Ne jméno, číslo slotu, prohlížeč nebo rodičovský účet. Nová hra ve stejném slotu je nový profil. |
| Nový herní profil | Doložené `profile_created` v období. Import starého savu je „Nově zachycený“, ne nově založený. |
| Aktivní hráč | Profil s alespoň jedním skutečným zodpovězeným zadáním v období. Samotné otevření savu se měří zvlášť. |
| Herní sezení | Souvislé hraní konkrétního profilu/sestavy spoluhráčů; začíná aktivací hry, ne otevřením webu. Co-op je jedno sezení se dvěma účastníky. |
| Příklad / odpověď | Jedno konkrétně předložené a zodpovězené zadání. Opakování stejného výrazu později je nový příklad; znovuodeslání stejné události není. |
| Správnost | Podíl správných prvních odpovědí ze skutečně zodpovězených zadání. Oprava, ukázka, syntetická historie a volba startovního pásma nevytvoří další úspěch. |
| Čas odpovědi | Od viditelného a ovladatelného zadání po první odpověď; bez úvodní animace, loadingu a skutečné pauzy. Pro souhrnnou rychlost primárně medián správných odpovědí. |
| Návrat | Tentýž profil s hraním v dalším dni; opakované uploady starých dat nejsou návrat. Bez dostatečně dlouhého pozorování není profil označen za „nevrátil se“. |
| Místo ukončení | Poslední doložená scéna/akce před ukončením nebo ztrátou kontaktu. Není to automaticky místo způsobující odchod. |

Souhrn všech příkladů je vážen počtem příkladů. Případný „průměrný hráč“ je
jiná metrika se stejnou vahou každého profilu. UI je nesmí zaměňovat. Zobrazit
počty vzorků; z krátkého pilotu neodvozovat věk dětí ani prokázaný učební účinek.

### Měření času a hranice sezení

- **Web:** odhad aktivního času ve viditelné kartě s nedávnou interakcí;
  výchozí hranice neaktivity 60 sekund. Čas čtení bez interakce může být delší,
  proto údaj výslovně označit jako odhad, ne přesnou pozornost návštěvníka.
- **Hra:** měřit odděleně hraní v popředí, loading, explicitní pauzu/skrytou
  kartu a celkovou dobu. Během otevřeného zadání absence kliknutí není důkaz
  neaktivity — dítě může přemýšlet. Dlouhé úseky bez vstupu označit jako nejisté,
  ne je potichu vyřadit z času odpovědi. Výchozí upozornění po 120 sekundách.
- Heartbeat přibližně po 15 sekundách; monotónní čítače aktivního času a
  pořadová čísla. Po uspání zařízení nepřičíst celou mezeru mezi dvěma heartbeaty.
- `visibilitychange`/pauza ukončí aktivní úsek; `pagehide` pouze zkusí doposlat
  zbytek. Zavření karty nelze spolehlivě zachytit vždy.
- Po 30 minutách skryté/pozastavené/neaktivní aplikace začne při další aktivitě
  nové sezení. Viditelné řešení zadání se nerozděluje podle krátké mezery mezi kliky.
- Reload bez dlouhé pauzy může pokračovat ve stejném sezení, ale dostane nové
  ID běhu dokumentu. Návrat do menu a ukončení hry, změna profilu nebo změna
  sestavy spoluhráčů ukončí původní herní sezení. Střídání tahů A/B nikoliv.
- Další karta má vlastní běh/sezení; v součtu aktivity jednoho prohlížeče se
  překrývající časové úseky sjednotí, aby dvě karty nenásobily návštěvní čas.
- Offline průběh uchová původní ID a časy. Chybějící kontakt není okamžitý
  konec hry. Pozdější upload může zpřesnit dříve odhadnutý konec, nevytvoří
  další sezení. Aktuální stav bez kontaktu se zobrazí jako nepotvrzený.
- Počty sezení se přiřazují dni zahájení, časy se rozdělují podle překryvu
  s vybraným intervalem a odpovědi podle času odpovědi. Tyto rozdíly budou
  v definicích metrik; hraní přes půlnoc není dvojí nová návštěva.

Hranice 15/60/120 sekund a 30 minut jsou navržené, společně konfigurované
parametry měření, nikoli změna dětského herního tempa.

## 10. Co už máme a co začne fungovat až po doplnění sběru

| Oblast | Současný stav | Co doplnit |
|---|---|---|
| Google registrace | Tabulky Better Auth a Google identity existují | Správná agregace prvních registrací, historie úspěšných loginů a vazba na návštěvu, kde je doložená |
| Herní profily | `gameplayProfileId`, anonymní/propojený účet, poslední snapshot | Kanonické analytické identity, vytvoření versus import, historie propojení |
| Odpovědi | Příkladový klíč, správnost, čas, kontext; porovnávání má bohatší detaily | ID předložení, sezení, skutečná volba, opuštěné zadání, scéna/encounter, verze při vzniku |
| Aktuální postup | Poslední snapshot učení, arény, inventáře a příběhu | Historie milníků a doložené místo poslední aktivity |
| Web, kliky, zdroje | V současném herním sběru nejsou | Nové webové události a přehled pokrytí |
| Čas a sezení | Nejsou spolehlivě explicitně zaznamenaná | Životní cyklus sezení, heartbeat, viditelnost, pauzy a loading |
| Průchody a chyby | Ze snapshotu lze zjistit jen některé dosažené stavy | Vstupy/výstupy, zahájení/výsledek bojů a hádanek, omezená chybová telemetrie |

Audit 29. 9. našel 300 fyzických řádků odpovědí, ale 198 unikátních dvojic
profil/událost a čtyři různé herní identity. To je výchozí doklad problému,
nikoli hodnota napevno v UI. Aktuální přehled musí vždy číst živá data.

Staré webové návštěvy, skutečný čas hraní, kliky a přesné cesty scén nelze
zpětně vyrobit. Historické odpovědi lze zobrazit hned; seskupení podle časových
mezer bude nanejvýš volitelné **Historický odhad**, vyloučené z přesných
session/time statistik. Při zapnutí nového měření bude v grafech hranice
„Podrobné měření od…“. Starší oblast nebude vyplněna nulami.

## 11. Duplicity, importy a testovací hraní

1. **Opakovaný přenos:** stabilní ID události a databázová unikátnost; stejná
   dávka po ztraceném potvrzení nesmí přidat další odpověď, čas ani registraci.
2. **Import téže hry do jiného prohlížeče:** zachovat ID profilu a původní
   identitu odpovědí. Analytika sjednotí doložené kopie; vlastnictví pro čtení
   běžným hráčem zůstává oddělené a řízené serverem.
3. **Existující duplicity:** nová normalizační vrstva nad současnými tabulkami.
   Kandidát je shodné ID profilu, pro odpověď navíc stejný `event_key` a shodný
   obsah. Rozporné identity/obsahy patří do Stav dat, ne do tichého přepsání.
   Jméno ani e-mail nejsou klíčem pro slučování dětí.
4. **Záměrně nová hra/kopie:** nové ID; importovaná historie se nepočítá jako
   nové odehrané příklady. Pro zachování historie evidovat původ/import.
5. **Snapshoty:** místní revize lze porovnávat jen v rámci jejich zařízení.
   Revize 300 na zařízení A automaticky neporáží revizi 10 na B. Uchovat původ,
   čas a nesrovnalosti; poslední přijatý upload nemusí být poslední hraní.
6. **Novější přihlášení:** vazba Google účtu se doplní, ale nevznikne další
   návštěvník, hráč ani odpověď jen kvůli změně anonymního stavu.
7. **Testování:** dev má oddělenou DB. Automatické produkční kontroly musí
   mít předem označený testovací kontext nebo blokované zápisy. Ruční označení
   lze použít na celý profil, sezení i časový úsek; je vratné a auditované.
8. **Dospělý u dětského profilu:** vyřadit označený úsek z učebních statistik,
   ne automaticky celou historii. Změnu dosaženého stavu označit původem;
   nic nevracet zpět ve skutečném savu. Rychlost sama věk nedokazuje.

Původní záznamy se kvůli deduplikaci **nemažou**. Pro přehledy existuje jeden
společný výpočet, aby souhrn, detail i export počítaly totéž. Pravidla a jejich
verze jsou dohledatelné. Analytické sjednocení nikdy samo nerozšíří oprávnění
k hráčským datům a neumožní přístup jen na základě znalosti UUID.

## 12. Instrumentace a jednoduchá technická realizace

Zachovat současné **Cloudflare + Hono/TypeScript API + PostgreSQL**. Bez nového
BI produktu, datového skladu, frontového clusteru nebo další přihlašovací služby.

### Události

- Web: zobrazení stránky, klik Hrát v konkrétním umístění, zahájení přihlášení.
- Server: úspěšná Google registrace/přihlášení; klientský klik není potvrzení.
- Start hry: požadavek na start, hotové menu, vytvoření/import/aktivace profilu,
  začátek a konec herního sezení, účastníci co-opu.
- Hraní: vstup/výstup scény a místnosti, začátek/výsledek konkrétního encounteru,
  hádanky a zkoušky, změna dovednosti, převzetí/vložení příběhového krystalu.
- Příklad: předložení, první odpověď, opravné kroky, opuštění, skutečně zobrazená
  pomoc. Existující záznam odpovědi zůstane jediným zdrojem počtu odpovědí;
  obecná časová osa jej referencuje, nevytváří druhý nezávislý čítač.
- Čas/technika: heartbeat, viditelnost/pauza, loading, chyby assetů/save/sync
  a zachycené výjimky. Omezit opakování stejné chyby.

Společná data: ID události, návštěvy, sezení a běhu dokumentu, ID příslušného
profilu/účastníka už v okamžiku vzniku, pořadí, klientský i serverový čas,
prostředí, verze klienta při vzniku a při odeslání, verze schématu a původ
`živé / import / historické`; označení testu je samostatné. U příkladu zachovat skutečné zadání,
nikoli ho později generovat z aktuálního katalogu. Základní typ zařízení stačí;
plná identifikace hardwaru není potřebná.

### Ukládání a čtení

- Rozšířit stávající lokální transakční frontu, dávkování a potvrzení;
  na landing page použít lehký společný klient bez importu Phaseru.
- Přenos ani selhání analytiky nikdy nesmí blokovat hru, save, klik Hrát nebo
  přihlášení. Omezené dávky, retry s odstupem a zachování neodeslaných dat.
- Verzionovaná migrace IndexedDB nesmí zahodit stávající savy/frontu. Starší
  klienti a jejich API kontrakt musí během přechodu dál fungovat.
- Server přijímá jen validované typy a omezené velikosti dat; ověřuje vlastníka
  zápisové identity, Origin a limity. Prostředí a SSO identitu nebere za pravdu
  jen z libovolného klientského payloadu. Žádný veřejný endpoint pro čtení všech hráčů.
- SQL migrace budou aditivní: události, návštěvy/sezení a jejich účastníci,
  mapování analytických identit a auditovaná označení. Stávající odpovědi dostanou
  potřebné volitelné vazby. Přesný počet tabulek podřídit jednoduchosti, ne
  vytváření kopie herních savů nebo paralelního mastery systému.
- U pilotního objemu stačí indexované SQL pohledy a dotazy na vyžádání.
  Časové agregace lze později materializovat, teprve pokud měření ukáže potřebu.
- Jedna serverová vrstva definuje všechny metriky a filtry. Admin API vrací
  souhrny, stránkované seznamy, detaily a stav pokrytí, ne neomezený dump DB.
- Povolené filtry a řazení validovat, stránky omezit a použít timeout dotazů.
  Cíl pro pilot: běžný přehled do dvou sekund, detail načítaný postupně,
  nové online události viditelné zpravidla do 30 sekund. Pomalý přenos označit,
  ne blokovat celou stránku; nejde o příslib aktuálnosti odpojených zařízení.
- Nové čtecí cesty `/v1/admin/...`; zápis označení zvlášť chráněný proti CSRF,
  s kontrolou rozsahu, auditem a možností vrácení. Samotné načtení reportu nic nemění.

### Konkrétní místa v repozitáři

| Místo | Plánovaná změna |
|---|---|
| `admin.html`, `src/admin/` | Samostatný lehký vstup, navigace, přehledy a detaily |
| `vite.config.ts`, `infra/cloudflare/worker.mjs` | Build a směrování `/admin/` i přímých odkazů do detailů |
| `src/auth/googleAuth.ts`, `src/landing-auth.ts` | Návrat na povolenou admin cestu, odkaz Statistiky pouze oprávněnému účtu |
| `server/src/app.ts`, `auth.ts`, `config.ts` | Admin autorizace, čtecí API, potvrzené SSO události |
| `server/src/domain/`, `server/migrations/` | Jednotná agregace, deduplikace, session data a audit |
| `src/telemetry/`, `src/main.ts`, vstup landingu | Sdílený neblokující sběr návštěv a hraní |
| Lifecycle scén, MasterySystem, CoopSessionManager | Kontext při vzniku události, skutečný čas a správný účastník |
| `scripts/offline-build.mjs`, offline worker | Admin data ani jeho balík nepřednačítat jako herní offline obsah |

Pozor: dnešní offline manifest bere všechny Vite soubory v `assets/`.
Pouhé přidání dalšího HTML vstupu nestačí; výběr závislostí se musí omezit na hru.
Admin API má `no-store`, admin dokument se nekachuje jako soukromý offline
report. Po odhlášení UI odstraní načtené údaje. Landing a administrace nesmí
načítat herní knihovnu a balík ilustrací.

## 13. Soukromí a hranice sběru

Detailní analytika s trvalou identitou není automaticky „technická“ jen proto,
že používá naši doménu. ÚOOÚ rozlišuje nezbytné ukládání od analytického a
pravidla vztahuje i na obdobná lokální úložiště. Před zapnutím nového sběru
ověřit právní titul, potřebný souhlas, informační text a režim pro dětské
hraní s odpovědnou osobou. [ÚOOÚ — cookies a podobné technologie](https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/cookies).

Navržený bezpečný výchozí režim: nové volitelné analytické identifikátory a
detailní měření se spustí až po příslušném povolení; odmítnutí neblokuje hraní,
save ani login. Měření se neobchází převzetím přihlašovací cookie k jinému
účelu. Odvolání zastaví nový sběr i odesílání čekajících analytických událostí,
nevymaže lokální herní postup. Existující serverová data se řeší schválenými
retenčními/výmazovými pravidly, ne automatickým smazáním při odhlášení.

- Ukázat rozsah pokrytí, nikoli tvrdit, že souhrn obsahuje úplně všechny návštěvy.
- Bez fingerprintingu, nahrávání obrazovky, přesné polohy, kontaktů a klávesových záznamů.
- Do analytiky nekopírovat OAuth tokeny, auth cookies, plný user-agent,
  IP adresy ani celé query stringy/referrery. Chybové zprávy sanitizovat.
- E-mail pouze v chráněné části účtů, v seznamu maskovaný; ve většině UI stačí přezdívka a ID.
- Návrh uchování pro schválení: detailní události 90 dní, souhrny 12 měsíců;
  herní save a přihlášení mají samostatnou politiku. Před jakoukoli expirací
  výslovně schválit pravidla a možnost exportu. Tento plán žádná data nemaže.
- Samotná administrace a její prohlížení se nepočítají do návštěvnosti hry.

## 14. Pořadí implementace a hotové výstupy

| Etapa | Výstup viditelný uživateli | Podmínka dokončení |
|---|---|---|
| **1. Přístup a současná data** | `/admin/`, Přehled, Hráči + detail/příklady, Účty, Stav dat. Chybějící web/session metriky označené, ne falešně vyplněné. | Přístup jen správce; současné odpovědi a profily bez duplicit; souhrn odpovídá detailům. |
| **2. Web a konverze** | Návštěvnost, čas na webu, zdroje, kliky Hrát, načtení hry, registrace/login a jejich propojení. | Doložený průchod web → hra; anonymní i přihlášený režim; respektování povolení měření. |
| **3. Herní sezení a průběh** | Hraní + detail, časová osa, poslední místo, scény, příklady, co-op, offline data a chyby. | Skutečný průchod menu → město → boj → návrat je správně vidět po reloadu i offline přenosu. |
| **4. Sjednocení a přejímka** | Všechny prokliky a filtry, časová pokrytí, označování testů, rozumné výchozí pohledy. | Kritické scénáře níže, kontrola desktop/tablet a shoda všech součtů. |

Tyto etapy nejsou alternativy; úplná první verze zahrnuje všechny požadované
obrazovky. První etapa umožní něco používat dříve, ale nenahrazuje požadované
měření návštěvnosti a sezení. Před produkčním zapnutím nového sběru musí být
uzavřený bod 13. Před implementací zafixovat slovník metrik a schéma událostí.

Mimo první verzi: vlastní tvorba dashboardů, obecný editor SQL, session replay,
heatmapy, automatické e-mailové reporty, automatické odhadování věku,
úpravy savů a slučování účtů. Export filtrované tabulky lze doplnit později;
není náhradou pro klikací detail.

## 15. Krátká, ale kritická přejímka

Před databázovými testy zkontrolovat migrace a aplikovat je do oddělené testovací
DB. Žádné testovací zápisy do skutečných hráčských dat a žádný celý herní suite
jen kvůli změně reportu.

**Rychlé kontraktní testy:**

1. Přihlášený neadmin, anonymní uživatel i znalost cizího ID nedají admin data;
   odhlášení a cache nic neprozradí. Jména/URL nejsou spustitelné HTML.
2. Retry stejné dávky, ztracené potvrzení, import na další zařízení a pozdější
   login nemění počet již přijatých odpovědí. Rozporná kopie se neztratí.
3. Jedna první chybná odpověď + oprava = jedno zodpovězené zadání s chybou;
   ukázka = nula. Stejný výraz předložený znovu později = další zadání.
4. Reload, skrytá karta, uspání, dvě karty, půlnoc/letní čas, nesprávné hodiny
   a pozdní offline upload nezvětšují čas ani počet sezení chybně.
5. Co-op má jedno sezení, dvě oddělené sady odpovědí a správný profil i po
   prohození aktivního hráče; společné milníky nejsou zdvojené.
6. Nová Google registrace se započítá jednou; opakovaný login ani klik na
   Google nejsou registrace. Herní profil/import/účet mají odlišné součty.
7. Filtry, deduplikace a testovací označení dávají stejný počet na kartě,
   v grafu, seznamu i detailu. Chybějící data se nezobrazí jako nula.

**Čtyři cílené prohlížečové průchody místo rozsáhlé sady:**

1. Web → Hrát → profil → odpovědi → administrace; všechny prokliky a součty.
2. Google první/další login, nepovolený účet, odhlášení a přímý odkaz do detailu.
3. Co-op → výhra → další scéna; dvě vlastní historie, jedna časová osa.
4. Offline → reload → obnovení připojení + opakovaný přenos; zachované časy,
   správné místo a žádná nová falešná aktivita v čase uploadu.

Vizuálně projít desktop a tablet: dlouhé přezdívky, prázdný přehled, chybu API,
rozbalenou odpověď, co-op a historická neúplná data. Kontrolovat skutečné
zobrazení, ne pouze existenci screenshotu. Nové herní prvky, pokud nějaké
vzniknou, musejí projít [pravidly pro nečtenáře](UI_PRE_READER_GATES.md).

**Hotovo z pohledu uživatele:** otevřu záložku Statistiky, vidím dnešní/poslední
hraní, kliknu na profil a konkrétní sezení, najdu jeho příklady i poslední
doložený stav. Současně vidím návštěvnost, čas na webu, kliky na hru,
Google registrace a nové/aktivní herní profily — bez pomoci vývojáře.

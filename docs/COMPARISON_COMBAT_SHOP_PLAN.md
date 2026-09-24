# Návrh: porovnávání, odměna za náročné příklady a vybavení

Datum: 11. 9. 2026; aktualizováno podle požadavku na zařazení za A2, společná
pravidla zkoušek a vypuštění tříoperandových úloh s chybějícím číslem.
Stav: implementováno 11. 9. 2026 ve společné herní vrstvě pilotního i vývojového
buildu. Dokument obsahuje celé zadání a výchozí hodnoty; nevyžaduje znalost
předchozí konverzace. Ceny a hranice zvládnutí zůstávají hodnotami pro první ověření.

> **REVIZE 21. 9. 2026 — schválený krokodýlí návrh je zapojený do hry.
> Aktuální chování: [COMPARISON_IMPLEMENTATION.md](COMPARISON_IMPLEMENTATION.md).
> Děti skoro neumějí číst: ŽÁDNÝ DLOUHÝ TEXT NIKDE V UI. Všechny kontroly musí
> zahrnout [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md). `<`, `>` a `=` musí být
> všude alespoň 2× větší. Aktuální návrh: [COMPARISON_CROCODILE_REDESIGN.md](COMPARISON_CROCODILE_REDESIGN.md).**

Následná revize 3: ukázka a řešení mají zůstat na společném MathBoardu,
**jeden příklad ze sady pro běžný útok najednou**. Vložený čistý znak nesmí
přerůstat číslice; 2× se vztahuje k původním drobným znakům hry. Rám tlačítka
a jeho symbol se při hoveru/stisku pohybují společně. Konkrétní tok a změny
napojení: [COMPARISON_BATTLE_INTEGRATION.md](COMPARISON_BATTLE_INTEGRATION.md).

## 1. Rozsah a společné chování

Výuková kapitola porovnávání, nové poškození, obrana a obchod budou společné
pilotní/release i plné vývojové verzi. Vývojová verze navíc dostane v hlavním menu
zkratku do testovacího boje. Pilot nadále obsahuje Mathorii a les bez Silverpondu.
Změny fungují lokálně; na infrastrukturu řešenou v jiné session nečekají.

Cílem kapitoly je naučit používat `<`, `>` a `=` přes skutečné krmení krokodýla.
Revize návrhu podle následné připomínky zachovává **společný MathBoard**, jeho
pergamen, zadání vlevo, tři odpovědi vpravo a společné vyhodnocování. Ve všech
čtyřech krocích dítě volí velkou tlamu/znak. Mezi nabídkami je před volbou
**prázdné místo**, nikoli neutrální krokodýl. Úvodní animace na stejné tabuli
předvede oba směry a rovnost. Přechod od velikosti k počtu předvedou obrázky
a párování, nikoli text zadání.

## 2. Výuková posloupnost

| Fáze | Podoba úlohy | Vysvětlení a podpora |
|---|---|---|
| 1. Větší předmět | Jeden větší a jeden menší předmět stejného druhu, bez čísel. | Krokodýl sní větší předmět. Dítě po ukázce volí tlamu v MathBoardu. Pro stejnou velikost ukázat `=`. |
| 2. Více předmětů | Skupiny 2 a 4, 4 a 2, 3 a 3; stejné velikosti a rozestupy, bez čísel. | Krokodýl sní početnější skupinu. Kusy se názorně párují; rovnost ukáže pár pro každý kus. |
| 3. Předměty s číslem | Každá skupina zůstává vidět a dostane odpovídající číslo. | Dotyk kusů a zvýraznění čísla propojí množství a zápis; výběr velké krokodýlí tlamy. Obrázky se nesmějí vynechat. |
| 4. Jen čísla | Dvě čísla, bez předmětů. | Stejný vztah se přenese na čísla; tlama přejde na velký čistý znak. Obrázkovou pomoc lze přehrát. |
| 5. Výraz → symbol, s odloženou početní nápovědou | `2 + 1 ? 4`, `2 + 1 ? 3`, `2 + 1 ? 2`. Odčítání až podle znalostí hráče. | Po 15 sekundách se pod výrazem ukáže jeho výsledek, např. `2 + 1` → `3`. Správný porovnávací znak zůstává na dítěti. |
| 6. Výraz → symbol samostatně | Stejné formy a známý číselný rozsah, bez automatického výsledku. | Na požádání lze pomoci; takový pokus je označený jako řešení s pomocí. |

Každá fáze začíná názornou ukázkou všech tří vztahů a pokračuje vlastními novými
úlohami. Při ukázce se správná tlama předvede; při samostatné odpovědi předem
nenaznačuje správný směr. Po volbě může animace potvrdit nebo vysvětlit výsledek.
Místo pro vztah zůstává před volbou prázdné. Rovnost se vysvětluje jako „na obou stranách
stejně“ a má vlastní znak `=`. Samotné zavření krokodýlí tlamy nenahrazuje vysvětlení
rovnosti. Ve všech krocích se zachovají tři volby MathBoardu v pořadí `<`, `=`, `>`;
v prvních třech mají podobu krokodýlí tlamy, ve čtvrtém čistých znaků.

Začít v rozsahu do pěti; při opakování používat rozsah, který hráč zná. Větší hodnota
se pravidelně střídá vlevo i vpravo. Rovnost tvoří přibližně třetinu úloh. Krokodýl,
barvy, pozice předmětů a animace před samostatnou odpovědí nesmějí prozrazovat řešení.

### Nápověda po 15 sekundách

Čas běží až od viditelného a ovladatelného zadání, pouze během aktivního hraní.
Pauza, vysvětlovací animace a skrytá karta ho zastaví. Čas se resetuje s novou úlohou.
Nápověda ukazuje početní mezivýsledek, ne celý vyřešený vztah. U pozdějších tří
operandů lze ukázat postup `4 − 2 + 1` → `2 + 1` → `3`.

Použitou pomoc zaznamenat. Správná první odpověď s pomocí stále může způsobit běžné
poškození, včetně odměny za složitost; nedává rychlostní bonus a nedokládá samostatné
zvládnutí. Ukázka, v níž odpověď doplní hra, nezpůsobí poškození. Po chybě se oprava
stejného zadání nezapočítá jako další úspěšný pokus.

### Postup a návrat k vysvětlení

- Fáze 1–3: minimálně šest nových úloh, každému vztahu věnovat dvě; pro postup
  alespoň pět správných prvních odpovědí bez dodatečného prozrazení řešení.
- Fáze 4: vyvážených devět nových úloh, osm správných bez pomoci.
- Fáze 5: alespoň šest nových úloh, pět správných prvních voleb symbolu. Výsledek
  po 15 sekundách je zde povolenou výukovou oporou; podpořené odpovědi nepovýší
  samostatné aritmetické mastery.
- Fáze 6: vyvážených devět nových úloh, osm správných bez pomoci.
- Dvě chyby z posledních čtyř pokusů aktivují cílené vysvětlení a několik jednodušších
  úloh stejného vztahu. Následuje nové ověření bez pomoci. Pomalá správná odpověď
  sama nezpůsobí návrat a nepřepíše již zvládnuté etapy.

Průběh se ukládá mezi souboji a herními sezeními. Fáze nejsou jeden povinný dlouhý
blok a hráč může odejít a navázat. Postup výuky je nezávislý na vítězství v boji.
U všech výukových kroků je dovoleno přemýšlet bez časového limitu; během vysvětlení
boj stojí. Tato pravidla jsou laditelná a neznamenají vědecky stanovenou hranici znalosti.

## 3. Smíšená zkouška a návaznost na běžné úlohy

Závěrečná zkouška používá stejnou konfiguraci jako ostatní modulové zkoušky:
`EXAM_CONFIGS.sub_atom`. Aktuálně má **8 úloh**, bronz od **5**, stříbro od **6**
a zlato od **7** správných odpovědí. Kapitola neobsahuje vlastní kopii těchto čísel,
nový počet úloh ani dodatečnou hranici úspěchu. Časování, vyhodnocení a přechod
po získání medaile používají dosavadní společná pravidla. Jiné existující druhy
zkoušek, například pásmové, si zachovají své vlastní společné konfigurace.

Při současném počtu osmi zadání se promíchají:

- 2 porovnání velikosti předmětů;
- 2 porovnání počtu předmětů;
- 2 porovnání samotných čísel;
- 2 porovnání známého výrazu s číslem.

Symboly rozdělit co nejrovnoměrněji, tedy 3/3/2, a mezi zkouškami střídat, který
symbol je zastoupen dvakrát. Pokud se společný počet úloh někdy změní, složení
se odvodí z něj. Krokodýl a automatické výsledky se ve zkoušce nezobrazují.
Slabá místa podle symbolu a podoby úlohy slouží k doporučení dalšího procvičování;
nepřepisují výsledek zkoušky vypočtený společnými pravidly. Při neúspěchu se
procvičí slabé místo a zkouška se nabídne znovu s jinými zadáními.

Zkouška úvodní kapitoly nevyžaduje tři operandy, pokud je dítě ještě neprocvičuje.
Pozdější zkoušky příslušných vyšších úrovní kombinují i tříoperandové úlohy
a tříoperandové porovnávání. Podporují známé operace a číselný rozsah hráče.

Pořadí je **A1 → A2 → kapitola porovnávání → A3 → A4**. Dokončení A2 podle
dosavadních pravidel odemkne kapitolu; její dokončení odemkne pokračování v A3.
ID existujících modulů se nepřečíslují. Kapitola má vlastní stabilní identitu
a uložený postup. Při procvičování porovnávání jsou už dostupné základy sčítání
i odčítání z A1/A2.

Dnes se aritmetické porovnávání může objevit už po deseti správných řešeních A1
a je součástí modulových zkoušek. Před dokončením nové kapitoly ho proto běžný
výběr a zkoušky A1/A2 nenabízejí. V aktuální osmipříkladové zkoušce A1/A2 se před
kapitolou použijí 4 úlohy na výsledek a 4 na běžný chybějící operand. Celkový počet,
medaile a pravidla dokončení zůstanou společné; původní požadavek na procvičení
dvou forem je tak nadále dosažitelný. Výukové úlohy fází 5–6 používají porovnávání
pod řízením kapitoly.

Jedna podmínka dostupnosti řídí běžný výběr, upevňování, opakování i všechny druhy
zkoušek. Požadavky na znalost symbolů se nesmějí obejít jiným zdrojem příkladů,
například mečem, mazlíčkem, štítem, manou nebo přípravou v obchodě. Totéž platí pro
automatické postupování v co-op. Podmínky připravenosti nové kapitoly vyhodnocují
její podoby zadání a symboly; nesmějí čekat na aritmetické formy, které neobsahuje.

Stávající savy nepřijdou o postup. Hráčům, kteří už porovnávání používají, lze
nabídnout smíšenou vstupní zkoušku a při úspěchu kapitolu uznat. Chybějící nový
záznam v savu sám o sobě nezruší původní mastery ani vybavení.

## 4. Povolené tříoperandové úlohy a jejich poškození

U tříoperandových úloh budou vždy zadané všechny tři aritmetické operandy. Zůstává
výpočet výsledku, např. `3 − 2 + 1 = ?`, a již dohodnuté porovnání vypočtené hodnoty,
např. `4 − 2 + 1 ? 3`. Vyřadí se hledání libovolného chybějícího operandu, např.
`3 − ? + 1 = 2`, bez ohledu na jeho pozici a číselný rozsah. Běžné doplňování čísla
ve dvouoperandových úlohách, např. `3 − ? = 1`, zůstává.

Vyřazení platí ve všech modulech, boji, opakování, zkouškách a přípravě vybavení,
včetně fallback generátorů. Původní historické záznamy odpovědí se nemažou, ale
zakázaná zadání se odstraní z aktivních, opakovacích a pomalých front po načtení
starého savu. Nově generovaný tříoperandový výsledek i každý mezivýsledek zleva
doprava musí zůstat nezáporný a v povoleném číselném rozsahu. Totéž platí pro
postup, kterým hra úlohu vysvětluje.

Zkoušky a výzvy musejí po vyřazení formy stále obsahovat celý počet úloh ze své
společné konfigurace. U tříoperandového modulu se původní místa pro chybějící číslo
přerozdělí mezi výsledek a porovnání; v současné modulové zkoušce jde o 4 + 4 úlohy.
Podmínky připravenosti a automatického postupu nevyžadují vyřazenou formu. Po
dokončení kapitoly porovnávání zůstávají pro A3 dvě dostupné formy, takže není
nutné plošně snižovat stávající požadavek na procvičení dvou forem.

| Typ | Příklad | Váha poškození |
|---|---|---|
| Dva aritmetické operandy | `2 + 1 = ?` | 1× |
| Dva operandy porovnané s číslem | `2 + 1 ? 4` | 1× |
| Tři aritmetické operandy | `3 − 2 + 1 = ?` | 2× |
| Tři operandy a porovnání | `4 − 2 + 1 ? 3` | 2× |

Tříoperandové porovnávání nebude dále násobit 2×2: první nastavení je 2× celkem. Ostatní formy
si zatím zachovají dosavadní váhu; výrazy na obou stranách lze později ladit samostatně.

Nejprve se určí dosavadní síla konkrétní úlohy podle útoku hráče či vybavení, potom
se vynásobí vahou složitosti. Tři příklady s původní silou 1/1/1, z nichž jeden je
tříoperandový, dají při správném řešení **4 místo 3 poškození**. Pokud má úloha
dosavadní sílu 2, náročná varianta dá 4. Vyšší odměna se nesmí dalším rozdělením
útoku zpětně snížit na původní součet.

Rychlostní bonusy a bonus přípravné runy se přičítají samostatně a nenásobí se
znovu složitostí. Obrana nepřítele se odečte jednou od celého útoku. Stejný výpočet
platí v solo, co-op a pro úlohy meče a mazlíčka. Jedna odpověď stále znamená jeden
výukový pokus; váha poškození nenásobí mastery, počet odpovědí ani mince.

UI u zadání ukáže skutečnou sílu zásahu. Náročnost se určuje podle struktury
aritmetického výrazu. Samotné pole `operand3` nestačí: obyčejné `a + b ? c` v něm
dnes ukládá pravou porovnávanou hodnotu.

## 5. Obrana štítem: vždy jediná úloha

Pro každý jednotlivý příchozí útok s kladným poškozením se štítem zobrazí jedna
úloha. Síla štítu určuje počet blokovaných bodů. Špatná první odpověď blokuje nulu.
Nulové poškození neotevře obrannou úlohu. Více samostatných nepřátelských útoků může
znamenat více obran; lepší štít nikdy nezvyšuje počet příkladů v jedné obraně.

| Síla štítu | Běžná správná odpověď | Rychlá správná odpověď |
|---|---|---|
| 1 | blok 1 | blok 2 |
| 2 | blok 2 | blok 4 |
| 3 | blok 3 | blok 6 |

Rychlá odpověď zachovává dosavadní maximální odměnu odpovídající více rychle
vyřešeným úlohám. Jde o bonus při existující hranici rychlosti, ne o časový limit.
Výsledek se vždy omezí velikostí příchozího útoku. Úloha vyřešená s pomocí může
dát základní blok, ne rychlostní bonus. Dvojnásobná útočná váha složitých úloh
se na blok nepoužije.

Přípravná runa štítu může dál zachytit jeden jinak neblokovaný bod a spotřebuje
se pouze tehdy, když pomůže. Příprava vybavení v obchodě si ponechá svůj vlastní
počet procvičovacích úloh; pravidlo jedné úlohy se týká obrany v boji.

Přidat výslovnou `blockPower` do dat předmětů a oddělit ji od počtu pokusů.
Všem již existujícím štítům zachovat jejich dosavadní celkovou základní kapacitu
bloku. V UI nahradit zastaralé údaje o sekundách a počtu pokusů textem
„Jedna úloha • blok 2“, podle konkrétního štítu. Dosavadní časovač obrany už neběží.

## 6. Tři stupně mečů a štítů v obchodě

Výchozí návrh cen v měďácích:

| Stupeň | Meč: původní → nová cena | Síla bonusové úlohy meče | Štít: původní → nová cena | Síla bloku |
|---|---|---|---|---|
| 1. Dřevěný | 8 → 8 | 1 | 3 → 3 | 1 |
| 2. Železný | 20 → 16 | 2 | 15 → 12 | 2 |
| 3. Zpevněný — nový | nový: 28 | 3 | nový: 20 | 3 |

Železná sada zlevní celkem z 35 na 28. Nová sada stojí 48 a tvoří další dostupný
krok. Ceny se ověří proti skutečným výdělkům v Mathorii; nejde o hotový výsledek
ekonomické simulace.

Oprava podle playtestu z 24. září: meč přidává jednu samostatnou bonusovou úlohu.
Nákup ani výměna meče nemění úroveň, získanou sílu hrdiny ani počet a sílu jeho
základních útoků. To platí pro všechny meče. Například bonusová úloha zpevněného
meče má základ 3, při skutečně tříoperandovém zadání 6. Nákup silnějšího meče
sám nevynucuje neznámé operace; příklady dál vybírá výukový systém.

`PlayerState.attack` obsahuje pouze získanou sílu hrdiny. Nové a opravené záznamy
mají `attackPowerVersion: 1`. Při načtení starého záznamu se jednorázově odečte
`attackBonus` vybaveného meče, který starý obchod chybně přičítal. Úroveň ani
odměny ze zkoušek se nepřepočítávají. Hodnoty `attackBonus` v katalogu zůstávají
pro tuto migraci a řazení staršího vybavení; sílu bonusové úlohy i její údaj
v kartě postavy určuje `damageMultiplier`.

Přidat nové stabilní ID `sword_reinforced` a `shield_reinforced`. Existující ocelové
a zlaté předměty v katalogu mají jiné vlastnosti a zůstanou zachované pro staré savy.
Nové ID se nesmějí zaměnit za jejich dosavadní význam. Změna cen už zakoupeným
předmětům nepřipíše ani nestrhne peníze.

Obchod dnes napevno vystavuje čtyři položky. Nabídku rozšířit na šest, tři meče
a tři štíty, s výslovným seznamem ID. Rozložení šesti položek, názvů, cen,
tooltipů a přípravných tlačítek upravit v `scenes.json`; platba mincemi zůstává
použitelná i na tabletu. Výběr staršího/lepšího vybavení řídit skutečnou silou
a stupněm, nikoli cenou nebo pořadím v JSONu.

Nové ikony mají odpovídat existujícímu výtvarnému stylu a zřetelně se odlišovat.
Použít společné rámečky, text vykreslovat ve hře a zachovat proporce obrázků.
Příslušné assety musí generátor pilotního balíku zahrnout. Sdílený ShopScene
promítne změnu také do vývojové varianty s jiným regionálním pozadím.

## 7. Testovací vstup

Pouze vývojové menu dostane tlačítko „TEST: POROVNÁVÁNÍ“. Otevře boj s existujícím
vzhledem zeleného slizu, ale samostatnými testovacími statistikami **50 HP,
útok 0, obrana 0**. Roster se vyřeší z katalogu; běžný sliz se nepřepisuje.

Testovací postava má pevnou nízkou sílu, žádnou výbavu, mazlíčka ani rychlostní
bonus. Běžná úloha způsobí 1 bod, tříoperandová 2. Žádné obranné úlohy proti
nulovému útoku. Boj používá společné výukové a bojové mechanismy, nikoliv jinou
pevnou testovací sadu příkladů. Po dokončení kapitoly pokračuje smíšené procvičování.

Použít dočasný profil. Reálný save, jeho mastery, inventář a mince se nemění;
při odchodu se původní stav obnoví. Diagnostická data nesou označení testovacího
režimu. Porážka slizu sama kapitolu neoznačuje za zvládnutou: při delším učení může
testující navázat dalším soubojem se stejným dočasným postupem, ukončení testu
všechna dočasná data zahodí. V release je kapitola dostupná normálním postupem,
bez této zkratky.

## 8. Technický postup a ověření

1. **Sdílená pravidla a data:** výukové fáze, generování reprezentací, řešení,
   nápověda, pravidla zkoušky, explicitní váha náročnosti a síla štítu. Nastavení
   držet v datových souborech; nemít různé kopie hodnot pro jednotlivé buildy.
2. **Boj a vybavení:** aplikovat odměnu za složitost, jednoúlohový blok, nové položky
   a ceny; propojit údaje o síle se zobrazením v boji a obchodě.
3. **Výuková prezentace:** krokodýl → znak, velikost/počet/čísla/výrazy, časování
   nápovědy a smíšená zkouška. Použít stávající UI prvky a pozice z Scene Editoru.
4. **Integrace:** zápis postupu do savu, zařazení kapitoly mezi A2 a A3, podmínky
   výběru příkladů a připravenosti zkoušek, odstranění vyřazených forem z aktivních
   front, co-op přiřazení každému hráči, testovací vstup, oba registry scén a balík
   pilotních assetů.
5. **Ověření a vyvážení:** zkontrolovat skutečné úlohy, délku soubojů, dostupnost
   nákupů a výukový průchod. Staré ekonomické simulace mají jiné ceny než runtime;
   nejprve relevantní model napojit na aktuální items/encounters a společná bojová
   pravidla. Teprve potom jeho výsledky použít pro úpravy cen a síly.

Do existujícího JSON savu přidat verzovaný postup kapitoly, úspěšnost podle fáze
a symbolu, výsledek zkoušky a aktuální potřebu podpory. Každý pokus eviduje podobu
zadání, hodnoty/operace, zvolený symbol, první správnost, použitou pomoc a aktivní
čas. Samostatné aritmetické mastery se nemá zvyšovat jen tím, že nápověda předvedla
výpočet. V co-op se záznam vztahuje k právě odpovídajícímu hráči.

Serverový save model přijímá JSON payload, proto tato práce nevyžaduje novou tabulku.
Budoucí telemetry transport z jiné session použije tato data bez blokování hraní.
Před případnými integračními testy API ověřit aplikované migrace; herní/unit testy
těchto změn mohou běžet bez databáze.

Přijetí implementace:

- **BLOKUJÍCÍ:** všechny [kontroly UI pro nečtenáře](UI_PRE_READER_GATES.md).
  Žádný dlouhý text v žádném stavu, vše názorně, čtyři kroky bez přeskočení
  předmětů s číslem, všechny `<`, `>` a `=` alespoň 2× větší. Starší níže
  uvedené výsledky testů nejsou přijetím nové vizuální revize.

- Správná orientace všech symbolů, rovnosti, různých rozmístění a generovaných
  aritmetických výsledků; hodnoty a mezivýsledky v již známém rozsahu.
- Nápověda přesně po 15 sekundách aktivního zadání, žádné spuštění během pauzy,
  její odstranění při přechodu a žádné započítání jako samostatné zvládnutí.
- Vyvážená smíšená zkouška, cílené opakování, zachování postupu mezi sezeními
  a funkční podmínky v hlavním výběru, opakování, zkouškách i vybavení.
- Zkouška kapitoly má počet a medaile ze stejné konfigurace jako ostatní modulové
  zkoušky; všechny další zkoušky a výzvy zůstanou plné i po vyřazení forem.
- Průchod A1 → A2 → porovnávání → A3 bez zablokování nedostupnou úlohou nebo
  předčasného přeskočení kapitoly; totéž při co-op postupu a importu savu.
- Žádné tříoperandové zadání s chybějícím číslem ze žádného zdroje ani staré
  aktivní fronty. Zachované dvouoperandové doplňování, tříoperandové výsledky
  a porovnávání, nezáporné mezivýsledky i vysvětlení.
- Tříoperandová váha v solo/co-op/meči/mazlíčkovi, jediný odpočet obrany,
  užitečné čerpání run a jedna odpověď zapsaná jako jeden pokus.
- Jeden příklad pro libovolný štít; správně, rychle, špatně, příliš silný štít
  proti slabému útoku, nulový útok a správný cílový hráč v co-op.
- Všech šest nákupů, ceny, síla, výměna vybavení a kompatibilita dosavadních savů.
- Oba buildy; screenshoty desktop/tablet a Canvas/WebGL, čitelnost, žádné překryvy,
  zachované proporce, stavy tlačítek a žádné chybějící assety v pilotu.
- Návrat z testovacího boje neovlivní reálné sloty ani jejich statistiky.

Implementace nevyžadovala databázovou migraci. Ověření zahrnuje cílené unit a
integrační testy, pilotní kontrolu obsahu, oba buildy a vizuální průchod na desktopu
i tabletu v Canvas i WebGL rendereru.

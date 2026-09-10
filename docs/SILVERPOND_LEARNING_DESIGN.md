# Silverpond: objevování, procvičování a použití

Návrh aktualizovaný 7. září 2026. Navazuje na [mapu jedenácti místností](SILVERPOND_UNDERWATER_PLAN.md), nenahrazuje ji novou lineární trasou.

Aktualizace 8. září: zapojeny také U09–U11 a ponor do přírodní průrvy. Stav finále a výtvarná omezení jsou v [UNDERWATER_FINALE.md](UNDERWATER_FINALE.md); níže zachované popisy dřívějších iterací nejsou seznamem současných blokací.

Podklad: [Play Learning – matematika 1.–2. třída: discovery, drill, automaticita a motivace](https://docs.google.com/document/d/1_rvAW9Z1IbQ2rUcdBGzcrbQQM32_GJmIIoLlCmPW6SE/edit?tab=t.0). Dokument byl přečten celý, bez změn jeho obsahu. Následující herní mechanismy jsou vlastní návrhovou aplikací jeho principů, nikoli výsledkem ověřovací studie. Citované výzkumy nebyly v tomto kroku nezávisle auditovány. Neurobiologické hypotézy nejsou důkaz účinnosti této hry.

## Hlavní rozhodnutí

Vodní kapitola má střídat **objevení vztahu → jeho názorné zachycení → krátké vybavování z paměti → použití v jiné situaci**. Ne každý výpočet potřebuje nové puzzle a ne každé puzzle má být test rychlosti.

**Hlavním nositelem repetice jsou skutečné souboje.** Nepřidáváme za každý boj další formulář s dávkou příkladů. Existující BattleScene vybírá úlohy z osobního učiva a zaznamenává jednotlivé odpovědi, včetně samostatného profilu A/B. Puzzle učí plánování a přenos; procházení, spuštění stroje a odměna dávají rytmu pauzu. Počet odpovědí v boji závisí na vybavení, útoku, obraně a chybách — počet nepřátel není pevná dávka procvičování.

Hráč obnovuje zatopené město: rozsvítí zvonici, zprovozní proudy, vrátí ryby domů a otevře cestu ke strážci. Početní práce má viditelný důsledek. Volí mezi dvěma smysluplnými směry, ale nemusí sám sestavovat své učivo.

Obtížnost zvyšujeme hlavně počtem vztahů, přenosem a plánováním. Číselné pásmo nadále vychází z konkrétního dítěte, nikoli pouze z toho, jak daleko došlo v příběhu. V co-opu má každá samostatně řešená početní úloha jednoho označeného řešitele a jeho vlastní pásmo.

## Co už je v této iteraci implementováno

- **Perlový proud ve zvonici:** jeden zdroj, dva postupné kroky, zvon s cílovým číslem. Šest skutečně malovaných perel nese změny `+n` či `−n`. Dítě vybere nebo přetáhne dvě různé perly a teprve zazvoněním provede svůj plán. První tón používá dvě přičtení, druhý přidání a ubrání, třetí ubrání a doplnění. Uznávají se všechny platné plány, ne jedna tajná autorská kombinace. Průběžný počet nesmí být záporný. Dvě mušle připomínající váhy byly odstraněny.
- **Slovní truhla:** pět promíchaných početních stop, každá s písmenem. Výsledky seřazené od nejmenšího dají heslo `PROUD`. Dítě jej nastaví na pěti kolečkách zámku. Obrázek ryby už odpověď neprozradí. Jde o kombinaci výpočtu, řazení a přenosu písmen, nikoli jen pojmenování obrázku.
- **Pomoc a omyl:** bez poplatku a časového limitu. Proud po chybě ukáže skutečně dosažené hodnoty a dovolí opravit stejný plán. První pomoc ukáže potřebnou celkovou změnu, další zasadí první krok; neprovede druhý. U truhly pomoc odhaluje postupně výsledky stop, nehotový zámek.
- **Poctivé měření:** první samostatné odevzdání plánu se zapíše jako jeden pokus s příslušným klíčem učiva, nikoli jako dva nezávislé výpočty. Oprava téhož plánu ani dokončení po nápovědě nevytvoří další samostatně správný příklad. Pomoc je zaznamenána ve stavu kapitoly. Čas plánování a přetahování není použit do metrik rychlosti ani do seznamu pomalu vybavovaných faktů. Truhla nevytváří pět domněle správných příkladů, protože hra nepozoruje pět samostatně zadaných výsledků.

Ukázka z menu používá pro puzzle pásmo D, tedy do 20. Skutečné profily své pásmo nemění. Staré otevřené truhly a dosažené tóny zůstávají zachovány. Nyní jsou implementované i U03 a U05: v zahradě boj → společný proud dvou ryb; v kanálu boj → tři fyzické ventily podle hodnot na potrubí. Truhla v kanálu je volitelná a má samostatný otočný zámek PERLA. Po třech tónech lze zvolit libovolnou větev; první obnovený mechanismus otevře přímou obousměrnou zkratku. Společná řešení mechanismů jsou evidencí postupu ve světě, ne třemi individuálními správnými příklady. Nyní jsou hratelné i U04 a U06: tříetapový obrácený proud včetně přenosu na rozvětvení, skutečný souboj s krunýřníkem a mlokem, pak plánování dvou cest třemi výhybkami. Každý dokončený mechanismus přidá vlastní trvalou pečeť. Obě větve lze projít v libovolném pořadí; obtížnost čísel se dál řídí profilem. Dokončené etapy svatyně se ukládají. Brána, vedlejší vrak/jeskyně a finální boss zatím zůstávají návrhem.

Nejnověji jsou hratelné i U07 a U08. Vrak nahradil dočasnou přímou spojnici; průchod je volný, boj chrání dvě dobrovolné odměny. Zámek KOTVA používá výpočet, chybějící začátek a při malé hodnotě perly. Stopy zůstávají před očima vedle zámku. Společná šifra nevytváří domnělé individuální správné příklady. Podrobnosti: [UNDERWATER_WRECK_AND_UI.md](UNDERWATER_WRECK_AND_UI.md).

## Dvě větve, společný smysl

U09 přidává čistě prostorové plánování světla jako volitelný oddech. U10 a tři fáze U11 používají známé bojové ovládání a skutečnou evidenci početních odpovědí. Požehnání, průchod ponorem a získání krystalu nepřidávají matematické pokusy. Před závěrem je bezplatný odpočinek; nepovedený pokus nespotřebuje pečetě ani požehnání. Silnější vlna je ohlášená předem a používá známou obranu, nikoli novou reflexní úlohu.

| Místo | Nová zkušenost | Učební role a herní důsledek |
|---|---|---|
| U01 mělčina, U02 zvonice | Nová truhla a perlový proud | Seznámení s ovládáním; naplánovaný řetězec změn. Ve finální kapitole zvon zviditelní obě větve |
| U03 rákosová zahrada | Návrat rybího hejna | Objevit společnou změnu dvou hodnot; ryby rozhrnou kořeny |
| U04 mušlová svatyně | Perlová paměť | Krátce upevnit objevené vztahy, poté použít obrácenou operaci; získat první pečeť |
| U05 zatopený kanál | Boj a oprava proudového čerpadla | Opakování v boji; potom nastavení tří změn podle návazných hodnot, viditelné rozběhnutí stroje |
| U06 proudová komora | Přesměrování vodních cest | Plánovat dvě související trasy se sdíleným úsekem; druhá pečeť |
| U07 vrak, U08 podpalubí | Poštovní šifra | Nové pořadí a reprezentace známých vztahů; volitelná truhla a průchod mezi větvemi |
| U09 světelná jeskyně | Zrcadla a paprsek | Krátký prostorový oddech, ne falešný matematický výkon; užitečná volitelná pomoc |
| U10 brána, U11 srdce jezera | Spojení známých mechanismů a osvobození strážce | Přenos a vyvrcholení. Žádný zcela nový princip poprvé pod tlakem bosse |

Zvonice zůstává orientačním středem. Lze jít zahrady → kanál i kanál → zahrady. Vrak obě větve propojí; již vyřešené mechanismy a poražení nepřátelé se při návratu povinně neopakují. Odbočky pomáhají, ale nejsou skrytou podmínkou vítězství.

## Konkrétní další puzzly

### 1. Hejno a společný proud

Na začátcích dvou krátkých tras jsou ryby se světelnými počty 3 a 8; domovy mají 7 a 12. Dítě nastavuje **jeden společný proud**. Zjišťuje, že oběma chybí stejná změna, přestože počáteční i cílové hodnoty jsou jiné. Spuštění ukáže obě cesty současně. Nejde o vyrovnávání vah: ryby mají jasně vlastní domovy a šipky vždy vedou od ryby k domovu.

V další místnosti se cesty rozdělí: první ryba potřebuje celkem +4, druhá +2. Společný úsek může přidat 4 a druhá odbočka ubrat 2. Hráč plánuje, kde změna působí na obě ryby a kde jen na jednu. Otočné kamenné výhybky mají skutečný viditelný dopad; není třeba číst pravidla z panelu.

První setkání předvede jeden pohyb a jeho početní zápis vedle sebe. Nápověda nejprve rozsvítí nesplněný domov, poté ukáže rozdíl, teprve poslední pomoc osadí jeden díl. Čísla v příkladu jsou ilustrace, ne pevný obsah všech profilů.

### 2. Svatyně: obrátit známý mechanismus

V zahradě hráč viděl začátek a hledal změnu; svatyně ukáže konec a již osazené změny, ale začátek chybí. Například proud přidá 6, potom ubere 3 a zvon potřebuje 14. Kolik má být na začátku? Dítě může přehrát tok opačným směrem; animace ukáže opačné operace, nikoli pouhé sdělení výsledku.

Nejprve jeden názorný případ, pak krátké samostatné úlohy a nakonec jiné uspořádání mechanismu bez předepsaných kroků. To je přenos, ne jen pátá kopie stejného zámku. Pečeť otevře viditelnou bezpečnou zkratku ke zvonici.

### 3. Čerpadlo: boj jako procvičování, ventily jako použití

Původní návrh samostatného bloku 4–6 opravovacích příkladů byl po upřesnění zadání nahrazen skutečným bojem s krabem a rybou. Opakování probíhá zde, v již známém ovládání souboje.

Po boji je potřeba nastavit tři ventily, ne pouze kliknout na hotové kolo. Například hodnoty na potrubí 11 → 15 → 12 → 18 vyžadují změny +4, −3, +6. Každý ventil má čtyři promíchaná nastavení a samostatnou animaci otáčení. Hodnoty jsou ve světě viditelné, takže obtížnost nespočívá v zapamatování dlouhého zadání. Potvrzení přehraje skutečnou posloupnost hodnot; nápověda ukáže jeden vztah, nenastaví celý stroj. Bez časového limitu a poplatku. Stroj se rozběhne až po řešení, ale lze ho dobrovolně přehrát bez opakované odměny.

### 4. Poštovní vrak: stopy ve světě

Další slovní truhla nemá pouze přidat písmena. Část stop může být na nalezených poštovních destičkách: výpočet, obrázkové rozdělení perel a chybějící část. Nalezené destičky se automaticky objeví vedle zámku, aby dítě nemuselo mít silnou čtenářskou či pracovní paměť nebo běhat mezi obrazovkami s čísly v hlavě.

Všechny stopy řeší známé vztahy, jen jinak vyjádřené. Pořadí udává fyzický motiv, například pět zvětšujících se otvorů. Vlastní slovo je krátké, česky známé a bez potřeby obecného trivia. Pro další truhlu použít jiné heslo; opakované `PROUD` už nic neověřuje.

## Jak udržet objevování i automaticitu

Po novém objevu následuje malá názorná vazba objekt ↔ číslo ↔ operace. Nemá to být další odstavec od Zyxe. Pro opakované procvičování používat stabilní jednoduchý vstup; pro aplikaci měnit kontext, nikoli zbytečně ovládání.

Známé vztahy se vracejí v jiné větvi a později v další herní návštěvě. Jeden průchod mapou může zajistit odstup v rámci sezení, ale **sám nezajišťuje dlouhodobé rozložení opakování**. To vyžaduje následný výběr úloh z uložené historie a ověření v dalších dnech.

Čas v plánovacím puzzlu nevypovídá čistě o vybavení faktu. U jednoduchého procvičování lze sledovat latenci spolu s přesností a nápovědou, bez časového limitu, bonusu za rychlost nebo trestu. Herní pokrok a učební jistota jsou dvě různé věci: dítě může s pomocí zachránit město, ale systém z toho nesmí odvodit samostatné zvládnutí všeho.

Strážce prověřuje známé vztahy v běžném souboji. Silný útok je předem vidět; neúspěch nemaže objevené cesty. Žádný skrytý požadavek na perfektní sérii, náhodná truhla jako motivace nebo nákup dalšího pokusu. Krystal a očištění jezera jsou předvídatelný příběhový výsledek.

## Výroba a ověření

1. Ověřit současný proud a truhlu s dítětem na tabletu: rozpozná cíl bez vysvětlování? Považuje ještě něco za váhu? Zkouší plán, nebo pouze náhodně překládá perly? Rozumí směru řazení?
2. Postavit U03 a U05 jako dvě alternativní krátké mise. Jeden nový objev, jedna užitečná oprava. Teprve po ovládání a playtestu vyrábět celé větve.
3. Doplnit obrácený proud, společné výhybky a návratové zkratky. V obou pořadích větví musí být potřebný princip předem dostupný; při opačném pořadí nabídnout stejnou krátkou ukázku.
4. Přidat odložený návrat potřebných úloh a oddělenou diagnostiku: samostatná první odpověď, pomoc, oprava, přenos na novou formu. Společně řešený prostorový puzzle nezapisovat oběma jako individuální správné výpočty.
5. Boss, art a odměny ladit až na tomto základě. Testovat různé úrovně obou hráčů, save/reload a nápovědu, nikoli jen bezchybný průchod.

Úspěch není pouze počet kliknutí nebo doba strávená ve hře. Pro skutečné vyhodnocení učení sledovat samostatnou přesnost, závislost na pomoci, vztah známý v novém zobrazení a jeho vybavení v dalším sezení. Tvrzení o zlepšení učení vyžaduje odpovídající delší vyhodnocení, ne samotný interní playtest.

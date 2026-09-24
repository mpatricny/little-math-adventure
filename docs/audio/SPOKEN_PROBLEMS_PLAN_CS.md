# Mluvené příklady a opožděná nápověda

Návrh z 24. 9. 2026. **Pouze plán, nikoli zapojená funkce.** Nevznikly nahrávky,
volání placeného API ani změny měření, obtížnosti nebo uložených pozic.

## Doporučené chování

Příklad se nadále dá vyřešit zcela bez čtení a bez zvuku. Hlas je volitelný
doplněk stávající názorné výuky, ne náhrada obrázků, předvedení a velkých voleb.
Použít [kontrolu UI pro nečtenáře](../UI_PRE_READER_GATES.md).

| Situace | Navržená řeč |
|---|---|
| Objeví se `5 + 3` | „Pět plus tři.“ |
| Po 15 sekundách dosud neodpovězeného procvičování | „Máš pět a přidáš k tomu tři.“ |
| Objeví se `8 − 3` | „Osm minus tři.“ |
| Po 15 sekundách | „Máš osm a tři odebereš.“ |
| Dítě odpoví, i chybně | Ihned zrušit čtení i čekající nápovědu; pokračuje současná zpětná vazba. |
| Dítě řeší zkoušku / bránu / katakomby | Jen neutrální čtení zadání; automatickou vysvětlující nápovědu vypnout. |

Číst přirozeně, klidně a stručně; neříkat výsledek, „to je snadné“, „rychle“ ani
nevyvozovat z čekání, že dítě něčemu nerozumí. V první verzi neopakovat průběžně
povzbuzování ani nápovědu každých dalších 15 sekund. Jedna automatická nápověda
na aktuální příklad stačí.

### Ovládání

- Návrh výchozího režimu: čtení zapnuté při povoleném hlasu; vysvětlení po
  15 sekundách pouze v procvičování. Samostatně uložit volby „Číst příklady“
  a „Slovní pomoc“, aby nešlo vypnout příklady jen vypnutím všech postav.
- Malý, ale alespoň 44 CSS px velký reproduktor umožní zopakovat aktuální
  zadání. Nejde o tlačítko prozrazení výsledku. Stav musí být patrný ikonou.
- Nové ovládání má vlastní host a bezpečný prostor v `scenes.json`; nepřekrývá
  odpovědi, čísla ani místo vyhrazené pro stávající obrázkové nápovědy.
- Nastavení respektuje současné ztišení hlasu i celkovou pauzu. Na zařízení se
  nevyžaduje mikrofon, rozpoznávání řeči ani přihlašování do hlasové služby.

## Jak formulovat různé úlohy

Čtení sestavovat ze struktury zadání (`MathProblem`, jeho forma a reprezentace),
nikoli z vykresleného textu a nikdy z `answer`, správné volby nebo tajných hodnot.
Formátovač má mít zvláštní typ vstupu obsahující pouze viditelné zadání.

- Sčítání: „přidáš“, odčítání: „odebereš“. Vysvětlení může souběžně zopakovat
  známý pohyb objektů, ale případné odkrytí mezivýsledku je již vyšší pomoc.
- Chybějící člen `5 + □ = 8`: „Pět plus něco je osm.“ Později „Máš pět.
  Kolik přidáš, abys měl osm?“ Nikdy přečíst chybějící trojku z modelu odpovědi.
- Tři členy `6 + 2 − 1`: „Šest plus dva minus jedna.“ Vysvětlení popíše kroky
  ve stejném pořadí, bez spočítání mezivýsledku.
- Porovnávání čísel: „Porovnej pět a tři.“ Neříkat správný vztah před odpovědí.
  U výrazů přečíst oba výrazy v plném rozsahu a zachovat jejich strany.
- Obrázkové lekce porovnávání velikosti/počtu: nevyzradit zatím nezobrazená
  čísla ani větší stranu. Neutrální „Porovnej“ doplňuje viditelné předvedení.
  Velikost jednoho předmětu nepopisovat jako počet předmětů.
- Úlohy s jinou sémantikou (rovnováha, doplnění řady, krystalové operace)
  nedabovat automaticky stejnou aritmetickou šablonou; mají vlastní pozdější návrh.

## Časování a společný hlasový kanál

15 sekund znamená **aktivní čas řešení aktuální nezodpovězené otázky** od jejího
zpřístupnění. Nezapočítávat úvodní ukázku, pauzu, skrytou kartu, zobrazenou chybu,
přechod mezi otázkami ani tah druhého hráče. Není to prostý `setTimeout(15000)`.
Čtení neblokuje odpověď. Rychlé dítě ho smí okamžitě přerušit správnou volbou.

Každé zadání získá identitu `(scene, player, batch, question, generation)`.
Plánovač těsně před přehráním znovu ověří identitu, otevřené odpovídání, hlasitost
a počet již přehraných nápověd. Zrušení na odpověď, výměnu otázky, restart,
pauzu a konec scény platí i pro soubor, který se teprve načítá. Po návratu
z pauzy nezačíná dlouhá fronta starých vět; nejvýše pokračuje aktuální otázka.

V jednu chvíli zní jediný hlas. Explicitní akce dítěte a aktuální zadání mají
přednost před automatickou patnáctisekundovou nápovědou; příběhový dialog je
samostatný režim, během něhož se vůbec nepočítá čas odpovídání. Nestačí spoléhat
na pravidlo „poslední volání řeči vyhraje“, které nyní má `AudioDirector`.

U běžného boje se čte pouze aktivní otázka, ne celý balík najednou. Totéž pro
útok mazlíčka, štít a přípravu v obchodě. Přepnutí hráče ruší předchozího vlastníka.
**Současné dvouproudové sbírání many automaticky nečíst:** hlasy by se přerušovaly
a patnáctisekundová pomoc zpravidla přijde až po konci dané úlohy. V první verzi
tam nanejvýš nabídnout vyžádané čtení jednoho vybraného proudu přes společný
kanál, nebo tuto minihru ponechat bez čtení. Neměnit kvůli hlasu její tempo.

## Samostatné řešení, nápověda a statistiky

Je třeba odlišit přístupnost zadání od pomoci s výpočtem:

| Událost | Návrh vyhodnocení |
|---|---|
| Přečtení / opakované přečtení viditelného zadání | Není asistované řešení. |
| Slovní přeformulování po 15 s bez nových údajů | Samostatný příznak `audioRephrasePlayed`; v první verzi neodebírat samostatnost. |
| Odhalení mezivýsledku, rozklad přes desítku nebo konkrétní postup výpočtu | Skutečná pomoc `assisted`; navázat na pravidla konkrétní dovednosti. |
| Vypnutý hlas, zamítnutý autoplay, chybějící soubor, zrušené čekání | Žádná zaznamenaná hlasová pomoc. |

Příznak zaznamenat až při **skutečném zahájení přehrávání**, ne při naplánování
nebo načtení. Tím se zabrání trestání pomalejších dětí nebo dětí s vypnutým zvukem.
V analytice „bez přeformulování“ a „s přeformulováním“ lze odlišit, aniž bychom
automaticky měnili postup a odměny. Rozhodnutí, zda je slovní přeformulování
pedagogicky již asistence, ověřit v pilotu a schválit před změnou progrese.

Zachovat první odpověď jako jediný pokus. Neukládat opravu stejného příkladu jako
nový samostatný úspěch. Čas odezvy automaticky nepřepisovat odečtením celé délky
nahrávky: dítě může při poslouchání počítat. Nejdříve měřit zvlášť aktivní RT,
skutečnou dobu hlasu a přehrání nápovědy; vliv na odhad plynulosti vyhodnotit
na pilotu. Zkoušky nyní nemají viditelný odpočet ani automatické selhání po 15 s;
audio nesmí takový limit přidat.

Současné `comparisonMeta.assisted` je specifické pro porovnávání. Nová obecná
evidence nesmí být u aritmetiky schovaná v `comparisonMeta`. Potřebuje vlastní
volitelné údaje o pokusu a zpětně kompatibilní načítání starých uložení.
Před případnou změnou serverového ukládání ověřit schéma a potřebu migrace.

## Nahrávky a technické napojení

Preferuji **předem připravené celé české fráze se stávajícím schváleným hlasem
Zyxe**. Nejprve ověřit několik ukázek výslovnosti, tempa, klidného tónu a mezer;
neskládat produkční řeč z tvrdě stříhaných samostatných číslic. Stávající původ
hlasů a mixer popisuje [Audio ve hře](INTEGRATION.md).

Nejdříve inventarizovat skutečné unikátní formulace z `ProblemDatabase` a dalších
zapojovaných generátorů. Počty příkladů nejsou počty unikátních nahrávek. Klíč
obsahuje jazyk, verzi scénáře, typ čtení, formu a **pořadí** operandů; `5+3`
a `3+5` se nesmějí omylem sdílet. Teprve z počtu a délky schválených vět odhadnout
velikost balíčku a cenu generování; nevymýšlet cenový odhad před inventurou.

V runtime pouze běžné statické audio, žádný placený TTS požadavek při každém
příkladu ani odesílání dětských profilů. Načítat jen okolí aktuální lekce,
sdílet cache, mít rozumný paměťový rozpočet a při nedostupném souboru pokračovat
vizuálně. Offline dostupnost neslibovat, dokud nebude konkrétní cache opravdu
navržená a ověřená; současná paměťová cache není trvalé offline úložiště.

Použít existující `AudioDirector.speak`, `cancel(owner)`, ztišení hudby a hlasovou
hlasitost. Doplnit úzce vymezený plánovač `ProblemSpeechController`, sémantický
formátovač a oznámení `onStarted` / `onEnded` / `onCancelled`. Současný
`speak(): Promise<void>` končí i při nepřehrání a samotná Promise není důkaz,
že dítě nápovědu slyšelo. Nepřidávat druhý nezávislý přehrávač.

Přehrávání musí respektovat odemčení zvuku dotykem a ovládání hlasitosti.
Toto je i doporučení [MDN pro Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
Systémové `speechSynthesis` lze zkusit v interním prototypu, nikoli jako
garantovaný český produkční hlas: [getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)
vrací hlasy dostupné na daném zařízení. Navíc
[cancel](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel)
ruší celou jeho frontu; bez společného řízení by kolidovalo se zbytkem řeči.

## Postup realizace

1. **Obsahový pilot:** inventura forem, 6–12 reprezentativních vět a nápověd
   (sčítání, odčítání, nula, desítka, chybějící člen, oba směry porovnání).
   Odsouhlasit hlas a význam „pomoci“. Teprve potom schválit placené generování.
2. **Úzká integrace do MathBoardu:** jedna aktivní aritmetická otázka,
   opakování, 15 s aktivního času, priority, vypnutí a zrušení. Testovací adapter
   musí umět nahrávku zpozdit nebo odmítnout bez úniku staré repliky.
3. **Rozšíření:** sekvenční boj, mazlíček, štít, obchod. Zkoušky v `GuildScene`
   a `CatacombTrialUI` mají vlastní prezentaci — připojit je výslovně,
   nepředpokládat, že změna MathBoardu je sama pokryje. Jen čtení, ne nápovědy.
4. **Porovnávání:** navázat na existující plánovač obrázkových pomocí, netvořit
   souběžné nesouvisející časovače. Aktuální konfigurace
   `comparison-learning.json` ukazuje první pomoc ihned pro prvních pět úloh
   a pak po 10 s; nový návrh 15 s je pro slovní pomoc, nikoli tichá náhrada
   této schválené vizuální mechaniky. Omezit současné události vhodnou prioritou.
5. **Obsahová výroba a pilot na zařízeních:** až po přejímce malého vzorku
   vytvořit zbytek nahrávek, manifest, limity cache a technické kontroly.
   Rozšířit na další minihry pouze po samostatném návrhu jejich interakcí.

## Přejímka

- Automaticky: 14,9 s / 15 s, odpověď těsně před hranicí, pomalé načtení,
  chybějící soubor, mute, změna otázky/hráče/scény, opakovaný restart, skrytá
  karta, pauza a návrat. Žádná opožděná replika k již jinému příkladu.
- Obsahově: všechny formy, obě pořadí operandů, záporný operátor versus pomlčka,
  přesná česká výslovnost, žádný tajný člen, vztah ani mezivýsledek.
- Herně: stejné první odpovědi, poškození a odměny s hlasem i bez něj;
  žádné automatické nápovědy ve zkoušce; správný vlastník v co-opu.
- Zrakem: stejné kroky s prose skrytou a zvukem vypnutým, desktop/tablet,
  Canvas/WebGL, reproduktor normální/stisknutý/vypnutý, bez překryvů.
- Poslechem: skutečný iPad/Safari a Android/Chrome, sluchátka i reproduktor,
  srozumitelnost vedle hudby a efektů. Emulace tabletového viewportu ani test
  `audio.play()` nepotvrzuje kvalitu výslovnosti a není fyzický playtest.

Výstupem pilotu má být rozhodnutí, zda děti čtení pomáhá, kdy je ruší a zda
15sekundové přeformulování podporuje porozumění. Nejde samo o sobě o důkaz
učebního účinku a zatím kvůli němu neměnit postup dětí do náročnějších dovedností.

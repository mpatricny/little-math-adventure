# Silverpond: první hratelný úsek

Stav k 7. září 2026. Osm hratelných místností, nikoli celá jedenáctimístnostní kapitola. Historické revize níže zachycují tehdejší obsah.

## Nejnovější úsek: vrak, podpalubí a nové UI

U07 skutečně propojuje zahradu a kanál; U08 je volitelné podpalubí. Boj hlídá dvě jednorázové truhly, nikoli průchozí cestu. Větší poštovní zámek kombinuje známé vztahy s jiným zápisem a má heslo KOTVA. Truhly dostaly společné smaltované kartičky a obrazové ikony, VictoryScene pevné bezpečné rozvržení a sladěné Pokračovat. Podrobnosti, přesné imagegen prompty a ověření jsou v [UNDERWATER_WRECK_AND_UI.md](UNDERWATER_WRECK_AND_UI.md). U09–U11 nejsou zatím přístupné. Následující oddíly dokumentují starší revize.

## Aktuální oprava mapové architektury

Po auditu všech jedenácti uzlů mají existující obrázky odpovídající počet fyzických spojení: mělčina 2, zvonice 4 běžné cesty + 2 příchozí proudy, zahrada 3, svatyně 2, kanál 4, komora 2. Čtyři pozadí byla upravena, mělčina a zahrada již počty splňovaly.

Návratové proudy ze svatyně a komory přímo do zvonice nyní fungují, každá cesta se otevře vlastní pečetí a má samostatné přijímací ústí i spawn. Jednosměrnost se týká pouze těchto volitelných zkratek; původní obousměrný návrat zůstává volný. Dveře do budoucí U10 a jeskyně U09 jsou viditelné, pevně uzavřené a neinteraktivní. Přímá spojnice zahrada ↔ kanál dočasně zůstává do výroby vraku. Úplná hratelná mapa tedy ještě dokončena není.

Počty, protějšky, hosty, bezpečné uložení a vizuální kontrola: [UNDERWATER_PASSAGES.md](UNDERWATER_PASSAGES.md). Nové sourozenecké bitmapy `bell-hub-passages.webp`, `sunken-canal-passages.webp`, `shell-shrine-passages.webp`, `current-chamber-passages.webp`; staré soubory zůstaly zachovány. Následující popis dvou pečetí zachycuje předchozí stav, před doplněním návratových proudů.

## Nový úsek: dvě pečetě a navazující vchody

- **Lasturová svatyně U04** navazuje na zahradu. Po obnovení zahradního proudu se odhalí zadní lasturový oblouk za jezírkem. Protější levý vchod ve svatyni má stejný lasturový motiv a výhled zpět do světlého zahradního nádvoří. Zpáteční cesta je vždy volná.
- **Komora proudů U06** navazuje na kanál. Po opravě čerpadla se otevře menší zadní kamenný vchod napravo od kola. Z komory vede zpět levý oblouk s mosazným potrubím a výhledem na architekturu čerpadla.
- Každý nový pár průchodů má společné datové `passage` ID, samostatný protější vstup a návratový bod. Při přechodu družina vpluje do skutečného otvoru a na druhé straně z něj vyplave. Reload a návrat z boje tuto příchodovou animaci neopakují.
- Svatyně nejdřív požaduje začátek známého dvoukrokového proudu, podruhé obrací pořadí přidání/ubrání a potřetí přenáší vztah na **dva cíle se společným začátkem**. Tři krátké etapy, šest promíchaných číselných perel, právě jedna správná volba. Šipka zpět přehrává opačné operace, neosadí odpověď. Tap i drag, chyby bez ceny a časového limitu.
- V komoře proběhne skutečný souboj s Mlýnským krunýřníkem a Ruinovým mlokem (`silverpond-chamber-keepers`, v co-opu třetí protivník podle katalogu). Potom tři dvoucestné výhybky přepojují dvě trasy mezi pevnými početními změnami. Jeden ovladač mění obě trasy. Hráč plán spustí; viditelné perly sledují stejný graf, který hra vyhodnocuje. Právě jedna platná kompletní konfigurace.
- Každý dokončený mechanismus svatyně/komory udělí trvalou pečeť, jednorázově 5 many a doplní zdraví. Pečetě se odvozují z již přiznaných mechanismů, nezabírají inventář a nelze je spotřebovat. Jejich dvě zásuvky jsou vidět na pilířích zvonice.
- `mechanismStages` je volitelné pole lokálního savu; po každé dokončené etapě svatyně se ukládá checkpoint. Není potřeba databázová migrace. Společné plánování nezvyšuje osobní počty matematických příkladů; ty dále pocházejí z jednotlivých odpovědí v reálných soubojích.
- Zámek má souvislou řadu původních lesních kovových rámů na **jednom patinovaném podkladu**. Hit plochy bubínků se nepřekrývají, rámy nemají prázdné mezery.

Nové layouty: `UnderwaterShellShrine`, `UnderwaterCurrentChamber`, `UnderwaterReverse`, `UnderwaterReverseSplit`, `UnderwaterRouting`. Všechny statické hosty, rozměry, hloubky a vstupy jsou v `scenes.json`. Nová obrazová data se načítají pouze s podvodní kapitolou.

Dosavadní přímé propojení zahrady a kanálu zůstává. Mapa, vrak, jeskyně, brána a boss zatím nejsou zpřístupněné. Návratové proudy byly následně doplněny podle auditu výše. Nevytváříme aktivní východy do neexistujících místností ani nepárové portály bez odpovídající architektury. K hubu lze z obou nových místností také bezpečně dojít přes jejich předchozí místnost.

### Kontrakt nových průchodů

| Výchozí místnost a otvor | Cílová místnost a protějšek | Odemčení | Společné ID |
|---|---|---|---|
| Zahrada: zadní lasturový oblouk za jezírkem | Svatyně: levý lasturový oblouk | Zahradní proud; zpět vždy | `garden-shell-arch` |
| Kanál: malý zadní oblouk napravo od kola | Komora: levý oblouk s potrubím | Čerpadlo kanálu; zpět vždy | `canal-pipe-arch` |

`exit.entry` musí odpovídat ID protějšího východu a vlastnímu spawn bodu v cílovém layoutu. Test kontroluje i blízkost spawn bodu k obrazu vchodu. Pevné stěnové mozaiky v obou nových místnostech nejsou další východy. Při rozšiřování kapitoly se nejdřív navrhne skutečný otvor a jeho protějšek, ne osamocený svítící hotspot na uzavřené zdi.

### Ověření dvou pečetí

- Před testováním ověřeno: změny nevyžadují žádné nezavedené databázové migrace. Existující klientské migrace učební historie se nemění.
- `npm test -- --silent`: **269 testů / 35 souborů prošlo**. Nové testy ověřují všechna pásma A–E, jediné řešení výhybek, neúvodní správné perly, páry průchodů, návazné spawn body, idempotenci pečetí, etapy a export/import rozpracované svatyně.
- Celá sada `npx playwright test --config e2e/underwater/playwright.config.ts`: **19 / 19 prošlo (15,3 minuty)**, včetně všech původních podvodních regresí. Produkční soubory ani servery se během běhu neměnily.
- `underwater-seals.spec.ts` přidává oba směry sólo průchodu, co-op s již získanou pečetí hosta B a tři Canvas dotykové rozměry. Boj komory skutečně odesílá odpovědi běžné matematické tabuli; nepoužívá debug zabití. Samostatný co-op průchod měl **164 odeslaných odpovědí** pro testovací profil. To není garantovaná délka boje pro každý profil ani doklad vzdělávacího účinku; skutečnou délku je třeba ověřit s dětmi.
- Vizuálně otevřeny snímky nových místností, průchodů a návratů, společného podkladu zámku, hoveru/otáčení/pointer-out, obráceného toku, přenosu na rozvětvení, chybné odpovědi, zkřížených tras a výsledků. Canvas 1280 × 720, 1024 × 768, 1280 × 800; navíc WebGL přes Playwright MCP. Snímky `artifacts/underwater/seals-*.png`. Kontroly rozměrů jsou doplněk, ne náhrada tohoto posouzení.
- Ověřeno zavření během přehrávání opačného toku, otáčení výhybky, pohybu perel i bubínku zámku; žádné hlášené runtime chyby. Výsledek po boji zachovává místo nepřítele. Reload uprostřed svatyně zachovává hotovou etapu. Získané pečetě lze dobrovolně přehrát bez opakované odměny.
- `npm run build` prošlo. Celoprojektový `npx tsc --noEmit` stále hlásí stejné existující problémy mimo podvodní soubory; tato iterace je neopravuje. `git diff --check` prošlo.
- Ukázka po MCP kontrole vrácena do menu. Hra na 8001 a editor na 5173 zůstaly spuštěné. Reálný Samsung a jeho GPU zatím nebyly otestovány.


## Jak spustit

- Hra: http://localhost:8001. Po aktualizaci obnovit stránku.
- V hlavním menu je místo zkratky „MOCK: CECHOVNÍ ZKOUŠKA“ tlačítko **PODVODNÍ ŘÍŠE · UKÁZKA**.
- Zkratka vytváří dočasného Průzkumníka (24 HP, útok 8, železný meč a štít, tři lektvary). Nevytváří slot, neuděluje skutečné postavě šupinu ani odměny. Po návratu do menu se obnoví původní stav; po reloadu ukázka začíná znovu. Vybavení umožňuje reprezentativně testovat i nové skupinové souboje.
- Ve skutečném Silverpondu se hráči se šupinou (včetně kompatibilních starých savů s dokončenou arénou 6) objeví **↓ PONOŘIT SE**. Tento průchod se ukládá do profilu a podporuje co-op.
- Cechovní zkoušky ve hře zůstaly; odstraněna je jejich testovací zkratka z menu.

## Hotový obsah

1. Zyxův krátký úvod „Šupina ti půjčí dech.“ s obrázkem šupiny a ikonou ponoru; první souboj zůstává.
2. Mělčina s plovoucí družinou, slovní truhlou (pět početních stop, řazení výsledků a heslo PROUD, 5 mincí + 3 many) a skutečným soubojem se Stříbroploutvým šupináčem. Dítě klepá přímo na objekty, ne jejich popisky.
3. Zatopená zvonice: jednosměrný proud z jedné mušle přes dvě místa pro perly do zvonu. Hráč plánuje dvě změny vybrané ze šesti perel; klikání i přetažení, potvrzení zvonem. Tři tóny postupně zapojí přičítání i odčítání. Všechny matematicky platné plány se uznávají. Žádný časový limit ani poplatek; chybu lze opravit. Skutečný profil používá své pásmo učiva, ukázka pásmo D (do 20).
4. Léčivý pramen zdarma: družina nejdřív dojde k prameni, pak doplní zdraví. Zřetelná zelená vektorová srdce se objeví nad postavami; nepoužívá se drobný fontový/emoji symbol.
5. Po třech tónech zvonice otevře **dvě rovnocenné větve**. Centrální průchod pod zvonem vede do Rákosové zahrady, pravý oblouk do Zatopeného kanálu. Zahrada obsahuje reálný boj s rybou a axolotlem, potom společný proud se třemi perlami a dvěma různými cíli. Obnova přidá 5 many a doplní zdraví.
6. Kanál obsahuje reálný boj s krabem a rybou, potom tři otočné ventily: nastavit změny tak, aby souhlasily všechny hodnoty podél potrubí. Teprve řešení spustí velké kolo. Samostatně přístupná slovní truhla má jiné heslo **PERLA**, kovový otočný zámek a odměnu 8 mincí + 4 many. Žádná truhla není odměněna pouhým otevřením dialogu.
7. Obnovení kteréhokoli mechanismu otevře obousměrnou zkratku zahrada ↔ kanál. V obou místnostech je vždy volný návrat do zvonice. Vyřešené mechanismy lze dobrovolně znovu zahrát, ale odměnu neopakují. Již získané tóny ve starších savech otevřou cesty bez opakování zvonu.
8. Sdílený HUD, kniha postavy a menu s fullscreenem. Osvětlené skutečné průchody, světlo na dlažbě a částice; družina vpluje do otvoru. Postavy jsou před světovými rekvizitami, ale pod HUD a modály.

Slovní truhly nyní znovu používají skutečné kovové rámy/bubínky lesního `SpinLockPuzzleScene` (místnost s hádankou o stole), včetně dvoufázové posuvné animace uvnitř výřezu. Počáteční písmena, nabídky i vzdálenosti od řešení jsou promíchané; neplatí „všude jednou nahoru“. Obě perlové úlohy mají pouze 1–2 správné celé plány a nabídka nezačíná hotovým řešením v prvních sousedních pozicích. Všechny platné plány se nadále uznávají.

## Ukládání a co-op

`player.underwaterProgress` je volitelné verzované rozšíření profilu. Starší savy nepotřebují databázovou migraci. Ukládá místnost/vstup, úvod, navštívené místnosti, poražené encountery, truhly a stav puzzle. Nová volitelná pole `restoredMechanisms`, `mechanismAttempts` a `position` zachovávají obnovené stroje, využití pomoci a pozici družiny. Export/import nový stav zachovává.

Výhra zapisuje poražený encounter společně s bojovou odměnou ještě před výsledkovou obrazovkou. Návrat z výhry umístí družinu k místu nepřítele, ne k původnímu vstupu. Zavření truhly postavu nepřemístí; i reload zachová uloženou pozici. Porážka vrací družinu do mělčiny s doplněným zdravím; truhly a puzzle se neresetují. Reload během boje obnoví místnost u nedokončeného střetu.

V co-opu svět určuje A. Ochrana jeho šupiny pokrývá B bez trvalého udělení příběhové odměny. Nové události se uloží oběma, každý dostane truhlu nejvýše jednou. Řešitel se střídá po dosažení tónu; opravy stejného plánu zůstávají témuž dítěti. Pouze první samostatný pokus se zapisuje řešiteli do učební historie a Denního pokroku. Pomoc a oprava dovolí postup v příběhu, ale nevytvoří další samostatně správný příklad. Plánovací čas se nepoužívá jako rychlost vybavení početního faktu. Běžný vstup do co-opu nově respektuje hostitelův region/checkpoint.

## Data a editor

- `public/assets/data/underwater-rooms.json`: propojení místností, ID objektů, podmínky cest a ne-bitevní odměna truhly.
- `scenes.json`: šest světových layoutů UnderwaterShallows, UnderwaterBellHub, UnderwaterReedGarden, UnderwaterSunkenCanal, UnderwaterShellShrine, UnderwaterCurrentChamber; dále UnderwaterOverlay, UnderwaterHandsOn (úvod), UnderwaterFlow, UnderwaterCurrents, UnderwaterPump, UnderwaterCipher, UnderwaterReverse, UnderwaterReverseSplit a UnderwaterRouting. Pozice, velikosti, hloubky a body pohybových tras. Městský host underwaterEntryHost.
- `underwater-puzzles.json`: počet kroků/karet, pásmo ukázky a pětiznakové heslo truhly. Nejde o volně proměnný počet UI slotů; změna počtů vyžaduje odpovídající layout.
- `encounters.json`: silverpond-shallows-guardian, silverpond-garden-patrol, silverpond-canal-blockade a silverpond-chamber-keepers pod volitelnou skupinou UnderwaterRoomScene, připojenou za stávající tři skupiny. Hra i editor nadále čtou původní v3 dokument bez této skupiny. Runtime a ProductionEncounterAdapter používají stejný katalog, včetně co-op pravidel. V sólo mají souboje za zvonicí dva protivníky, v co-opu tři.
- Scene Editor http://localhost:5173: **Encounters → Underwater**. Editace sestavy je ověřena jednotkovým testem; běžící hru je po změně encounterů potřeba obnovit.

## Výtvarný základ

Šest pozadí z vestavěného imagegen, zkontrolovaných a exportovaných jako WebP 1280 × 720: `shallows.webp`, `bell-hub.webp`, `reed-garden-v2.webp`, `sunken-canal.webp`, `shell-shrine.webp` a `current-chamber.webp` v `public/assets/images/underwater/`. Původní zahrada `reed-garden.webp` zůstává zachována, její nová varianta doplňuje zadní vchod. Rekvizita `pump-impeller.webp` má jednotné měřítko a rotuje fyzicky jako celé kolo. Zámek doplňuje nový transparentní `lock-backing.webp`. Načítají se až při vstupu pod vodu; při chybě je k dispozici opakování i návrat do menu.

Přesné prompty, zdrojové soubory a znovupoužité prvky: [UNDERWATER_ASSET_PROMPTS.md](UNDERWATER_ASSET_PROMPTS.md). Postavy zatím používají existující idle v pohybující se auře a truhla je znovupoužitý lesní asset. Finální plavecké animace a speciální podvodní truhly nejsou součástí této iterace.

## Ověření předchozí čtyřmístnostní revize

- `npm test`: **249 testů prošlo**, včetně všech pásem A–E, omezení perlových řešení na 1–2 plány, jediné konfigurace ventilů, různých počátečních poloh zámků, uložení, pomoci a bezpečného rozvržení.
- `npm run test:e2e:underwater`: **13 testů prošlo**. Obsahují oba celé směry nových větví, skutečné řešení obou soubojů, skutečný co-op boj, nezávislé učební záznamy a odměny, návrat po prohře, pozici po výhře/truhle/reloadu, příchod k prameni a dvě sady vizuálních kontrol pro 1280 × 720, 1024 × 768 a 1280 × 800. Starší co-op test první místnosti stále zkracuje boj debug cestou, nový co-op test kanálu nikoli.
- V každém kompletním sólo průchodu novými větvemi testovací profil zadal **62 bojových odpovědí**, všechny zůstaly v učební historii. Jde o ověření konkrétního profilu s útokem 8, železným mečem a štítem, ne garantovaný počet pro každé dítě. Tempo animací je v automatizovaném boji zrychlené; nejde o studii obtížnosti ani účinnosti učení.
- Scene Editor: v předchozí iteraci prošlo 26 testů katalogu/store/ukládání a `npx tsc --noEmit`. Nyní jednotkové testy hry ověřují všechny nové hosty a shodu produkčních sólo/co-op rosterů se simulátorem.
- `npm run build` prošlo. Celoprojektový `npx tsc --noEmit` hry není čistý: hlásí existující chyby v ostatních scénách/testech; nové podvodní soubory nemají hlášené typové chyby. Tyto nesouvisející opravy nejsou součástí této iterace.
- Vizuální kontrola přes Playwright MCP a otevřené snímky: nová zahrada/kanál, skutečná lesní předloha zámku, otočné bubínky, ventily, nápověda a zpětná vazba, příchod/léčení, sólo i co-op boj. Canvas snímky `branches-canvas-*`, průchody `branches-sp_*`, WebGL `final-webgl-*` v `artifacts/underwater/`. Vizuální efekty v modálech jsou omezené, aby nepřekrývaly rám a zavírací tlačítko. Všechny nové statické hosty zůstávají v editoru.
- Skutečný Samsung tablet, výkon GPU a dlouhé hraní celé kapitoly zatím nejsou otestované.

Závěrečná kontrola rychlého zavření během otáčení odhalila dobíhající tween ventilu nad již zničeným textem. Modál nyní zruší i tyto tweens; scénář je v každé nové tabletové vizuální sadě a byl zvlášť ověřen přes Playwright MCP v WebGL, stejně jako rychlé zavření bubínku truhly. Ukázka po kontrole skončila zpět v menu. Hra zůstává na 8001 a editor na 5173.

## Revize UI po prvním playtestu

První vizuální kontrola byla nedostatečná: původní dialogový rám byl deformovaný,
texty puzzle zasahovaly do okraje nebo mimo rám a dřevěné ovládání neodpovídalo jezeru.
Tyto snímky nejsou schváleným vizuálním vzorem.

Aktuální podoba znovu používá existující modrý smalt, perly a jemné zlaté hrany
z odměny jezerní víly. Kompletní rám i tlačítka mají vždy jednotné měřítko,
truhla už se nenatahuje do čtverce. Odpovědi jsou velké kruhové perly;
nepřístupné větve mají nenápadné označení místo aktivních tlačítek.
Všechny pozice zůstávají v editoru. V této první revizi nebyly generovány nové bitmapy; následující interakční revize přidává tři rekvizity.

`modalSafeAreaHost` určuje skutečný prostor uvnitř ozdob. Text, portrét,
instrukce, příklad, odpovědi, zpětná vazba a akce mají oddělené oblasti.
`UnderwaterUI.auditLayout()` ověřuje renderované rozměry, překryvy,
proporce bitmap a shodu textové/texturní resolution. Test úmyslně poruší
geometrii a resolution, aby doložil, že ochrana tyto chyby odhalí.

Kontrola snímků navíc odhalila chybu Canvas fallbacku: pozdní Phaser
`setResolution(2)` zvětšil skutečnou kresbu textu 2× bez změny jeho logických
rozměrů. Resolution se nyní zadává při vytvoření textu — i ve sdílených
komponentách HUD, knihy a tlačítek, které kapitola používá. WebGL vzhled se
tím nemění. Automatické vizuální průchody explicitně používají Canvas;
WebGL je kontrolován samostatně přes Playwright MCP.

Revidované snímky: `artifacts/underwater/qa-*-intro*.png`, `qa-*-hub.png`,
`qa-*-puzzle.png`, `qa-*-wrong.png`, `qa-*-correct.png`, `qa-*-complete.png`,
`qa-*-hover.png`, `qa-*-pressed.png` a `qa-*-notice.png`.
Ověřeny jsou dlouhé české texty, diakritika, stavy po dotyku, neaktivní odpovědi
a návraty mezi obrazovkami. Automatické kontroly nejsou schválením estetiky;
snímky je nutné skutečně otevřít a posoudit.

## Předchozí interakční revize: méně čtení

Následující popis zachycuje první verzi; dvě mušle a obrázkovou rybu nahradila plánovací revize uvedená výše a níže.

Textové akce nad scénou nahradily `UnderwaterHotspot` objekty. Aktivní objekt
pulzuje i bez hoveru (tablet), při ukázání či dotyku zvýší světlo. Průchody
rozsvěcují vnitřek skutečné architektury a podlahu, nikoli čárový obrys oblouku.
Název místnosti po příchodu sám zmizí. První ryba se spouští přímo dotykem.

`UnderwaterBellPuzzle` staví počet perel ve dvou mušlích. Jedna krátká věta,
čísla a animované gesto nahrazují vysvětlující odstavce a nabídku odpovědí.
Podpora tap/drag, odebrání perly, jeden záznam na zazvonění, automatický nový
příklad a zrušení časovačů při zavření jsou ověřené dotykovými testy.
V co-opu se aktuální řešitel ukazuje portrétem; tři dosažené tóny jsou vidět
i v samotné zvonici. Nezavádí se žádný časový požadavek ani poplatek.

„Puzzle word chest“ je zde interpretováno jako otočný písmenný zámek známý
z lesa. Nový vodní vzhled má rybu místo textové hádanky, čtyři kolečka a
volitelnou pomoc odhalující jedno písmeno. Mince a mana se připíší pouze po
otevření, již vybrané truhly zůstávají vybrané i ve starých savech.

Skill imagegen dodal tři nové bitmapové rekvizity (zvon, opakovaně použitá
mušle, porost blokující nedokončený průchod). Rám zůstává kanonický rám víly.
Přesné prompty, cesty originálů, výstupy a normalizace jsou v
[UNDERWATER_ASSET_PROMPTS.md](UNDERWATER_ASSET_PROMPTS.md).

Aktuální snímky: `artifacts/underwater/review-final-{chest,hub,bell}.png`
(WebGL) a `hands-{1280x720,1024x768,1280x800}-*.png` (Canvas).
Kontrolovány otevřením snímků, nikoli jen výpočtem rozměrů. Nový guard navíc
hlídá, aby rekvizity uvnitř modálu nezasahovaly do ozdobného rámu.
225 jednotkových testů a šest browser průchodů prošlo; dodatečný co-op test
kontroluje přepnutí portrétu na B. Fyzický Samsung stále vyžaduje playtest.

## Plánovací revize po dalším playtestu

Dvě mušle navozovaly vyrovnávání vah. Nahrazuje je jeden zdroj a směrovaný tok
přes dva kroky ke zvonu. Před spuštěním dítě předpovídá výsledek; teprve pak
uvidí průběžné hodnoty. Další tóny používají kombinaci přičtení a odečtení.
Slovní zámek už neukazuje obrázek odpovědi: pět různých výsledků určí pořadí
písmen PROUD. Nápověda rozkrývá výsledky, nikoli hotový zámek.

Nová malovaná perla `pearl-nacre.webp` nahrazuje barevné kruhy v zásobě,
osazených místech, animaci i světlech postupu. Vytvořena přes skill imagegen
ve vestavěném režimu; přesný prompt a normalizace v assetovém protokolu.
Nové layouty jsou samostatné editorové scény UnderwaterFlow a UnderwaterCipher.
Jejich děti se řadí podle hloubek hostů, nejen podle pořadí vytvoření.

Dlouhodobý návrh podle dodaného pedagogického dokumentu je samostatně v
[SILVERPOND_LEARNING_DESIGN.md](SILVERPOND_LEARNING_DESIGN.md). Nové větve,
opravy čerpadla, rybí výhybky, odložené procvičování a boss nejsou v této iteraci
implementovány. Současný učební záznam už odlišuje první samostatný pokus od
opravy/nápovědy a odděluje plánovací čas od metrik rychlosti. Stav hry se
neresetuje a změna nevyžaduje databázovou migraci.

Snímky této revize: `artifacts/underwater/learning-webgl-*.png` a
`learning-{1280x720,1024x768,1280x800}-*.png` (Canvas).

Závěrečné ověření revize: **233 jednotkových testů, 7 prohlížečových testů
a produkční build prošly**. Čtvrtý funkční test výslovně ověřuje, že oprava
prvního chybného plánu i následující tón s nápovědou neposkytnou falešné
samostatně správné odpovědi. Vizuální testy běží v Canvas rendereru; přes
Playwright MCP byly navíc pořízeny a otevřeny snímky WebGL včetně pokročilého
plánu, zpětné vazby a nápovědy truhly. Celoprojektový TypeScript check stále
hlásí chyby mimo podvodní soubory; není označen za úspěšný. Fyzický Samsung
nebyl vzdáleně ovládán ani otestován. Hra na 8001 a editor na 5173 zůstávají
spuštěné, skutečné save sloty nebyly tímto playtestem přepsány.

## Další iterace

Ověřit šest místností s dítětem na skutečném tabletu, zejména srozumitelnost nových vstupů a délku co-op boje. Další výrobní krok: volitelný vrak U07 a podpalubí U08 s nalezenými početními stopami, které se automaticky shromáždí u jiného otočného zámku. Nejdřív navrhnout odpovídající páry vstupů a teprve podle nich vytvořit prostředí. Mapka, proudové návraty, jeskyně, finální strážce, velký krystal a finální vodní animace zůstávají v [SILVERPOND_UNDERWATER_PLAN.md](SILVERPOND_UNDERWATER_PLAN.md).

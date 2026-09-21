# Podvodní říše: audit průchodů podle mapy

7. září 2026. Zdroj: mapa v [SILVERPOND_UNDERWATER_PLAN.md](SILVERPOND_UNDERWATER_PLAN.md). Počítáme fyzická spojení, tedy i přijímací ústí jednosměrných proudů; fontánka, uzavřená stěnová mozaika ani uložení vodního kola nejsou další cesty.

## Cílové počty pro všech jedenáct místností

| Místnost | Fyzická spojení | Protější místa | Stav obrázku |
|---|---:|---|---|
| U01 Mělčina | 2 | povrch, zvonice | Zkontrolováno, změna není potřebná |
| U02 Zvonice | 6 | mělčina, zahrada, kanál, brána; dvě příchozí ústí ze svatyně a komory | Čtyři cesty, z toho cesta do brány krytá porostem do získání obou pečetí; dvě příchozí ústí |
| U03 Zahrada | 3 | zvonice, svatyně, vrak | Pravý průchod vede k levému zahradnímu oblouku vraku |
| U04 Svatyně | 2 | zahrada; jednosměrný návrat do zvonice | Přidán pravý lasturový tunel |
| U05 Kanál | 4 | zvonice, komora, vrak, jeskyně | Malý skalní vstup do jeskyně je otevřený; pravý průchod vede k vraku |
| U06 Komora | 2 | kanál; jednosměrný návrat do zvonice | Přidán pravý mosazný tunel |
| U07 Vrak | 3 | zahrada, kanál, podpalubí | Hotovo: dva boční kamenné oblouky a prostřední dřevěné dveře v trupu |
| U08 Podpalubí | 1 | vrak | Hotovo: jeden levý dřevěný otvor, uzavřený zadní prostor |
| U09 Jeskyně | 1 | kanál | Levý kamenný oblouk, ostatní stěny uzavřené |
| U10 Brána | 2 | zvonice, srdce jezera | Malý levý oblouk zpět; monumentální pravý oblouk do ponoru |
| U11 Srdce jezera | 1 | brána | Levý stoupající tunel zpět; svislá průrva uprostřed je scenérie, nikoli druhý východ |

Aktualizace 8. září: zapojeno všech jedenáct pozadí. Ponor U10 → U11 je filmový přesun po stejné hraně mapy, nikoli další rozcestí. Zpáteční průchod zůstává krátký.

## Přiřazení nových otvorů

Rozměry a hloubky jsou v `scenes.json`, ne v kódu. Níže jsou souřadnice středu otvoru v obrazu 1280 × 720, upravené podle skutečně vygenerované architektury, nikoli pouze podle promptu.

| Layout / host | Střed | Význam a stav |
|---|---|---|
| UnderwaterBellHub / exitDepthsHost | 423, 405 | Oblouk do U10, odemkne se oběma pečetěmi |
| UnderwaterBellHub / arrivalShellHost | 80, 480 | Přijímací lasturové ústí z U04, bez zpětné navigace |
| UnderwaterBellHub / arrivalCurrentHost | 1206, 480 | Přijímací mosazné ústí z U06, bez zpětné navigace |
| UnderwaterShellShrine / exitReturnHost | 1188, 421 | Lasturový tunel. Porost zmizí a světlo se zapne po pečeti A |
| UnderwaterCurrentChamber / exitReturnHost | 1169, 410 | Mosazný tunel. Porost zmizí a světlo se zapne po pečeti B |
| UnderwaterSunkenCanal / exitGrottoHost | 357, 410 | Otevřený skalní vstup do U09 |
| UnderwaterGlowGrotto / exitCanalHost | 155, 365 | Zpět do kanálu |
| UnderwaterDepthGate / exitBellHost | 154, 396 | Zpět do zvonice |
| UnderwaterDepthGate / exitHeartHost | 1052, 364 | Po hlídce vede do souvislého ponoru |
| UnderwaterLakeHeart / exitGateHost | 166, 363 | Stoupající tunel zpět k bráně |

Návratové proudy se shodují na obou koncích materiálem a tvarem: lasturový → lasturový, mosazný → mosazný. Ve zvonici hráči vyplavou k bodům `shrine_return` (205, 550) a `chamber_return` (1100, 558). Původní obousměrné vchody do zahrady/kanálu zůstávají zachovány a jsou volné i bez pečeti. Nezavádíme povinné jednosměrné pokračování.

V `underwater-rooms.json` jsou přijímací ústí oddělena jako `arrivals`, nikoli falešné východy. Dočasné `plannedExits` pro jeskyni a bránu byly nahrazeny skutečnými cestami. Příchozí ústí nezískávají silný navigační glow. Stávající ID místností zůstávají; nová pole checkpointu jsou volitelná, žádná databázová migrace není potřeba.

Spojnice zahrada ↔ kanál nyní vede přes U07 se zachováním starých vstupních ID. Vrak má otevřené boční cesty a hlídané prostřední dveře do podpalubí; zpět z U08 lze vždy. Trojice párů nese ID `garden-wreck-arch`, `canal-wreck-arch` a `wreck-timber-door`. Souřadnice hostů: vrak zahrada (101, 418), kanál (1162, 420), podpalubí (775, 421); podpalubí vrak (205, 346). Výroba a ověření: [UNDERWATER_WRECK_AND_UI.md](UNDERWATER_WRECK_AND_UI.md).

## Výtvarná výroba a kontrola

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

Vestavěný skill **imagegen**, přesné úpravy původních čtyř obrázků. Původní soubory zůstaly zachovány; produkce používá sourozence `*-passages.webp`. Poměr stran byl zachován při jednotném převodu 1672 × 941 → 1280 × 720, WebP kvalita 88. Žádné nové texty, ovládací prvky ani postavy nejsou zapečené do pozadí.

Prompty a přesné cesty: [UNDERWATER_ASSET_PROMPTS.md](UNDERWATER_ASSET_PROMPTS.md), sekce „Map passage corrections“.

Otevřením zkontrolovány všechny čtyři nové bitmapy a obě ponechané původní. Ve hře přes Playwright MCP: uzavřený/otevřený tunel svatyně i komory, zvýraznění, stisk, obě příchodové pozice a celek zvonice. Snímky `artifacts/underwater/passages-webgl-*.png`. Automatická sada `underwater-passages.spec.ts` prochází šest místností ve WebGL, dvou tabletových Canvas rozměrech a co-opu, řeší skutečné puzzly pro odemčení cest a kontroluje uložení i neaktivní konce. Fyzický Samsung stále vyžaduje playtest.

`UnderwaterPassages.test.ts` přímo počítá hrany původního Mermaid plánu a porovnává je se všemi aktuálními fyzickými hosty, včetně příchozích a rezervovaných otvorů. Tato kontrola nenahrazuje vizuální posouzení obrázku.

### Výsledek ověření této opravy

- `npm test -- --silent`: **274 testů / 37 souborů prošlo**.
- `underwater-passages.spec.ts` + `underwater-branch-visual.spec.ts`: všech **7 různých scénářů prošlo**. První společný běh skončil 6 úspěchy a timeoutem posledního co-op scénáře při počátečním čekání na MenuScene; samostatné opakování stejného co-op testu beze změny kódu prošlo. Není to tvrzení o čistém prvním běhu celé sady.
- Nové průchody jsou ověřeny skutečným vyřešením obou puzzlů, odemčením porostu, průchodem do správného přijímacího ústí a uložením vstupu pro oba hráče. Boje se v této sadě znovu neřeší; jejich dřívější testy tato oprava nenahrazuje.
- Vizuálně posouzeny i Canvas snímky kanálu, zamčené komory a návratu ve 1024 × 768, svatyně ve 1280 × 800 a oba co-op návraty. Nové otvory nepřekrývají mechanismy či nepřátele, postavy zůstávají před rekvizitami.
- `npm run build` prošlo. Žádná hlášená typová chyba v podvodních souborech; projektový typecheck stále obsahuje známé chyby mimo tuto opravu. Cílený `git diff --check` upravených textových souborů prošel. Celorepozitářový diff přes nesouvisející LFS databázi nebyl pod read-only `.git` oprávněním použit.
- Playwright MCP neměl hlášené runtime chyby a dočasná ukázka skončila zpět v menu. Servery 8001 / 5173 nebyly restartovány.

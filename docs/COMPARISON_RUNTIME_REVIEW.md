# Vizuální a funkční kontrola krokodýla

21. 9. 2026. Kontrola skutečné hry po zapojení schváleného návrhu;
[popis chování](COMPARISON_IMPLEMENTATION.md). Nejde o kontrolu HTML prototypu.

## Dokončení herního zapojení (21. 9. 2026)

Aktuální pravidlo nahrazuje dřívější čtyřsekundovou / ubývající podporu uvedenou
v historických kontrolách níže: pět zodpovězených číselných úloh má všechny tři
krokodýlí připomínky hned, další po deseti aktivních sekundách. Připomínky jsou
popisky voleb, nepředstavují dopočtený výsledek a neblokují postup ke zkoušce.

Ověřeno v produkčních scénách s oddělenými testovacími profily:

- Rychlé kapitolové úlohy bez početního klíče nabíjejí rychlostní ukazatel.
  Dokončení ukazatele opravdu zvýší útok proti HP nepřítele. Ukázky a zkoušky
  bonus nepřidávají; štít má svůj rychlý dvojnásobný blok.
- Hranice páté / šesté číselné odpovědi, přesné čekání 10 000 ms, uložení
  a načtení. Útok, mazlíček i štít čerpají aktuální etapu kapitoly.
- Cech vybere zkoušku z dosaženého pokroku, načte osm různých porovnání,
  uloží pokusy a medaili. Následují skutečné výzvy plynulosti a mistrovství:
  obě po deseti úlohách, po každém úspěchu liška skutečně +1.
- Katakomby po studeném vstupu mají všechny obrázky; žádná závislost na
  předchozí návštěvě souboje. Chyba, vypršení času a souběžný callback
  zapisují pouze jeden neúspěch a neudělují odměnu.
- Co-op: oba mazlíčci se správnou vlastní silou, skutečným rychlostním bonusem,
  poté štíty proti oběma nepřátelům pro A i B. Odpovědi a počítadla nápovědy
  patří jen vlastníkovi. Automatické výzvy přijímají i další smíšené procvičování.

Nová sada `e2e/learning/comparison-integration.config.ts` má šest scénářů:
čtyři průchody v Canvasu / WebGL, co-op a neúspěšný průchod katakombami.
Všechny prošly. Tři scénáře skutečného mobilního co-opu také prošly. Cílené
unit kontroly včetně starých savů, progrese, katakomb, layoutů a vyvážení
všech rotací prošly (70 testů); devět kontrol pilotních dat a pilotní build
rovněž. Před testy prověřeno: změny nevyžadují databázovou migraci.
Plný TypeScript check stále hlásí předchozích 142 výskytů (99 různých diagnostik),
bez nové odchylky. Dvanáct dosavadních regresních scénářů tabule také prošlo;
jeden byl zopakován po opravě testu, který po pomalém screenshotu očekával
zamčenou odpověď i v již otevřeném následujícím příkladu.

Skutečně prohlédnuté snímky v `artifacts/comparison-integration/`:
`webgl-speed-1`, `canvas-pet-question`, `canvas-exam-overview`,
`canvas-catacomb-0-count`, `webgl-catacomb-1-expression`,
`webgl-catacomb-win-1`, `catacomb-wrong-0`, `catacomb-failed`, `coop-A-shield`.
Přes Playwright MCP navíc `mcp-catacomb-intro`, `mcp-catacomb-question`,
`mcp-catacomb-hover`, `mcp-catacomb-pressed`, `mcp-catacomb-correct` a
`mcp-catacomb-pointer-out-tablet`. Zkontrolovány oddělené oblasti, poměry
obrázků, světlé vyplněné znaménko, prázdný slot, společný pohyb volby a ikony,
krátké instrukce i vypnuté volby. Rozsah je tato kapitola a její návaznosti;
nejde o novou vizuální přejímku všech starších obrazovek hry.

## Kontrola co-opu

Nové scénáře `e2e/learning/comparison-coop.spec.ts` procházejí produkční souboj
dvou samostatně uložených profilů přes skutečný lokální WebSocket relay a mobilní
ovladač. Testovací kontexty mají vlastní úložiště; uživatelské profily se nemění.
V jednom průchodu má Ada pásmo A a Borek pásmo E, oba čtyři smíšené úlohy.
Sestavení úloh, vyhodnocení, útoky, přepnutí hráče a zápisy zůstávají produkční.
Nepřátelé mají v testu zvýšené HP, aby oba hráči stihli dokončit své sady;
čas rychlé/pomalé odpovědi je řízený pro jednoznačné ověření bonusu.

Ověřeno:

- Prázdná políčka a menší volby u obou hráčů; oba pokročilé porovnávací formáty.
- Přesně jeden dokončovací callback za útok, správná/chybná odpověď, oddělené
  rychlostní ukazatele a počty chyb. Mobil skutečně odesílá odpovědi do souboje.
- Obrana obou hráčů při střídání cíle nepřátel. Chyba poškodí správnou postavu,
  štít nenabíjí útočnou energii a pokus patří do správného profilu.
- Přepnutí z běžné smíšené sady prvního hráče do krokodýlí lekce druhého.
  Čtyřsekundová nápověda dorazí i na mobil; pomoc a posun čekání se uloží
  pouze druhému hráči a přežijí obnovení stránky.
- Také dosavadní kontrola pauzy/rušení nápovědy v co-opu a obě kontroly many:
  jména, prahy, efekty, společná odměna i pro již skončeného spoluhráče,
  samostatné počty správných odpovědí a jediné připsání odměny do obou savů.

Opravena drobnost v `BattleScene`: během zadání na mobilu se nyní zobrazuje
skutečné jméno aktivního spoluhráče; u prvního dříve chybělo a druhý byl „Hráč 2“.
Po opravě znovu prošly všechny tři nové scénáře. Celkem prošlo šest co-op E2E
scénářů, 47 cílených unit testů a pilotní build. Databázová migrace není potřeba.

Vizuálně prohlédnuté podklady v `artifacts/comparison-coop/`: `canvas-A-mixed`,
`canvas-B-mixed`, `webgl-B-mixed`, obě rendererové varianty `A-shield`, `B-shield`,
`A-phone`, `B-phone`, dále `webgl-B-chapter-hints`, `webgl-B-chapter-phone-hints`
a `mcp-phone-long-name`. Poslední je izolovaný náhled dlouhého jména přes
Playwright MCP; přenos odpovědí ověřují síťové E2E scénáře. Pro many prohlédnuty
`artifacts/mana-qa/canvas-coop-results.png`, `webgl-coop-results.png`
a `webgl-coop-gain-1.png`. Kontrola se týká těchto změn, nikoli nové přejímky
všech starších herních obrazovek.

## Následné zmenšení voleb ve smíšených sadách

Na žádost autora jsou znaky `<`, `=` a `>` na řádkových tlačítkách MathBoardu
o dalších 10 % menší. Přes Playwright MCP ověřen poměr 0,9 u všech tří znaků
(šířka 39,508 → 35,5572 herních bodů); rámečky a dotykové plochy se nemění.
Oba dosavadní scénáře smíšených sad prošly v Canvasu i WebGL. Vizuálně znovu
prohlédnuty snímky v `artifacts/comparison-style/`: `mcp-mixed-smaller`,
`canvas-mixed-four` a varianty `canvas-` / `webgl-` pro `hover`, `pointer-out`,
`pressed-correct`, `wrong-equality` a `complete`. Znaky mají více místa uvnitř
rámečků, bez překrytí ve zkontrolovaných stavech.

## Sjednocení běžného a pokročilého porovnávání

Navazující úprava nahrazuje kolečko prázdným přerušovaným políčkem také mimo
krokodýlí lekci. Platí pro smíšený MathBoard, jednopříkladovou obranu, cechovní
zkoušky, katakomby a mobil. Zůstávají celé výrazy na obou stranách i všechny
tři členy vlevo. Běžná sada se nepřepíná na postupnou lekci a nezískává její
nápovědu. Číselné odpovědi a běžná rovnítka v aritmetice se nemění.

Volby používají kresbu znaků z kapitoly, velikost podle skutečného rámu a společný
pohyb se dřevěnou plochou. Ozdobná tlačítka zachovávají rezervu pro kovový okraj.
Vložený znak má výšku přibližně shodnou s číslicemi. Na tmavé tabuli se kreslí
světlou barvou přímo, protože Canvas nepodporuje tint obrázku. Klikací plocha
malých odpovědí má na tabletu šířky 1024 px alespoň 44 CSS px na výšku.

Ověření:

- 16 cílených unit testů (formátování, kapitola a podpora), tři kontroly závislostí
  scén a osm kontrol pilotního obsahu. Pilotní build prošel.
- Pět nových prohlížečových scénářů v `e2e/learning/comparison-style.spec.ts`:
  čtyři běžné/smíšené úlohy, oba pokročilé formáty, správná/chybná odpověď,
  jediné dokončení sady, obrana, skutečná zkouška pásma E, skutečné katakomby
  a mobilní ovladač. Canvas 1024 × 800 a WebGL 1280 × 800; mobil 390 × 844.
- Po posledních změnách znovu prošly oba scénáře řádků a dotykových ploch;
  po úpravě kontrastu prošly oba scénáře katakomb. Obě dosavadní krokodýlí
  zkoušky také prošly s kontrolou velikosti uvnitř rámečku.
- Přes Playwright MCP bylo změřeno 6968 aktuálně vygenerovaných porovnání
  z pásma A–E. Nejdelší z každého pásma byly přímo zobrazeny v šestičlenné
  sadě a vizuálně zkontrolovány. Původní čtyři příklady zůstávají současně vidět.
- Žádná potřebná databázová migrace. Celková kontrola TypeScriptu nadále hlásí
  starší chyby; proti stavu před úpravou nepřibyla nová diagnostika.

Prohlédnuté snímky v `artifacts/comparison-style/`: `canvas-` i `webgl-`
varianty `mixed-four`, `advanced-four`, `hover`, `pointer-out`, `pressed-correct`,
`wrong-equality`, `complete`, `shield`, `guild`, `catacomb` a `catacomb-revealed`;
také `mobile-advanced` a `mcp-longest-six`. Při kontrole bylo opraveno odsazení
od dřevěného okraje, překrytí značek správnosti s čísly a velikost znaků v
ozdobných tlačítkách. Výsledné porovnání se vejde do plochy, znak je čitelný
a slot prázdný. Starší textové výsledky běžných zkoušek nejsou touto kontrolou
nově schválené a nebyly předmětem této úpravy porovnávacích zadání.

Příklady: [čtyři příklady](../artifacts/comparison-style/webgl-mixed-four.png),
[pokročilé výrazy](../artifacts/comparison-style/webgl-advanced-four.png),
[mobil](../artifacts/comparison-style/mobile-advanced.png),
[světlý znak v Canvasu](../artifacts/comparison-style/canvas-catacomb-revealed.png).

## Oprava pergamenu v dalším arénovém souboji

Následný hlášený problém byl reprodukován ve druhém i třetím souboji bez
obnovení stránky. `Texture.add()` v Phaseru přepnul výchozí frame sdílené
textury `ui-math-board` z celého obrázku 1424 × 832 na první nově přidaný
roh 170 × 90. Spouštěčem bylo první zobrazení štítu nebo porovnávání.
Další instance běžného MathBoardu potom roztáhla tento roh na celou tabuli.

`SequentialMathView` nyní řeže výslovně z `__BASE` a po přidání dílů obnoví
celý obrázek jako výchozí frame. Oprava nemění layout, soubojové vyhodnocení
ani uložený postup. Databázová migrace není potřeba. Již otevřená hra
vyžaduje obnovení stránky kvůli starému kódu a textuře v paměti.

Nový regresní scénář před opravou selhal na rozměru i identitě textury.
Po opravě prošel v Canvas (1024 × 800) a WebGL (1280 × 800): tři navazující
souboje přes skutečnou obrazovku vítězství a arény, obrana v prvním a třetím,
porovnávání ve druhém. Kontroluje celý výchozí obrázek a devět platných
dílů bez přibývání framů. Pokračování čeká na připravenost ovládání ve hře,
nikoli pevnou prodlevu. Prošly také oba dosavadní scénáře rychlostního bonusu
a štítu a nový pilotní build (`/tmp/lma-parchment-pilot`).

Vizuálně prohlédnuto: [druhý souboj WebGL](../artifacts/comparison-game/webgl-parchment-arena-2.png),
[druhý souboj Canvas](../artifacts/comparison-game/canvas-parchment-arena-2.png),
[porovnávání](../artifacts/comparison-game/webgl-parchment-comparison-2.png),
[opakovaná obrana WebGL](../artifacts/comparison-game/webgl-parchment-shield-3.png)
a [Canvas](../artifacts/comparison-game/canvas-parchment-shield-3.png).
Další vytvoření tabule bylo přímo ověřeno přes Playwright MCP a
[jeho snímek](../artifacts/comparison-game/mcp-parchment-recreated.png).
Pergamen má celé okraje i střed; pro tuto opravu nezůstala vizuální závada.

## Následná vizuální úprava a štít

Podle připomínek autora jsou nestejná jablka v poměru 2:1 v obou rozměrech,
odpovědní tlamy a čisté znaky mají 90 % původní velikosti a první lekce má
o 30 % delší pohyby i pauzy. Čekání na nápovědu 4/8/16/24/vypnuto se nemění.

Patička obsahuje samostatný host bonusu. Rychlý běžný příklad doplní dosavadní
energii pod životy; dvě nejrychlejší odpovědi v ověřovacím scénáři naplnily
čtyři políčka a daly celkem 3 body síly (dva za úlohy, jeden za naplnění).
Štít používá stejný pergamen, jeden známý příklad a přehled příchozího útoku
a bloku. Ověřený štít síly 3 proti útoku 9 zablokoval 6/3/0 bodů při rychlé,
pomalé/chybné odpovědi; nezapsal dvojí odpověď ani útočnou rychlostní energii.
Další útok nezdědil obranné popisky ani bonus.

Prohlédnuté snímky této úpravy:

- [Zřetelně různé velikosti](../artifacts/comparison-game/canvas-stage-1.png),
  [menší tlamy při hoveru](../artifacts/comparison-game/canvas-hover-0.png),
  [čisté znaky](../artifacts/comparison-game/canvas-stage-4.png),
  [shodná velikost](../artifacts/comparison-game/canvas-equal-0.png).
- [Rychlostní bonus na tabletu](../artifacts/comparison-game/canvas-speed-bonus-0.png),
  [naplnění ukazatele](../artifacts/comparison-game/webgl-speed-bonus-1.png),
  [zadání obrany](../artifacts/comparison-game/canvas-shield-quick-question.png),
  [rychlá obrana](../artifacts/comparison-game/webgl-shield-quick-answer.png).

Dva nové scénáře rychlosti a štítu prošly v Canvas i WebGL. Celá rozšířená
sada deseti herních scénářů prošla. Po této úpravě prošlo také 18 cílených
unit testů, osm kontrol pilotního balíčku a pilotní
build. Změna nevyžaduje novou databázovou migraci.

## Provedené ověření

- 69 unit testů v osmi souborech: podpora 4/8/16/24/vypnuto, návrat po každé
  chybě, první odpovědi, hydratace starších savů, kapitola, co-op, zkoušky,
  katalog textur, poškození a obrana.
- Osm scénářů v `e2e/learning/comparison.spec.ts`: čtyři obrázkové kroky v
  Canvas/WebGL, skutečný útok s bonusovým příkladem meče a uložením postupu,
  oddělená podpora hráčů v co-op, pauza aktivního času, rušení starých callbacků,
  oba renderery zkoušky, mobilní obrázkové volby a shoda původního/postupného
  vyhodnocení sady. Dvojí vstup během zpětné vazby nezapisuje další odpověď.
- Rozšířené vizuální průchody zahrnují normální stav, hover, opuštění plátna,
  stisk přecházející do disabled, chybu, správnou odpověď, rovnost a dokončení
  sady. Testy používají 1280 × 800, tablet 1024 × 800 a ovladač 390 × 844.
- Osm kontrol pilotního balíčku a tři kontroly závislostí scén. Pilot skutečně
  obsahuje oba nové layouty a všech pět SVG, včetně přímého vstupu do cechu.
- `npm run build:pilot -- --outDir /tmp/lma-crocodile-pilot` prošel. Zůstávají
  dosavadní upozornění bundleru na velikost chunků a kombinované importy.
- Změna používá lokální save a jeho aditivní hydrataci; před testy byla
  ověřena absence potřebné serverové databázové migrace.

Prohlížečové testy běžely v izolovaném Chromium přes místně nainstalovaný
Playwright a vlastní Vite na portu 8017. Playwright MCP měl profil obsazený;
uživatelský profil ani server na portu 8001 nebyl ukončován. Fixture hlídá
výjimky prohlížeče a `console.error`.

## Prohlédnuté obrázky

Snímky se při testu obnovují v `artifacts/comparison-game/`. Kontrola sledovala
skutečné proporce, prázdný vztah, stejnou velikost počítaných kusů, shodu počtů
s číslem, oddělené oblasti tabule, společný pohyb symbolu s tlačítkem a text
omezený na krátké popisky. Příklady kontrolovaných snímků:

- [Úvod s tlamou](../artifacts/comparison-game/webgl-intro-mouth.png),
  [velikost na tabletu](../artifacts/comparison-game/canvas-stage-1.png),
  [počet](../artifacts/comparison-game/webgl-stage-2.png),
  [předměty a čísla](../artifacts/comparison-game/canvas-stage-3.png).
- [Nápověda nad třemi volbami](../artifacts/comparison-game/hints.png),
  [chybná první odpověď](../artifacts/comparison-game/canvas-wrong-3.png),
  [stisk a zablokované volby](../artifacts/comparison-game/webgl-pressed-disabled-2.png),
  [rovnost](../artifacts/comparison-game/canvas-equal-3.png),
  [dokončená sada](../artifacts/comparison-game/webgl-batch-complete-3.png).
- [Zkouška v Canvasu](../artifacts/comparison-game/canvas-exam-number.png),
  [zkouška s počty](../artifacts/comparison-game/webgl-exam-count.png),
  [obrázková oprava](../artifacts/comparison-game/canvas-exam-feedback.png),
  [výsledky](../artifacts/comparison-game/canvas-exam-results.png).
- [Mobilní nápověda](../artifacts/comparison-game/remote-hints.png),
  [mobilní předměty s čísly](../artifacts/comparison-game/remote-objects.png).

Kontrola zachytila a opravila přetrvávající hover po opuštění plátna, příliš
malou plochu tlačítka „Ukázka“, chybějící layouty v pilotním exportu,
nepodporovaný gradient pergamenu v Canvasu a diagonální šev ve WebGL.
Starý textový výpis výsledků kapitoly byl nahrazen osmi velkými značkami
a odměnami s ikonami. Mobilní počty mají rezervovanou výšku pro zarovnání
číslic. Bitmapy zachovávají poměr stran; pergamen používá autorovaný
9-slice. Texty používají konstruktorové `resolution: 2`; shoda rozlišení
textury a textového stylu je také ověřena v běžícím MathBoardu.

## Meze kontroly

`npx tsc --noEmit` zatím není zelený kvůli již přítomným chybám repozitáře
(mimo jiné nepoužité členy a nullable hodnoty v BattleScene a starší testové
typy). Nebyly zahrnuty do této úpravy. Cílené testy a produkční build prošly.

Jde o kontrolu implementace a vizuálního chování, nikoli o dokončený playtest
s dětmi. Předčtenářská pravidla zůstávají povinná pro celou hru; tato kontrola
nepotvrzuje splnění všech starších obrazovek mimo upravenou kapitolu.

## Opakování kontroly

```sh
npx playwright test --config e2e/learning/comparison.config.ts
npm run test:pilot-content
node --test scripts/__tests__/scene-assets.test.mjs
```

Do kapitoly vede vývojová zkratka hlavního menu **TEST: POROVNÁVÁNÍ**.
Po změně závislostí obrázků je vhodné restartovat starší běžící Vite, aby
obnovil manifest načítání scén. Produkční build jej vytváří znovu automaticky.

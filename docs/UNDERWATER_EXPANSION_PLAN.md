# Podvodní nepřátelé a návaznost obtížnosti

Zadání: 4. listopadu 2026. Navázat podvodní bojovou část na poslední vlnu
stříbrorybníkové arény, rozlišit silnější varianty obrazem a přidat dva nové
druhy. Realizaci kódu a vyvážení zpracovává GPT-6.1 Sol xhigh, vizuály
GPT-6 Astra xhigh; výsledky procházejí samostatnou revizí hlavního agenta.

## Výchozí stav

- Referenční vlna `silverpond-arena-3-wave-5`: tři medúzky, každá
  32 HP / útok 9 / obrana 5. Co-op zvyšuje HP každé na 44.
- Běžné podvodní souboje mají v sólu 18–58 HP a součet útoků 5–12.
  Perlový štít jejich tlak při správných odpovědích téměř ruší.
- Strážce hlubin má tři fáze s 86 HP dohromady a dvěma mezifázovými
  léčeními hráče po 20 %. Hodnoty fází mají přednost před základním
  záznamem nepřítele.
- Stávající simulátor řeší protivníky postupně; runtime nechává útočit
  všechny přeživší. Pro vyvážení skupin je nutný odpovídající model.

## Pracovní plán

1. **Výtvarné zdroje.** Pancéřový koník (`silverpond_armored_seahorse`)
   má dlouhý rypec, svislé zahnuté tělo a žádné paže. Runová loděnka
   (`silverpond_rune_nautilus`) má výraznou spirálovou ulitu a krátká
   chapadla. Oba navazují na malovaný smalt, perleť a zlato Silverpondu.
   Silnější varianty označuje společný zlatý znak se třemi krystaly,
   rozpoznatelný i bez textu a barevného rozlišení.
2. **Výroba animací.** Po vizuální revizi kanonických obrázků vygenerovat
   skutečná Sorceress image-to-video idle/attack/defend/defeat videa.
   Posoudit celý zdroj včetně extrémů před extrakcí. Every 4, původní RGB,
   konzervativní alfa, jednotná transformace rodiny, 512px WebP a runtime
   aliasy podle `ASSET_CREATION.md`. Nepoužívat deformaci statického obrázku.
3. **Bojová návaznost.** Původní arénové druhy a sestavy zachovat.
   Silnější varianty zapsat do společného `enemies.json`; souboje a bossovy
   fáze do `encounters.json`. Zahrada a kanál mají srovnatelnou obtížnost,
   hlubší souboje přidávají výdrž nebo tlak. Brána prodlužuje boj, volitelný
   vrak zasahuje tvrději; nejde o růst každé metriky v každé místnosti.
   Dva nové druhy rozmístit do této návaznosti. Zachovat léčení, checkpointy,
   učební postup i kompatibilitu uloženého postupu.
   Pod vodou použít samostatnou co-op politiku: ponechat dva protivníky
   a zvýšit jejich HP na 1,55násobek se zaokrouhlením nahoru, místo přidání třetího. Model prokázal, že tři útoky
   v jednom kole příliš snadno vyřadí slabšího spoluhráče. Lesní a arénová
   pravidla zůstanou zachována; editor musí nové pravidlo umět zachovat.
4. **Ověření.** Deterministicky porovnat celé sestavy s referenční arénou
   přes produkční katalog a společné bojové formule. Zahrnout sólo/co-op,
   různé vybavení, přesnost, rychlost, mazlíčka, bossovy fáze a léčení.
   Revidovat délku i utržené poškození, nikoli pouze součet HP.
   Poté ověřit skutečnou hru a všechny nové animace přes Playwright,
   desktop WebGL a tablet Canvas, s izolovanými profily.

## Podmínky přijetí

- Dva nové druhy mají úplné animace ze skutečného video modelu,
  kontrolované zdroje a dohledatelný výrobní manifest.
- Silnější varianty jsou jasně rozlišitelné ve světě i v souboji.
- Nové prvky zachovávají proporce, nepřekrývají postavy ani ovládání,
  mají editorové hosty a splňují `UI_PRE_READER_GATES.md`.
- Vyvážení má reprodukovatelné výsledky pro sólo i co-op; případné
  omezení modelu je výslovně zaznamenáno.
- Nejsou změněny cizí rozpracované úpravy ani skutečné hráčské savy.
- Tato úprava místních herních dat a assetů nevyžaduje databázovou migraci.
  Rozpracované analytické migrace nesouvisejí s izolovanými herními testy.

## Zapojený výsledek

Oba nové druhy, jejich silnější varianty a konečné sestavy jsou zapsané
v produkčních datech. Pět silnějších variant původních druhů má útok 10;
nové druhy a jejich varianty mají útok 9 a odlišnou výdrž/obranu. Arénové
a lesní sestavy zůstaly zachované. Původní arénová medúzka má nadále
32 HP / útok 9 / obranu 5 a odměnu 5–25.

| Místnost | Aktuální protivníci |
|---|---|
| Mělčina pod molem | 2× hlubinný šupináč |
| Rákosová zahrada | Hlubinný šupináč + hlubinný mlok |
| Zatopený kanál | Hlubinný rak + pancéřový koník |
| Komora proudů | Hlubinný krunýřník + runová loděnka |
| Vrak poštovní lodi | Hlubinný rak + hlubinný mlok |
| Světélkující jeskyně | Hlubinná medúzka + runová loděnka |
| Brána hlubin | Hlubinný koník + hlubinná loděnka |
| Srdce jezera | Strážce hlubin ve třech fázích |

Silnější tvorové mají společný zlatý znak se třemi krystaly ve světě
i vedle bojového ukazatele HP. Znak nepotřebuje slovní popisek a má
samostatné hosty v `scenes.json`. Editor zachovává hodnost, vazbu na
základní druh, geometrii a novou co-op politiku. Porážka silnější varianty
stále odemyká původní druh, pokud má existující definici mazlíčka.
Nové adoptovatelné mazlíčky toto zadání nepřidává.

Čerstvý audit finálních produkčních dat obsahuje 500 běhů na scénář,
bez dosažení limitu kol. V referenčním sólu má první střet 7,9 kola
a 31,4 utrženého poškození proti 8,1 kola a 30,0 v závěru arény.
Brána má 9,8 kola / 27,6 poškození; boss 12,9 / 40,3.
Jde o konkrétní model výbavy a odpovědí, nikoli předpověď každého dítěte.

Co-op ponechává dva protivníky, jejich HP násobí 1,55 a zaokrouhluje
nahoru. Bossovy fáze používají 1,35. Zkoušela se i nestejně silná dvojice,
obě pořadí větví, cesta bez lektvarů a skutečné checkpointy. Výrazně slabší
spoluhráč může padnout i při vítězství družiny; oba výsledky jsou vedené
odděleně. Vyšší útok u brány byl zamítnut, protože tuto dvojici poškozoval
příliš. Podrobné výsledky a omezení jsou v [UNDERWATER_BALANCE.md](UNDERWATER_BALANCE.md).

## Výroba a revize

Kanonické obrázky a znak vytvořil vestavěný imagegen pod vedením Astry;
prompty jsou v `public/assets/images/concepts/underwater-expansion/PROMPTS.md`.
Animace pocházejí ze skutečných Sorceress videí. První dva útočné záběry
byly celé zamítnuté kvůli oříznutým efektům; schválené náhradní záběry
používají fyzický pohyb bez těchto efektů.

Výsledkem je osm pohybů a 78 produkčních snímků při 6 FPS. Každý druh má
jeden společný výřez a měřítko přes všechny pohyby, průhledné 512px buňky,
WebP s přesnou alfou a potřebné aliasy attack/hurt/death. Konzervativní
odstranění zeleného lemu zachovává alfu i neprůhlednou barevnost.
Zdrojová videa, extrahované snímky, světlé/tmavé kompozity a celé výsledné
sekvence schválila Astra i hlavní agent před registrací.

Výrobní metadata mají SHA256
`c153af0f1509b7adacd5a699a2cac596ddbd5a2879d82ddf02b509e095dfed9a`.
Ověřovací protokol váže schválení na všech osm přesných WebP souborů.
Postup a záznamy jsou v [UNDERWATER_CREATURE_ANIMATIONS.md](UNDERWATER_CREATURE_ANIMATIONS.md)
a ignorovaném `artifacts/sorceress/underwater-expansion/`.

Přístupový klíč je ve stálém ignorovaném lokálním souboru s oprávněním
600; původní odkaz už vede na toto umístění. Není uložený v dočasné
složce, skriptech, dokumentaci ani výrobních manifestech.

## Ověření

- 195 cílených testů ve 22 souborech prošlo nad finálními daty.
- Ověřovač produkčních animací prošel všemi 78 snímky i po registraci.
- Editor prošel 60 cílenými testy, buildem a vizuální kontrolou desktop/tablet.
- Sedm podvodních místností, úplný třífázový boss v sólu/co-opu a návrat
  osvobozeného strážce byly ověřené v izolovaných herních profilech.
- Dotykový průchod se skrytými slovy a vypnutým zvukem ověřil vstup
  do boje, útok a první správnou odpověď.
- Všechny tři nové E2E průchody prošly: desktop WebGL sólo, tablet Canvas
  sólo a tablet Canvas s nestejně silnou dvojicí. Čtyři místnosti, celé
  animace, skutečné vítězství u brány, pokračování a návrat do světa;
  postupně 49, 49 a 82 skutečných odpovědí, bez přímého udělení poškození.
- Astra schválila celou výslednou vizuální matici; hlavní agent samostatně
  posoudil kanál, komoru, jeskyni a bránu včetně tabletového co-opu
  a nového průchodu bez čtení. Záznamy jsou
  `artifacts/underwater/new-species-*.png`, zejména
  `new-species-sp_depth_gate-true-true-world.png`,
  `new-species-sp_depth_gate-true-true-battle.png` a
  `new-species-mcp-pre-reader-{world,battle}.png`.
- `npm run build:dev` prošel (Vite, 9,57 s). Jde o vývojový build,
  nikoli tvrzení, že prošel celorepozitářový TypeScript check.
- Síťový audit všech tří průchodů a samostatného MCP ověření potvrdil,
  že všechny požadavky na backend, dev savy a diagnostiku zachytila
  lokální testovací izolace; žádný neprošel do skutečného úložiště.

Databázová migrace není pro tuto změnu potřeba. Cílené kontroly nepoužívají
backend ani skutečné savy. Celorepozitářové starší TypeScript chyby mimo
tento rozsah nejsou prohlášené za opravené. Po změně dat je nutné hru
znovu načíst, aby nepoužívala starý katalog z paměti.

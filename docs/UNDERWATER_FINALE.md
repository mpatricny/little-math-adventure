# Srdce jezera — závěrečná hratelná část

8. září 2026. Navazuje na U01–U08, původní mapu a zásady v `SILVERPOND_LEARNING_DESIGN.md`.

## Zapojený obsah

- **U09 Světélkující jeskyně:** volitelný boj s medúzkou, potom prostorový paprsek přes čtyři zrcadlové lastury. Dvě rozsvícené perly a dosažení cíle jsou obě nutné. Jedno řešení z 256; nápověda odvozuje jeden krok ze skutečných pravidel. Požehnání ztlumí první silnou vlnu každého obránce v každém pokusu o bosse.
- **U10 Brána hlubin:** vstup ze zvonice vyžaduje obě trvalé pečetě. Hlídka krunýřník + šupináč, potom bezplatná fontánka a návratový bod. Zpět do zvonice lze vždy.
- **Ponor:** přibližně 21 sekund včetně přechodů. Souvislé pozadí 1280 × 2274, plynulá spline, ryby, bubliny a postupně tmavší/fialové prostředí. Kamera projede více než dvě výšky herní obrazovky. Kliknutí/dotyk nebo šipky vlevo/vpravo ovládají boční pohyb. Srážka s rybou ubere 1 HP, nejvýše do posledního zbývajícího HP, s úvodní ochrannou dobou a krátkou nezranitelností po zásahu. Postavy A/B zůstávají samostatnými objekty a zranění se ihned ukládá správnému profilu. **Klidný ponor** vypne zranění, ale zachová celý průjezd; nezapisuje výhru ani odměnu. Přerušení před koncem ponechá save u brány. Zpáteční cesta je krátká.
- **U11 Srdce jezera:** přírodní průrva místo další chrámové síně, jeden skutečný návratový tunel. Strážce má tři fáze z `encounters.json`. Druhá fáze oznamuje silnější vlny předem. Každý obránce má vlastní počítadlo, takže co-op střídání nepřenáší všechny silné útoky na jediného hráče. Třetí fáze nemá skrytou podmínku přesnosti nebo časový limit. Mezifázové léčení používá vlastní maximum HP každého žijícího hráče.
- Po vítězství čeká krystal jako samostatná interakce. Příznak `depthCrystalClaimed` brání dvojímu získání, nevyužívá omezený inventář spotřebních krystalů. Hráč může pokračovat v průzkumu nebo se vrátit na povrch; s krystalem navazuje návštěva Zyxovy lodi a jeho vložení do stroje (viz `SECOND_CRYSTAL_RETURN.md`). Zyx v cechu už neposílá držitele krystalu znovu na dno.
- Všechny skutečné vchody mají výrazné klidové světlo a samostatnou přídavnou světelnou vrstvu pro hover/stisk. Zavřené cesty a přijímací ústí zůstávají vizuálně odlišné.

## Učení a data

Boje používají existující matematické úlohy a evidenci jednotlivých hráčů; prostorový puzzle nepřidává fiktivní příklady. Volitelná odbočka pomáhá, ale není zámkem hlavní cesty. Nově připojený spoluhráč může získat právě vyřešené požehnání bez kopírování historického boje hostitele.

`scenes.json` je autoritou pozic, velikostí a hloubek, včetně dráhy ponoru a přechodových panelů. Encounters zůstávají ve společném katalogu a nepřátelé v `enemies.json`; regionální kopie rosterů nevznikla. `tidalWave` je volitelná validovaná část boss profilu. Editorová práce s ostatními poli ji zachovává, speciální ovládání této volitelné sekce nebylo přidáno.

Nové volitelné save položky: `restPoint`, `descentSeen`, `depthCrystalClaimed`, `litHubSeals`, `revealedPassages`. Poslední dvě evidují dokončené odhalovací animace, nikoli podmínky herního postupu. Přerušená animace se může přehrát znovu, již dokončená nikoli. Ověřena absence požadavku na databázové migrace před testy; staré savy se nevymazávají.

### Pečetě a nápovědy

- Získaná pečeť se nejprve objeví zvětšená, rozsvítí se a přesune na své místo. Ve zvonici se nově přinesené pečetě rozsvěcují postupně; po druhé vedou světelné perly k bráně a rostliny se přibližně 2,8 sekundy rozpadají. Ovládání světa během odhalení čeká, aby hráč nepřešel dál dříve, než uvidí souvislost.
- Všech sedm typů podvodních puzzlů používá společné nápovědy: po **30 sekundách aktivně otevřené hádanky**, za **1 měděnou minci**. Odpočet se během stejné návštěvy místnosti zachová při zavření a otevření; po opuštění/reloadu se začíná znovu. Nápověda se neúčtuje při zamčení, nedostatku mincí ani tehdy, když už nemá co ukázat. Co-op účtuje profil řešitele. Optika jen zvýrazní další zrcadlo, sama je správně neotočí.
- Ladění: `public/assets/data/underwater-puzzles.json` a `src/data/underwater-descent.json`. Cena/odpočet i odhalovací scéna mají samostatné hosty v `scenes.json`.

## Výtvarný stav a omezení

Nová prostředí a druhý krystal vznikly pomocí skillu imagegen, s existujícími obrazy jako výtvarnými referencemi. Přesné prompty: [UNDERWATER_FINALE_PROMPTS.md](UNDERWATER_FINALE_PROMPTS.md). Bitmapy zachovávají poměry stran; ovládání používá existující modrý smalt/perly, text zůstává v kódu.

**Medúzka i nepřátelský strážce nyní používají produkční animace ze skutečných Sorceress videí.** Po výslovném schválení uživatelem bylo dokončeno AutoSprite zpracování všech deseti bojových klipů. Medúzka má idle/attack/defend/defeat, strážce navíc samostatný vodní a krystalový útok pro druhou a třetí fázi. Bojové rodiny mají 98 normalizovaných průhledných snímků; přehrávání všech pohybů bylo posouzeno na desktopu i tabletovém Canvasu a ověřeno v celém sólo/co-op souboji. Osvobozený strážce nyní dostal další vlastní přátelské idle video (13 snímků); po vítězství odplave stranou nad cestu, aby nepřekrýval hráče ani krystal. Zdroje, zpracování, rozsah vizuální kontroly a ověření: [UNDERWATER_CREATURE_ANIMATIONS.md](UNDERWATER_CREATURE_ANIMATIONS.md). Nebylo použito deformování bitmap ani falešné video.

## Ověření

- `npm test -- --silent --reporter=dot`: **292 testů / 40 souborů prošlo**. Součástí je export/import nového checkpointu a krystalu, jediné řešení optiky, brány, jednorázová odměna, co-op katalog a kontrakt názvů boss UI hostů.
- `npm run build` prošlo. Projektový `tsc --noEmit` stále hlásí starší chyby mimo novou implementaci (nepoužívaná pole, nullability, chybějící Node typy a staré typy uložených dat). Žádná nová hlášená chyba v podvodních třídách, novém boss HUD, katalogu nebo upraveném battle docku. Cílený whitespace/diff check prošel.
- Dvě sady finále/checkpointů: **8 scénářů prošlo v jednom běhu**, včetně všech 11 pokojů v idle/hover/pressed/pointer-out, reálných bojů v U09/U10, celého ponoru a všech tří boss fází v sólo i co-opu, obnovení hry před vyzvednutím odměny a optiky v Canvas/WebGL. Následně **4 aktualizované scénáře finále prošly znovu**, tentokrát co-op v Canvas 1280×800 bez volitelného požehnání.
- Poslední sólo průchod zaznamenal **58 skutečných bojových odpovědí**, co-op **102**, u samostatných profilů. To není požadované minimum ani obecný výsledek vyvážení: test používá útok 8, železné vybavení, 55 HP a bezchybné odpovědi. Dětský playtest, různé vybavení a chybovost zůstávají důležité.
- První vizuální běh zachytil lámání popisku přeskočení a přesah potvrzení optiky do rámu; opraveno. Následující průchod zachytil nesoulad názvů mezifázových hostů; opraveno a přidán regresní kontrakt. Odhalený starší problém velikosti čísla lektvarů byl opraven constructorovým `resolution: 2`. Nejde o tvrzení, že všechny první pokusy prošly.

### Skutečně posouzené obrazy

Artefakty v `artifacts/underwater/`: `finale-map-idle-review.jpg` (všech 11 místností), jednotlivé `finale-map-*-idle/hover/pressed/out.png`, zejména kanál, zvonice, jeskyně a brána; `finale-false/true-descent-top/middle/bottom.png`, vstup do srdce, boss battle, obě mezifázové karty, osvobozený strážce a odměna. Optika: `finale-false/true-light-normal/wrong/solved.png`.

Obrazy byly otevřeny a vizuálně posouzeny, ne pouze automaticky vyfotografovány. Kontrola zahrnovala proporce, oblast uvnitř rámů, čitelnost světla a textu, rozdíl hoveru a dotykové stavy. Playwright MCP nebyl v aktuální sadě nástrojů dostupný; použita projektová Playwright sada v izolovaném prohlížeči a přímé prohlížení jejích snímků. Fyzický Samsung nebyl ovládán ani testován. Žádný hráčský save ani běžící server nebyl kvůli testům resetován.

Regresní kontroly starších místností: **10 scénářů `underwater-passages` + `underwater-wreck` prošlo v jednom běhu** (7 minut), včetně skutečného odemčení pečetí, všech návratových proudů, vraku, co-op odměn, zámků a kompletních stavů vítězné obrazovky ve WebGL a obou tabletových rozměrech Canvas. Starý test jeskyně byl změněn z očekávání neaktivního otvoru na skutečný průchod do U09 a zpět; ostatní podmínky odemykání zůstaly zachované. Celkem tedy ověřeno 18 různých E2E scénářů v oddělených sadách, nikoli tvrzení o jediném prvním čistém běhu všech testů.

Hra nadále poslouchá na `*:8001`, Scene Editor na `*:5173`; oba původní procesy byly ponechány běžet.

Dodatečný běh obou optických testů prošel i s explicitními snímky hover/stisk/pointer-out potvrzení, nápovědy, zavření a zrcadla (`finale-*-light-*-hover/pressed/out.png`). Zkontrolovány zejména aktivní potvrzení, stisk zavření a opuštění zrcadla v Canvas; geometrie zůstává stabilní, texty a ovladače jsou uvnitř rámu.

### Ověření interakcí a odhalování (8. září, navazující úprava)

- Poslední jednotkový běh: **295 / 41 souborů prošlo**, včetně uložení/exportu/importu prezentačních příznaků, placení nápověd, minimálního HP a geometrie. Poslední build prošel; zůstávají upozornění na velikost chunku a smíšený statický/dynamický import MasterySystem.
- **4 scénáře průchodů prošly**: sólo WebGL, Canvas 1024×768 a 1280×800, co-op. Následně **5 interakčních scénářů prošlo** v jednom běhu: postupné pečetě a brána na desktopu i skutečném Canvas tabletu, skutečný 30sekundový odklad nápovědy, platba bez změny zrcadla, platba pouze řešitele B, dotyk/šipky/kolize a klidný ponor. **Šestý samostatný scénář** ověřil přesunutou nápovědu čerpadla v Canvasu včetně normálního, zamčeného, hover, stisknutého, pointer-out a použitého stavu.
- V prvních kontrolách byly nalezeny a opraveny: dobíhající callback odpočtu po zničení modalového textu, nedostatečná výška hostu ceny a nulová výplň ztmavovací vrstvy pečeti. Testy tyto stavy nyní kontrolují; nešlo o první bezchybný běh.
- Otevřené a posouzené snímky: `interaction-seal-false/true.png`, `interaction-kelp-false/true.png`, `interaction-open-false/true.png`, `interaction-hint-locked/used.png`, `interaction-coop-hint.png`, `interaction-descent-hit.png` a `interaction-pump-disabled/hover/pressed/out/used.png`. Zkontrolováno rozsvícení, vazba pečetí na bránu, čitelnost ceny uvnitř rámu a stabilní geometrie ovladače. Zdrojové kontaktní přehledy všech deseti Sorceress videí byly posouzeny samostatně. Následnou kontrolu průhledných spritesheetů v souboji dokumentuje `UNDERWATER_CREATURE_ANIMATIONS.md`.
- Běžící hra `*:8001` a editor `*:5173` zůstaly na původních procesech. Testy používaly vlastní izolované profily, nikoli dětské savy. Fyzický Samsung nebyl ovládán.

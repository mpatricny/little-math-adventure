# Hráči, mapa a denní pokrok — review 12. 11. 2026

Rozsah: R1, R4 a R5 z `UI_REFRESH_REQUIREMENTS_2026_11_12.md`. Návrh a implementace vycházejí z `AGENTS.md`, `ASSET_CREATION.md` a `UI_PRE_READER_GATES.md`. Návody a boj mají samostatné review dokumenty.

## Funkční revize 17. 11. 2026 — libovolný den historie

Tato revize nahrazuje původní sedmidenní chování denního přehledu. Zachovává rám a jeho opravené odsazení z 13. 11.; nejde o nové rozsáhlé estetické přijetí. Datovou obnovu a význam historických záznamů popisuje samostatně `DAILY_PROGRESS_REVIEW_2026_11_17.md`.

- Horní pruh **CELKEM** používá `DailyProgressSystem.getSummary`, tedy všechny doložené odpovědi, správné výsledky a jejich procento. Také čítač v přehledu hráčů má výslovný popisek CELKEM a nepoužívá starý `totalAttempts`.
- Vybraný **DEN** má úplné datum a čtyři hlavní karty: Čas hry, Příklady, Úspěšnost a Trénuje teď. Pátá zachovaná metrika **Průměr správně** má vlastní klidný pruh. Skutečný čas hry se nezaměňuje s průměrem správných odpovědí; historický neznámý čas je Neměřeno, chybějící průměr je pomlčka.
- Trénuje teď zobrazuje matematický rozsah a operaci z aktuálního plánu, respektuje `requiredBand` a aktivní kapitolu Porovnávání. Nejde o úroveň postavy ani o rekonstruovanou úroveň z historického dne. Rozsah a operátory zůstávají viditelné i při listování starým datem.
- Historie používá týdny Po–Ne, šipky o týden a návrat DNES. Lze dojít ke všem dostupným datům; první týden vychází z evidované historie. Budoucí dny a posun za aktuální týden jsou neaktivní. Změna prohlíženého hráče zachovává vybraný den, takže lze porovnat stejné datum; nemění hráče na tahu.
- Veškeré nové statické hosty jsou v `DailyProgressLayout` a souhrnové hosty v `PlayersHubLayout` v `scenes.json`. Čtyři karty a samostatný pruh průměru mají vlastní svislé oblasti. Spodní historie končí na y = 588 a zachovává skutečný odstup od zlatých rohových ornamentů. Žádné nové grafické assety nevznikly.

`e2e/profiles/daily-history.spec.ts` ověřuje izolované umělé profily na čerstvém serveru **8133**, desktop WebGL a tablet Canvas. Jednopoložkové pracovní okno a úmyslně nesprávný legacy čítač nesmějí přepsat archivní součty 805/699 a 1176/1000. Scénář klikáním projde starší týdny, historický i nulový den, osobní přepínač a návrat DNES; kontroluje známý čas hry, neznámý historický čas, zachovaný průměr správných odpovědí, skutečnou matematickou úroveň a nezměněného aktivního hráče B. Součástí jsou chybějící textury, bezpečné hranice textu a konstruktorové rozlišení textu v obou rendererech. API, vývojová synchronizace a diagnostika jsou zachyceny v testovací paměti. Tento UI průchod nečetl ani nezapsal skutečné profily, nepoužil port 8001 a nepotřeboval DB migraci.

Příkaz `npx playwright test --config e2e/profiles/playwright.config.ts daily-history.spec.ts --timeout 180000`: **2/2 prošly za 23,8 s**. Po doplnění povinného snímku bez slov/zvuku byl zopakován jen Canvas příkazem `npx playwright test --config e2e/profiles/playwright.config.ts daily-history.spec.ts --grep canvas --timeout 180000`: **1/1 prošel za 16,6 s**, již s finálním sloučením historických dat. `git diff --check` prošel. Kontrola `tsc --noEmit` stále nachází dřívější chyby repozitáře mimo upravené UI moduly; v `DailyProgressOverlay` a `PlayersHubScene` žádnou chybu nehlásí. Široká sada testů se nespouštěla.

Implementující agent skutečně prohlédl tyto nové snímky v `artifacts/daily-history-2026-11-17/`: `today-webgl.png`, `today-canvas.png`, `old-day-webgl.png`, `other-player-webgl.png`, `other-player-canvas.png`, `empty-day-webgl.png`, `empty-day-canvas.png`, `hub-canvas.png` a `today-no-prose-canvas.png`. Na nich jsou čitelné součty i dlouhé jméno, oddělené časy, prázdný den s pomlčkou a celý spodní týden bez překryvu rámu. Bez slov a zvuku zůstávají portrét, přepínací šipky, datumy, počty, operátory a odlišení časových údajů hodinami a značkou správné odpovědi. Tyto snímky jsou dokladem izolovaného UI, nikoli dokladem provedení obnovy skutečných rodinných dat.

## Revize 13. 11. 2026 — ornamenty a posuvník

**Původní estetické přijetí z 12. 11. je zrušeno a nahrazeno touto revizí.** Autorovy výřezy ukázaly, že krajní spodní tlačítko překrývalo zlaté listy u tyrkysového kamene a tenká modrá čára mapy neodpovídala stylu panelu. Původní obdélník `safeContent` a úspěšné funkční testy tento problém neodhalily; nejsou dokladem estetického přijetí.

Změny jsou omezené na rozložení přehledu hráčů, mapy, dne a mapový posuvník:

- Spodní akce v přehledu končí na y = 590 (při stisku 592), místo 626. Jejich krajní dosah je x = 165 až 1115. Karty a souhrn byly uspořádány tak, aby nad ovladači zůstaly samostatné mezery; text ani portréty nebyly deformovány.
- Historie dne končí na y = 588 a leží mezi x = 165 a 1115. Odměny a titulek historie mají vlastní místo nad kartami. Zvlášť se kontrolují skutečné spodní rohové listy a kameny, nikoli pouze vnější okraje bitmapy.
- Mapa má obsah x = 140 až 1100, y = 165 až 547. Legenda je v samostatném pruhu s volným pergamenem nad spodním ornamentem. Po dalším review má pás výšku 116 px a `rowGap` 14 px ve scénových datech: tři celé pásy mají 376 px a vejdou se do 382px viewportu včetně počtů. Koncová mezera za posledním pásem se nepočítá do obsahu, takže celé tři pásy zůstanou vidět i na konci posuvu. Karty zůstávají vysoké 106 px, symboly ani písmo se nezmenšily. Detail se vejde do výšky viewportu; sloupce a rozestupy řádků mají editorové hosty/data.
- Posuvník mapy má samostatný 22px široký vizuální host, zaoblenou pergamenovou dráhu se zlatým okrajem a tyrkysový jezdec. Barvy, inset a nejmenší délka jsou v `scenes.json`, načítané přes `SceneBuilder`. Výška jezdce odpovídá viditelnému podílu obsahu; oba konce respektují vnitřní odsazení. Jezdec lze přímo táhnout se zachováním místa uchopení a klik na volnou dráhu posune obsah. Stabilní průhledný editorový hit host má šířku 56 herních px, tedy 44,8 CSS px na ověřeném tabletu. Kolečko funguje i nad touto dráhou, obsah zůstává dotykově posuvný. Skrytá mapa nereaguje a zánik panelu zničí hit host i handlery. `ScrollablePanel` přijímá tento vzhled a ovládání volitelně; ostatní odběratelé včetně zkoušek zůstávají beze změny.

Nové důkazy jsou v `artifacts/ui-refresh-v2/profiles/`. Implementující agent skutečně prohlédl `hubCoop-pressed-webgl.png`, `hubCoop-pressed-canvas.png`, `hub-eight.png`, `hub-empty.png`, `coop-canvas.png`, `day-webgl.png`, `day-canvas.png`, `map-webgl.png`, `map-scroll-end-webgl.png`, `map-scroll-end-canvas.png` a `map-subtraction-canvas.png`. Na těchto snímcích je vidět volný pergamen před spodními ornamenty i během stisku, samostatná legenda, celý detail a nový posuvník. Původní snímek mapy s třetím pásem uříznutým přes počty nebyl při druhém review přijat a následně jej nahradilo rozložení se třemi celými pásy; další obsah ukazuje poloha jezdce.

Testy revize běží nad lokálními izolovanými saves a nevyžadují DB migrace. První běh revize `npx playwright test --config e2e/profiles/playwright.config.ts --timeout 180000`: **4/4 prošly**. Po posledním mapovém review byly zopakovány jen dva dotčené scénáře příkazem `npx playwright test --config e2e/profiles/playwright.config.ts --grep 'players, personal day' --timeout 180000`: **2/2 prošly za 2,8 minuty** (WebGL desktop, Canvas tablet). Ověřují skutečné tažení jezdce, klik na dráhu, kolečko nad dráhou, dotykový posuv obsahu bez výběru karty, celé tři pásy na začátku i konci, skrytý posuvník krátkého obsahu, neaktivní vstup skryté mapy a odstranění hit hostu po změně scény. Součástí jsou i hover/stisk/out krajní akce, nezměněné osobní saves a skutečné spuštění coopu. Předchozí souběžný browser běh dosáhl časového limitu ve WebGL; po uvolnění výkonu oba scénáře prošly se stejným limitem a bez změny chování.

Finální mapové snímky implementující agent znovu prohlédl: `map-webgl.png`, `map-canvas.png`, `map-scroll-drag-end-webgl.png`, `map-scroll-drag-end-canvas.png` a návrat kliknutím na dráhu `map-scroll-track-top-webgl.png` / `map-scroll-track-top-canvas.png` v `artifacts/ui-refresh-v2/profiles/`. Počty ani okraje karet nejsou uříznuté, jezdec má prostor na obou koncích a legenda zůstává ve vlastním pruhu. `git diff --check` prošel. `tsc --noEmit` nehlásí nové chyby v upravených modulech; trvají dřívější chyby repozitáře. Žádná široká sada testů se v této revizi nespouští. Automatické výsledky nenahrazují samostatné vizuální posouzení koordinátora/autora.

## Výsledek

- **R1:** Menu otevírá skutečný přehled všech osmi profilů. Portrét a jméno, osobní souhrn, den a mapa jsou dostupné před vstupem do hry. Sólo pokračuje vybraným profilem; coop vyžaduje dvě různé uložené postavy. Založení hráče zachovává skutečný průchod výběrem postavy, jména a počátečního pásma. Prázdný přehled, jeden profil a zaplněný přehled mají odpovídající aktivní/neaktivní akce. Smazání zůstává dvouvolbovým rozhodnutím.
- **R4:** Pásy používají kanonické rozsahy A 0–5, B 0–8, C 0–10, D 0–20 a E 0–20 s přechodem přes 10; kurikulum se neměnilo. Kódy dovedností nahradily operace a krátké názvy, zaznamenané odpovědi, zámek a jedna až čtyři značky. Společná legenda a značky v detailu vysvětlují stupeň bez závislosti na barvě. Ukázky forem jsou skutečné položky katalogu odpovídající konkrétní dovednosti. Zobrazené pásy se omezují pouze uloženým `selectedStartBand`, nikoli dosaženým postupem.
- **R5:** Přehled ukazuje konkrétního hráče, jeho odpovědi, správné/chybné výsledky, úspěšnost, čas, kanonické ikony odměn a sedmidenní historii. Samostatná kapitola porovnávání se počítá do dne podle skutečných časů pokusů. Diagnostika a syntetická historie bez spolehlivého dne denní počty nezvyšují. Přepínání profilu nikdy nevytváří osobní součet obou hráčů.

## Oddělení dat

`SaveSystem.readSnapshot` čte uložený slot bez doplnění identity a bez zápisu. `LearningProfileView` připravuje hluboké kopie, případnou legacy migraci provádí pouze na kopii a v coopu používá nejnovější živé mastery obou partnerů. Prohlížení nevolá `loadSlot`, `activatePlayer`, `setActiveData`, `save` ani `endSession`.

Hlavní menu už samo neukončuje coop. Změnu herního režimu provádí až výslovné spuštění sólo/coopu nebo nového hráče. Test s aktivním B ověřuje zachování jeho slotu i živého postupu A. Návrat z denního přehledu/mapy zachovává právě prohlížený profil v přehledu hráčů.

## Soubory

- `src/scenes/PlayersHubScene.ts`, tenké vstupní scény `MenuNewScene`, `CoopSetupScene`, `SaveSlotScene` a vstup v `MenuScene`.
- `src/ui/LearningUi.ts`, `LearningOverlay.ts`, `MasteryMapOverlay.ts`, `DailyProgressOverlay.ts`; `ScrollablePanel.clipInput` omezuje interakce odrolovaného obsahu na skutečný viewport.
- `src/systems/LearningProfileView.ts`, čtecí metoda `SaveSystem` a doplnění porovnávacích odpovědí v `DailyProgressSystem`.
- Editorové layouty `PlayersHubLayout`, `LearningPanelLayout`, `LearningMapOverlay`, `DailyProgressLayout` v `scenes.json`, registrace v `assets.json`, `textures.json` a pilot allowlistu.
- Bitmapa `public/assets/ui/learning-refresh-v1/learning-panel-v1.png` (1160 × 640). Vytvořena imagegen koordinujícím agentem; původ a prompt jsou v `ui-refresh-2026-11-12/IMAGEGEN_PROMPTS.md`. Je zobrazována rovnoměrným měřítkem, bez deformace.

## Povinné vizuální brány

Rozhraní používá portréty, operace, počty, výsledek ✓/✕, hodiny, skutečné odměnové obrázky a jednoduchou historii. Běžné popisky jsou krátké; nejsou zde odstavce ani návod skrytý zmenšením. Denní přehled byl prohlédnut i s vypnutým zvukem a skrytými slovy. Bez nich zůstávají identita portrétu, přepínací šipky, počty, výsledky a historie.

Rám má samostatné bezpečné vnitřní odsazení. Nadpisy, selector a zavření jsou uvnitř horního pásu; legenda a patička nad spodním zlatým lemem. Zavření a šipky mají 58 herních px, na tabletu 1024 × 768 přibližně 46 CSS px. Celé portréty i rámy zachovávají poměr stran. Text používá konstruktorové `resolution: 2`; test měří shodu se zdrojem textury v Canvas i WebGL. Jména jsou zalamována v hostu, nejsou deformována nebo ořezána maskou. Test porovnává skutečné vykreslené jméno s deklarovaným obdélníkem karty, nikoli s jejími obsahovými bounds.

Porovnávací symboly přehledu mají 40 px místo původních drobných znaků; v konkrétních výrazech mají společnou velikost 32 px s číslicemi. Stupeň zvládnutí používá počet/tvar značek, nikoli pouze barvu. Detail neukazuje agregovaný stupeň jako údaj jednotlivých forem — ty mají skutečné počty a úspěšnost.

Kořen tlačítka a hit area zůstávají pevné. Hover/stisk posouvá společnou plochu se symbolem o −2/+2 px; pointer-out zruší stisk. Zakázaný start nereaguje. Překryvné panely uvolňují vlastní handlery, scroll masky i neviditelné editorové hosty při nahrazení a zániku scény.

## Prohlédnuté screenshoty

Koordinující agent prohlédl `artifacts/ui-refresh/players-hub.png`, `learning-map.png`, `daily-progress.png`, `daily-player-two.png`, `map-start-e.png` po opravě vnitřního odsazení.

Implementující agent prohlédl aktuální snímky v `artifacts/ui-refresh-profiles/`:

- `hub-webgl.png`, `hub-canvas.png`, `hub-empty.png`, `hub-one.png`, `hub-eight.png`: portréty, výběr, dlouhé/importované jméno, maximální přijaté dvanáctiznakové jméno a prázdné/plné stavy.
- `coop-webgl.png`, `coop-canvas.png`, `coop-one-disabled.png`: dva zřetelně označení partneři nebo chybějící druhý partner a neaktivní start.
- `day-webgl.png`, `day-canvas.png`, `day-empty-canvas.png`, `day-no-prose-canvas.png`: osobní aktivní/nulový den, skutečné odměnové ikony, historie a průchod bez slov/zvuku.
- `map-webgl.png`, `map-canvas.png`, `map-start-e-webgl.png`, `map-subtraction-webgl.png`, `map-subtraction-canvas.png`: pásy, legenda, omezení na uložený start a konkrétní odčítací formy.
- `button-hover-canvas.png`, `button-pressed-canvas.png`: celá plocha a obsah se pohybují společně uvnitř pevného cíle.

Starší snímky s chybějícími texturami nebyly přijaty. Vznikly po opětovném použití vývojového serveru se starým virtuálním manifestem. Finální konfigurace vždy spouští čerstvý server; každá fotografovaná scéna automaticky odmítne viditelné `__MISSING` textury. Canvas reload navíc zachovává identity seedovaných profilů, aby izolovaná simulace záloh neobnovila jejich starší kopie jako další hráče.

## Testy a preflight

Frontend používá lokální fixture saves; `/v1`, vývojové zálohy i diagnostika jsou v Playwrightu izolovány. Nejsou potřeba DB migrace. Žádné API/DB integrační testy ani zápisy do skutečných profilů nebyly součástí ověření.

- `npx vitest run src/systems/__tests__/LearningProfileView.test.ts src/systems/__tests__/DailyProgressSystem.test.ts src/systems/__tests__/SaveTransfer.test.ts src/systems/__tests__/MenuTransferAndFullscreen.test.ts --exclude '**/artifacts/**' --exclude '**/server/**' --exclude '**/node_modules/**'`: **20/20 úspěšných testů**.
- `node --test scripts/__tests__/scene-assets.test.mjs scripts/__tests__/pilot-content.test.mjs`: **19/19 úspěšných testů**, včetně produkčního pilot balení.
- `e2e/profiles/profiles.spec.ts`: **všechny čtyři scénáře úspěšné na finálním zdrojovém kódu**. Čerstvý úplný běh potvrdil aktivního B a vytvoření/0/1/8/maximální jméno/smazání/sólo. Dva scénáře WebGL/Canvas pak byly zopakovány s opraveným `hasTouch: true` a oba prošly včetně skutečného dotykového posuvu bez náhodného výběru, zavření z detailu, spuštění coopu, kontrol textur a hover/stisk/out. Předchozí dotykové selhání bylo v konfiguraci browser fixture, která dotykový vstup neměla povolený. Příkaz pro kompletní opakování: `npx playwright test --config e2e/profiles/playwright.config.ts --timeout 180000`.
- Starší testy `e2e/learning/learning.spec.ts` a `e2e/coop/guild-progress.spec.ts` byly přizpůsobeny vnořeným pásům a osobním údajům. Celý jejich bojový scénář nebyl v tomto rozsahu znovu spuštěn.
- `npx tsc --noEmit`: repozitář má existující chyby mimo tuto implementaci; ve zde nových modulech žádná chyba. Ve změněném `MenuScene` zůstává již existující nepoužité pole `debugger`. Úplný výpis byl uložen do `/tmp/ui-refresh-profiles-tsc.txt`.

## Nalezené a opravené vady

1. Původní patička, zavření a legenda zasahovaly do ozdobného lemu; editorové hosty byly posunuty do safe inset.
2. Čtení starého slotu doplňovalo identitu; oddělená čtecí cesta a kopie odstranily vedlejší zápis.
3. Denní přehled nepočítal samostatně ukládanou kapitolu porovnávání; nově ji počítá a testuje v odlišných dnech/profilech.
4. Mapové formy původně používaly jednotnou ilustraci sčítání; nyní se berou z konkrétního katalogu. Pokročilé porovnávání respektuje výsledky fluency/mastery výzev.
5. Obecné značky odměn a coopu byly nahrazeny kanonickými obrázky. Mapová akce používá existující mapový obrázek.
6. Celé animované hrdinské balíky se nepřipravují kvůli drobným portrétům; použity jsou statické portréty a kontrola scene-assets.
7. Maska scroll panelu neomezovala hit test skrytých karet; ty mohly po otevření detailu spotřebovat kliknutí na horní zavření. Nově se původní stabilní Phaser hit area navíc omezí na viditelný viewport.
8. Starý serverový manifest a opakovaně seedované identity zkreslovaly snímky. Čerstvý server, izolace identity, kontrola přesného počtu profilů a chybějících textur tomu nyní brání.

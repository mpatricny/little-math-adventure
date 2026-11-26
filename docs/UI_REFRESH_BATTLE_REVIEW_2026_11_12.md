# R3 — Jedno tlačítko útoku: implementace a přejímka

**13. 11. 2026: Vizuální přijetí původního uspořádání níže je zrušené.**
Autor odmítl portrét/jméno zasahující do bojiště i ovladače a odznaky přes
ozdobný spodní okraj arény. Následuje revize samostatné spodní lišty;
staré screenshoty `artifacts/ui-refresh/battle/` jsou odmítnutý výchozí stav,
nikoli doklad přijetí revize.

## Revize 13. 11. — samostatná spodní lišta

- Nový editorový `battleActionFooterHost` vymezuje neprůhledný klidný panel
  `(480, 592)–(1110, 712)`. Barva, jemný okraj a vnitřní linka jsou vykreslené
  programově; původní kruhové bitmapové rámy se dál škálují rovnoměrně.
- Jediný útok zůstává na středu obrazovky `(640, 653)`, nyní 100 × 100 px.
  Lektvar má samostatných 64 × 64 px. Na tabletu šířky 1024 je to 80 a
  51,2 CSS px. Hover/stisk posouvá společný povrch; hit area zůstává pevná.
- Identita je **vedle kruhu napravo**, nikoli nad ním v bojišti. Portrétní
  rám 64 × 64 px má střed `(770, 643)`, jméno host 270 × 64 px se středem
  `(951, 653)`. Písmo zůstává 24 px. Běžná jména jsou na jednom řádku;
  extrémně široké dvanáctiznakové jméno smí po výslovné kontrole zalomit
  na dva řádky uvnitř vyhrazeného prostoru, bez zmenšování nebo masky.
- Počet lektvarů má vlastní host pod jeho rámem `(540, 688)`. Síla mazlíčka
  má vlastní host v mezeře napravo od útoku `(714, 688)`. Oba odznaky mají
  32 × 32 px a žádný nekříží ornamentální obvod. Značky A/B jsou samostatně
  pod portrétem. Ani jméno, počet či diamant nezasahují do rámu nebo okraje.
- Úprava nemění postavy, spawn pointy, tahy, sady úloh, mastery, poškození,
  spotřebu přípravy ani směrování vstupů. Přibyl pouze host panelu a změnily
  se rozměry/polohy vizuálních hostů, umístění jména a kresba podkladu.

Migrační preflight byl zopakován: browser fixture používá lokální savy a
zachycuje `/v1/*` i vývojový save endpoint; DB migrace není potřebná.
První čekání na vstup do boje odhalilo závod s opožděným návodem
`arena.free.v1`, nikoli chybu docku. Pro izolovanou kontrolu bitvy nyní oba
fixture hráči mají tento návod v `seenGuides`; produkční návod se nemění.

První desktopový coop obraz byl prohlédnut: arénní nápis pod ovladači
neprosvítá, postavy a přední nepřítel zůstávají odkryté. Následné nezávislé
posouzení zkrátilo panel z 672 na 630 px, aby u krátkého jména nezůstával
zbytečně dlouhý prázdný konec. **Nezávislá kontrola finálních 630px snímků
normal, pet-B a long-name v plné velikosti tuto kompozici přijala.**

Dokončené ověření revize:

- `BattleUiMockLayout.test.ts`: **14/14 prošlo**. Kontroluje samostatný
  panel, safe inset včetně hover/stisku, vzájemné mezery všech viditelných
  oblastí a nepřekrývání samostatných počtů s rámy.
- `battle-action.spec.ts --grep 'co-op.*webgl'`: **1/1 prošlo**, celý
  čtyřtahový coop cyklus (1,8 min). Znovu ověřuje jednu instanci tlačítka,
  portrét/přesného mazlíčka, skutečné sady, mastery, disabled, dvojklik a
  návrat do dalšího kola. Nově měří také skutečné bounds povrchů a textu,
  včetně extrémního jména a souběžného pohybu rámu/ikony.
- `battle-action.spec.ts --grep-invert 'co-op.*webgl'`: **4/4 prošlo**
  (2,1 min): sólo WebGL, sólo Canvas, coop Canvas a pause/remote/reuse.
  Celkem je tedy pro revizi **5/5 cílených browser testů**. Spouštěny přes
  `--config e2e/arena/battle-action.playwright.config.ts`, po jednom workeru
  a po koordinaci s ostatními browser kontrolami.
- Samostatná striktní typová kontrola obou komponent a `git diff --check`
  prošly. Souběžné Chromium běhy původně významně zpomalovaly screenshoty;
  finální zbývající průchody proběhly sériově bez problému.

Skutečně prohlédnuté nové snímky v `artifacts/ui-refresh-v2/battle/`:

- `webgl-coop-hero-A-normal.png`, `webgl-coop-pet-B.png`: samostatná spodní
  oblast, jasná identita vedle útoku, všechny postavy odkryté.
- `webgl-coop-long-name.png`: všech 12 znaků `W` ve dvou řádcích uvnitř
  prostoru pro jméno, původní 24px font a žádná maska.
- `webgl-coop-controls-contact.png`: čtyři skutečné výřezy normal, hover,
  pressed a pointer-out. Rám i ikona se posouvají společně a zůstávají inset.
- `webgl-coop-pet-A-disabled.png`, `webgl-coop-pet-A-no-reading.png`:
  deaktivovaný útok během MathBoard a aktivní mazlíček bez jména při
  ztlumené hudbě, hlasu i efektech; portrét a značky pořád určují vlastníka.
- `webgl-solo-hero-A-normal.png`, `webgl-solo-pet-A.png`: obě sólo identity
  ve stejném středu, nezměněné postavy a nepřátelé, čistý spodní panel.
- `canvas-solo-hero-A-normal.png`, `canvas-solo-pet-A.png`,
  `canvas-coop-hero-B.png`, `canvas-coop-pet-B.png`: tablet 1024 × 768,
  stejné proporce, jasný hrdina/mazlíček a vlastník, oddělené počty.
- `canvas-coop-long-name.png`, `canvas-coop-controls-contact.png`,
  `canvas-coop-pet-B-disabled.png`, `canvas-coop-pet-B-no-reading.png`:
  nejširší jméno, čtyři interakční stavy, disabled a čitelnost bez jména
  byly prohlédnuty také ve skutečném Canvas rendereru.
- `input-guards-after-reuse.png`: po návratu do nové instance scény je
  ovladač znovu čistý, připravený a bez starého stisku.

Revize je hotová pro tento vymezený rozsah. Žádné nové assety ani změny
bojových pravidel nebyly potřeba; žádný commit nebyl vytvořen. Historické
výsledky původní funkční integrace níže zůstávají záznamem, ale její původní
vizuální schválení je nahrazené touto revizí.

## Historický záznam 12. 11. (vzhled již nepřijatý)

12. 11. 2026. Rozsah: produkční `BattleScene`, její ovladač útoku a identita
aktivního hráče. Zadání: [UI_REFRESH_REQUIREMENTS_2026_11_12.md](UI_REFRESH_REQUIREMENTS_2026_11_12.md),
část R3. Při návrhu a kontrole byly použity `AGENTS.md`,
[ASSET_CREATION.md](ASSET_CREATION.md), [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md)
a [COMPARISON_BATTLE_INTEGRATION.md](COMPARISON_BATTLE_INTEGRATION.md).

## Výsledné chování

- Všichni hrdinové a mazlíčci používají **tentýž kontejner a hit area**
  `battleAttackAction`. Hrdina má meč; mazlíček vlastní skutečný portrét podle
  `spriteKey` své definice. Pokud portrét neexistuje, použije se skutečná textura
  a snímek aktivního mazlíčka. Na pravé straně nezůstalo druhé tlačítko ani prázdná
  konkurenční objímka.
- Nad útokem je portrét vlastníka a celé jméno. V coopu jedna/dvě diamantové
  značky rozlišují A/B také tvarem a počtem. Odpovídající HP rámeček vlastníka
  je zvýrazněný; i jeho okraj nese stejný počet značek. Obrázek mazlíčka tedy
  nenahrazuje identitu jeho vlastníka.
- Pořadí `TurnManager` se nemění: sólo hrdina → mazlíček → nepřítel; coop
  hrdina A → hrdina B → mazlíček A → mazlíček B → nepřítel, se stávajícím
  přeskakováním padlých hráčů a chybějících mazlíčků.
- Lokální tlačítko, template handler i remote příkaz `attack` používají tentýž
  dispatcher. Stávající hlídání fáze zabrání druhému vytvoření sady. Ovladač se
  navíc deaktivuje **před** předáním kliknutí do scény. Zrušený stisk, disabled,
  skrytí, nové vykreslení i návrat z pauzy obnoví plochu a zruší starý stisk.
- Útočná plocha obsahuje rámeček, svit i oba stavy obrázku. Hover posune celek
  o −3 px, stisk o +1 px; root, měřítko a hit area stojí. Komponenta nemá vlastní
  opožděné callbacky ani časovače. Zánik scény zničí její objekty a handlery.
- Lektvar zůstává samostatnou vedlejší pomůckou. Neaktivní fáze a pauza nesmějí
  spustit útok ani spotřebovat lektvar. Příprava, obrana, poškození, celé sady
  úloh, první odpovědi a přiřazení mastery mají původní výpočetní cestu.

## Soubory a editor

- `src/ui/BattleActionDock.ts`: jeden ovladač útoku, portrét vlastníka,
  obrazové stavy, stabilní interakce, rovnoměrné měřítko všech bitmap.
- `src/scenes/BattleScene.ts`: jednotné směrování útoku podle fáze, čtení
  aktivního hráče, přesný mazlíček, odstranění `petAttackButton`, pauza.
- `src/ui/BattleActorStatusHud.ts`: volitelné značky vlastníka a barva vybraného
  rámečku. Sledování pozice herce a výpočty HP se nemění.
- `public/assets/data/scenes.json`: hosty útoku/jeho ikony, lektvaru/jeho ikony
  a odznaku, síly mazlíčka, vlastníka, portrétního rámečku, portrétu, jména a
  značek vlastníka. `BattleScene.consumeHudPoint()` čte jejich polohu, rozměry
  a hloubku. Staré `battlePetActionHost`, `battlePetBadgeHost`,
  `battleSwordActionHost` a široký `battleActionDockFrame` jsou odstraněné.
- `public/assets/data/assets.json`, `textures.json` a
  `public/assets/ui/battle/round-action-frame.png`: jedna sdílená kruhová
  struktura, deterministicky vyjmutá ze schváleného docku. Reprodukce:
  `node scripts/extract-battle-action-frame.mjs`. Neobsahuje text ani nové
  samostatně generované varianty. Používá se beze změny poměru stran.
- `src/systems/__tests__/BattleUiMockLayout.test.ts`,
  `e2e/arena/battle-action.spec.ts`, `battle-action.playwright.config.ts`,
  `battle-hud.spec.ts`: editorové safe oblasti, skutečný průchod bojem a
  kontrola vstupních stavů. Staré pevné čekání 80 ms ve status testech bylo
  nahrazeno čekáním na skutečné následování pozice herce.

Hlavní hit area má 132 × 132 herních px (105,6 CSS px na šířce 1024);
lektvar 84 × 84 (67,2 CSS px). Ikona útoku má vlastní 86 × 86 host se safe
insetem 23 px. Portrétní rámeček má vlastní 66 × 66 host, portrét 50 × 50,
jméno 314 × 32. Portrét a jméno se nepřekrývají. Všechen nový text používá
konstruktorové `resolution: 2`; browser ověřuje také `frame.source.resolution`.

## Migrační preflight

Před testy byly zkontrolovány závislosti a fixture helper
`e2e/helpers/isolated-dev-profile.ts`. Jde o frontend s izolovanými lokálními
savy; `/v1/*` a vývojová synchronizace savů jsou zachycené v browser kontextu.
Žádná změna backendu nebo schématu a žádná DB migrace nejsou pro tyto testy
potřeba. Integrační DB testy se v tomto rozsahu nespouštěly.

## Ověření

1. `npx vitest run --exclude 'artifacts/**' src/systems/__tests__/BattleUiMockLayout.test.ts src/systems/__tests__/CombatDamageSystem.test.ts src/systems/__tests__/CombatAttackSystem.test.ts src/systems/__tests__/CombatLearningRules.test.ts src/systems/__tests__/PreparationSystem.test.ts`
   — **45 testů prošlo**. Výchozí hledání bez výjimky navíc sebralo starou
   neúplnou kopii projektu v `artifacts/commit-organization/snapshot`; její
   chybějící `MathSkillRules` není chyba produkčního zdroje.
2. Čtyři celé browser průchody (sólo/coop × desktop WebGL/tablet Canvas)
   prošly. Kliká se na skutečné tlačítko, včetně dvojkliku; správné odpovědi
   procházejí `MathBoard.submitChoice`, následnými animacemi a skutečnými
   přechody `TurnManager`. Kontroluje se zachování reference jediného rootu,
   meč/přesný mazlíček, jméno/portrét/owner, celé sady a násobitele úloh,
   deaktivace během matematiky, oddělené počty mastery a návrat do dalšího kola.
3. Samostatný browser test pauzy, starého stisku, platných i opakovaných remote
   příkazů a návratu do nové instance scény prošel. Nezodpovězená sada
   nevytvořila mastery ani nespotřebovala přípravu nebo lektvar.
4. Produkční test tří nepřátel, pohyblivých HP rámečků a cílového meče prošel.
5. Finální `npx playwright test --config e2e/arena/battle-action.playwright.config.ts`
   — **7 ze 7 testů prošlo** (4,0 min). Status test katakomb prošel po
   nahrazení pevného čekání čekáním na skutečný stav. Screenshoty byly obnoveny
   po konečném oddělení portrétního rámečku a jména.
6. Dodatečný celý coop průchod v Canvas rendereru se ztlumenou hudbou, hlasem
   a efekty přes produkční `gameAudio` prošel (1,1 min). Pro hrdinu A/B i
   mazlíčka A/B zachytil také stav se skrytým jménem vlastníka. Nezávislá
   kontrola přes Playwright MCP navíc dokončila skutečný coop sled
   hrdina A → hrdina B → mazlíček A → mazlíček B pomocí pointer kliknutí na
   útok **i každou odpověď MathBoard** (Anežka/Matěj, slime/demon). Identita
   všech čtyř tahů i finální tabletový obraz byly vizuálně přijaty.

Celkové `npx tsc --noEmit` hlásí starší chyby napříč repozitářem (nepoužité
proměnné, typy legacy scén a testů). V novém `BattleActionDock` a upraveném
`BattleActorStatusHud` nehlásilo chybu. Samostatná striktní typová kontrola obou
komponent prošla: `npx tsc --noEmit --skipLibCheck --target ESNext --module ESNext
--moduleResolution Node --esModuleInterop --resolveJsonModule --strict
--lib ESNext,DOM src/ui/BattleActionDock.ts src/ui/BattleActorStatusHud.ts`.

## Vizuální kontrola a opravy

První široký štítek vlastníka překrýval spodního nepřítele. Byl nahrazen
kompaktním svislým uspořádáním: portrét, jméno, útok. Následná kontrola safe
oblastí oddělila portrétní rámeček od jména o další 8 px. Velikost a polohy
nepřátel ani bojové spawn pointy se kvůli tomu neměnily.

Prohlédnuty byly skutečné obrázky v `artifacts/ui-refresh/battle/`:

- `webgl-solo-hero-A-normal.png`, `-hover.png`, `-pressed.png`, `-out.png`:
  jednotný posun rámečku a meče, stabilní rozměry, bez překryvů s postavami.
- `webgl-solo-hero-A-disabled.png`, `webgl-solo-pet-A.png` a
  `webgl-solo-pet-A-disabled.png`: jasný svit aktivního útoku, utlumený neaktivní
  stav, jeden pet portrét ve středovém kruhu a původní MathBoard.
- `webgl-coop-hero-B.png`, `webgl-coop-pet-A.png`, `webgl-coop-pet-B.png`:
  jiný vlastník i mazlíček v témže ovladači; přední nepřítel zůstává odkrytý.
- `canvas-coop-hero-A-normal.png`, `canvas-coop-pet-B.png`,
  `canvas-coop-pet-B-disabled.png`, `canvas-solo-pet-A.png`: tablet 1024 × 768,
  správné proporce, celý dvanáctiznakový název, správné rozlišení textu.
- `webgl-coop-no-reading.png`, `canvas-coop-no-reading.png`: skryté jméno,
  stále rozpoznatelný portrét a počet značek vlastníka, meč jako akce.
- `canvas-coop-pet-A-no-reading.png`, `canvas-coop-pet-B-no-reading.png`:
  při ztlumeném zvuku a skrytém jménu ukazuje velký kruh přesného mazlíčka;
  portrét a značky nad ním zachovávají jeho vlastníka. Nezakrývají nepřítele.
- `webgl-solo-states-contact.png` a `canvas-coop-states-contact.png`: výřezy
  čtyř skutečných interakčních screenshotů vedle sebe pro kontrolu geometrie.
- `webgl-coop-identity-contact.png`: čtyři identity vedle sebe ve stejném
  ovladači. Nezávislá MCP kontrola uložila také
  `artifacts/ui-refresh/battle-coop-parent-hero-a.png`,
  `battle-coop-parent-hero-b.png`, `battle-coop-parent-pet-a.png` a
  `battle-coop-parent-pet-b.png`.

Přijetí R3: jeden středový útok, správná identita a mazlíček, vstupní guards,
čitelnost bez jména a zachované bojové výpočty jsou doložené. Toto není tvrzení,
že byly nově ověřeny všechny starší obrazovky celé hry nebo všechny telefonní
prohlížeče. Remote byl ověřen na hranici doručeného příkazu v produkční scéně;
transport relaye a samostatný fyzický telefon se tímto UI refaktorem nemění.

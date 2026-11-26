# Liška v boji · V5

Interaktivní návrh pro review: <http://localhost:8013/docs/design-drafts/fox-battle-v5/index.html>.
Canvas varianta: přidej `?renderer=canvas`.

**Poslední upřesnění autora, 19. 11.: animace 01 a 04 jsou schválené.**
Podoby **02, 03 a 05** již používají nové statické předlohy v přirozeném stoji,
jejich nový pohyb se připravuje. `model.json → approvedMotionForms` obsahuje pouze
`01, 04`; `restSources` odkazuje na nové předlohy ve `fox-animation-v2`.
Toto upřesnění nahrazuje předchozí plošné odmítnutí. Původní světlo u lišky je
schválené; nové účinky léčení, zásahu a štítu jsou předložené k vizuálnímu review.
Nový pohyb ostatních podob řeší implementační chat. Samotná přítomnost
atlasu v manifestu pohyb nepovolí. Výchozí postoj má být přirozený; zvednutí tlapky
nebo protažení může být občasnou součástí idle.

## Rozsah

Ukázka přidává tři liščí schopnosti do aktuálního bojového prostředí. Používá
skutečný `MathBoard` a `MathBoardView`. Před výrobní integrací je potřeba potvrdit
rozložení a napojit pravidla z implementačního chatu.

- Štít, léčení a zásah mají každý jedno použití za boj a za vlastníka.
- Dva portréty vybírají vlastníka schopností. Volba nemění vlastníka příkladu.
- Schopnost druhého hráče lze použít během příkladu prvního hráče.
- Celá obranná fáze blokuje všechny tři schopnosti i přepnutí jejich vlastníka.
- První kontakt otevře obrázkovou ukázku. Šipka vrátí dítě k vlastnímu pokusu.
- Zásah ukáže živé cíle. Zrušení cílení nespotřebuje použití.
- Při plném zdraví se léčení nespotřebuje. Opakovaný dotyk nepřidá druhý účinek.
- Léčení a štít se změní při aplikaci svého místního efektu. Zásah odečte životy při dopadu.
- Poslední poražený protivník ukončí ukázkový boj. Výhra je jednoduchý koncový
  stav testovací scény, nikoli náhrada výrobní obrazovky odměn.

Čísla v `model.json` (štít 5, léčení 6, zásah 4) slouží k předvedení. Neurčují
nový balance. Ukázka i její obrázkové předvedení čtou stejné hodnoty.

## Společný MathBoard

Zdroj: `src/ui/MathBoard.ts` a `src/ui/mathboard/MathBoardView.ts`. Příklady,
první odpovědi, názorná oprava a dokončení sady běží přes tyto komponenty.
Ukázka má tři sčítání při útoku a jedno při obraně. Nevytváří druhý výukový engine.

`state.owner` určuje vlastníka příkladu; `state.abilityOwner` vlastníka schopnosti.
Při zásahu se deska dočasně schová, aby byly vidět skutečné cíle. Potom se vrátí
stejný rozpočítaný příklad. Štít a léčení při počítání míří na odpovídající
portrét a ukazatel zdraví ve spodní liště.

**Pozastavení musí zastavit celý čas řešení.** Prototyp volá `view.setPaused()`
a pozastaví samostatnou Phaser scénu desky. Tím stojí aktivní čas, nápovědy
i rozběhnuté přechody během ukázky, cílení a účinku. Ve výrobním BattleScene
nelze bez rozmyslu pozastavit celou scénu: potřebné efekty by se také zastavily.
Zachovej tento kontrakt samostatným pozastavením MathBoardu nebo jeho scény.

## Rozložení a zdroje

Výchozí prostředí bylo ověřeno přímo v aktuálním BattleScene na portu 8001,
včetně jeho docku, HUD a otevřené matematické desky. Podklady jsou v `review/`.

- `scenes.json`: hlavní statické hosty, hloubky a bezpečné oblasti.
- `main.ts`: vlastní SceneBuilder načte hosty, jejich polohy a hloubky pak
  přebírá DOM scéna. Vnitřní vrstvy tlačítek a obrázkové ukázky skládá kód.
- `style.css`: společný rám tlačítek, stavy, text a lokální UI efekty.
- `assets/`: první snímky skutečných produkčních postav a protivníka.
- Parchment a dekorativní bitmapy zachovávají poměr stran.
- MathBoard je oproti výrobnímu `MathBoardArtLayout` posunut celý o 24 px nahoru.
  Jeho rozměry a vnitřní rozestupy zůstávají stejné; pod ním se vejde lišta.
- Deska končí na y=612, lišta začíná na y=616 v souřadnicích 1280 × 720.
- Při otevřené desce se schovají postavy za ní, aby pod pergamenem netrčely nohy.
- Rám a symbol tlačítka se při hover/stisku pohybují společně. Kořenový hit area
  se nehýbe. Disabled, pointer-out a opětovné použití vracejí plochu na místo.

## Pohyb lišek

`FoxSprite.ts` čte `../fox-animation-v1/manifest.json`, ale načtení atlasů
vyžaduje také výslovné povolení ID podoby v `approvedMotionForms`.
**Povolené jsou pouze 01 a 04.** Ostatní používají statické ilustrace
z `fox-evolution-v4` až do autorova schválení jejich nových pohybů.

- Idle se přehrává dopředu v cyklu. Attack a cast jednou dopředu, pak idle.
- Shield/heal používají cast. Zásah používá attack.
- Zpětné pořadí snímků se odmítne; žádný ping-pong ani deformace těla.
- Načítá se pouze vybraná podoba. Oba hráči sdílejí právě načítané obrázky.
  Po přepnutí renderer uvolní vlastní odkazy na předchozí atlasy.
- Generační token chrání před opožděným dokončením staršího načítání.
- Manifest používá neměnné URL s hashem. Při chybě dekódování je jeden nový
  pokus a následně statická podoba; chyba animace nezablokuje boj.
- Skrytá karta zastaví přehrávání. Reduced motion ponechá lišku statickou
  a zkrátí UI efekty; jejich herní účinek zůstane.
- Lokální světlo, ikona účinku a změna HP jsou oddělené od těla lišky.

### Účinky na cílech

`BattleEffects.ts` kreslí samostatné světelné vrstvy bez změny bitmap postav.
Léčení tvoří jemný tyrkysový kruh, teplé a tyrkysové částice kolem správného
hráče a `+HP` vedle jeho zdraví. Během MathBoardu se účinek ukáže u portrétu
vlastníka schopnosti, i když počítá druhý hráč.

Zásah je krátký směrovaný výboj z lišky na zvoleného živého protivníka.
HP klesne při dopadu a cílová potvora dostane místní světelný kruh a paprsky.

Štít je průsvitná modrá klenba před chráněným hráčem, která přetrvá, dokud má
sílu. Má oddělené hosty `airShieldA/B` a `portraitShieldA/B` v `scenes.json`.
V boji leží před vlastním hráčem, ale za postavou ve bližší řadě. Při počítání
se přesune před příslušný portrét. Pohlcený zásah vyvolá vlnu v místě dopadu,
odečte sílu a ztlumí body na spodním okraji. Vyčerpaná klenba krátce dohasne.

Autorský přepínač **Zásah do štítu** simuluje zásah 2 do vybraného vlastníka
schopností; při otevřené desce ji pozastaví a vrátí stejný příklad. Používá
stejný výpočet i účinky jako dokončená obranná úloha. Je určený k prohlédnutí
částečného úbytku štítu, není novou herní akcí ani změnou balance. Běžný
**Příchozí útok** dál otevírá skutečný obranný MathBoard proti 8.

### Jak účinky předvést

Při prvním stisku schopnosti otevře ukázka obrázkové předvedení. Klepni na
velkou šipku a potom na schopnost znovu. `Nový boj` resetuje použití a zdraví,
ale v téže návštěvě si pamatuje již předvedené schopnosti.

1. **Léčení na hráče:** výchozí stav → srdce → případné první předvedení →
   srdce. Hrdinka dostane 6 HP, kruh a částice jsou u ní, `+6` nad jejím HP.
   Nejlepší snímek: `review/effects-heal-player.png`.
2. **Zásah na potvoru:** `Nový boj` → blesk → případné předvedení → blesk →
   pravá potvora. Směrovaný výboj jí při dopadu ubere 4 HP.
   Snímek: `review/effects-strike-enemy.png`.
3. **Aplikace štítu:** `Nový boj` → modrý štít → případné předvedení → štít.
   Snímek: `review/effects-shield-apply.png` (přibližně 330 ms po použití).
4. **Částečné pohlcení:** po štítu → horní autorské tlačítko `Zásah do štítu`.
   Síla ubude z 5 na 3, HP zůstanou. Snímek: `review/effects-shield-block.png`
   (přibližně 640 ms po kliknutí; let trvá 390 ms).
5. **Skutečná obrana:** `Nový boj` → štít → `Příchozí útok` → na `2 + 3`
   zvol 4 → po názorné opravě pokračuj kulatým tlačítkem vpravo. Zásah 8
   spotřebuje štít 5 a ubere 3 HP. Snímek: `review/effects-real-defense-block.png`.
6. **Druhý vlastník při počítání:** `Nový boj` → běžný útok mečem → v dolní
   liště vyber portrét 2 → léčení nebo štít. Deska stále patří hráči 1.
   Pro prohlédnutí zásahu u portrétu použij `Zásah do štítu`. Snímky:
   `effects-heal-portrait.png`, `effects-shield-portrait-apply.png`,
   `effects-shield-portrait-block.png` v `review/`.

Pro technické zachycení již vysvětlených schopností lze v izolované stránce
nastavit `window.foxBattle.state.taught = new Set(['shield','heal','strike'])`.
`snapshot().effects.jobs` ukazuje aktivní fáze (`heal`, `shield-apply`,
`strike-flight`, `strike-impact`, `incoming-flight`, `shield-block`, `hp-loss`).
Statické snímky jsou připravené; animované záznamy vytváří implementační chat
z tohoto běžícího prototypu.

Konečné měřítko jednotlivých podob v produkčním boji je potřeba zkontrolovat
s finálními atlasy: stejně velká buňka nemusí znamenat stejně velké tělo.
Čtvrtá podoba má v nynějším společném čtvercovém hostu menší viditelnou siluetu.
Neřeš to odlišným ořezem jednotlivých snímků.

## Izolace a spuštění

Ukázka nepoužívá skutečný hráčský profil. Ještě před importy má okno vlastní
paměťové `localStorage`/`sessionStorage`. Skutečné úložiště nečte ani nemaže.
Nespouští vstupní modul hry, dev-save synchronizaci ani API. Obnovení stránky
zresetuje ukázkové hráče. Není potřeba databázová migrace.

Server, pokud neběží:

```sh
./node_modules/.bin/vite --config docs/design-drafts/mathboard-variants-v4/vite.config.ts
```

Použij port 8013 pro návrhy. Tento Vite config neobsahuje virtuální moduly
produkční hry; skutečná hra běží samostatně na 8001.

## Výrobní napojení

Přenes odsouhlasené rozložení do výrobních hostů a rozšiř stávající
`BattleActionDock`, `BattleActorStatusHud` a bojový stav. Převzít je nutné hlavně
oddělené vlastnictví schopností, časový kontrakt desky a ochranu jednoho použití.
Pro skutečný zásah použij výsledná pravidla schopnosti a sdílený bojový výpočet.
Ukázkovou ekonomiku, pevné příklady, testovací přepínače ani paměťové úložiště
do hry nekopíruj. Validace tohoto návrhu je v [REVIEW.md](REVIEW.md).

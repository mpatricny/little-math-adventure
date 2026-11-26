# MathBoard v4: integrace a kontrola

18. listopadu 2026. Převzatý návrh: `design-drafts/mathboard-variants-v4`.
Produkční prezentační vrstva: `src/ui/mathboard`. Aréna se nemění.

## Co je zapojené

- BattleScene: jeden společný MathBoard pro útok, meč, mazlíčka, obranu
  a oba hráče. Skutečné portréty, aktivní dítě, značka trénování, základní
  síla a osobní bonus +1. Při otázce jsou skryté původní překrývající se
  akční ovladače a starý jmenný štítek.
- ShopScene: stejná deska s kovovým rámem. Správná první odpověď nabije
  runu; chyba přidá nový příklad. Výsledek ukazuje skutečný počet nabitých
  mečů/štítů a návrat do obchodu uloží přípravu dosavadním controllerem.
- GuildScene: červený rám zkoušky, první odpověď a aktivní čas se zaznamenají
  jednou. Výklad chyby a šipka pokračování nezískávají další výsledek.
  Dlouhá zkouška stránkuje pečeti po šesti a ponechává skutečný počet otázek.
- CatacombTrialScene: kamenný rám a časová lišta. Čas se zastaví hned po
  první odpovědi, nikoli až po animaci a potvrzení. Timeout zruší čekající
  pokračování. Zkouška dál používá původní poškození, postup a odměny.

MathBoard stále vlastní celou sadu, první odpovědi, časování, asistenci,
vyhodnocení a jediný závěrečný callback. Z prezentačního prototypu se
nepřebírá fiktivní stav hráčů, protivníků, HP ani replay útoku. Skutečné
bojové postavy a animace zůstávají ve hře. ContextView/ImpactView z galerie
nejsou samostatnou náhradou produkčního boje.

Layout je v `scenes.json` / `MathBoardArtLayout`; obal čte pozice a hloubky
přes SceneBuilder. Přibyly hosty výsledku přípravy. Obrázky zachovávají
poměr stran. Text vzniká s `resolution: 2`; font Gelasio se načte před menu.
Každá scéna přednačítá pouze svůj rám, nikoli všechny čtyři tematické bitmapy.
Rušení animací respektuje již zničené Phaser objekty při přechodu do výsledku.

## Ověření

Před testováním zkontrolovány změny dat: žádná databázová migrace není potřeba.
Testy běžely v izolovaných kontextech; helper zachytává synchronizaci savů
i API a používá vlastní testovací profily. Postup dětí nebyl čten ani upraven.
Playwright MCP byl obsazený, proto se použily samostatné Playwright procesy.

- 57 jednotkových testů: osobní bonusy, připravenost, trénování, příprava,
  poškození a odměny osobního mazlíčka.
- 10 prohlížečových scénářů v opravdovém WebGL a Canvas: dva bonus/mana,
  dva cech, dva katakomby, dva příprava a dva porovnávání.
- Porovnávání: celé výrazy na obou stranách, třetí člen, prázdné místo pro
  vztah, obrázky s počty, chybná i správná první odpověď, jediný callback.
  Kontrola hover/stisk/pointer-out, deaktivace a návratu ovladačů; skutečný
  dotyk při šířce 768 px. Hra se kontroluje naležato, její portrétní režim
  nadále zobrazuje dosavadní výzvu k otočení.
- Mezní násobení výbavy 12 × 12: skupiny zůstávají uvnitř zpětné vazby,
  tříciferný výsledek má předem vyhrazenou šířku a nesráží se s `=`.
- Příprava: chybná odpověď + tři správné = tři runy ze čtyř pokusů;
  dotyk návratového tlačítka skutečně uloží přípravu.
- Co-op: vlastní reference obou dětí, bonus přesně jednou, mana jen
  oprávněnému dítěti a opakované vyhodnocení výhry nic nepřipíše.
- TypeScript má 136 existujících řádků diagnostiky před i po integraci;
  po normalizaci čísel řádků nepřibyla nová diagnostika. Není to čistý
  celorepozitářový typecheck. `git diff --check` pro upravené soubory prošel.

Reprodukce: `e2e/practice/mathboard-runtime.playwright.config.ts` a
`e2e/practice/bonus-ui.playwright.config.ts`. Bonusový soubor obsahuje také
starší návrh celé arény; pro runtime použít filtr `personal`.

## Vizuální review a jeho hranice

Prohlédnuté produkční snímky jsou v `design-drafts/mathboard-runtime-v4/review`:
cech ready/wrong, katakomby ready/feedback, příprava ready/complete,
co-op bonus, porovnávání ready/hover/pressed/pointer-out/wrong,
počty s čísly a tříčlenný výraz. Zkontrolovány Canvas i WebGL, rozměry
1280×720, 1024×768 a 768×576; targety odpovědí mají alespoň 44 CSS px.
Matematická deska sama neobsahuje slovní návod a nepotřebuje audio.
Znaménka a jejich tlačítka sdílejí stabilní povrch; při zadání není vztah
předvybraný. Nápověda nezvýrazňuje jednu správnou volbu.

Nejde o schválení všech starších menu, výsledků a úvodů celé hry podle
`UI_PRE_READER_GATES.md`. Zejména nový Zyxův úvod, modal před soubojem,
obrázková výhra a získání/vylepšení lišky v `training-flow-v5` čekají na
autorovo posouzení. Návrh vstupu a přehledu katakomb v `catacombs-access-v1`
je izolovaný prototyp k doladění. Oba návrhy jsou bez produkčního ukládání.
Srozumitelnost nových metafor je třeba ověřit s dětmi; automatický průchod
ani prohlídka screenshotů takové ověření nenahrazují.
Hustý model 12 × 12 používá malé obrázky; jeho rozložení bylo zkontrolováno,
pedagogickou srozumitelnost velké násobilky tento průchod nepotvrzuje.

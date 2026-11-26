# Společná cesta — spojený návrh V4

Oprava rozsahu podle autora, 19. listopadu 2026. Mění se spodní část původního
návrhu. Horní vývoj lišky a schopnosti zůstávají na jedné obrazovce.

Náhled: <http://localhost:8013/docs/design-drafts/fox-journey-v4/index.html>

## Skladba

- Nahoře: velká nynější a příští liška, pět milníků podob, společná lišta
  a odměna vybraného modulu.
- Dole: tři stabilní řádky Štít, Léčení, Zásah. Každý má jednu hlavní ikonu,
  aktuální účinek a sedm dvojic run za moduly. Zámek zmizí při první odměně.
- Kliknutí na dvojici nebo prostřední odměnu otevře detail stejného modulu
  a hráče. Přepnutí modulu nemění získanou podobu.
- Jedno nové dosažení zvýší schopnost a společný vývoj téhož hráče. I → II
  nahrazuje příspěvek 1 hodnotou 2; nepřidává další celou runu navíc.
- Po poslední podobě zůstává plná lišta a značka dokončení. Schopnosti
  mohou dál růst. Každý ze dvou ukázkových hráčů má vlastní stav.

## Rozsah a otevřené části

Jde o izolovaný prototyp v paměti prohlížeče. Není propojený s herními savy,
API ani databází a nemá závislost na migracích. Veškeré ovládání nad a pod
herním panelem slouží autorovi při review; nepatří do dětské hry.

Skutečné ID a ukázky modulů vycházejí ze sdíleného `ExamPresentation`.
Přiřazení 21 modulů k rodinám, součet až 14 za schopnost a hranice podob
0 / 4 / 10 / 20 / 32 jsou ilustrační model pro vyvážení. Není implementována
adaptace délky cesty pro hráče zařazené rovnou do vyššího pásma.

Pět různých statických podob přebírá návrh přes manifest `fox-evolution-v4`.
První vychází z preferované úpravy výrazu v `fox-expression-v3`; čtyři vyšší
podoby jsou nové neschválené návrhy od UI agenta. Aktuální portrét, příští
portrét a milníky vždy používají odpovídající ilustraci. Budoucí medailony
jsou tlumené, velký příští portrét ukazuje vzhled v barvě. Odmítnuté
ilustrace V2 se nepoužívají; tento náhled nezavádí žádné animace lišky.

Všechny statické hosty a vnitřní pozice jsou v `scenes.json`. Kresby rámů,
ikon i lišky zachovávají poměr stran. Související ovládání přebírá společné
vrstvy a stavy z `fox-abilities-v3`; mění se povrch, nikoli kořenová hit area.

## Ověření

Primární agent spustil Playwright MCP i po doplnění pěti ilustrací a všech
23 kontrol prošlo; podrobnosti
jsou v [review/functional-review.json](review/functional-review.json).
Ověřeny byly společné příspěvky, přechody podob při 4/10/32, jedinečnost
odměn, oddělení A/B, změna modulu, dokončení, reduced motion, funkce detailu,
stabilní hit area a dotykové cíle nejméně 44 CSS px na tabletu. Žádné chyby
stránky ani síťové zápisy. Syntaxe JS a oba JSON soubory také prošly kontrolou.

Vizuálně prohlédnuté screenshoty v `review/`:

- `combined-desktop.png`, `locked-desktop.png`, `after-first-evolution.png`,
  `last-appearance.png`, `complete-desktop.png`;
- `combined-tablet.png`, `hover-tablet.png`, `pressed-tablet.png`,
  `pointer-out-tablet.png`, `detail-tablet.png`;
- `combined-portrait.png`, `no-words-portrait.png`, `reduced-motion.png`.

Desktop 1440 × 1200, tablet 1024 × 768 a 768 × 1024: portréty, horní cesta,
odměna a všechny tři řádky mají oddělené oblasti bez překryvů. Hover/stisk
posouvá celý povrch, pointer-out jej vrátí. Získané runy mají světlo i fajfku;
zamčení má skutečný zámek. Prose hidden/audio muted review podle
`docs/UI_PRE_READER_GATES.md` zachovává ikony, čísla účinku, dvojice run,
šipku a odměnu. Srovnávací znak je výrazný a nezakrývá číslice.

Limity: schválení autora a použití dětmi na fyzickém tabletu zůstává otevřené.
Malé příklady v husté cestě jsou vodítko; detail má jejich velkou podobu.
Změny pozic, siluet a srsti vyšších podob jsou vidět ve velkých portrétech;
drobné detaily run se v malých medailonech ztrácejí. Tento návrh není
schválením ilustrací ani nasazením do hry.

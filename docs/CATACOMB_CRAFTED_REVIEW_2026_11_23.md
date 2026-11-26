# Katakomby / Moje liška — druhý vizuální průchod

Tento průchod opravuje vzhled vrácený autorem po první integraci. Předchozí
automatické a vizuální kontroly nejsou schválením prvního vzhledu autorem.
Předlohy jsou `artifacts/katakomby-malovane-v2/moje-liska.png`, `katakomby.png`
a `katakomby-cas.png`.

## Výsledek

- Šest odlišných malovaných konstrukcí: titul, krátký štítek, cesta schopnosti,
  karta modulu, široká akce a osmihranné lůžko. Celé bitmapy mají jednotné
  měřítko a zachované proporce.
- Výrazné tlapky mají vlastní siluetu; zámky sedí uprostřed kovových lůžek.
  Štít, srdce v listech a blesk vycházejí z malovaných předloh. Vodorovná čára
  přes zámky byla odstraněna. Jemná cesta vede pouze od dostupné lekce k bráně.
- Dostupný je jen uzel právě otevřené konkrétní lekce nebo uzel, do kterého lze
  vložit volný bod. Budoucí Léčení/Zásah neposílají dítě na Zkoušku štítu.
- Brána ukazuje skutečnou dostupnost cíle. Zavřená brána dovoluje prohlédnout
  předpoklady. Bod se přiděluje výslovnou volbou; prohlížení nic neuděluje.
- Časová osa používá reálně vykreslený rozsah mezi středy koncových drahokamů,
  včetně umístění všech mezí i portrétu. Výpočty už nepoužívají širší layoutový
  obdélník kolem menší bitmapy.
- Jména Maxmiliánka a Alexandřinka mají oddělené místo nad liškami. Příklady,
  hvězdy a odměna jsou uvnitř klidné části kamenného oblouku. Fajfka vybraného
  příkladu má samostatnou kapsu. Ikony spodních akcí zůstávají uvnitř lemu.
- Tři malé náhledy používají skutečný obličejový portrét dané podoby. Stav po
  `Vzít lišku` zachová portrét a samostatnou fajfku i se skrytými slovy.
- Živé profily, pravidla odměn ani vzhled/pohyb schválených lišek tento průchod
  nemění. Pohyb a usazení obou lišek spravoval souběžně implementační chat.

## Zdrojové assety a spolupráce

`public/assets/ui/catacomb-crafted-v3/` obsahuje 18 exportů tohoto průchodu
(šest rámů a šest dvojic ikon). Přesné prompty z vestavěného ImageGen jsou v
`docs/design-drafts/shared/catacomb-crafted-v3/prompts.json`; zdroje a SHA-256
exportů eviduje sousední `provenance.json`. Export je opakovatelný přes
`node scripts/build-catacomb-crafted-assets.mjs`.

Dvojice stavů mají společný výřez a stejné 256×256 plátno. Runtime u schopností
používá neutrální ikonku na jedné stabilní ploše, takže hover nemění siluetu.
Štítky a čísla jsou skutečný text Phaseru s `resolution: 2` v konstruktoru.
Hlavní pozice a hloubky zůstávají v `scenes.json`.

Implementační chat dodal kamennou síň a její brány, původní jablka/operace,
pět portrétů, širokou cílovou bránu a doplňkový rám `module-focus.webp`.
V závěru převzal `renderPinned` a odznak `Na dosah` v `renderList`, aby oba
dříve dohodnuté údaje zůstaly viditelné. Tyto příspěvky nejsou výstupem
generátoru `build-catacomb-crafted-assets.mjs`.

## Ověření

Před testováním byla ověřena závislost na migracích: jde o klientské UI a JSON
uloženého stavu; žádná databázová migrace není potřeba. Všechny průchody běžely
na syntetických profilech s izolovaným dev-save/API na portu 8198. Rodinné
savy ani server hry na portu 8001 se nerestartovaly nebo nepřepisovaly.

- `playwright test --config artifacts/catacomb-crafted-review/review.config.ts`:
  tři průchody prošly. Canvas a WebGL, tablet 1024×600 a desktop 1280×800;
  D4/E4, dlouhá jména, konkrétní dostupná lekce, zamčené budoucí uzly, otevřený
  a zavřený cíl, volný bod, přidělení bodu pouze zvolenému hráči a vybavení lišky.
- Hover, pressed a pointer-out posouvají plochu s ikonou i textem; hit area
  zůstává pevná. Po pointer-out se plocha vrací na nulový posun.
- 14 testů `BattleUiMockLayout.test.ts` a 12 testů `scene-assets.test.mjs` prošlo.
- Celoprojektový `tsc --noEmit` nad sdíleným pracovním stromem stále hlásí
  dřívější chyby v jiných částech hry. V `CatacombProgressOverlay.ts`,
  `CatacombPaintedUi.ts` ani `PracticeChoiceControl.ts` žádná chyba nalezena
  nebyla. Toto není potvrzení čistého celoprojektového buildu.

Skutečně prohlédnuté finální snímky jsou v
`artifacts/catacomb-crafted-review/screenshots/`:

- `canvas-fox-ready.png`, `canvas-fox-desktop.png`, `webgl-fox-ready.png`
- `canvas-lesson.png`, `canvas-E2.png`, `canvas-D4.png`, `webgl-E4.png`
- `canvas-hover.png`, `canvas-pressed.png`, `canvas-pointer-out.png`
- `canvas-banked-point.png`, `canvas-point-spent.png`, `canvas-equipped.png`
- `canvas-closed-destination.png`, `canvas-no-words.png`,
  `canvas-equipped-no-words.png`

Kontrola zahrnuje viditelné lemy, poměr stran, soulad ikon, oddělení textů,
stabilní ovládání i obrazové vysvětlení se skrytými slovy a ztlumeným zvukem.
Ve vyhodnocených snímcích nejsou kolize textů ani aktivní dotykové cíle pod
44 CSS px. Diagnostický přesah 122px textu `Moje liška` v původní 118px
kapsičce po dokončení všech lekcí implementační chat opravil na 130 px a
nezávisle ověřil v hotovém stavu přes MCP. Nezůstává otevřeným nálezem.

Playwright MCP v tomto chatu odmítá druhé použití sdíleného prohlížečového
profilu. Profil nebyl ukončen. Souběžný implementační chat provedl samostatný
průchod přes MCP a potvrdil kontrolu šesti finálních stavů bez kolizí textů,
včetně dokončených lekcí, dlouhých jmen a smíšeného připnutého tréninku.
Místní izolované průchody a skutečné prohlédnutí jejich snímků tuto kontrolu
doplňují; automatický průchod sám estetiku neschvaluje.

Závěrečné předání: implementační chat ověřil nové malby a medailony na 8001,
oba renderery zkoušek i oba samostatné záznamy pohybu lišek. Druhý průchod
je připravený k vyzkoušení autorem; další zásah do hry není součástí předání.

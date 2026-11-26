# Lišky V2 — přirozený postoj

**Stav 21. 11.:** autor výslovně schválil odeslání obrázků a zadání do
Sorceress. Pro podoby 02, 03 a 05 je hotových devět skutečných video animací
(idle, útok, schopnost), vyklíčovaných a sestavených do WebP atlasů.
Nové pohyby jsou předané autorovi k posouzení; nejsou označené jako jím
schválené. Původní odsouhlasené podoby 01 a 04 zůstaly beze změny.

Autor potvrdil animace podob 01 a 04 z V1. Ty zůstávají beze změny.
V2 nahrazuje pouze 02, 03 a 05: nový základ je uvolněný stoj na čtyřech tlapkách.
Zachované jsou tváře, barvy, bílá srst a odlišující tyrkysové/zlaté znaky.

## Pohyb

- Idle: klidný dech, mrknutí, uši a konec ocasu. Dopředná uzavřená smyčka.
- Útok: krátký přirozený krok a výpad vpřed, přenesení váhy, návrat do stoje.
- Schopnost: malé kývnutí hlavy a pozornost uší. Světlo se skládá zvlášť.
- Tlapka, protažení nebo sednutí jsou možné občasné vložky. Netvoří trvalou
  základní pózu a neomezují přirozenou anatomii jiných akcí.
- Žádné zpětné přehrávání, prohýbání těla, fixování boků při kroucení přední
  poloviny, samostatné ořezy snímků ani prolínání siluet.

## Zdroje

Statické předlohy: `assets/fox-02-standing.png`, `fox-03-standing.png`,
`fox-05-standing.png`. Vytvořeny vestavěným image_gen z původních ilustrací;
zdrojové prompty a původní PNG jsou v `artifacts/sorceress/fox-companion-v2/`.
Nová zkušební kresba 01 nepřepisuje autorem potvrzenou V1 animaci 01.

Video workflow: `scripts/sorceress-fox-natural.mjs`. Přijímá jen 02, 03 a 05,
ukládá identifikátory jobů a při opakovaném spuštění nevytváří duplicity.
Kontrola a export používají `FOX_ANIMATION_VERSION=v2` se stávajícími skripty
`inspect-fox-companion-videos.py` a `build-fox-companion-sheets.py`.
V1 atlasů se tyto výstupy nedotýkají. Produkční registrace
`scripts/register-fox-companion-base.mjs` používá pouze přijatý idle a útok 01
pod samostatnými klíči `companion-fox-01-*`. Nemění nepřátelskou lišku,
základní poškození ani bonus uložený u hráče. Nepoužitý cast se zatím do
produkce neregistruje, aby zbytečně nezabíral paměť tabletu.

## Výsledek kontroly

- Zdrojové záběry: všech 49 nativních snímků každého přijatého videa;
  první, poslední a krajní pózy; dopředné přehrání bez ping-pongu.
- Odmítnuté první záběry: idle 02 (oříznutý ocas), cast 02 (změněné barvy),
  útok 03 (oříznutý ocas), útok 05 (změna postoje a podlahy). Celé záběry
  zůstaly mimo export; náhradní videa mají vlastní zdrojové záznamy.
- Všechny tři pohyby jedné podoby používají společný ořez, měřítko a základnu.
  Buňky 512 × 512, atlasy nejvýše 2048 × 1536, 6 snímků/s, pouze dopředu.
- `gpu-review.json`: všech devět atlasů prošlo skutečným WebGL uploadem,
  připojením framebufferu a čtením neprázdných pixelů bez GL chyby.
- Prohlédnuté kontaktní listy a výsledné obrazy jsou v
  `artifacts/sorceress/fox-companion-v2/`: `fox-*-contact-dark.png`,
  `fox-*-contact-light.png` a `review-*-light.png`. Světlo nových castů
  sleduje znak na hrudi; útoky mají drobnou stopu u tlapky.
- Galerie zkontrolována při 1280 × 960 a 1024 × 768, bez vodorovného
  přetékání, ovládání nejméně 44 CSS px. Jde o autorskou galerii, ne dětské UI.
- Produkční základ 01: čtyři průchody portrétu a boje v Canvas/WebGL;
  po omezení načítání ještě dva cílené průchody. Útok čeká na animaci i
  příjezd k cíli, při pomalém vykreslování se neuřízne. Síla 6 + uložené 4 = 10.
  Screenshoty `artifacts/fox-companion-review/` a
  `artifacts/coop-difficulty/fox-*-1024.png` byly prohlédnuté.
- Dodatečná kontrola 21. 11.: všech 15 atlasů galerie, včetně podob 01 a 04,
  prošlo WebGL čtením barevných a průhledných pixelů. Produkční idle a útok
  se navíc čtou z textur skutečně nahraných Phaserem, ne z nově vytvořené
  testovací kopie. Důkaz je v `artifacts/practice-transition-review/gpu-proof.json`.
  `fox-companion.spec.ts` tento GPU test opakuje a vyžaduje i načtený malý
  portrét vybavené lišky. `fox-asset.spec.ts` nyní pořizuje snímek výběru až
  v profilu se zhlédnutým úvodem Pythie, aby jiný dialog portrét nezakrýval.

**Hranice:** fyzický Android nebyl připojený. Nové pohyby 02/03/05 ještě
čekají na autorovo posouzení. Dva vyšší rychlostní stupně, pravidla jejich
odemčení a skutečné použití štítu/léčení/okamžitého zásahu v produkčním boji
nejsou součástí této registrace; bojová demonstrace zůstává v `fox-battle-v5`.

## Kontrola před použitím

Nejprve zkontrolovat všechna zdrojová políčka a skutečný pohyb: anatomii,
přenášení váhy, návrat, kresbu, pozadí a volný okraj. Až poté klíčovat a sestavit
atlas společnou transformací. Kontrola rozměrů ani test kódu nemohou schválit
přirozenost animace.

Samostatné účinky léčení na hráče, zásahu na protivníka a vzdušného štítu před
chráněným hráčem vznikají v `fox-battle-v5`. V co-opu sledují vlastníka schopnosti,
který se může lišit od vlastníka příkladu. Účinek nesmí započítat odpověď nebo
mastery; čas otevřeného MathBoardu stojí během použití.

Tato práce nemění databázi ani profily; test náhledů nezávisí na migraci.

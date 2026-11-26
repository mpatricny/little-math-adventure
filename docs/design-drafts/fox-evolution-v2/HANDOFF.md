# Runová liška V2 — přívětivý parťák a společný růst

## Aktuální stav — výtvarný směr odmítnut

Autor 19. listopadu odmítl novou lišku i její varianty: změnily celou postavu
a ztratily detail původní kresby. Technická kontrola této galerie není
schválením vzhledu. **V2 se nesmí integrovat jako nový vzhled lišky.**

Aktuálním základem je původní `training-flow-v5/assets/fox-reward.webp`
s vlídnějším výrazem v [novém srovnání](../fox-expression-v3/index.html).
Autor nový samostatný návrh výrazu ocenil slovy „jo, tahle je lepší“.
Další podoby a nové animace čekají na schválení. Stávající produkční
animace se nemění. Pravidla progrese jsou dál samostatným návrhem.

Následující obsah je archiv předchozího návrhu.

19. listopadu 2026. Hotová galerie statických konceptů k posouzení autora.
Obsahuje tři výrazy, doporučenou pětici, společnou cestu přes více modulů,
dvě úrovně run a prokliknutelný bojový náhled. Produkční postavy, animace,
pravidla a uložené hry se v této dodávce nemění. V1 zůstává archivem.

## Otevřít

- [Pět podob](http://localhost:8013/docs/design-drafts/fox-evolution-v2/index.html?view=forms)
- [Výrazy](http://localhost:8013/docs/design-drafts/fox-evolution-v2/index.html?view=expressions)
- [Společný růst](http://localhost:8013/docs/design-drafts/fox-evolution-v2/index.html?view=growth)
- [Runy I / II](http://localhost:8013/docs/design-drafts/fox-evolution-v2/index.html?view=abilities)
- [Bojové měřítko](http://localhost:8013/docs/design-drafts/fox-evolution-v2/index.html?view=battle)

Server používá `../mathboard-variants-v4/vite.config.ts`, port 8013.

## Doporučený vzhled

Základem je prostřední **Zvědavá**: velké otevřené jantarové oči, uvolněné
obočí, kulatější čenich a malý veselý úsměv. Stejná tvář zůstává ve všech
pěti podobách. Vyšší podoby mění velké barevné plochy a obrys srsti:

| Podoba | Rozpoznatelný prvek | Návrh příspěvků pro 21 uzlů |
| --- | --- | --- |
| 1 | Oranžový kožíšek, světlý konec ocasu, jednoduchá runa | 0 |
| 2 | Široký tyrkysový pruh ocasu, bílé kotníky | 4 |
| 3 | Světlá polovina ocasu se spirálou, výraznější hruď a ponožky | 10 |
| 4 | Bohatý límec, huňatý světlý ocas s půlměsícem | 20 |
| 5 | Plnější límec, velká tyrkysová spirála se zlatým okrajem | 32 |

**Podoby 4 a 5 jsou si nejbližší.** Na malém tabletu je hlavním rozdílem
půlměsíc versus spirála; jejich rozlišitelnost je bod k autorovu posouzení.
V tomto kole už nejsou vyráběné další varianty. Zvětšený detail sám nestačí
ke schválení malé bojové postavy.

## Pravidla, která návrh zachovává

Aktuální podklad je `../../PRACTICE_JOURNEY_PROPOSAL.md`:

- Plynulost a Mistrovství zachovávají dosavadní odměny běžného útoku:
  první záchrana 6, další nové úspěchy +1. Mistrovství nepřidává schopnost.
- Existují pouze dva nové vyšší stupně: runa **I** a **II**. Velmistr a
  Legenda jsou pracovní názvy. Třetí úroveň runy zde není.
- Každý jedinečný nový stupeň konkrétního modulu přispěje jednou do společného
  vývoje. Jeden modul tedy přidá nejvýše dva příspěvky. Opakování nic nepřidá.
- Celá podoba roste přes více modulů. Získaný vzhled zůstává při změně modulu,
  pomalejším dni a přepnutí režimu. Návrhová evidence příspěvků není měna.
- Hranice 0/4/10/20/32 jsou ilustrační tempo pro 21 uzlů. Ukázka pozdějšího
  startu se čtyřmi uzly má 0/2/4/6/8. V budoucím runtime se hranice pevně
  nastaví při založení cesty podle zbývajícího učiva a pak se neposouvají.
- Moduly přispívají do tří společných rodin: štít, léčení, runový zásah.
  Další moduly nepřidávají další řady tlačítek. Konkrétní přiřazení a součet
  účinků jsou návrh k vyvážení.

Ukázka společného růstu má **ilustrační cyklus rodin** podle čísla uzlu.
Není to mapa produkčních modulů. Tlačítko „Nový stupeň“ patří ovládání
návrhářské galerie, simuluje nové dosažení a nepředstírá odehranou výzvu.
Volba milníku a délky cesty zakládá nový fiktivní stav pro prohlídku.

## Prokliknutelné chování

- Na cestě lze vybrat uzel a přidat I, potom II. Další udělení je zakázané.
  Dva uzly dokončené na II odemknou druhou podobu plné cesty. Příspěvek
  vizuálně putuje z uzlu do lišty; po naplnění se ukáže získaná podoba.
- V přehledu run jde nezávisle vybrat štít I/II, léčení I/II a zásah I/II.
  Kombinace se přenese do arény. Zásah prvního příslušného uzlu předvádí
  1 → 2 HP. Součet dalších modulů zde nemá domyšlený číselný balance.
- Každá schopnost má vlastní jediné použití. Po něm zhasne symbol i světlo.
  Během obrany se ukáže zámek bez spotřeby. Zlaté rámy zůstávají neprůhledné.
- Štít i srdce míří k hrdince. Jejich číselná síla zde není určena; ukázka
  předvádí cíl, efekt a stav použití. Zásah snižuje HP fiktivního protivníka.
- Reset zruší rozpracovaný efekt i jeho pozdější callback. Omezení pohybu
  nahradí efekty klidným zobrazením, výsledek i použití zůstávají srozumitelné.
- Animují se tlačítkové plochy, světla, příspěvek a krátké efekty. Samotné
  postavy jsou statické obrázky. Výměna získané podoby nevyrábí pohyb těla.

## Soubory a výroba

- `assets/body-0.webp` až `body-4.webp`: pět transparentních buněk 512 × 512.
- `assets/expression-0.webp` až `expression-2.webp`: čistá srovnávací trojice.
- `assets/canonical-friendly-clean.png`: vybraný nový výraz ve zdrojové velikosti.
- `assets/sources/`: původní generované výstupy a mezivýstupy.
- `assets/build.mjs`: opakovatelný chroma výřez a export; stačí `node` a
  projektový `sharp`. `assets/normalization.json` uvádí skutečné rozměry.
- Přesné prompty vestavěného **image_gen**: `assets/prompts.json`,
  `assets/forms-prompt.json`, `assets/cleanup-prompt.json`,
  `assets/key-prompt.json`, `assets/expression-cleanup-prompt.json`.

Přímý transparentní výstup trojice měl barevné zbytky na okrajích a první
pětice měkké pozadí. Imagegen proto vytvořil zdroje na plochém zeleném
podkladu. Deterministické klíčování chrání tyrkysové vnitřní runy, odstraňuje
i uzavřenou mezeru mezi hlavou a ocasem a zelené odlesky v úzkém pásu obrysu.
Původní `canonical-friendly.png` zůstává historickým vstupem generování;
galerie používá pouze očištěné exporty.

Pětice se dělí na stejných hranicích 512px buněk. Všechny buňky mají shodnou
transformaci 432 × 432 plus 40px průhledný okraj; žádný samostatný ořez či
posun postavy. Výsledné neprůhledné obrysy končí nejblíže 48 px od kraje.
Základna tlapek je v rozsahu y=431–437, tedy rozdíl nejvýše 1,5 herního px
při současném bojovém měřítku. Drobné rozdíly pózy zdrojového konceptu
zůstávají zachované a nejsou vydávané za hotové snímky jedné animace.

Zlatý medailon a ikony I/II pocházejí z V1; karty a plakety používají
existující společné zdroje V4/V5. Texty zůstávají v HTML. Všechny celé
bitmapové rámy používají `object-fit: contain`. Rám a symbol se pohybují
uvnitř jedné plochy, kořenový dotykový cíl je stabilní. Rozvržení herních
výřezů a jejich bezpečné oblasti jsou v místním `scenes.json`.

## Ověření a jeho hranice

Použitý Playwright MCP, desktop 1440 px, tablet 1024 × 768 a 768 × 1024.
`review/verify.mjs` prošel **34 interakčními kontrolami**, bez chyby stránky
a bez požadavku měnícího data. Záznam: `review/functional-review.json`.
Po vizuálním doladění zámků a přechodu lišty proběhl průchod znovu.
Databáze ani migrace nejsou pro tuto statickou galerii potřebné.

Prohlédnuté screenshoty a konkrétní závěry jsou v `review/visual-review.json`.
Herní výřezy fungují se skrytými slovy a bez zvuku. Dlouhé popisy jsou
návrhářské poznámky mimo herní výřez. Zámek, použití, cíl štítu/srdce,
změna HP a cesta k další podobě jsou zobrazené obrazem. Není zde aritmetická
úloha ani porovnávací znak; tyto části pre-reader checklistu se neuplatní.

Buňka lišky v aréně skutečně odpovídá **128 herním pixelům**: 512 × 0,5 × 0,5
podle současného `BattleScene`. Při viewportu 1024 má 96,2 CSS px; při 768
přibližně 73,4 CSS px. Pětici ve stejném malém měřítku obsahuje
`review/actual-size-five-forms.png`. Nejmenší bojová tlačítka při 768 mají
69 × 72 CSS px, uzly 91 × 53 CSS px. Rozlišení čtvrté a páté podoby potřebuje
posouzení autora na skutečném tabletu. Kontrola v emulovaných rozměrech
nenahrazuje dětský playtest ani produkční Canvas/WebGL test.

## Předání do budoucí implementace

1. Potvrdit výtvarný koncept, zejména poslední dvě podoby v malém měřítku.
2. Oddělit assety zachráněného parťáka od protivníka. Dnes `pets.json` i
   `enemies.json` pro `catacomb_creature_A` odkazují na **rune-fox-sheet**.
   Globální výměna této textury by změnila i nezachráněného protivníka.
3. Z finální kanonické anatomie vyrobit pohyby skutečným image-to-video
   modelem podle `../../ASSET_CREATION.md`. Zachovat společné výřezy,
   základnu a okraje, atlasy nejvýše 2048 px. Tato galerie animace nedodává.
4. Runtime načítá jen právě získanou podobu; společné ikony a efekty se sdílejí
   mezi kombinacemi. Není třeba vyrábět tělo pro každou kombinaci run.
5. Převzít schválené skutečné mapování modulů, balance a evidenci jedinečných
   dosažení. Nepřebírat ilustrační cyklus rodin z této galerie.
6. Pozice a hloubky produkčních statických prvků načítat ze SceneBuilder
   hostů. Ověřit plný tok s uložením, co-op, Canvas/WebGL a na fyzickém tabletu.

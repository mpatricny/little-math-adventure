# Lišky: skutečné animace z videa

**Aktuální stav: autor potvrdil pohyb 01 a 04; tyto dvě podoby zachovat.**
Pohyb 02, 03 a 05 se přepracovává a nepřebírá se do hry. Viz
[oprava směru](AUTHOR_CORRECTION.md). Technické kontroly níže toto rozhodnutí
nenahrazují. Nové zdroje těchto tří podob vycházejí z přirozeného stoje.

Tato galerie a `fox-battle-v5` jsou samostatné návrhy. Nemění produkční katalogy,
hráčské profily ani uložený postup. Nemají závislost na databázové migraci.

## Závazná aktuální dohoda

- Pět podob používá kresby z `fox-evolution-v4`.
- Každá podoba má klidový pohyb, běžný útok a gesto pro schopnost.
- **Idle se přehrává pouze dopředu v uzavřené smyčce. Žádný ping-pong ani yoyo.**
  Výslovný požadavek autora z 19. listopadu 2026 nahrazuje dřívější možnost
  dopředného a zpětného přehrávání z obecného animačního postupu.
- Útok a gesto proběhnou jednou dopředu a vrátí se do idle.
- Světlo je samostatná vrstva, nezvětšuje ani netónuje celé tělo. Základní
  ukázku tvoří krátký tyrkysový záblesk u tlapky, drobný oblouk a několik jisker.
  Reduced motion ponechává jen jemné místní světlo.

## Technické předání

`manifest.json` obsahuje pouze sestavené podoby. `frames` je počet skutečných
snímků v atlasu, `playback` jejich dopředné pořadí, `fps` odpovídá vzorkování
každého čtvrtého nativního video snímku. Zdroj má 24 FPS, proto běží animace na
6 FPS. Exportní WebP používá kvalitu 88, přesnou alfu a maximálně 2048 × 2048 px.
Všechny pohyby jedné podoby sdílejí jediný crop a transformaci na 512 × 512 px.

Žádný snímek nebyl samostatně oříznutý nebo deformovaný. Zdrojový pohyb vytvořil
skutečný video model. AutoSprite CorridorKey poskytl alfu, barvy zůstaly z videa.
Odmítnuté zdroje zůstávají v artefaktech pro kontrolu a nejsou herními assety.

Produkční integrace musí vytvořit nové klíče pro přátelskou lišku. Nepřepisovat
starý `rune-fox-sheet`, který dosud sdílí protivník a mazlíček. Načítat jen podoby
nasazených lišek; při proměně novou podobu připravit na pozadí. Nepřednačítat
všech patnáct atlasů při spuštění hry.

V boji společně používat `*-attack` a `*-attack-anim` alias, `*-cast` pro gesto.
Pohyb lišky a efekt nesmějí běžet při skryté kartě. Čas MathBoardu se pozastaví
od zahájení cílování přes efekt do návratu ke stejnému příkladu. Schopnost sama
nevytváří odpověď, mastery ani rychlostní odměnu.

## Reprodukce a kontrola

- `scripts/sorceress-fox-evolution.mjs`: původní video joby, klíčování a stažení.
- `scripts/sorceress-fox-retakes.mjs`: konečný počet opakování vadných zdrojů,
  oddělené záznamy, ochrana před duplicitní placenou generací.
- `scripts/inspect-fox-companion-videos.py`: kontakty všech nativních snímků,
  první/poslední snímek, největší pohyb a nejmenší okrajová rezerva.
- `scripts/build-fox-companion-sheets.py`: pouze schválená okna, společná
  transformace, průhledné atlasy a kontrolní náhledy.

Zdrojová kontrola je v `artifacts/sorceress/fox-companion-v1/`, schválená okna v
`approved-windows.json`. Kontakty na tmavém a světlém pozadí se jmenují
`fox-XX-MOTION-contact-dark.png` a `...-light.png`. Galerie má přepnutí pozadí,
směru a světelného efektu. Náhledové texty mimo plátno jsou pouze pro autora.

Samostatné použití schopností, cílování, výuka bez čtení, co-op a stavy ikon
jsou součástí [bojového prototypu](../fox-battle-v5/index.html).

## Stav kontroly

První, druhá a čtvrtá podoba prošly kontrolou všech nativních snímků a
vyexportovaných kontaktů. Třetí a pátá zatím procházejí kontrolou nových záběrů.
Závěrečný browser/GPU průchod bude doplněný po dokončení sady.

# Liška — pět podob V4

19. listopadu 2026. Čtyři nové statické návrhy vývoje vycházejí z autorova
preferovaného původního těla lišky s opraveným vlídným výrazem.

## Stav schválení

- **01 je schválený výtvarný základ**, převzatý z `fox-expression-v3`.
- **02–05 jsou nové návrhy k posouzení. Jejich podoba zatím není schválená.**
- Pracovní názvy slouží jen galerii. Neurčují názvy, ceny, schopnosti nebo
  milníky ve hře; pravidla a spojený náhled vlastní vedlejší chat.
- Animace se nevytvářejí, dokud autor neschválí podoby. Produkční spritesheet
  ani sdílený klíč `rune-fox-sheet` se nemění.
- Odmítnutý výtvarný směr V2 není zdrojem těchto obrázků.

## Podoby

| Soubor | Pracovní název | Výtvarná změna | Postoj |
|---|---|---|---|
| `assets/fox-01.webp` | Základní | Schválená vlídná tvář, původní runy | Zvednutá tlapka |
| `assets/fox-02.webp` | Runová | Bílé přední ponožky, první zlatý lem na ocase | Zvědavé naklonění |
| `assets/fox-03.webp` | Stříbrná | Stříbrná horní část ocasu, dvě zlatem lemované linky | Hravá poklona |
| `assets/fox-04.webp` | Zářivá | Bohatá bílá hříva, bílé tlapky, propojené zlatem lemované runy | Krok doprava |
| `assets/fox-05.webp` | Hvězdná | Hvězdné znaky na čele, hřívě a ocase, stříbrná srst | Hrdý sed |

Všechny podoby drží oranžovou hlavu a hřbet, jantarové oči, jeden ocas,
detailní srst a tyrkysové runy. Každá má jiný přirozený postoj. Bílá srst
a kresba run tvoří trvalé rozpoznávací znaky; změnu nenahrazuje jen záře.
U čtvrté byl první vygenerovaný postoj příliš podobný základu, proto jej
nahradil samostatný edit do chůze doprava.

## Assety a původ

- `manifest.json`: stabilní pořadí a cesty, popisy, stav návrhu a původní zdroje.
- `assets/fox-01.png` až `fox-05.png`: plné transparentní mastery 1200 × 1200.
- Stejnojmenné WebP: náhledové exporty, kvalita 94, alfa 100.
- `assets/prompts.json`: přesná zadání **built-in image_gen**, včetně opravy
  čtvrtého postoje a cest nedotčených generovaných zdrojů.
- `normalize.mjs` a `assets/normalization.json`: opakovatelná technická úprava.
  Vymazává pouze numerické pozadí s alfou pod 8/255. Všechny viditelné barvy
  zůstávají; obrázky se proporčně vejdou do 1056 × 1056 na plátno 1200 × 1200,
  s dolním okrajem 60 px. Žádné překreslování ani deformace ilustrace.
- Každá podoba je samostatný koncept, nikoli zarovnaný snímek animace.
  Velikost ve hře a výřezy portrétů se po schválení musí odvodit společně
  podle anatomie; stejné plátno samo neurčuje produkční měřítko.

## Galerie

[Otevřít pět podob](http://localhost:8013/docs/design-drafts/fox-evolution-v4/index.html)

Kliknutí na podobu otevře velké srovnání se schváleným základem. Šipky
přepínají sousední podoby, přepínač mění pozadí pro kontrolu okrajů a odkaz
PNG otevře celý transparentní master. Galerie je výtvarný přehled pro autora,
nikoli hráčská obrazovka. Výtvarné rozdíly jsou patrné i bez popisků a zvuku.

Bez produkčních změn, ukládání a API. Standalone Vite na 8013 nemá databázi
ani migrace; kontrola této galerie na nich nezávisí.

## Předání

Vedlejší chat `01a0fd93-aaa3-7480-ad12-e42887b4550b` může obrázky zapojit do
`fox-journey-v4` jako **nové návrhy**, aby je autor viděl ve společné cestě.
Tato složka sama nemění schopnosti ani hodnoty postupu.

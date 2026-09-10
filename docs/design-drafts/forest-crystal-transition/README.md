# Krystal lesa – přechod do Silverpondu

Tato sada obsahuje tři 1280×720 koncepční mockupy příběhového přechodu po
porážce Verdant Guardiana. Jde o návrh obrazovek a interakcí, ne o hotové
produkční bitmapy.

## 1. Odměna po bossovi

- Krystal lesa je unikátní questový předmět, ne běžný Numera krystal do inventáře.
- Po vítězství zmizí bojové HUD prvky a scéna se zklidní.
- Krystal během krátké animace vystoupí do zeleného světla a listových částic;
  nevzniká z lesa, jen se odhalí předmět, který v něm zůstal po havárii.
- Tlačítko `VEZMI KRYSTAL` se aktivuje až po dokončení hlavní animace.
- Původ krystalu vysvětlují tři obrázkové kartičky s krátkými popisky:
  `SPADL Z LODI` → `STRÁŽCE HO HLÍDAL` → `VRAŤ HO ZYXOVI`.

## 2. Zyxova částečně opravená raketa

- Silueta vychází přímo z rakety v úvodu hry: nízké protáhlé tělo, prstencová
  záď, zkosená příď s kulatým světlem a jedno velké kruhové boční okno.
- Raketa zůstává zřetelně poškozená, ale nové pláty, lešení a aktivní kabely
  ukazují, že Zyx od poslední návštěvy pokročil.
- Zyx hráče zastaví před odchodem do Silverpondu a požádá ho, aby přinesený
  krystal zapojil do stroje.
- Cesta do Silverpondu pokračuje doprava. Šipka je během dialogu neaktivní a
  rozsvítí se až po vložení krystalu.
- Pravá cesta funguje jako vstup i výstup. Při první návštěvě se hráč objeví na
  pravém okraji, automaticky dojde doleva doprostřed k Zyxovi a tam začne
  dialog. Po dokončení stroje se ovládání vrátí a hráč odejde stejnou cestou
  doprava podle šipky.

## 3. Kalibrace a vložení krystalu

- Horní část ukazuje tři velké regionální sloty. Před prvním vložením je levý
  slot otevřený a další dva uzavřené.
- Pravý šestiúhelník ukazuje cílovou energii. U prvního krystalu je to `10`.
- Oba operátory `+` jsou v první tutoriálové variantě pevné. Hráč vybere tři ze
  čtyř spodních destiček `1`, `2`, `4`, `5`.
- Správná cesta je `1 + 4 + 5 = 10`. Vybraná čísla se okamžitě rozsvítí a
  objeví ve vodičích. Při špatném výsledku se zobrazí `ZKUS TO ZNOVU` a výběr
  se bez časovače nebo trestu vyčistí.
- Po správné kalibraci začne Krystal lesa pulzovat. Hráč nejprve klikne na
  krystal a potom na zeleně zvýrazněný horní slot. Tento dvoukrok je čitelný
  pro dotykové ovládání a nevyžaduje přesný drag-and-drop.
- Teprve po vložení se odemkne `AKTIVOVAT`. Energie projde vodiči, slot se
  uzamkne a první část stroje se trvale rozsvítí.
- Stav stroje se po animaci změní z `0/3` na `1/3`; další dva sloty zůstanou
  uzavřené. Poté se hráč vrátí do venkovní scény a cesta do Silverpondu se
  aktivuje.

## Speciální victory sekvence po Verdant Guardianovi

Současný tok ukazuje obecný `VictoryScene` a po návratu do `ForestRoomScene`
ještě druhou obecnou obrazovku „Výprava dokončena“. U Guardiana se obě obrazovky
nahradí jedním příběhovým tokem:

1. Po posledním zásahu zmizí bojové HUD prvky. Krátké `VÍTĚZSTVÍ!` zůstane jen
   jako 0,8–1,0s fanfára přímo nad bojištěm.
2. Běžné odměny se připíšou stejně jako dnes. Mince a obyčejné krystaly pouze
   krátce odletí do HUD; neotevře se standardní šedý victory panel.
3. Hra se vrátí do Guardianovy svatyně ve speciálním aftermath stavu. Fialová
   korupce pohasne, runy zezelenají a střed oltáře se otevře.
4. Krystal lesa vystoupí nad oltář a dostane samostatnou hero animaci s
   listovými částicemi. Jde o velký krystal, který se při poruše odlomil ze
   Zyxovy lodi; Verdant Guardian jej pouze chránil.
5. Objeví se speciální panel `KRYSTAL LESA` se třemi obrázkovými kartičkami.
   Tlačítko se aktivuje až po dokončení hlavní animace.
6. Po `VEZMI KRYSTAL` krystal odletí do questového HUD slotu, overlay zmizí a na pravém
   okraji svatyně se rozsvítí cesta k Zyxovi. Ovládání hráče se vrátí.
7. Odchod doprava spustí raketovou meziscénu. Hráč přijde z pravého okraje,
   dojde doprostřed, proběhne dialog, kalibrace, vložení a aktivace.
8. Po návratu z puzzle se pravá šipka přepne do aktivního stavu. Odchod doprava
   nastaví `Silverpond` jako odemčený cíl.

Sekvence musí být jednorázová a uložená před přechodem mezi scénami. Doporučené
milníky ve `StoryProgress` jsou `hasDefeatedVerdantGuardian`,
`hasClaimedForestCrystal`, `hasInstalledForestCrystal` a
`hasUnlockedSilverpond`. Krystal lesa se vede jako questový předmět, ne jako
číselný Numera krystal v běžném inventáři.

## Produkční rozklad

- Generovaný koncept je pouze kompoziční reference.
- Rámy, číselné destičky, sloty, krystal, portrét a text se implementují jako
  samostatné vrstvy.
- Čísla, operátory, lokalizace a stavy tlačítek zůstávají v kódu nebo UI šablonách.
- Všechny statické hosty musí být v `scenes.json`; pozice a depth se čtou přes
  `SceneBuilder`.
- Hover nemění geometrii. Použije se malý zdvih povrchu, světlo, stín a
  cross-fade přesně zarovnaných stavů.

## Soubory

- `01-forest-crystal-reward-mock.png`
- `02-zyx-rocket-interlude-mock.png`
- `02-zyx-rocket-interlude-mock-v1.png` – původní kulatější koncept pro srovnání
- `03-crystal-machine-puzzle-mock.png`
- `isolated-assets-preview.png` – kontrolní složení transparentních vrstev
- `compose_mockups.py` – deterministická sazba českého textu a čísel
- `normalize_isolated_assets.py` – normalizace průhledných canvasů
- `PROMPTS.md` – prompty použité pro obrazové koncepty

Produkční kandidáti:

- `public/assets/ui/story/forest-crystal-transition/zyx-dialog-frame.png`
  (`1200×320`, transparentní)
- `public/assets/ui/story/forest-crystal-transition/zyx-dialog-action-frame.png`
  (`480×160`, transparentní)
- `public/assets/ui/story/forest-crystal-transition/forest-crystal.png`
  (`512×512`, transparentní)
- `public/assets/images/backgrounds/zyx-rocket-interlude.webp`
  (`1280×720`, čisté herní pozadí bez postav a UI)
- `public/assets/ui/story/forest-crystal-transition/pictograms/`
  (čtyři normalizované průhledné piktogramy `512×512`)

## Integrovaný testovací řetězec

V menu je zkratka `GUARDIAN – POSLEDNÍ ÚTOK`. Spouští izolovaný mock souboj s
Verdant Guardianem na 1 HP a bez zápisu běžných bojových odměn do save. Po
posledním útoku následuje speciální získání Krystalu lesa, návrat ovládání v
doupěti, odchod doprava, venkovní dialog se Zyxem, kalibrační puzzle,
dvoukrokové vložení krystalu a aktivace prvního ze tří slotů. Po návratu k
raketě se odemkne směrovka `SILVERPOND`, která vede přímo do města.

Textová náročnost integrovaného toku je přizpůsobená prvňákům. Reward používá
tři obrázkové kartičky a Zyxovy stránky mají vždy jeden velký obrázek a nejvýše
dvě krátké věty.

## Produkční napojení

Skutečná `GuardianLairScene` předává bossovu výhru jako story victory
`forest-crystal`. Ještě před otevřením speciální odměny se `boss_guardian`
označí jako poražený a aktivní lesní výprava se dokončí. Toto dokončení je
idempotentní, aby opakovaný přechod nemohl znovu připsat odměny výpravy.
Standardní šedý `VictoryScene` se u tohoto bosse přeskočí; ostatní souboje
zůstávají beze změny.

# Vrak, podpalubí a sjednocené ovládání

7. září 2026. Hratelné jsou U01–U08; U09 jeskyně, U10 brána a U11 boss zatím nejsou implementované.

## Nové místnosti a postup

- U07 Vrak poštovní lodi nahradil dočasnou přímou spojnici zahrada ↔ kanál. Má tři skutečně namalované průchody: vlevo zahrada, vpravo kanál s potrubím, uprostřed dřevěné dveře podpalubí s poštovní obálkou. V U08 je jediný východ zpět, stejný dřevěný motiv a výhled na venkovní oblouk.
- Starší vstupní ID `canal` v zahradě a `garden` v kanálu zůstávají platná. Každá hrana má společné `passage` ID a protější spawn. Obě větve lze stále projít v libovolném pořadí, hlídky a puzzly jejich pečetí se neobcházejí.
- Přímý průchod vrakem nevyžaduje boj. Volitelná hlídka `silverpond-wreck-watch` (Bublinový rak a Ruinový mlok) chrání malou truhlu a vstup do podpalubí. Co-op má třetího protivníka podle stávající katalogové politiky. Sestavy nemají kopii ve scéně ani v simulátoru.
- Malá truhla: 8 mincí + 4 many, bez druhého puzzle po boji. Podpalubí: větší otočná poštovní truhla, 18 mincí + 10 many, heslo KOTVA. Data odměn jsou v `underwater-rooms.json`, boj v `encounters.json`. Odměny jsou jednorázové a oddělené pro profily A/B. Nově připojený hráč B sdílí hostitelovu již otevřenou cestu a odměnu z právě otevřené truhly, nikoli jeho minulé boje či dříve otevřené poklady. Číselné hodnoty jsou návrhové, ne nově simulovaná garance vyvážení.
- Poštovní zámek střídá běžný výpočet a hledání neznámého začátku; v dostupném malém rozsahu je nejnižší hodnota zobrazena skutečnými perlami. Všechny stopy jsou vedle zámku, není nutné pamatovat si čísla z jiné obrazovky. Výsledky jsou různé, pořadí jednoznačné a kartičky promíchané. Zámek používá původní fyzická kolečka lesa, ne výběrové kartičky místo zámku.
- Bez ceny, časového limitu a trestu za chybu. Nápověda postupně ukazuje jednotlivé výsledky, nevyplní heslo. Puzzle nepřipisuje pět fiktivních matematických výkonů; jednotlivé reálně odevzdané odpovědi se zapisují v soubojích. Jde o aplikaci známých vztahů v jiném zobrazení podle `SILVERPOND_LEARNING_DESIGN.md`, nikoli důkaz vzdělávací účinnosti.

## UI

Truhly sdílejí nový smaltovaný rámeček stop, perlovou objímku a čtyři rodiny ikon. Zavření a pomoc jsou ikonové, odemknutí má krátký runtime popisek. Všechny stavy zachovávají rám a zásahovou plochu; mění se jen povrchový posun, stín a světlo ikony. Souvislý původní otočný zámek a společná rezavá podložka zůstaly zachovány.

VictoryScene nyní používá tentýž stálý modrý rám, samostatné oblasti pro titulek, jména, mince, osvobozeného tvora, krystaly, informace a spodní Pokračovat. Při větším počtu krystalů stránkuje po čtyřech místo přetékání; při opakovaném vítězství bez nového tvora či krystalu ukáže místo prázdného seznamu perlový medailon. Mince v co-opu ukazují oba účastníky. Klávesnice, kliknutí i TV pokračování sdílejí stejnou 1,5s pojistku; směrování a přiznávání odměn se nemění. Všechna statická místa jsou v `scenes.json` a čtena přes SceneBuilder. Bitmapy se neprotahují, text má `resolution: 2` již v konstruktoru.

## Výtvarná výroba

Použit skill **imagegen**, vestavěný nástroj, reference-guided generation. Původní generace jsou zachované. Pozadí: jednotné cover 1672 × 941 → 1280 × 720, WebP 88. Strukturální díly: skill `remove_chroma_key.py`, #00ff00, tolerance 75, despill, edge contract 1, feather 0.3; jeden trim, uniform contain na 256² canvas. Ikony: soft matte 18/180, despill, edge contract 1, společné 400² výřezy pro každou dvojici z jedné generace, stejná velikost 192². Vymezení buněk: x=40/440; řádky y=40,450,880,1280. Žádné samostatné trimování aktivních ikon podle záře. Původní obrazové rámy Silverpondu se používají znovu, nevyrábí se nezávislé kompletní tlačítko pro každý stav.

Produkční soubory: `public/assets/images/underwater/post-wreck.webp`, `wreck-hold.webp`; `public/assets/ui/enamel/{clue-plaque,control-socket,check-normal,check-active,close-normal,close-active,hint-normal,hint-active,continue-normal,continue-active}.webp`.

## Ověření a vizuální přejímka

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

- Před testováním zkontrolována migrace: pouze existující klientská migrace mastery, žádná nová databázová migrace. Doplnění místností hydratuje staré savy bez resetu postupu.
- `npm test -- --silent --reporter=dot`: 39 souborů, 285 testů prošlo. Obsahují nové průchody, jejich protější vstupy, blokování podpalubí, jednorázové odměny, rozdílnou historii co-op profilů a bezpečné oblasti VictoryScene.
- `npm run build`: prošel; zbývají upozornění Vite na velikost společného balíku a kombinovaný statický/dynamický import MasterySystem.
- Globální `npx tsc --noEmit` není zelený kvůli existujícím chybám mimo tuto úpravu (např. ArenaScene, BattleScene, CharacterSelectScene). Ve změněných souborech této úpravy nehlásí chybu. Nejde o tvrzení, že celý repozitář prošel typecheckem.
- Ve finálních dílčích bězích prošlo všech 12 odlišných scénářů ze souborů `underwater-branches.spec.ts` a `underwater-wreck.spec.ts` (včetně opakování opravených testů; nešlo o jeden čistý úvodní běh). Ověřují obě pořadí původních větví, jejich co-op postup, průchod vrakem bez boje, skutečný volitelný boj sólo/co-op, obě odměny, návrat na místo souboje, reload savu a nově připojeného spoluhráče bez připsání historických bojů. Testy používají izolované profily; preview bylo vráceno do menu a herní/editorový server nebyl restartován.
- Vizuální testy kontrolují rozlišení 1280 × 720 (WebGL), 1024 × 768 a 1280 × 800 (Canvas fallback): truhlu normální, hover, stisk, pointer-out, chybnou odpověď, nápovědu/disabled a dokončení; vítězství disabled, normální, hover, stisk, druhou stránku odměn a opakované vítězství. Bounds/aspect audit doplňuje ruční prohlédnutí skutečných screenshotů. Dlouhá kooperativní jména, sedm krystalů a tři stavové zprávy se vejdou do oddělených oblastí bez natahování bitmap.
- V průběhu QA opraveny dva testovací předpoklady: čekání na ukončení příchodového přechodu před dalším klikem a vyhledání runtime textu místo jeho SceneBuilder placeholderu. Starý limit 45 s pro kooperativní souboj prodloužen na 120 s; obtížnost, počet nepřátel a produkční časování tím nebyly změněny. Opravené scénáře byly spuštěny znovu.

Prohlédnuté finální snímky jsou v `artifacts/underwater/`: `wreck-mcp-final.png`, `enamel-1280x720-hold.png`, `chest-first-polish.png`, `enamel-1024x768-lock-complete.png`, `enamel-1024x768-close-pressed.png`, `enamel-1280x720-victory-disabled.png`, `enamel-1280x800-victory-normal.png`, `enamel-1280x800-victory-page2.png`, `enamel-1280x800-victory-repeat.png` a související interakční stavy pod stejným prefixem. Normalizované ikonové páry byly také prohlédnuty samostatně v `asset-review/enamel-symbols.png`.

Omezení: tablet je ověřen emulovaným viewportem a Canvas rendererem, ne přímo na fyzickém Samsungu. U09–U11 ani úplná regresní sada celé hry nejsou součástí této přejímky.

## Přesné prompty

### post-wreck

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-022ecd27-e13c-46cb-a36c-ce6f91bee972.png`

Reference: `public/assets/images/underwater/reed-garden-v2.webp`, `public/assets/images/underwater/sunken-canal-passages.webp`.

```text
Game environment background for Little Math Adventure, Silverpond underwater chapter. Images 1 and 2 are STYLE and ARCHITECTURE references, not edit targets. Create a beautiful painterly high-detail 16:9 scene underwater outside a small sunken freshwater postal ship. Same turquoise light shafts, warm aged brass and mossy stone, soft storybook realism, no people or text. IMPORTANT exact navigation geometry: THREE and only three walk-through openings. Left side at roughly 12% canvas width / 57% height: a stone arch with teal roof matching the garden reference, leading into bright kelp garden. Right side at roughly 89% / 58%: another stone arch matching the canal reference, with one brass pipe going into the wall, leading to blue ruins. Third at 60% / 48%: a large rounded wooden doorway cut into the side of the sunken postal ship, leading into its dark warmly glowing cargo hold. It must be recognizably a ship hull, curved wooden ribs, tarnished brass envelope emblem ABOVE doorway without letters, broken mast above, old ropes and sealed parcels tucked into corners. Ship occupies middle background, door remains clearly visible. Solid hull everywhere else, no additional holes/windows resembling routes. Broad unobstructed sandy stone foreground walkway across full width at 74–88% height; leave clear staging areas at 36% and 72% width. Do not paint a chest, enemy, puzzle UI, character, numbers, labels, arrows or interface. Entire scene submerged, not above water. Rich harmonious composition as polished as reference. No flat graphic overlays.
```

### wreck-hold

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-68893b35-a52c-4f1c-8590-b9872062154d.png`

Reference: `public/assets/images/underwater/reed-garden-v2.webp`, `public/assets/images/underwater/sunken-canal-passages.webp`.

```text
Game environment background for Little Math Adventure, Silverpond underwater chapter. Images are style references: preserve softly painterly detailed storybook freshwater underwater aesthetic, teal caustics, warm weathered wood, patinated brass, readable play area. Create a 16:9 interior of the cargo hold of a small sunken postal ship. Curved sturdy wooden ribs and planks frame the upper ceiling. Stacks of sealed postal parcels, tied mailbags and shelves at the rear, small pearl lamps, dusty underwater bubbles, subtle kelp. EXACTLY ONE traversable opening: a large rounded timber doorway on the LEFT at 15% width, 55% height, showing the blue outdoor lake ruins beyond. No second door, corridor, large crack, hatch, window or false exit. Back wall closed and readable, center-right an empty low broad wooden pedestal at about 68% width / 71% height, for a separate interactable postal chest later. DO NOT paint the chest. Foreground at 73–87% height is broad and clear, level floorboards with sand, no obstacles crossing movement path. Small envelope emblems are okay but NO text, numbers, UI, arrows, people, creatures or puzzle parts. Look like a cozy mysterious optional treasure room, not scary or gloomy. Entire interior under water, clear visibility, high polish.
```

### clue-plaque

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-b1a44976-e638-4700-a0a3-fcd22248fc74.png`

Reference: `public/assets/ui/story/silverpond-fairy-reward/reward-frame.webp`.

```text
Match the supplied game UI reference and preserve one shared visual system. Create only the requested structural frame; do not add text. For any state pair both states must be generated together with identical silhouette, pose, scale, cell size and placement, changing only light, glow or compact particles. Use a perfectly flat #00ff00 background, no cast shadow or ambient scenery. Keep generous clear padding around every asset, do not crop any ornament. Result will be chroma-keyed, centered on transparent canvas and composed with runtime text and code-driven interaction; no baked labels or hit areas. ELEMENT: one front-facing square clue tablet for a submerged rotating-lock treasure chest, aspect 1:1. Match the reference dark blue enamel, fine patinated gold/brass edging and tiny pearl rivets. A restrained nautical postage-stamp shape, gently rounded corners, tiny shell filigree only at corners. Thin border takes at most 10% of width on each side. At least central 78% width and 78% height is EMPTY smooth deep navy-blue enamel, low contrast, no inset symbols, no dividers, no jewels in writing space, no letters, numbers, glyphs, lines of imitation writing or logo. Delicately rusty outer brass to fit a submerged lock. Straight symmetrical front view, not tilted or perspective, useful at small game size. ONE plaque centered, generous green padding.
```

### control-socket

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-35d6504b-3812-4c03-b8ff-3862212b5356.png`

Reference: `public/assets/ui/story/silverpond-fairy-reward/reward-frame.webp`.

```text
Match the supplied game UI reference and preserve one shared visual system. Create only the requested structural frame; do not add text. For state pairs generate both states together with identical silhouette, pose, scale, cell size, placement, changing only light/glow/compact particles. Perfectly flat #00ff00 background, no cast shadow or scenery. Generous clear padding, no cropped ornament. Result will be chroma-keyed and composed on transparent canvas with separate aligned icons and code animation. ELEMENT: exactly one small round empty icon-button socket, front-facing, same blue enamel and delicately tarnished gold-brass as supplied Silverpond frame. Thin sculpted brass ring, four tiny pearl studs at cardinal points, elegant shell curls subtle and compact. Empty deep midnight blue circular center, center should span 65% of total diameter to hold a runtime icon. Circular symmetrical stable silhouette. No text, no icon inside, no check, no cross, no glow cloud, no surrounding panel. Production raster game UI asset at small size, polished painterly finish, not generic flat vector.
```

### control-symbols

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-fea097e3-79fe-4154-b57a-b260bdadc792.png`

Reference: `public/assets/ui/story/silverpond-fairy-reward/reward-frame.webp`.

```text
Match supplied game UI reference and preserve one shared visual system. Create only requested isolated icon pairs, no frames and no text. Generate both states of every pair together with IDENTICAL silhouette, pose, scale, cell size and placement; change ONLY light, glow or compact particles. Perfectly flat #00ff00 background, no shadow or ambient scenery. Generous clear padding around every asset, do not crop. Output is an exact 2-column by 4-row grid, eight equal SQUARE cells, overall 1:2 portrait aspect. Left column normal, right column active. Identical icons centered exactly in each cell, all fit inside central 60% cell, active glows within central 74%. Shared palette warm ivory pearl and aged gold edges, blue-enamel accents. Row1 two identical simple solid beveled ivory CHECKMARK icons, right copy subtle turquoise edge glow. Row2 two identical beveled ivory X/CLOSE icons, right copy subtle turquoise glow. Row3 two identical small pearl lightbulb icons (hint), right copy lit with warm pearl glow. Row4 two identical right-facing curved golden arrow icons (continue), right copy warm luminous edges. Crisp readable silhouettes, dimensional painted game icons, no letters, no labels, no extra symbols, no circles/disks/backplates or borders. Both copies must have EXACT same base geometry and alignment. Keep symbols friendly and restrained.
```

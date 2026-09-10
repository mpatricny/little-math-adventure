# Podvodní tvorové — produkční animace

8. září 2026. Dokončení po výslovném schválení vzdáleného AutoSprite zpracování uživatelem.

## Zapojení do hry

- Perlová medúzka: klidové vznášení, útok, reakce na zásah a porážka.
- Strážce hlubin: klid, reakce na zásah, porážka a tři různé útoky. Fáze v `encounters.json` vybírají `depth-guardian-attack`, `depth-guardian-attack-tide` a `depth-guardian-attack-crystal`.
- Nové útoky mají opt-in `holdUntilComplete`: návrat nepřítele čeká na skutečné dokončení animace, včetně blokování a třetího krystalového efektu. Starší tvorové ponechávají původní časování.
- Data textur, animací, nepřátel a editorových assetů odkazují na stejné produkční soubory v `public/assets/sprites/silverpond/`. Aliasy hurt/death odkazují na defend/defeat.
- Světlo interakce se kreslí za tvorem, ne přes jeho barvy. Nové výškové okraje `frameTopInset` (medúzka 80 px, strážce 58 px) odečítají průhlednou část snímku při připojení bojového HUD. SceneBuilder zůstává autoritou layoutu.
- Větší hosty v jeskyni a srdci kompenzují společné průhledné okraje. Osvobozený strážce má vlastní přátelskou animaci a oddělené hosty nad cestou; viz navazující úprava níže.

Nezměněny bojové statistiky, pravidla odměn ani save schéma. Tato integrace nevyžaduje databázovou migraci.

## Skutečný zdroj pohybu

Deset Sorceress `imagine-1.5` image-to-video zdrojů je v `artifacts/sorceress/underwater-finalists/`. Před extrakcí byly posouzeny kamera, anatomie, okraje i extrémy pohybu a efektů. Postup nepoužívá deformování statického obrázku, morphing ani převod starého spritesheetu na falešné video.

AutoSprite změnil barevnost strážce a hlásil 30 FPS, zatímco fyzické zdrojové video má 24 FPS. Proto produkce používá původní video RGB a pouze zarovnanou AutoSprite alfu. Zarovnání bylo změřeno podle siluet; klíčování chrání aktuální pevné jádro těla a omezuje zelený okraj podle aktuálního zdrojového snímku. Nespoléhá na neodpovídající vzdálené časové metadata.

Vzorkování skutečného zdroje: Every 4 při 24 FPS → 6 FPS. Jedna společná transformace pro všechny pohyby daného tvora, nikdy nezávislé ořezávání snímků. Finální canvas je vždy 512 × 512. Společné čtvercové výřezy z pracovních 512px zdrojů: medúzka `(8,18,491,501)`, strážce `(22,24,488,490)`.

| Pohyb | Unikátní snímky | Přehrávání |
|---|---:|---|
| Idle, oba tvorové | 13 každý | Vpřed/zpět, bez opakování krajního snímku |
| Attack, oba tvorové | 9 každý | Jednorázově |
| Defend, oba tvorové | 7 každý | Jednorázově |
| Defeat, oba tvorové | 9 každý | Jednorázově |
| Vodní útok strážce | 9 | Jednorázově |
| Krystalový útok strážce | 13 | Včetně doznění celého efektu |

Celkem 98 unikátních snímků, deset WebP spritesheetů, přibližně 3,8 MB. RGB je komprimované, alfa zůstává přesná.

## Reprodukce a artefakty

- `scripts/sorceress-underwater-finalists.mjs`: vzdálené generování a keying s uloženými ID úloh; manifest `jobs.json` předchází duplicitnímu účtování po nejistém výsledku. API klíč se nevypisuje ani neukládá do manifestu.
- `scripts/inspect-underwater-key-alignment.py`: kontrola shody vzdálených masek se skutečnými zdrojovými snímky.
- `scripts/build-underwater-finalist-sheets.py`: lokální extrakce, konzervativní klíčování, společný canvas, kontaktní přehledy a animované náhledy.
- `scripts/verify-underwater-finalist-sheets.py`: read-only kontrola všech výsledných snímků, přesné alfy, bezpečného odstupu od okrajů a HUD insetu.
- `artifacts/sorceress/underwater-finalists/production.json`: zdrojové snímky, alfa mapování, výřezy a produkční soubory. Ve stejné složce jsou `*-frames`, přehledy na světlém/tmavém podkladu a `*-preview.webp`.

## Vizuální kontrola a testy

Otevřeny a posouzeny kontaktní přehledy všech deseti výsledných pohybů včetně prvního, posledního a extrémních snímků. V herním přehrávání zkontrolovány všechny klipy na desktopu 1280×720 a skutečném Canvas rendereru 1024×768; celý co-op souboj navíc v Canvasu 1280×800. Proporce zůstávají jednotné, těla ani efekty nejsou useknuté, ovládání není překryté.

První herní kontrola odhalila světlo překrývající barevnost strážce a HUD ukotvený k průhlednému okraji. Obojí bylo opraveno a vizuální testy zopakovány. Výsledné obrazy v `artifacts/underwater/`: `creature-*-world/idle/attack/attack-tide/attack-crystal/hurt/death.png`, dále `finale-false/true-battle.png`, obě mezifáze, osvobozený strážce a odměna. Ze závěrečného běhu byly přímo posouzeny svět s nepřátelským strážcem, všechny jeho útoky, klid/zásah/porážka obou tvorů, útok medúzky, obě co-op mezifáze a osvobozený strážce.

- Produkční kontrola: **98/98 snímků prošlo**, přesná alfa a bezpečné okraje.
- Registrace animací, prezentace nepřátel a podvodní layout: **20 testů / 3 soubory prošly** v závěrečném cíleném běhu.
- **4 E2E scénáře prošly v jednom běhu**: všechny pohyby desktop/Canvas a celý skutečný boss v sólo/co-opu. Test kontroluje dokončení všech tří fázových útoků, správné odměny a reload před vyzvednutím krystalu. Sólo zaznamenalo 58, co-op 102 skutečných odpovědí při testovacím vybavení, nikoli při simulaci bojového výsledku.
- **Samostatný skutečný souboj s medúzkou prošel**, včetně návratu postavy na místo střetu.
- Závěrečný `npm run build` prošel; přetrvávají upozornění na velikost chunku a smíšený import MasterySystem.
- Celkový souběžně měněný workspace není celý zelený: poslední `npm test -- --silent --reporter=dot --maxWorkers=2 --testTimeout=30000` měl **340 úspěšných / 1 neúspěšný test**. Selhal `PuzzleCatalog.test.ts:22` (očekávané odmítnutí katalogu s 19 položkami), mimo integraci animací. Katalog puzzlů nebyl v této práci měněn. Starší běh zachytil překrytí flow karet; aktuální samostatný layout test již prošel. Tyto výsledky nejsou tvrzením o prvním bezchybném běhu celé sady.

Testy používají izolované profily. Běžící hra na 8001 ani editor na 5173 nebyly restartovány, skutečné savy nebyly měněny. Fyzický Samsung nebyl ovládán; Canvas test není tvrzením o testování konkrétního zařízení.

## Osvobozený strážce — přátelský pohyb a volná cesta

Navazující oprava po playtestu: původní statická ilustrace se překrývala s hráčem vráceným správně na místo střetu. Hráčův návrat ani uložené souřadnice se proto nemění. Strážce po výhře plave z `calmGuardianArrivalHost` do samostatného `calmGuardianHost`, vlevo a výše od místa boje. Celý jeho snímek je nad pohybovou cestou včetně bublin hráčů a mimo krystal. Pozice, velikost i hloubka zůstávají v `scenes.json`.

- Nové skutečné video vychází z `guardian-calm.webp`, nikoli z nepřátelského idle. Přátelská tvář, mrkání, pokyvování hlavy a samostatný pohyb ploutví/ocasu. Zdroj prošel kontrolou před extrakcí: 49 snímků, 24 FPS, 960×960, minimální okraj 182 px.
- Stejný Sorceress + AutoSprite workflow, 13 unikátních 512px snímků při 6 FPS, společný výřez `(126,120,437,431)`. Jedna forward/reverse smyčka bez duplicitních krajních snímků. Klidný tělesný pohyb pochází z videa; tween pouze přemisťuje celého tvora ve světě.
- Produkce: `public/assets/sprites/silverpond/depth-guardian-friendly-idle.webp`. Registrace jako samostatné NPC, ne nový bojový nepřítel. Šablona `characters.npcs.depth_guardian_friendly`; animace `depth-guardian-friendly-idle`.
- Při návratu z čerstvého vítězství proběhne 2,2sekundové odplutí. Reload nebo další návštěva zobrazí strážce přímo v jeho přátelském idle; prezentace nepřepisuje save ani znovu neuděluje odměnu. Nouzové chybějící animaci zůstává klidná ilustrace ve správném prostoru, nikoli chybová textura.
- Pro reprodukci použij `scripts/prepare-friendly-guardian-reference.py` a u generování, kontroly, stavby a validace stávajících `*-underwater-*` skriptů příznak `--friendly`. Oddělené zdroje a manifest: `artifacts/sorceress/underwater-friendly-guardian/`.
- Posouzeny zdrojový kontaktní přehled, jednotlivé první/poslední/extrémní snímky a všechny vyextrahované snímky na světlém i tmavém podkladu. Automatická kontrola přesné alfy a odstupu od okrajů prošla pro všech **13 snímků**.

Save schéma se nemění; před testy ověřeno, že tato úprava nevyžaduje databázovou migraci.

Závěrečné ověření této úpravy: **23 cílených unit testů / 3 soubory, 4 E2E scénáře a produkční build prošly**. E2E zahrnuje celý sólo boj se skutečnými 58 odpověďmi a předáním příznaku čerstvého vítězství, dále odplutí, měnící se snímky idle, oddělení od hráčů/krystalu, průchod pod strážcem, starší save, vyzvednutí krystalu a reload v desktopu 1280×720, Canvas 1024×768 a co-op Canvas 1280×800. Otevřeny a vizuálně posouzeny `friendly-desktop-departing/resting/swim-under.png`, `friendly-tablet-resting.png` a `friendly-coop-tablet-loaded/swim-under.png` v `artifacts/underwater/`; žádný přesah strážce do hráčů, názvu místnosti, ovládání nebo krystalu. Celá ostatní unit sada nebyla v této navazující úpravě spouštěna znovu. Fyzický tablet ani skutečné savy se nepoužívaly; původní server 8001 zůstal běžet.

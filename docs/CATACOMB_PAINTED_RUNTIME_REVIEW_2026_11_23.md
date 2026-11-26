# Malované katakomby a úvodní schopnosti lišky — kontrola 23. 11. 2026

## Druhý výtvarný průchod po připomínkách z tabletu

Autor na tabletu odmítl první výtvarné provedení. Níže zaznamenaný první průchod prokázal funkčnost, při jeho vizuální kontrole ale prošly statická druhá liška, tlapky před podstavci a obsah přes zlaté lemy.

Ve druhém průchodu se kontrolovaly snímky přímo v cechu vedle schválených maleb. Playwright ověřil oba renderery, pohyb na podstavcích a průchod zkouškou se zamčenou a otevřenou branou. Samostatný izolovaný průchod zkontroloval dvě dlouhá jména, přepnutí vlastníka, připnutí smíšeného modulu a skutečnou šířku typografie i časové osy. Při kontrole vyšly najevo příliš krátká tyč, svítící zámky budoucích lekcí a přesahy textů. Opravy jsou zahrnuté v těchto výsledných snímcích. Běhy používaly syntetické profily.

- [Animace obou lišek přímo ze hry](../artifacts/catacomb-art-pass2/moje-liska-loop.webp)
- [První zkouška](../artifacts/catacomb-art-pass2/hra-tablet-trial.png) a [pokročilá liška s volnými body](../artifacts/catacomb-art-pass2/moje-liska-vylepseni.png)
- [Otevřená časová zkouška](../artifacts/catacomb-art-pass2/hra-tablet-speed-open.png) a [zamčená zkouška](../artifacts/catacomb-art-pass2/hra-tablet-speed-closed.png)
- [Dlouhá jména, nejbližší modul a připnuté smíšené procvičování](../artifacts/catacomb-art-pass2/tablet-pinned-mixed.png)

## Původní průchod

Schválené panely Katakomby / Moje liška jsou zapojené do skutečného cechu. Obrazové podklady vznikly z odsouhlasených malovaných návrhů; čísla, popisky, výběr hráče, hit areas a stav tlačítek vykresluje Phaser. Žádný nový vzhled ani pohybová sekvence lišky se touto integrací neschvaluje: používají se existující schválené podoby, základní idle a sdílené bojové efekty.

## Výsledné chování

- Hlavička vždy ukazuje vybraného vlastníka a jeho skutečný připnutý/effective trénink, také na obrazovce Moje liška.
- Prohlížení, `Procvičovat` a `Vstoupit` jsou samostatné operace. Pouhé prohlížení nic nepřipíná ani nepřepíná v uloženém profilu.
- Seznam obsahuje všechny otevřené moduly se stránkováním. Otevřené zkoušky jsou první, další se řadí podle sdíleného `readinessPercent`.
- Časová osa používá skutečný čas dítěte a skutečné hranice. Zamčená základní zkouška má obrazový důvod a při dotyku zámku přehraje volitelný český klip `vo.catacomb.exam-first`; zvuk respektuje ztlumení.
- Moje liška zobrazuje skutečný útok, nynější a další podobu, růst a tři cesty schopností. Body z vyšších rychlostních zkoušek se přidělují výslovným dotykem po absolvování všech tří úvodních lekcí.
- Úvodní lekce štít → léčení → zásah lze plnit v kterémkoli již zvládnutém modulu po prvním/druhém/třetím původním zvýšení útoku lišky. Každá vyžaduje tři nové správné první odpovědi a praktické použití schopnosti. Nemá časový limit a nepřidává časové mastery záznamy, útok ani růstové body.
- Chybná odpověď se neopravuje na druhý úspěch stejného příkladu. Při vyčerpání konečné zásoby nezávislých příkladů zůstane dítě ve scéně a může výslovně zkusit nový pokus nebo odejít.
- Ukázka štítu skutečně odrazí viditelný projektil slizu; léčení doplní srdce a zásah ubere srdce protivníka. Odměna vzniká až po ukázce. Opakovaný callback ji neudělí znovu.
- Lekce i běžná zkouška pracují se zvoleným účastníkem co-op a po návratu obnoví předchozího aktivního hráče. Liška se automaticky nevybavuje; `Vzít lišku` je samostatná volba.
- Výsledek zkoušky vždy počítá z celého kola: například 10/10 správně a 10/10 rychle. Vlaječka na řádku teček označuje požadovanou hranici, například devátou rychlou odpověď. Pravidlo samotné se nemění.

## Hlavní soubory

- `src/ui/CatacombProgressOverlay.ts`, `src/ui/CatacombPaintedUi.ts`
- `src/scenes/FoxLessonScene.ts`, `src/systems/FoxLessons.ts`
- `src/systems/CatacombTrialOwner.ts`, úpravy `CatacombTrialScene.ts` a `CoopSessionManager.ts`
- `src/ui/CatacombTrialUI.ts`
- Hosty a safe oblasti v `public/assets/data/scenes.json`, registrace v `assets.json` a `textures.json`
- `SceneAssetPlugin.ts`: FoxLessonScene zachovává katakombový rám ve filtru témat společného MathBoardu. Ukázky neimportují nepotřebné walk/attack/defend animace postavy.

Přidělování bodů a kompatibilitu starších odměn v `FoxAbilitySystem.ts` / `CatacombProgress.ts` a vnější cechovní dveře v `GuildHallUI.ts` upravoval souběžný implementační chat. Tato integrace jejich skutečné výsledky čte; neobsahuje kopii pravidel.

## Obrazové podklady

- Produkční bitmapy: `public/assets/ui/catacomb-painted-v2/` — 9 WebP, žádný rozměr přes 2048 px.
- Uchované zdroje: `docs/design-drafts/shared/catacomb-painted-v2/source/`.
- Původ a prompty: `docs/design-drafts/shared/catacomb-painted-v2/provenance.json`. U dvou čištěných pozadí je výslovně označen rekonstruovaný popis, ne přesný původní prompt.
- Opakovatelný export: `node scripts/build-catacomb-painted-assets.mjs [výstupní-adresář]`. Výchozím cílem jsou produkční bitmapy. Opětovný ztrátový WebP export se může lišit od původního kódování; sdílené výřezy, alfa a rozměry jsou pevné.
- Ikony otevřených/zavřených dveří mají společný výřez a stejné transparentní plátno. Hover a stisk nevyměňují celé bitmapy; pohybuje se vnitřní plocha se svými ikonami/popisky, hit area zůstává pevná.

## Ověření

Změny používají klientský save JSON; není nutná databázová migrace. Testy před spuštěním ověřily tuto závislost a běžely pouze s izolovanými syntetickými profily a zachycenými dev-save/API požadavky. Rodinné savy se neotevíraly pro zápis. Běžící herní server na portu 8001 zůstal zachován.

- 40 testů v pěti sadách: `FoxLessons`, `CatacombProgress`, `FoxAbilitySystem`, `FoxAbilityAllocation`, `FoxAbilitySave`.
- 14 testů editorového rozložení v `BattleUiMockLayout.test.ts`.
- 12 testů manifestu v `scripts/__tests__/scene-assets.test.mjs`.
- `playwright test --config e2e/catacombs/fox-lessons.config.ts`: dva úplné dotykové průchody (Canvas a WebGL, 1024×600) a samostatná hranice vyčerpání příkladů. V obou úplných průchodech Eli získala všechny tři schopnosti v C1, zůstala jí želva, trénink A1 a původní útok 9. Druhá postava nezískala odměnu; její průběžné měření času hraní se správně neporovnává jako neměnný stav. Ověřeno i obnovení po reloadu a absence nových časových mastery záznamů.
- `playwright test --config e2e/catacombs/speed-levels.config.ts --grep 'real door, map, new trial and saved rune: webgl'`: skutečná vyšší zkouška, blokovaný vstup, explicitní připnutí, bod pro lišku, odměna jen jednou a reload uloženého výsledku.
- Celoprojektový `tsc --noEmit` nad sdíleným rozpracovaným stromem stále hlásí chyby v jiných částech (například ArenaScene/BattleScene). V souborech této integrace při kontrole žádná chyba nebyla. Nejde o potvrzení čistého celoprojektového buildu.

## Vizuální přejímka a pre-reader kontrola

Byly skutečně prohlédnuty screenshoty níže, včetně odstraněných slov a vypnutého zvuku. Potvrzují hierarchii, rozestupy, proporce rámů, viditelné počty, chybné/nové zadání, volbu schopnosti a její výsledek. Dotykové ovládání používá společný ověřený `PracticeChoiceControl`; nové hlavní cíle na 1024px tabletu přesahují 44 CSS px.

- `artifacts/catacomb-painted-review/canvas-shield-overview.png`
- `artifacts/catacomb-painted-review/webgl-shield-question.png`
- `artifacts/catacomb-painted-review/canvas-wrong.png`
- `artifacts/catacomb-painted-review/canvas-shield-demo.png`
- `artifacts/catacomb-painted-review/canvas-heal-demo.png`
- `artifacts/catacomb-painted-review/canvas-strike-victory.png`
- `artifacts/catacomb-painted-review/canvas-journey.png`
- `artifacts/catacomb-painted-review/webgl-journey-no-words.png`
- `artifacts/catacomb-painted-review/webgl-victory-no-words.png`
- `artifacts/catacomb-painted-review/webgl-retry-no-words.png`
- `artifacts/catacomb-speed/webgl-exam-lock.png`
- `artifacts/catacomb-speed/webgl-reward.png`

Samostatný reviewer navíc přes Playwright MCP otevřel oba skutečné panely a ověřil přepnutí Kitten/D1 → Eli/A1 při zachování obrazovky Moje liška. V tomto chatu nové MCP kontexty odmítal zámek sdíleného profilu; nebyl ukončen cizí ani uživatelův prohlížeč. Místní průchody proto používaly samostatný Playwright Chromium. Doložení z MCP a izolovaných průchodů se doplňuje; automatický průchod nenahrazuje vizuální přejímku.

Poslední čistě prostorová korekce přesunula spodní výsledkovou řádku o 6 px nahoru, aby číslo času mělo mezeru nad vlaječkou. Nemění podmínky splnění ani časové limity. Nezávislý reviewer ji následně ověřil skutečným WebGL průchodem na izolovaném portu 8196; snímek `artifacts/catacomb-speed/webgl-reward.png` z 15:14 ukazuje zřetelnou mezeru a čitelnou devátou tečku. Potvrdil přijetí obou hlavních panelů, zkoušek i ukládání. Starší části hry mimo uvedené panely a lekce nejsou tímto dokumentem vizuálně schválené.

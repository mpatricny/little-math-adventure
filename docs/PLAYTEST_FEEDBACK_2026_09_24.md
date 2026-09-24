# Playtest — české názvy a první kroky ve hře

Zapracováno lokálně, bez nasazení. Navazuje na [kontrolu názvosloví webu a hry](BRANDING_REVIEW_2026_09_24.md).

## Chování

- Nová postava prochází výběrem vzhledu a jména, potom samostatným výběrem počítání. Nejlehčí úroveň není automaticky předvolená. Uložení nové hry proběhne až po potvrzení obtížnosti. Návrat zachová jméno, postavu i již vybranou úroveň. Stejný postup používá i starší obrazovka založení postavy.
- Pět dřevěných karet má velké rozsahy, ukázkové příklady a rostoucí počet hvězd. Potvrzení zůstává vypnuté do výběru. Texty jsou krátké; delší vysvětlení patří do hlasu.
- Menu používá „Nahrát uložené hry“ a „Stáhnout uložené hry“. Aréna používá kola, karta postavy mazlíčka. Poškození a síla mazlíčků se zobrazují symbolem meče a číslem. Krystalové hodnoty jsou větší, včetně cen mazlíčků. Interní názvy polí a formát uložených her zůstávají kompatibilní.
- Úvod souboje říká „Klikni na meč. Pak spočítej příklad.“ Úvod arény vysvětluje osvobozování zmatených tvorů. Obrázek výsledku obsahuje srdce, takže změnu nesděluje jen barva.
- Pythiina cedule má český nápis vykreslený za běhu. Při výběru dosud nevlastněného mazlíčka bez odpovídajícího krystalu se zobrazí obrázková ukázka a zazní rada s kovárnou. Ukázka rozlišuje tvar krystalu a používá skutečná pravidla výroby.
- Kovárna předvede spojení a rozdělení krystalů při prvním vstupu. Vytvoření fragmentu, rozdělení fragmentu, odsekávání a vytvoření prizmatu se vysvětlují až po odemčení. Ukázka zvýrazní příslušné tlačítko, animuje vstup a výsledek a umožní opakování.
- Obchod má první hlasový a obrázkový úvod. Po prvním nákupu meče nebo štítu se předvede odpovídající příprava. Úvod se nabídne také starší postavě, která už výbavu vlastní a ukázku ještě neviděla.
- Dokončení ukázek se ukládá samostatně pro každou postavu. Předčasně zavřená ukázka se nepovažuje za dokončenou. Přehrání ani ukázka neutratí krystaly, mince či manu, neudělí runy ani matematický pokrok. Hlas se při zavření a odchodu zastaví.

Příprava nadále používá nejvýše **tři užitečně spotřebované runy**, podle `src/data/preparation.json`. Meč posílí úspěšný útok, štít zachytí dodatečné poškození. Nejde o časovač tří arénových kol. Hlas odpovídá těmto stávajícím pravidlům; jejich změna nebyla provedena.

## Vizuální kontrola

Použity brány `docs/UI_PRE_READER_GATES.md` a kontext `docs/ASSET_CREATION.md`. Nové statické prvky mají hosty v `scenes.json`. Výběrové karty i návody používají jeden existující dřevěný rám. Jeho záměrná devítidílná kompozice zachovává rohové plechy a funguje přes běžné obrázky v Canvas i WebGL. Kompletní bitmapová cedule Pythie se přizpůsobuje rovnoměrně.

Zkontrolované snímky jsou v `artifacts/playtest-feedback/`:

- `desktop-webgl-level-disabled.png`, `desktop-webgl-level-selected.png` a jejich tabletové protějšky: oddělené karty, velká čísla, dostatek místa, zakázané a vybrané potvrzení.
- `production-*-level-hover.png`, `production-*-level-pressed.png`, `production-*-level-pointer-out.png`: stabilní plocha kliknutí a společný pohyb rámu s obsahem.
- `desktop-webgl-pythia-normal.png`, `tablet-canvas-pythia-normal.png`: česká cedule, větší cena krystalu a meč u síly mazlíčka.
- `desktop-webgl-missing-crystal.png`, `tablet-canvas-missing-crystal.png`: hlas doprovází skutečný vizuální příklad.
- `*-forge-forge.merge.v1.png`, `*-forge-forge.split.v1.png` a `advanced-forge.*.png`: zvýraznění správného ovládacího prvku, prostor pro vstupy, výsledek a ovládání.
- `advanced-prism-no-prose-muted.png`: obrázkový postup funguje s vypnutou řečí a skrytým slovním textem.
- `*-shop-shop.sword.v1.png`, `*-shop-shop.shield.v1.png`: cílové tlačítko zůstává celé nad panelem ukázky; runy se postupně vyčerpávají.
- `advanced-crystal-values.png`: jednociferná i dvouciferná čísla v inventáři.
- `production-*-forge-*.png`: skutečné hover/press/pointer-out stavy; rozměry a pozice plochy kliknutí se nemění.
- `production-*-character-book.png`: český název mazlíčka a symboly síly výbavy se vejdou do původních polí knihy.
- `production-*-arena.png` a `production-*-battle.png`: kola, skutečné tlačítko vstupu do souboje a načtená herní grafika.

Playwright MCP měl obsazený sdílený profil. Kontroly proto běžely v samostatně spuštěných izolovaných prohlížečích Playwright. Starší okolní UI není tímto označeno za kompletně schválené: například některé původní dekorativní nine-slice prvky nemají v Canvas vykreslení. Nové karty a panely tuto závislost nemají. Mobilní kontrola napodobuje změnu visualViewport; nenahrazuje fyzické zařízení s nativní klávesnicí.

## Ověření

Změny nevyžadují databázovou migraci. Testy používají místní uložené hry a mock volitelného účtového API.

- `npm run build:pilot` — úspěšné sestavení.
- 31 testů v `SaveTransfer`, `PreparationSystem`, `MenuTransferAndFullscreen`, `AudioSettings` a `MasteryThresholds` — prošlo. Přidaná kontrola ověřuje, že export a import zachovají dokončené návody jednotlivých postav odděleně.
- `npm run test:pilot-content` — 9 kontrol prošlo.
- `npm run test:landing` — desktop a tablet, obrázky a stavy ovládání prošly.
- `scripts/check-playtest-feedback.mjs` — povinný výběr, návrat ke jménu, uložení zvolené úrovně, návody, Pythia, obchod a aréna v desktop WebGL a tablet Canvas.
- `scripts/check-playtest-guidance.mjs` — postupné odemykání všech operací, přehrání a zastavení hlasu, uložení po reloadu, nezávislost postav, žádné udělování odměn a úvod po nákupu štítu.
- `scripts/check-mobile-layout.mjs` — telefon WebGL/Canvas, tablet a desktop; psaní, otočení, simulace klávesnice, návrat a uložení.
- Produkční kontrola: `artifacts/playtest-feedback/production-smoke.mjs`, včetně karty postavy a vstupu do skutečného arénového souboje. Mock API je omezený na kořenové `/v1/`, aby neblokoval obrázky v podadresářích se stejným názvem.
- Úplné `tsc` má předchozí chyby projektu. Porovnání s HEAD našlo 142 původních diagnostik a 141 v upraveném stromu, žádnou nově zavedenou. Výsledek: `artifacts/playtest-feedback/typecheck.json`.

## Hlas a obrázek

Přibylo 19 místních českých nahrávek, dohromady přibližně 119 sekund. Obsazení: Zyx / Will a Pythia / Lily, model `eleven_multilingual_v2`. Generátor použil 812 zahrnutých kreditů, nic nedokupoval. Kontrola dekódování a normalizace špiček je v `docs/audio/playtest-voice-checks.json`. Nahrávky jsou zapojené a ověřené přehráním v herním mixeru; samostatný lidský poslech výslovnosti není označen za schválený. API se během hraní nevolá.

Úprava cedule vznikla vestavěným nástrojem ImageGen v režimu editace existujícího obrázku, podle skillu `imagegen`. Zdroj: `public/assets/library/originals/3f568795-56a6e242.webp`. Produkční výstup: `public/assets/ui/workshop/pythia-sign-blank.webp`. Výsledek byl oříznut jednou podle průhlednosti a rovnoměrně vložen do průhledného plátna 700 × 162; původní soubor zůstal zachovaný.

Použitý prompt:

> Use case: precise-object-edit. This is an edit of the supplied medieval wooden workshop sign, a production game UI asset. Remove ALL English lettering from its dark brown center and reconstruct a clean, uninterrupted dark wood/brown surface in exactly the same lighting and painterly texture. Preserve the entire canonical decorative outer wooden frame, four gold diamond corner studs, border thickness, perspective, palette, and original extremely wide sign proportions (about 4.3:1). Do not add any text, numerals, logos, objects, shadows or ornaments. Show the complete intact sign on a genuinely transparent background with a small even clear margin around it; no green, no scenery, no edge clipping, no stretching. The game is for children who cannot read: titles and labels are separate runtime text, never baked into images. Stateful UI must reuse this one stable frame; no alternate state or redraw. Keep the center empty so the game can render a short Czech title. Output only the edited reusable sign.

# Vývojová hra a pilot Číslokraje

Jeden repozitář a společná herní logika, dva samostatné výstupy. Oprava souboje,
výuky nebo ukládání se provede jednou a při příštím sestavení se dostane do obou
variant. Veřejnou verzi určuje build; nejde ji přepnout URL parametrem nebo savem.

| Použití | Příkaz | Adresa / výstup |
|---|---|---|
| Běžný vývoj, celá hra | `npm run dev` | `http://localhost:8001` |
| Zkoušení pilotu | `npm run dev:pilot` | `http://localhost:8002` |
| Sestavení pilotu | `npm run build` nebo `npm run build:pilot` | `dist/pilot` |
| Sestavení celé vývojové hry | `npm run build:dev` | `dist/development` |
| Náhled sestaveného pilotu | `npm run preview:pilot` | `http://localhost:8012` |
| Náhled sestavené vývojové hry | `npm run preview:dev` | `http://localhost:8011` |

Porty jsou pevné, takže se při obsazeném portu omylem neotevře jiná varianta.
LocalStorage je díky různým adresám oddělený. Formát osmi savů a ruční import/export
zůstávají společné; automatická synchronizace mezi variantami není zapnutá.

## Rozsah pilotu

- Mathoria a les, včetně lesního krystalu a jeho vložení do Zyxova stroje.
- Po vložení krystalu poděkování a tlačítko zpět do Mathorie; lze dál procvičovat.
- Bez Silverpondu, podvodní říše, hlubinného krystalu a vývojových mock scén.
- Menu bez testovacích zkratek, neaktivní SceneDebugger, bez kláves pro přeskočení
  vlny, okamžité vítězství a vývojové nástroje města. Běžná pauza zůstává.
- Import pokročilého savu vrátí hráče do Mathorie, aniž by smazal pozdější postup.

Vývojová varianta obsahuje celou dosavadní hru, debugger a původní testovací vstupy.

## Jak se vybírají soubory

`src/config/buildVariant.ts` určuje režim. `pilotScenes.ts` a
`developmentScenes.ts` jsou oddělené vstupy scén, takže pilotní výstup nepotřebuje
třídy scén další kapitoly.

`scripts/pilot-content.config.mjs` vymezuje obsah pilotu. Generátor
`scripts/pilot-content.mjs` připraví `.generated/pilot-public`: omezené katalogy
scén, soubojů, nepřátel, animací a UI a kopie potřebných obrázků/zvuku. Vite používá
stejné omezené JSONy pro statické importy i soubory načítané za běhu.

Původní `public/assets` a editorové JSONy zůstávají kompletní. Do generované složky
se ručně nezasahuje. Po změně katalogů/assetů při zkoušení pilotu restartovat
`dev:pilot` a obnovit prohlížeč; build si balík vytvoří vždy znovu.

Výběr sleduje sdílené závislosti. Dva rámečky s historickým názvem `silverpond-*`
zůstávají, protože je používá běžná obrazovka vítězství. Pozadí, bytosti a zvuk
určené jen další kapitole se nepublikují. Editorové databáze, náhledy a zdrojová
média se do pilotu nekopírují.

Kontrola závislostí: `npm run test:pilot-content`. Aktuální inventář lze získat
`node scripts/pilot-content.mjs`; podrobný report je v
`.generated/pilot-content-report.json`.

K 10. 9. 2026: textury **37,01 MiB místo 60,65 MiB** (o 39 % méně),
203 souborů místo 317. Všechna média pilotu včetně audia mají **76,48 MiB**.
Jde o velikosti souborů, nikoli změřený čas startu či skutečný síťový přenos.
Postupné načítání zbývajících herních textur je další samostatný krok.

## Stabilní vydání

Vývoj pokračuje na `main`. Pro vydání vybereme otestovaný commit, označíme jej
tagem a z něj sestavíme `dist/pilot`. Hosting musí publikovat tuto podsložku,
nikoli celé `dist` nebo `public`. Další práce na `main` vydanou hru nezmění, dokud
vědomě nevydáme další verzi. Pro lokální práci na starším vydání lze později
přidat Git worktree; samostatný fork a dvojí ruční údržba nejsou potřeba.

Aktualizace názvosloví 24. 9. 2026: karta, manifest a menu používají
**Číslokraj: Tajemství krystalů**. Menu skládá název a podtitul z lokalizovaného
textu; Mathoria je první městečko výpravy. Aktuální stav nasazení popisuje
[plán vydání](CISLOKRAJ_RELEASE_PLAN.md).

## Ověření oddělení

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

- 7 testů balení obsahu: závislosti, sdílené vítězství, shoda seznamu scén,
  vyloučené soubory a nedotčená původní data.
- 21 cílených testů: debugger pilotu, návrat pokročilých savů, dosavadní postup,
  přenos savů a fullscreen.
- Obě varianty projdou Vite buildem. Celkový TypeScript check má 147 stávajících
  diagnostik; porovnání s `ade2177` nepotvrdilo žádnou novou.
- Playwright: pilotní menu na 1280×720 a 1024×768, WebGL i Canvas; klávesa D
  neotevírá debugger. Mathoria → aréna → boj, samostatné vítězství a konec pilotu
  → Mathoria bez chyb konzole nebo chybějících textur v kontrolovaných scénách.
- Konec pilotu vizuálně zkontrolovaný v normálním, hover, pressed, pointer-out
  a disabled stavu; Canvas text používá shodné rozlišení stylu a textury.
- Vývojové menu stále ukazuje tři zkratky, má 54 scén a funkční debugger.
- Hotový build otevřený přes `preview:pilot` na portu 8012: menu bez chyby
  spuštění a selhaných požadavků; výsledný JavaScript neobsahuje konstruktory
  scén Silverpondu/Underwater ani vývojovou globální instanci hry.

Zkontrolované screenshoty jsou lokálně v `artifacts/pilot-qa/`. Pro vstup do
vzdálených scén použil testovací prohlížeč dočasný přístup k instanci Phaseru
vložený pouze přes Playwright route; veřejný kód takový přístup neobsahuje.
Nejde o kompletní průchod všemi úlohami a co-op celého pilotu.

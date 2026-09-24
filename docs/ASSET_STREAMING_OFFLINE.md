# Načítání dopředu a offline hra

Implementováno 24. 9. 2026 pro [vydání pilot-0.1.10](releases/pilot-0.1.10.md).
Stav nasazení je zaznamenán u vydání. Samotné načítání nemění herní pravidla,
uložení hráčů ani databázi; migrace nevyžaduje.

## Chování

- První otevření načítá dosavadní základ hry a menu, nikoli celý svět.
- První klepnutí nebo stisk klávesy spustí nízkoprioritní stahování na pozadí.
  Menu a výběr postavy přednostně připravují Mathorii, arénu a boj;
  město arénu/boj a místní budovy; les a Silverpond své následující lokace.
  Při změně scény se pořadí přepočítá. Potom se dotáhne zbytek vydaného buildu.
- Běží nejvýše dva přenosy na pozadí. Skutečně vyžádaný asset má přednost;
  pokud se už stahuje, použije se tentýž přenos.
- Stažené soubory a rozbalené textury jsou dvě různé věci. Do grafické paměti se
  připravuje po jedné pouze blízká budoucnost, s rozpočtem 64 MiB odhadovaných
  RGBA dat navíc. Není to limit celkové paměti celé hry. Během boje, zkoušky,
  hádanky a sbírání many se spekulativní dekódování nespouští.
- Dosavadní načítání při vstupu zůstává pojistkou. Při prvním hraní může rychlý
  postup na pomalém internetu předběhnout stahování; absolutní nulové čekání
  před dokončením přípravy nelze garantovat. Lokální dekódování velkého obrázku
  také není totéž jako síťové čekání.

## Zdroje a soubory

`scripts/asset-downloads.mjs` odvozuje plán ze stejných katalogů a importů jako
`scripts/scene-assets.mjs`. Pilot používá filtrované pilotní katalogy, takže
nestahuje nevydané regiony. Plán obsahuje textury, runtime JSON a zvuky;
závislosti scén zahrnují také jejich mluvené průvodce. URL jsou normalizované
včetně starších názvů obrázků s mezerami.

`src/loading/preload-policy.ts` určuje pořadí a paměťový rozpočet.
`AssetPreparation.ts` propojuje plán se scénami přes `SceneAssetPlugin`.
`DownloadQueue.ts` zajišťuje běžnou HTTP předpřípravu, i pokud není dostupný
service worker. `OfflineClient.ts` jej u sestavené hry připojí po interakci.

`scripts/offline-build.mjs` po dokončení buildu vytvoří `offline-manifest.json`
a `offline-sw.js` z `src/loading/offline-worker.mjs`. Manifest zahrnuje i HTML,
spustitelný kód a styly, fonty a runtime média. Editorové databáze a marketingové
screenshoty nejsou součástí offline hry. Každý soubor má délku a SHA-256;
revize zahrnuje rovněž implementaci workeru.

## Offline a aktualizace

První instalace workeru ukládá jen spustitelný základ. Poté se ve stanoveném
pořadí ukládají média. `ready` znamená, že jsou v CacheStorage všechny soubory
manifestu, ne pouze že byly zahájeny požadavky. Při výpadku lze pokračovat po
obnovení připojení. Neúplné soubory, cizí verze a HTML místo obrázku se neukládají.
Zvuk podporuje byte-range požadavky i z offline kopie.

Nová verze se před dokončením instalace připraví celá. Nezměněné soubory může
zkopírovat z předchozí cache podle hashe. Není zde `skipWaiting` ani vynucený
reload: rozehraná hra zůstává na své verzi, nová ji nahradí až po uzavření
starých herních záložek. Přerušená instalace odstraní pouze svou nedokončenou
novou cache. Pro aktualizaci je potřeba místo i na souběh obou verzí.

Cache jsou oddělené podle scope a verze. Worker neukládá API, přihlášení,
POST požadavky, soukromé odpovědi ani hráčská uložení. Při nedostatku místa
nečistí localStorage nebo IndexedDB a hra může dál používat síť. Dosavadní
lokální uložení a synchronizační fronta zůstávají beze změny.

Na Cloudflare se HTML stahuje přes `/hra/`, ne přes `/index.html`: přímá
veřejná adresa HTML se přesměrovává na kořen s marketingovým webem. Klíč
uložené herní kopie zůstává `/index.html`; navigace `/hra/` ji použije offline.

## Podmínky a omezení

- Offline spuštění vyžaduje **jednou kompletně staženou sestavenou hru** na
  stejném zařízení, doméně a v témže profilu prohlížeče. Aktuální pilotní
  manifest vydání 0.1.10: 344 souborů, 92 949 884 bajtů (88,64 MiB), bez režie úložiště.
- Používat přímo adresu hry `/hra/`, ne marketingový kořen. První návštěva,
  přihlášení Google, cloudová synchronizace a vzdálené síťové funkce vyžadují
  připojení. Lokální hra s uložením jej po stažení nepotřebuje.
- Service worker vyžaduje HTTPS nebo důvěryhodný localhost. Na tabletu otevřeném
  přes obyčejné `http://192.168.…:8001` funguje přednačítání, **nikoli garantované
  offline znovuotevření**. Ve Vite dev serveru worker úmyslně neběží, aby necachoval
  živě měněné zdrojové soubory; sestavený vývojový build jej podporuje.
  Viz [MDN: Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
- Prohlížeč může cache odstranit kvůli nedostatku místa, soukromému režimu nebo
  rozhodnutí uživatele. Stav se kontroluje proti skutečnému obsahu CacheStorage,
  nepovažuje se za trvalý příslib. Nežádáme automaticky o oprávnění persistentního
  úložiště. Viz [MDN: kvóty a odstranění úložiště](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- Při nasazení během ještě neúplného prvního stahování nemusí být přepsané
  nehashované veřejné soubory staré verze na serveru dostupné. Smíchané verze
  se nepřijmou; po skončení hry je nutné otevřít aktuální verzi online.
- Zatím nepřibyl viditelný indikátor „offline připraveno“. Diagnostika je
  `game.registry.get('assetDownloadStatus')` a událost
  `window` → `cislokraj-download-progress` (`ready`, počty/bajty, `storageError`).

## Ověření

Před testy zkontrolovány změny serveru: žádná migrace nebyla potřebná.

```sh
node --test scripts/__tests__/offline-build.test.mjs scripts/__tests__/offline-worker.test.mjs scripts/__tests__/scene-assets.test.mjs scripts/__tests__/pilot-content.test.mjs
node_modules/.bin/vitest run src/loading/__tests__/preload.test.ts
npm run build:pilot
npm run build:dev
node infra/cloudflare/check-assets.mjs
```

Výsledek: 26 Node testů a 5 Vitest testů prošlo, oba buildy a kontrola
Cloudflare assetů prošly. Samostatný TypeScript check stále vrací stávající
chyby projektu; porovnání s výchozím stavem po normalizaci čísel řádků
neukázalo žádnou novou diagnostiku. To není tvrzení, že celý projekt typově prochází.

Pro opakování browser testu spustit v samostatném terminálu izolovaný Vite
server na portu 8140 (slouží pouze k vytvoření nového testovacího uložení):

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8140 --strictPort
```

Poté:

```sh
node scripts/check-asset-streaming.mjs
ASSET_QA_THROTTLE=1 node scripts/check-asset-streaming.mjs
```

Skript používá samostatný lokální server a dočasný Chromium profil, API oddělí
od sítě a nesahá na skutečné hráče. Zpomalení probíhá na serveru společně pro
všechny přenosy (2 MiB/s, latence 60 ms), tedy i pro service worker, ne pouze
přes emulaci sítě v jedné záložce. Počáteční menu zahájilo 22 požadavků na assety;
zbytek se při omezené lince připravil zhruba za 47 sekund bez opuštění menu.
V samostatném vývojovém průchodu byla textura města připravená již v menu;
v okamžiku kontroly přibylo 29 textur / 45 508 320 bajtů RGBA dat,
tedy méně než stanovených 64 MiB.

Ověřený scénář: kompletní stažení v menu → aktualizace čeká s kompletní novou
cache bez reloadu → úplné zavření a znovuotevření prohlížeče offline → načtení
testovacího uložení → Mathoria → aréna → boj. Žádný síťový požadavek na assety,
žádná výjimka stránky; offline audio range vrátilo 206 a správné bajty.
To ověřuje dostupnost zvukových dat, nikoli poslech každé nahrávky.

Navíc ověřen lokální Cloudflare runtime (`wrangler dev --local`): všech
344 souborů odpovídalo hashům manifestu a po dokončení stažení prošel offline
reload menu. Testy zahrnují nedostatek místa, odstraněný soubor cache,
chybnou verzi, sdílení probíhajícího přenosu a neúspěšnou aktualizaci.

### Vizuální kontrola

V souladu s `UI_PRE_READER_GATES.md` změna nepřidává žádný viditelný text,
dialog ani nové ovládání a nemění výuku porovnávání. Prohlédnuté snímky:

- `artifacts/asset-streaming/menu-ready-tablet.png`
- `artifacts/asset-streaming/town-offline-tablet.png`
- `artifacts/asset-streaming/arena-offline-tablet.png`
- `artifacts/asset-streaming/battle-offline-tablet.png`
- `artifacts/asset-streaming/battle-offline-desktop.png`

Na těchto snímcích jsou přítomná pozadí, postavy, rámy a ovládání, bez nové
regrese způsobené chybějícími assety. Desktop 1280×720 a tabletový viewport
1024×768 jsou Chromium emulace, nikoli fyzický iPad/Safari. Playwright MCP
byl obsazený; použit izolovaný Playwright Chromium bez zásahu do uživatelova
prohlížeče. Nejde o opakované schválení všech starších herních UI stavů,
hover/pressed variant ani o kompletní průchod každou scénou. Před produkčním
označením podpory iPadu je nutný průchod na skutečném zařízení.

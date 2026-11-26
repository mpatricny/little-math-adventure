# Běžná výhra

Samostatný návrh pro místní herní server. Otevře se na `/docs/design-drafts/normal-victory-v1/index.html`. Horní lišta slouží autorovi k přepínání čtyř výsledků a ke kontrole bez slov.

## Co dítě uvidí

Vlevo je tvor z právě dokončeného souboje. Při prvním osvobození má jméno nového přítele a tlapku. Vpravo jsou odměny konkrétního dítěte. Každý krystal má vlastní obrázek a pod ním svou hodnotu. Při hře ve dvou mění portrét pohled na výsledek.

V aréně spojuje spodní lišta pět kol. Zlatá fajfka označuje dokončení, šipka ukazuje na příští zvolené kolo. Po dokončení celé arény se vedle budovy objeví otevřený zámek s číslem odemčené arény. V lese stejný prostor ukazuje cestu hrdiny zpátky na okraj lesa.

**Dál** v galerii zobrazí ilustraci skutečného cíle přechodu. **Zpět** vrátí stejný výsledek a výběr hráče. Ukázkové odměny jsou pouze ke čtení.

## Původ výsledků a vzhledu

`examples.json` obsahuje výběr údajů ze čtyř výsledků herní BattleScene na izolovaných testovacích profilech. První kolo proběhlo přes MathBoard. Společná výhra, dokončení arény a lesní výhra používají produkční vyhodnocení na připraveném konci souboje. Příští protivník vychází z odpovídající vlny v katalogu střetnutí.

SceneBuilder načítá samostatné rozložení návrhu spolu s původními hosty rámu, nadpisu a tlačítka z tréninkové výhry. Obě obrazovky používají stejné herní ilustrace, písmo Gelasio a ovládací prvek PracticeChoiceControl.

## Prohlédnuté stavy

- `review/arena-desktop.png` zachycuje první kolo a další cíl. `review/arena-complete.png` ukazuje dokončenou arénu.
- `review/coop-a.png` a `review/coop-b.png` zachycují stejný souboj s odlišnou odměnou pro každého hráče.
- `review/forest.png` zachycuje lesní výhru. `review/tablet-no-words.png` ukazuje společnou výhru bez slov a zvuku.
- `review/button-states.png` ukazuje tlačítko postupně během odhalení, při najetí, při stisku a po opuštění ukazatelem.

Kontrola v prohlížeči zahrnovala WebGL i Canvas, stolní rozměr 1280 × 720 a emulované tabletové rozměry 1024 × 768 a 768 × 1024. Byly ověřeny dotykové cíle alespoň 44 CSS px, hranice vykreslených čísel a textu, přepínání vlastníka, pokračování a návrat, ovládání klávesnicí a nastavení omezeného pohybu. Ověření s dětmi na fyzickém zařízení je samostatný krok.

## Zapojení do hry

Běžná výhra ve hře používá tento návrh. Soupeři, získané odměny a dokončená kola přicházejí přímo z boje. Každý hráč vidí vlastní výsledek. Pokud trénoval jen jeden z dvojice, jeho portrét otevře rychlost a cestu k lišce, druhý portrét otevře běžnou výhru.

Mimo arénu ukazuje spodní lišta hrdinu, šipku a cíl tlačítka **Dál**. Les používá ilustraci příslušné místnosti včetně skutečného mostu z editoru. Pod vodou je vidět místo ponoru a v úvodním souboji Zyxova loď. Po lesním strážci navazuje předání příběhového krystalu.

Prohlédnuté snímky z běžící hry jsou v `artifacts/normal-victory-review/`. Zahrnují les, most, vrak, úvodní souboj, oba hráče v aréně i odemčení další arény. Lesní boj prošel přes MathBoard. Kontrola v Playwright MCP zahrnula odhalení tlačítka, najetí, stisk, opuštění a návrat do místnosti. Na emulovaném tabletu na šířku zůstaly při skrytém textu a ztlumeném zvuku vidět tvor, odměny, cíl i šipka.

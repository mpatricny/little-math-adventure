# Mobilní rozložení a zadání jména — 22. 9. 2026

## Příčina a rozsah opravy

Dodané screenshoty odpovídají původnímu dvojímu centrování: CSS flexbox přidával
další odsazení k okrajům nastaveným přes Phaser `FIT` / `CENTER_BOTH`. Odstranění
flexboxu už bylo v pracovním základu (commit `cd4e342`). Canvas a HTML vrstva nyní
mají výslovně společný počátek a centrování dál řídí pouze Phaser.

`src/utils/gameViewport.ts` navíc reaguje na `visualViewport.resize` i `scroll`,
změnu orientace a fullscreen. Při psaní zachovává měřítko před otevřením
klávesnice a posune canvas i HTML vrstvu tak, aby jméno zůstalo nad klávesnicí.
Přepočítá také souřadnice pro dotykové ovládání. CSS respektuje safe-area insets.

Pole jména v `CharacterSelectNewScene` má samostatný host v `scenes.json`
(`characterNameInputHost`, 216 × 90). Při 915 × 359 má dotyková plocha přibližně
108 × 45 CSS px; dosahuje k horní hraně stávajícího tlačítka změny úrovně, ale
nepřekrývá je. Text zůstává uvnitř původního ilustrovaného rámečku.

- Klepnutí vybere výchozí „Hrdina“ pro snadné přepsání.
- Funguje nativní označení a vložení textu; limit zůstává 12 znaků.
- Klávesnicové „Hotovo“ zavře psaní. Novou hru spouští tlačítko Hrát.
- Potvrzení během IME composition se ignoruje.
- Návrat z volby úrovně zachová jméno i postavu.
- Hodnota se nastavuje přes DOM property, nikoli interpolací do HTML.
- Opuštění scény odstraní vstup; prázdné jméno dál používá výchozí „Hrdina“.

## Funkční ověření

`npm run test:mobile-layout` proti vývojovému serveru na portu 8001 prošlo pro:

| Profil | CSS viewport | Renderer |
| --- | --- | --- |
| Telefon, dotyk | 915 × 359 | WebGL |
| Telefon, dotyk | 915 × 359 | Canvas |
| Tablet, dotyk | 1024 × 768 | Canvas |
| Počítač | 1440 × 900 | WebGL |

Test ověřuje skutečný renderer, centrování obou vrstev, zachování poměru stran,
polohu jména vůči hostu, dotyk, psaní s diakritikou a maximální délkou, chování
Enter, otočení a návrat zařízení, návrat z úrovně B a uložené jméno, postavu i
úroveň nové hry. Pro mobilní profily modeluje také samostatné zmenšení a posun
visualViewport bez změny innerHeight. Všude proběhl bez JavaScriptových výjimek.

`node scripts/check-game-account.mjs http://127.0.0.1:8001` prošlo na desktopu
i v tabletovém Canvas režimu: zarovnání účtu, normální/hover/pressed/pointer-out
stavy, chyby a disabled stav, změna velikosti a úklid při opuštění menu.

`npm run build:pilot` prošlo. Úplná TypeScript kontrola má 142 existujících
diagnostik; porovnání compileru proti verzím změněných souborů z HEAD potvrdilo
stejných 142 diagnostik a žádné nově přidané.

Změna nevyžaduje databázovou migraci. Testovací prohlížeče používají izolované
lokální savy a simulují odpověď volitelné služby účtu.

Lokální náhled sestaveného pilotu navíc prošel vstupem do fullscreen a návratem,
kontrolou centrování menu a skutečným otevřením pole jména. Ověření bez slovních
popisků a se ztlumeným zvukem ukázalo dvě rozlišitelné postavy uvnitř rámů;
dotyk druhé karty změnil volbu. Zeleným tlačítkům však bez popisků chybí názorná
ikona jejich akce. Nejde o schválení zbytku staršího UI.

## Vizuálně prohlédnuté snímky

Skutečné snímky jsou v ignorovaném adresáři `artifacts/mobile-layout/`:

- `phone-webgl-menu.png`, `phone-webgl-name.png`
- `phone-webgl-keyboard-viewport.png`, `phone-webgl-boy-selected.png`
- `phone-webgl-difficulty-return.png`
- `phone-canvas-name.png`, `phone-canvas-keyboard-viewport.png`
- `tablet-canvas-name.png`, `desktop-webgl-difficulty-return.png`
- `pilot-phone-name.png`, `pilot-phone-fullscreen.png`
- `phone-webgl-no-prose-selected.png`

Menu má vyvážené okraje. Výchozí i dvanáctiznakové jméno sedí v rámečku,
nepřekrývá sousední viditelné ovládání a při simulované klávesnici zachovává
měřítko. V WebGL jsou obě postavy v rámech a zvolená postava má zlatý obrys.
Bitmapy tato změna nenatahuje ani nevyměňuje. Nové dlouhé pokyny nepřibyly.

## Hranice ověření

- Skutečná systémová klávesnice telefonu nebyla k dispozici. Snímky s názvem
  `keyboard-viewport` zachycují simulovaný viditelný prostor, nikoli Android/iOS
  klávesnici. Fyzický telefon a skutečné výřezy displeje zbývají k ověření.
- Ve stávajícím Canvas fallbacku se nevykresluje velký nine-slice panel ani
  postFX zvýraznění vybrané postavy. Jde o existující rozdíl oproti WebGL;
  geometrie a zadání jména jsou opravené v obou režimech.
- Stávající tlačítko „Změnit“ a některé ovladače menu zůstávají na telefonu
  menší než 44 CSS px. Tento zásah nezvětšuje celé starší UI ani nepředstavuje
  schválení všech jeho stavů podle `UI_PRE_READER_GATES.md`.
- Tento report popisuje místní ověření. Vydání opravy na veřejný web je označeno
  jako `pilot-0.1.5`; veřejnou verzi identifikuje hlavička `X-Cislokraj-Release`.

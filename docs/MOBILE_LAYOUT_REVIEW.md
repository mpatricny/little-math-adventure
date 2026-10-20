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

## 17. října 2026: obnova vykreslování

Připojení kabelu na konkrétním Samsungu nebylo možné přímo diagnostikovat.
Opakované otočení v prohlížeči se vrátilo bez chyby. Skutečná simulovaná ztráta
WebGL kontextu ale reprodukovala černý obraz: Phaser přestal kreslit a logika
scény dál běžela. Obnovení kontextu obraz vrátilo.

`setupRendererRecovery` nyní při ztrátě vykreslování pozastaví hru a vstup.
Po obnovení vrátí jejich původní stav, včetně dříve pozastavené hry. Pokud
výpadek trvá déle než 500 ms, zobrazí samostatný HTML ovladač s ikonou obnovy
a jediným slovem „Znovu“. Ten zůstane použitelný i bez WebGL. Přepne pouze
parametr `renderer=canvas` na stejné adrese; nemaže ani nepřepisuje savy.
Může se tedy vrátit k poslednímu dokončenému uložení, nikoli zachovat
neuložený rozpracovaný tah. Funguje i nad fullscreen a po opuštění fullscreen
samotného canvasu. Krátký výpadek obnoví stejnou scénu bez reloadu.

Statické hosty panelu, bezpečné oblasti 580 × 320, akce a popisku jsou v
`RendererRecoveryOverlay` v `scenes.json`. HTML vrstva čte polohy a hloubky
přes SceneBuilder; prázdné hosty nepotřebují GPU. Používá společný enamel
socket, jednotné měřítko a stabilní klikací plochu. Rám a ikona se při hover
a stisku pohybují společně. Klávesnicový fokus zůstává v ovladači obnovy.

Viewport se přepočítá také při `pageshow`, návratu viditelnosti a obnovení
WebGL. Příprava dalších textur čeká na návrat kontextu.

Ověření bez databázových migrací a se smyšlenými lokálními savy:

- `npm run test:e2e:recovery`: 8 průchodů v desktopovém a tabletovém WebGL.
  Kontrolují zastavení logiky, automatickou obnovu, oba druhy fullscreen,
  přepnutí na Canvas, rotaci a obnovení visualViewport. Při obnově porovnávají
  celý uložený slot včetně ID, inventáře a postupu.
- Dodatečně prošly oba průchody pro nové stavy fokus/hover/stisk/pointer-out,
  disabled, portrét a tlačítko bez slov se ztlumeným zvukem.
- 16 kontrol načítání ve Vitestu, 15 kontrol manifestů a pilotního balení.
- Vývojový i pilotní build prošly. Globální `tsc` dál hlásí známé chyby mimo
  změněné soubory; v upravených souborech není nová diagnostika.

Prohlédnuté snímky: `artifacts/device-recovery/desktop-webgl-normal.png`,
`desktop-webgl-hover.png`, `desktop-webgl-pressed.png`,
`desktop-webgl-pointer-out.png`, `desktop-webgl-disabled.png`,
`tablet-webgl-normal.png`, `tablet-webgl-portrait.png`,
`tablet-webgl-no-words.png` a snímky obou fullscreen variant. Panel se vejde
do obrazu, kruhový asset zachovává proporce, popisek nepřekrývá akci a ovladač
zůstává srozumitelný i bez čtení. Automatické minimum dotykového cíle je 44 px.
Jde o ověření v prohlížeči, ne o potvrzení příčiny na fyzickém Samsungu.

Změna je v oddělené větvi `codex/fix-silverpond-loading`; běžící vývojová hra
na portu 8001 ani skutečné uložené pozice tímto zásahem nebyly změněny.
- Tento report popisuje místní ověření. Vydání opravy na veřejný web je označeno
  jako `pilot-0.1.5`; veřejnou verzi identifikuje hlavička `X-Cislokraj-Release`.

### Pozastavení při zakrytí hry

Další kontrola odhalila, že dosavadní portrétní překryv nechával běžet souboj.
`setupMobilePause` nyní zastaví celou herní logiku i vstup při otočení nastojato,
skrytí dokumentu nebo `pagehide`. Pokračuje po návratu na viditelnou stránku
naležato. `gameSuspension.ts` sdílí vlastnictví pauzy s obnovou WebGL: návrat
obrazu nesmí spustit hru pod portrétním překryvem a návrat naležato nesmí
spustit hru s nefunkčním vykreslováním. Původní ruční pauza a vypnutý vstup
zůstávají zachované. Změna nepřidává viditelné ovládání ani nemění savy.

Po upřesnění uživatele nebyl tablet připojen k Macu. Příčinu jeho restartu
proto z dostupných dat nelze potvrdit. Kontrola serverových záloh pouze pro
čtení potvrdila zachování čtyř dokončených vln aktuální arény u obou profilů.
Save obsahuje vybranou pátou vlnu, nikoli její průběžné nepřátelské HP nebo tah.
Tato oprava zachová rozehraný souboj při dočasném přerušení stránky, ale
neobnoví jej po úplném reloadu nebo ukončení procesu prohlížeče.

Ověření nevyžaduje databázovou migraci. Aktualizovaná sada
`npm run test:e2e:recovery` prošla ve všech 12 případech na desktopu a tabletu:
skutečný souboj v co-op režimu ze stejného EncounterCatalog, obě pořadí
otočení/výpadku GPU, zastavený čas scény, zachované HP/tah i oba celé savy,
návrat viditelnosti, původní ruční pauza, fullscreen a Canvas. Události
viditelnosti byly simulované; fyzický Samsung nebyl připojen. Vývojový build
prošel. TypeScript nehlásí diagnostiky ve změněných souborech; úplná kontrola
nadále obsahuje dřívější chyby jinde v projektu.

Prohlédnuty také `artifacts/device-recovery/desktop-webgl-battle-rotation-restored.png`
a `tablet-webgl-battle-rotation-restored.png`: po návratu je souboj vykreslený,
postavy ani akční ikony se nepřekrývají a bitmapy drží poměr stran. Tyto stavy
nepotřebují čtení. Vzhled ostatních původních obrazovek tím není nově schválen.
Hra dětí na portu 8001 a její skutečné uložené pozice nebyly změněny.

## 20. října 2026: návrat do menu během souboje po nečinnosti

Uživatel popsal návrat do menu po správné odpovědi v souboji se třemi raky,
po přibližně půlhodinové nečinnosti. Server na 8001 během kontroly dál běžel.
Jeho log obsahoval nedostupnou službu účtu na 3000, nikoli výjimku ze souboje.
Nové savy z tabletu následně dál přicházely. Zpětně nejsou k dispozici logy
rendereru Samsungu, takže konkrétní příčina jeho návratu do menu není potvrzená.

V čistém tabletovém prohlížeči byl otevřen právě `silverpond-arena-2-wave-5`
s aktuálními daty tří raků po 40 HP a anonymizovanou kopií profilu. Veškeré
zápisy na skutečný server byly nahrazené testovacími odpověďmi. Správné dotyky
prošly až k útoku a tahu mazlíčka, bez JS výjimky a bez druhé navigace. Další
průchod použil Playwright Clock pro simulovaný posun o 30 minut před první
správnou odpovědí; ani ten návrat do menu nevyvolal. To není simulace politiky
Androidu při nedostatku paměti ani potvrzení chování fyzického tabletu.

Při vstupu do tohoto souboje měla živá verze přibližně 458 MiB rozbalených
textur (součet šířka × výška × 4 přes unikátní zdroje). Obsahovala mimo jiné
katakombí lišku, lesního bosse a bojové animace nepřátel ostatních vln.
Větev už od předchozí opravy vyřazuje vizuální závislosti odvozené jen
z kontrol postupu. Nově `SceneAssetPlugin` navíc neprochází všechny soupisky
arény při přípravě konkrétního `BattleScene`; skutečná soupiska, fáze bosse
a vybavený mazlíček dál dodají potřebné animace. Se stejným profilem,
encountery, statistikami a texturovým katalogem měření ukázalo přibližně
216 MiB, tedy o 53 % méně. Jde o odhad obrazových dat, nikoli měření celé RAM
nebo GPU paměti tabletu. Tlak na paměť zůstává hypotézou příčiny pádu.

Data arény v oddělené větvi jsou starší než dnešní živý katalog. Pro přesné
porovnání proto testovací prohlížeč dostal dnešní `encounters.json` a
`enemies.json` pouze přes síťové mocky. Produkční balance, soubory katalogu
ani skutečné savy nebyly přepsané kvůli testu.

Vývojová verze nově posílá malé diagnostické události přímo Vite serveru,
nezávisle na účtu a analytickém API. Záznam obsahuje scénu, encounter, fázi,
odhad velikosti textur, JS chybu, ztrátu/obnovu kontextu, typ navigace,
`document.wasDiscarded` a předchozí značku ze sessionStorage. Ochranný reload
po obnově savů má vlastní událost `save_reload`. Tento mechanismus existoval
už před dnešním hlášením, ale jeho spuštění na tabletu nebylo prokázané.
Záznamy jsou v `.local-saves/development/diagnostics/YYYY-MM-DD.jsonl`.
Neobsahují hráčská jména, odpovědi ani celé savy. Endpoint omezuje původ,
velikost a povolená pole; diagnostika nemění herní save a její selhání
nezastaví hru. Pilotní build ji neaktivuje.

Ověření bez databáze a bez nutnosti migrací:

- 16 průchodů `test:e2e:recovery`: úsporné závislosti konkrétního souboje,
  odpověď po simulované nečinnosti, diagnostika přes reload, oba renderery,
  rotace, fullscreen, zachované savy i souběh pauz.
- 3 testy diagnostického endpointu a 26 testů ukládání a synchronizace.
- Pilotní build prošel; TypeScript nemá diagnostiky ve změněných souborech.

Prohlédnuty `artifacts/device-recovery/current-crab-battle.png` s aktuálními
třemi raky a `tablet-webgl-battle-after-idle.png`: tvorové, pergamen a volby
se vykreslují bez chybějících textur. Rozložení UI tato změna nemění a nejde
o nové schválení všech původních překryvů HP a MathBoardu.

Průběžný save celého souboje stále není implementovaný. Úplné ukončení nebo
reload prohlížeče tedy může vyžadovat zopakování rozehrané vlny; tato oprava
nesmí být prezentována jako obnova libovolného tahu. Vše zůstává v oddělené
větvi `codex/fix-silverpond-loading`; běžící hra na 8001 nebyla restartovaná.

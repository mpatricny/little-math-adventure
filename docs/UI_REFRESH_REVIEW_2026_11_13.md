# UI refresh — oprava po autorském review 13. 11. 2026

**Pět konkrétních oprav prošlo novou interní vizuální kontrolou.**
Revize řeší pět konkrétních autorských připomínek. Původní estetické schválení
z 12. 11. bylo zrušeno; historické snímky jsou zachované pro porovnání.
Implementaci znovu provedli tři agenti gpt-6-astra s reasoning max a koordinátor
kontroloval skutečné nové obrazy a vracel nalezené vady k opravě.

[Zadání a autorská korekce](UI_REFRESH_REQUIREMENTS_2026_11_12.md) ·
[Galerie před/po](../artifacts/ui-refresh-v2/gallery.html)

## Konkrétní opravy a nezávislé posouzení

| Připomínka | Oprava a prohlédnutý důkaz |
|---|---|
| 1. Tlačítka přes ozdoby rámu | Spodní akce končí na y = 590, při stisku 592, a jsou dále od obou rohů. Historie dne končí na y = 588. Prohlédnuty `parent/players-hub.png`, `profiles/hubCoop-pressed-webgl.png`, `profiles/day-webgl.png` a jejich tabletové varianty; zlaté listy i kameny zůstávají volné. |
| 2. Vzhled scrollbar | Samostatná zlatá dráha, tyrkysový zaoblený jezdec, stabilní 56 px cíl. Funguje tažení, klik na dráhu, kolečko a posuv obsahu prstem. Po následném review se vejdou tři celé pásy včetně počtů na začátku i konci. Prohlédnuty `profiles/map-webgl.png` a `profiles/map-scroll-drag-end-canvas.png`. |
| 3. Zyx mimo střed | Opravena poloha portrétu i jména a jeden společný optický origin celé animace. Prohlédnut vlastní MCP výřez `parent/zyx-centered-detail.png`, klid/náklon/mávnutí v agentových výřezech a celé kompozice questu/rakety. Postava je vystředěná vůči vnitřku medailonu, bez deformace či posouvání jednotlivých snímků. |
| 4. Identita zasahující do bojiště | Portrét a jméno jsou vedle útoku uvnitř dolní lišty. Jeden kruh zůstává na středu obrazovky. Běžná jména mají jeden řádek; extrémně široké jméno se vejde na dva bez zmenšování fontu. Prohlédnuty `battle/webgl-coop-hero-A-normal.png` a `battle/webgl-coop-long-name.png`. |
| 5. Bojové ovladače přes rámy | Vyhrazený neprůhledný panel odděluje ovladače od rytin arény. Počet lektvarů i síla mazlíčka mají vlastní prostor mimo zlaté obvody. Prohlédnuty `battle/webgl-coop-pet-B.png` a celý průchod normál/hover/stisk/out/disabled. |

Cesty v tabulce jsou vůči `artifacts/ui-refresh-v2/`. Koordinátor posoudil
opravené kompozice podle skutečných pixelů. Jde o interní přejímku konkrétní
revize, nikoli tvrzení, že autor už nové snímky schválil.

## Další vady nalezené při kontrole

- První opravená mapa uřezávala třetí řádek přes počty. Zmenšily se mezery
  a výška pásu, velikosti karet/symbolů/písma zůstaly stejné. Koncová mezera
  už neposouvá první viditelný pás nad horní okraj při dojetí dolů.
- Jezdec zprvu fungoval jen jako indikátor. Přidáno přímé tažení, klik na
  dráhu a dotykový cíl. Skrytí a zánik panelu ukončují jeho interakci.
- Bojová lišta měla příliš dlouhý prázdný konec. Zkrácena z 672 na 630 px;
  extrémní jméno se zalamuje ve vlastním 270 × 64 px prostoru.
- Cechovní a podvodní OK se posunula dále od spodních ozdob. Koordinátor
  viděl `guides/tablet-canvas-guild-pressed.png` a
  `guides/tablet-canvas-underwater-pressed.png`.
- `PictureDialog` v Canvasu vůbec nevykresloval původní nativní NineSlice.
  Nyní používá devět obrazových dílů sdíleným algoritmem `MedievalPanel` se
  stejnou texturou a původními řezy. Prohlédnuty
  `guides/desktop-webgl-picture-dialog.png` a
  `guides/tablet-canvas-picture-dialog-pressed.png`: rám skutečně existuje
  a potvrzení se vejde dovnitř. Regrese má test vykresleného pixelu.

## Rozsah ověření

Před testy byla znovu ověřena závislost na migracích. Úpravy jsou frontendové,
pracují s izolovanými lokálními saves a nevyžadují DB migraci. Testovací
prohlížeče zachycují API, vývojové zálohy i diagnostiku. Skutečné hráčské
profily nebyly použity při bojových či výukových testech.

- Profily: první revize 4/4; po druhé úpravě mapy finální dotčené WebGL/Canvas
  scénáře 2/2. Přímé tažení, dráha, kolečko, dotyk, skryté ovládání, zánik,
  celé řádky, osobní statistiky a spuštění coopu.
- Návody: 26 cílených unit testů a 10 kontrol manifestu prošlo. WebGL portréty
  a mezery 2/2, zbývající Canvas dialogy 1/1, finální PictureDialog v obou
  rendererech 2/2. Canvas portrétové kontroly a snímky proběhly před chybou
  testovací fixture; přesný průběh je v dílčím auditu.
- Boj: **14/14** cílených layout testů, **5/5** browser scénářů (sólo/coop,
  WebGL/Canvas, pause/remote/reuse) a striktní kontrola komponent prošly.
  Koordinátor navíc prohlédl `battle/canvas-coop-pet-B.png` a
  `battle/canvas-solo-pet-A.png`: celý panel zůstává uvnitř herní plochy,
  postavy jsou odkryté a identita s počty se nedotýká ozdob.
- Finální **build:pilot a build:dev prošly**, `git diff --check` čistý.
  Logy jsou v `artifacts/ui-refresh-v2/validation/`; zůstalo známé upozornění
  na velikost chunků. Širší unit sada ani globální typecheck se v této
  lokální vizuální revizi neopakovaly; historické chyby jsou v review z 12. 11.
- Nezávislé MCP: menu→hráči→osobní den (12 a 4 pokusy), výběr dvojice,
  skutečné potvrzení návodu arény a vstup do boje; vlastní detail Zyxe.

Současné Chromium běhy zpomalovaly snímky a jeden profilový běh vyčerpal
časový limit. Po sériovém spuštění prošel se stejným limitem. První bojový
timeout byl opožděný návod arény před startem; koordinátor jej skutečně
potvrdil, izolovaný bojový test jej má označený jako již absolvovaný.

Použity `ASSET_CREATION.md` a `UI_PRE_READER_GATES.md`: krátké popisky,
obrazové potvrzení, stabilní hit plochy, jednotné měřítko, constructor
resolution: 2, WebGL i Canvas. Oprava nemění kurikulum, bitevní pravidla ani
postup hráčů. Prohlédnuty i stavy bez slov a se ztlumeným zvukem uvedené
v dílčích auditech. Nebyl proveden fyzický dětský playtest ani nové schválení
všech starších obrazovek celé hry.

## Dostupnost hry a rodinné profily

Na výslovné doplnění zadání bylo čtením ověřeno, že hra i katalog uložených
profilů odpovídají HTTP 200 na `127.0.0.1:8001` a `192.168.3.49:8001`.
Server poslouchá na všech rozhraních a běží z tohoto pracovního adresáře.
Rodinné úložiště obsahuje Kitten (úroveň 11, 895 pokusů) a Eli
(úroveň 13, 1240 pokusů), s posledními uloženými daty z 10. 11. 2026.

Automatické načtení na nové adrese nevyžaduje DB ani přihlášení; podle
`DEV_SAVE_SYNC.md` používá `.local-saves/development/catalog.json`.
První načtení přes LAN odhalilo zastaralý virtuální seznam grafiky v dříve
spuštěném serveru: nový panel hráčů byl `__MISSING`. Tento stav byl odmítnut.
Server na portu 8001 byl restartován ze stejného pracovního adresáře, se
stejným úložištěm a s bindem `0.0.0.0`. Běží samostatně s PID 43480;
PID a výstup jsou v `artifacts/runtime/localhost-8001.{pid,log}`.

Finální Playwright MCP otevřel `http://192.168.3.49:8001/` v novém izolovaném
prohlížeči o rozměrech 1024 × 768. Po jednom skutečném GET katalogu se všech
osm existujících profilů automaticky načetlo před menu. Přes skutečné kliky
byly vybrány Kitten (slot 1) a Eli (slot 6), stisk HRÁT vytvořil coop a otevřel
jejich pokračování `SilverpondTownMockScene`. Úrovně 11/13 a počty 895/1240
zůstaly zachované; finální snímky nemají viditelnou chybějící texturu ani
runtime výjimku. Koordinátor skutečně prohlédl
`parent/family-lan-coop-ready.png`.

Všechny následné POST požadavky kontrolního prohlížeče byly zachycené pouze
do jeho paměťové kopie. Žádný testovací zápis nešel do skutečného úložiště;
SHA-256 katalogu před i po kontrole je totožný. Doklad:
`artifacts/ui-refresh-v2/validation/runtime-check.json`. Snímek spuštěné hry:
`parent/family-lan-started.png`. Fyzický tablet nebyl dálkově ovládán; pro
hraní na stejné Wi-Fi slouží uvedená domácí adresa, localhost na Macu zůstává
`http://localhost:8001/`.

Podrobnosti: [profily](UI_REFRESH_PROFILES_REVIEW_2026_11_12.md),
[návody](UI_REFRESH_GUIDES_REVIEW_2026_11_12.md),
[boj](UI_REFRESH_BATTLE_REVIEW_2026_11_12.md).

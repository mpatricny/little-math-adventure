# Bojový panel: oprava vzhledu — 22. listopadu 2026

## Výsledek

Panel nyní používá spojený portrét a jmenovku, obdélníkové záložky lišek,
větší bezpatková jména a jeden společný barevný rám. Referencí je
`design-drafts/battle-dock-v3/approved-owner-states.png`.
Předchozí vizuální přejímka z 21. listopadu neprokázala shodu s touto předlohou;
tento záznam ji pro vzhled panelu nahrazuje.

- Tyrkysová patří hráči 1, fialová hráči 2. Nevybraná záložka si ponechává
  tlumenou barvu vlastníka. Jasný okraj označuje právě vybranou lišku.
- Číselné kruhy zůstávají: vlastník, lektvary, síla útoku a síla schopností.
  Značka dočasné pauzy `II` byla odstraněna. Dostupné použití má plný kamínek,
  spotřebované prázdný, neodemčená schopnost zámek. Dočasná nedostupnost
  ztlumí obrázek a zachová plný kamínek.
- Kruhy síly i kamínky se vejdou dovnitř společného rámu i při stisku.
  Ikony mají společnou osu a větší barevné plochy. Meč má jantarové světlo.
- Dlouhá jména používají širší variantu hostů v `scenes.json`; písmo se
  nemačká ani nezmenšuje. Dvanáct W se rozdělí na dvě řádky uvnitř rámu.
- Spodní plocha má 96 herních pixelů. MathBoard je od panelu oddělený;
  spodní liška v co-op stojí výše, aby panel nezakrýval její nohy.

## Implementace a ověření

Změněné komponenty jsou `BattleDockArt`, `BattleActionDock` a
`BattleFoxAbilityPanel`. `BattleScene` předává editorové hosty a jejich
širší varianty. Pozice, rozměry a oddělovače zůstávají v `scenes.json`.
Stávající bitmapy rámů a ikon zachovávají poměr stran. Smaltované jmenovky
a světlo vznikají ve vrstvách Canvas, text používá konstruktorové
`resolution: 2`. Hit area stojí na místě, rámeček a obsah se pohybují spolu.

Před testy byla ověřena závislost na migracích: tato úprava je pouze v klientu,
nevyžaduje databázovou migraci. Testy běžely na odděleném portu 8029 bez API
proxy, se smyšlenými profily a zachyceným save syncem. Rodinné savy se neměnily.

- 14/14 scénářů Playwright: `battle-dock-v3.playwright.config.ts`.
  Přepínání vlastníků, skutečné použití a obnova schopností, solo, jiné zvíře,
  dlouhá jména, stisk/pointer-out, návrat z pauzy a původní HUD scénáře.
- 41/41 jednotkových testů: `BattleUiMockLayout`, `BattleFoxAbilitySession`,
  `FoxAbilitySystem`. Po posledním posunu odznaků znovu 14/14 layout testů.
- Skutečná BattleScene byla otevřená také přes Playwright MCP v oddělených
  kontextech. Kontrola WebGL i Canvas, 1280×720 a 1024×768.
- Celoprojektový TypeScript stále hlásí existující chyby mimo změněné
  prezentační komponenty; nejde o zelený celoprojektový typecheck.

## Skutečně prohlédnuté snímky

Pod `artifacts/battle-dock-fidelity/`:

| Snímek | Ověřený stav |
| --- | --- |
| `four-states.png` | Výřezy ze čtyř skutečných stavů souboje podle reference. Použité léčení a zásah Eli přetrvají i do obou jejích dalších tahů. |
| `a-hero-a-fox.png`, `b-pet-b-fox.png` | Celá scéna a hlavní akce hráče/mazlíčka. |
| `tablet-webgl.png` | Běžný panel v tabletovém viewportu. |
| `tablet-hover.png`, `tablet-pressed.png`, `tablet-out.png` | Společný pohyb povrchu a návrat bez spuštění akce. |
| `tablet-canvas-used.png` | Canvas, MathBoard, jiný vybraný vlastník a spotřebované léčení. |
| `tablet-defense.png` | Obrana: ztlumené schopnosti, plný nevyužitý kamínek, žádné `II`. |
| `tablet-full-hp.png` | Čerstvý Canvas souboj, 24/24 a 25/25. Model vrací pro léčení `full-health`, štít i zásah jsou dostupné. |
| `tablet-no-words.png` | Kontrola bez slovních popisků a se ztlumeným zvukem. |

Ze sady `artifacts/battle-dock-v3/` byly navíc prohlédnuty
`canvas-1024-first.png` (zámky) a `long-names-player_turn.png` (dlouhá jména).
Samotné testové výsledky nenahrazovaly porovnání snímků s předlohou.
Vedlejší UI chat provedl samostatné read-only porovnání a jeho připomínky
k barvě nevybrané záložky, světlu útoku a dokladům použitých stavů byly zapracovány.

Pre-reader kontrola se vztahuje na tento panel: nejsou přidané instrukční
odstavce, postavy a vlastnictví jsou rozlišitelné portréty a čísly, akce
obrázky a použití kamínky. Výška tlačítek 74 px odpovídá 59,2 CSS px na
1024px viewportu a 44,4 CSS px při šířce 768 px. Pravidla vztahových znamének
nebyla touto úpravou změněna. Neproběhl test na fyzickém Samsungu ani nové
ověření celé hry či dosud nedokončeného představení nových stupňů schopností.

## Běžící hra

Port 8001 při závěrečné kontrole neběžel, proto byl znovu spuštěn obvyklý
`npm run dev:tv -- --strictPort`; HTTP odpověď hry je 200.
HMR zůstává vypnuté. Nebyl vynucen refresh tabletu ani změněn uložený postup.
Změny jsou v rozpracovaném checkoutu; tento krok neprovedl commit ani push.

## Středový panel v bitevní scéně

Podle schváleného návrhu `docs/design-drafts/battle-dock-v3/centered-layouts-original-rim.png`
hra vystředí viditelné ovladače při nule nebo jedné lišce. Do šířky započítá
i odznak síly útoku. Se dvěma liškami používá pravostranné rozložení z editoru.
Středový panel má po obou stranách stejný oblouk a původní zlatý lem sahá
k oběma okrajům herní plochy. Na výřezech 1280 × 720 odpovídá jeho tloušťka
schválené předloze u obou krajů i uprostřed.

Playwright prošel všemi 18 regresními scénáři a třemi doplňkovými kontrolami.
Při vstupu z arény byl ověřen dotyk na útok a stav panelu po správné a chybné
odpovědi. Ve středovém panelu fungoval i dotyk na lektvar a na štít lišky
druhého hráče během tahu prvního. Prošlo také všech 41 jednotkových testů pro
rozložení a schopnosti lišky.

Prohlédnuté snímky z běžící hry jsou v `artifacts/battle-dock-centered/`.

| Snímky | Co zachycují |
| --- | --- |
| `layouts.png` | Tři sestavy ve stejném měřítku při šířce 1280 px. |
| `solo-tablet.png`, `one-fox-tablet.png`, `coop-tablet.png` | Oba konce lemu a krajní odznaky v emulovaném viewportu 1024 × 768. |
| `one-fox-hover.png`, `one-fox-press.png`, `one-fox-out.png` | Najetí, stisk a návrat kulatého útoku do klidové polohy. |
| `one-fox-no-words.png`, `one-fox-math.png` | Ikony se skrytými slovy a vypnutým zvukem, poté otevření příkladu. |
| `correct-tablet.png`, `wrong-tablet.png`, `victory-tablet.png` | Ztlumený útok pod zpětnou vazbou a přechod na výsledkovou obrazovku. Pro poslední snímek byl použit testovací přechod do vítězství. |

Vykreslení bylo ověřeno v Chromiu přes Canvas a WebGL. Tabletové kontroly
proběhly v emulaci dotyku a velikosti obrazovky.

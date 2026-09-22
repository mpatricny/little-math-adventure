# Číslokraj pilot 0.1.5

Mobilní herní plocha a pole jména mají společný počátek a měřítko. Změny
viditelného prostoru při otevření klávesnice, otočení a fullscreen se promítají
do canvasu, HTML vrstvy i souřadnic dotyků. Při psaní se zachová čitelné měřítko
a pole se spolu s rámečkem posune nad klávesnici.

Klepnutí vybere výchozí jméno pro přepsání. Klávesnicové Hotovo zavře psaní;
hru spouští Hrát. Návrat z volby úrovně zachová jméno i postavu. Rozměry a
umístění jména spravuje `characterNameInputHost` v `scenes.json`.

## Ověření

- Mobilní WebGL i Canvas, tabletový Canvas a desktopový WebGL: zarovnání,
  dotykové psaní, limit jména, model klávesnice, otočení, návrat z úrovně a
  uložená nová hra. Opakování: `npm run test:mobile-layout`.
- Regrese herního přihlášení na desktopu i tabletu: `npm run test:game-account`.
- Sestavený pilot: vstup/výstup z fullscreen, centrování a pole v rámečku.
- Produkční build, šest testů Cloudflare routování a limity statických souborů.
- TypeScript má stejných 142 existujících diagnostik jako základ; žádná nová.

Vizuálně prohlédnuté snímky, pre-reader kontrola a přesné hranice ověření jsou
v [mobilní kontrole](../MOBILE_LAYOUT_REVIEW.md). Systémová klávesnice byla
modelovaná přes visualViewport; fyzický telefon ještě nebyl ověřen. Dřívější
rozdíly dekorací v Canvas fallbacku a malé starší ovladače zůstávají popsané
v kontrole; nejde o schválení všech obrazovek celé hry.

## Vydání

Frontend Cloudflare Workeru `cislokraj-web` publikuje pouze `dist/pilot`.
Označení odpovědi je `X-Cislokraj-Release: pilot-0.1.5` a zdroj je Git tag
`pilot-0.1.5`. Vydání nemění API, SQL ani formát uložených her a nevyžaduje
databázovou migraci.

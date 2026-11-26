# Výtvarná a funkční kontrola V4

19. listopadu 2026. Kontrola samostatné autorské galerie; není to schválení
produkční podoby ani animace. Před kontrolou ověřen standalone Vite config:
žádné databázové migrace, save API ani herní data nejsou závislostí galerie.

## Prohlédnuté obrázky

- `lineup-desktop.png` — 1600 × 860, všech pět podob vedle sebe.
- `lineup-1024.png` — tablet naležato, celá řada a dostatečně velké cíle.
- `lineup-768.png` — tablet nastojato, přehled ve třech a dvou sloupcích.
- `detail-desktop.png` — velké srovnání schváleného základu a chůze doprava.
- `detail-tablet.png` — schválený základ a hravá poklona na tabletu.
- `detail-light.png` — stříbrná srst páté podoby a okraje na světlém pozadí.
- `hover.png`, `pressed.png`, `pointer-out.png` — stejná geometrie karty,
  obrázku i popisků; po odjetí kurzoru zmizí zvýraznění a šipka.
- Nakonec ověřeno také zobrazení v uživatelově IAB; karta galerie zůstává
  otevřená jako výstup.

Skutečné screenshoty byly prohlédnuté, nejen pořízené. Bez překryvů,
deformací, oříznutých tlapek či ocasů. Nadpisy i spodní popisky jsou
zarovnané; okraje průhledných ilustrací jsou čisté na tmavé i světlé ploše.
Přirozená rozdílnost postojů znamená různou výšku siluety. Galerie drží
stejnou spodní linii a bezpečné okraje, ne produkční anatomické měřítko.

## Interakce

Playwright MCP: 20/20 kontrol — výběr všech pěti podob, načtení všech
1200px obrázků, přechod šipkami přes oba konce, světlé pozadí, zavření
srovnání, navrácení fokusu, absence vodorovného přesahu a dotykové cíle
alespoň 44 × 44 při šířkách 1024 a 768. Konzole bez chyb a varování.

Žádný disabled, chybný matematický výsledek nebo vítězný herní stav tato
autorská galerie nemá; jejich kontrola sem nespadá.

## Pre-reader a další schválení

Použity `docs/UI_PRE_READER_GATES.md` a `docs/ASSET_CREATION.md`. Toto není
hráčský dialog: souvislá věta mimo karty a dokumentace jsou poznámky pro
autora. Samotné kresby ukazují odlišné postoje, bílou srst, strukturu run
a hvězdný znak bez čtení či zvuku. Žádná vysvětlení herních schopností
nebo matematické symboly do návrhu nepřibyly.

Autor stále musí posoudit čtyři nové evoluce. Produkční velikost, portrétní
výřezy a případná animace přijdou až po tom. Technická kontrola tento krok
nenahrazuje.

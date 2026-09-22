# Číslokraj pilot 0.1.1

Vydání 22. 9. 2026. Tag: `pilot-0.1.1`.

## Změny

- Obrázková kapitola porovnávání používá společný MathBoard od velikosti předmětů
  přes počet a čísla až k výrazům. Prázdné místo pro vztah a velké volby platí
  také pro smíšené sady, zkoušky, katakomby a mobilní ovladač.
- Rychlostní bonus se promítá do skutečného útoku; aktuální porovnávání používá
  také štít a mazlíček. Prvních pět číselných odpovědí má krokodýlí připomínky
  okamžitě, další po deseti aktivních sekundách, samostatně pro každého hráče.
- Opraven postup ke zkoušce a obě navazující výzvy v katakombách. Každý úspěšný
  průchod zvýší skutečnou sílu lišky o jeden, včetně opakovaných průchodů.
- Mana přibývá při 1, 3, 6, 10 a 15 správných odpovědích a dále po pěti.
  Výraznější efekt, vlastní jména spoluhráčů a výsledky s velkými ikonami.
- Opraven pergamen při dalších arénových soubojích, dotykové posouvání mapy
  učení, hranice početních úloh a ukládání statistik při střídání spoluhráčů.
- Pilot zachovává Mathorii a les; vývojová varianta obsahuje i další kapitoly.

## Ověření před vydáním

- 96 cílených jednotkových testů porovnávání, co-opu, bonusů, lišky, many a layoutů.
- Devět testů pilotních dat a samostatného načítání obrázků v cechu/katakombách.
- Šest prohlížečových integračních scénářů: skutečné poškození, hranice páté
  nápovědy, štít a mazlíček, získaná zkouška a obě katakomby v Canvas/WebGL,
  oddělené profily v co-opu a chybný/neúspěšný průchod katakombami.
- Pět testů routování Cloudflare, dvanáct testů API a sestavení API.
  Databázové integrační sady se při tomto běhu nespouštějí proti produkci.
- Produkční build a limity statických souborů Cloudflare: 326 souborů,
  největší 7 240 124 bytů, pod limitem 25 MiB.
- Vizuální přejímka změněných herních obrazovek podle
  [UI pro nečtenáře](../UI_PRE_READER_GATES.md), včetně Canvas/WebGL,
  desktopu/tabletu, stavů tlačítek a co-opu, je doložená v
  [kontrole porovnávání](../COMPARISON_RUNTIME_REVIEW.md) a
  [kontrole růstu lišky](../CATACOMB_FOX_PROGRESS.md).
  Při vydání znovu prohlédnuty `artifacts/comparison-integration/canvas-exam-overview.png`
  a `webgl-catacomb-1-expression.png`: přehled s ikonami, prázdný slot, čitelné
  výrazy a oddělená tlačítka bez překryvů.

Starší TypeScript diagnostiky a starší obrazovky mimo popsaný rozsah nejsou
tímto vydáním prohlášeny za nově opravené nebo vizuálně schválené.

## Nasazení

Zdroj vydání je uvedený Git tag. Cloudflare publikuje pouze `dist/pilot`;
Railway služba `api` se nasazuje z `server/`. `APP_RELEASE` ve Workeru i
v Doppler konfiguraci `cislokraj/prd` musí odpovídat tagu.

Vydání nepřidává ani nemění SQL migraci. Railway před startem ověřuje kontrolní
součty dosavadních migrací a případné chybějící aplikuje transakčně. Zdraví
nasazení ověřují `/health` a `/ready`, frontend hlavička `X-Cislokraj-Release`.

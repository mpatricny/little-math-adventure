# Srozumitelné názvy zkoušek a bran — 24. 9. 2026

## Rozsah

Produkční nabídka v obou ceších, úvod zkoušky, průběžný nadpis, výsledek a
podtitulek katakomb používají společné `getExamPresentation`. Například A2
znamená „Odčítání do 5“, brána A „Počítání do 5“ a E2 „Odčítání přes 10“.
Náhled ukazuje velký nevyřešený příklad, u smíšeného pásma sčítání i odčítání.
Ukázky jsou ověřené proti skutečnému katalogu, ale netvoří frontu zkoušky.

Kódy v uložení, dostupnost, generování skutečných otázek, první odpovědi,
obtížnost, prahy medailí a odměny se nemění. Výsledek používá stávající
symbolickou podobu odměn i u aritmetiky. Nové statické oblasti jsou v
`scenes.json`; tlačítko nabídky má na tabletovém viewportu 1024 × 768 dotykový
cíl 44,8 CSS px. Porovnávací znaky na tabuli mají 36 px místo původních 17 px.
Podtitulek katakomb má 24 px a vejde se do původního hostu.

Audio je pouze [samostatný návrh](audio/SPOKEN_PROBLEMS_PLAN_CS.md).
Nebyla přidána žádná nahrávka, timer nápovědy ani změna audiosystému.

## Funkční ověření

- Před testy ověřeno: změna prezentace nepotřebuje databázovou migraci;
  nezasahuje do serverového schématu ani formátu uložených pozic.
- 43 jednotkových testů prošlo v šesti souborech: `ExamPresentation`,
  `GuildHallLayout`, `GuildExamLayout`, `ExamBalance`, `CatacombPetProgress`
  a `ComparisonLearningSystem`.
- Dva scénáře `e2e/learning/exam-identity.spec.ts` prošly v Canvas i WebGL
  na lokálním serveru 8001. Každý projde osm otázek skutečnými dotyky,
  jednu zodpoví chybně a sedm správně, zkontroluje zpětnou vazbu a výsledek.
  Dále ověří bránu, tři členy, D1/E1/E2, porovnávání, Silverpond a disabled.
- Snímky zahrnují desktop 1280 × 720 a tabletový viewport 1024 × 768,
  kontrolu skutečných textových hranic a `frame.source.resolution === 2`.
- Playwright MCP navíc ověřil podtitulek katakomb v obou rendererech:
  správný název, 24 px, resolution 2, rozměry uvnitř hostu.
- `npm run build:pilot` prošel. Celkový `tsc --noEmit` nadále hlásí 142
  předchozích chyb; po odfiltrování posunů čísel řádků nepřibyla nová chyba.
- Testy běžely v oddělených kontextech, s testovacími profily a blokovaným
  kořenovým API `/v1/`. Skutečné profily ani tabletový prohlížeč se neměnily.

První neúspěšný E2E běh měl uměle nabídnuté A2 bez odemčení v testovacím
profilu, takže generátor správně nepřipravil otázky. Opravena fixture, ne
produkční pravidla pro dostupnost. Testy pak opakovaně prošly.

## Skutečně prohlédnuté snímky

Adresář `artifacts/exam-identity/`:

- `webgl-hall-desktop.png`, `canvas-hall-tablet.png`: čitelné názvy, ukázka
  a počet správných odpovědí v oddělených oblastech, žádné překrytí rámu.
- `canvas-overview-A.png`, `webgl-overview-A3.png`,
  `webgl-overview-E2.png`, `canvas-overview-comparison_symbols.png`: názvy
  a velké příklady uvnitř pergamenu, porovnávací znaky nejsou zmenšené.
- `canvas-active-tablet.png`, `canvas-results-tablet.png`: zachovaný název
  dovednosti během zkoušky a po ní; nový nadpis nekoliduje s počitadlem.
- `canvas-start-hover.png`, `webgl-start-pressed.png`,
  `canvas-start-out.png`, `webgl-hall-disabled.png`: stabilní geometrie,
  běžné stavové zvýraznění a odlišené neaktivní tlačítko.
- `canvas-gate-no-prose.png`: se skrytými slovními texty a vypnutým zvukem
  zůstává patrná směs sčítání a odčítání i číselné podmínky medailí.
- `webgl-silverpond-gate.png`: stejná identita zasazená do existujícího cechu.
- `canvas-catacomb-identity.png`, `webgl-catacomb-identity.png`: zvětšený
  podtitulek ve stávajícím modálním panelu, bez zásahu do pravidel lišky.

Kontrola se řídí `UI_PRE_READER_GATES.md`; nejde o plošnou přejímku celé hry.
Starší drobný seznam jednotlivých příkladů na výsledkové obrazovce nebyl
v tomto kroku typograficky přepracován. Ovládání zkoušky nepřidává nový typ
úkolu a používá dosavadní tok odpovědi a názorné opravy. Čitelnost názvů a
rozpoznatelnost ukázek byla posouzena vizuálně, nikoli playtestem s dětmi.
Tabletové rozměry jsou emulované; fyzický iPad a úzký mobil zde nebyly ověřeny.

## Předání

Hra běží na `http://192.168.3.10:8001/`. Po dohrání stačí ručně obnovit stránku.
Automatické obnovení bylo ponecháno vypnuté. Dočasný QA server 8003 byl zastaven.

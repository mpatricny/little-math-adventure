# POVINNÁ PŘEJÍMKA UI: DĚTI JEŠTĚ NEUMĚJÍ ČÍST

**Požadavek autora z 20. 9. 2026: ŽÁDNÝ DLOUHÝ TEXT NESMÍ BÝT NIKDE
V HERNÍM UI. Vysvětlení musí být názorné a obrázkové. Nesplnění blokuje přijetí.**

Platí pro celou hru, všechny regiony, oba buildy, solo i co-op, úvod, zadání,
nápovědu, chybu, úspěch, menu, obchod, mapu, zkoušku, tooltipy i systémové dialogy.
Dokumentace pro vývojáře může pravidla popisovat podrobně; nesmí se stát kopií
textu zobrazovaného dítěti. Starší schválení screenshotu tato pravidla nenahrazuje.

## Povinné kontroly při návrhu, review, testování a vydání

- [ ] **Bez čtení:** po skrytí všech slovních popisků a vypnutí zvuku je z obrázků
  a předvedení jasné, co dítě dělá, kam se dotkne a co jeho volba znamená.
- [ ] **Žádné dlouhé texty:** běžné popisky mají 1–3 známá slova, krátký nadpis
  nejvýše 4. Žádné odstavce, víceřádkové instrukce ani vysvětlení složené z mnoha
  krátkých vět. Limit slov je doplňková kontrola, nikoli důkaz srozumitelnosti.
- [ ] **Názorný první kontakt:** novou akci předvede ruka/pohyb předmětu nebo
  krátká sekvence. Pak dítě zkusí nový příklad. „Rozumím“ nepotvrzuje pochopení.
- [ ] **Názorná chyba:** zpětná vazba ukáže příslušný vztah či postup; neopravuje
  jej jen slovně. Oprava stejného příkladu není nový samostatný úspěch.
- [ ] **Velké vztahy:** `<`, `>` a `=` mají všude nejméně 2× původní viditelnou
  velikost při stejném viewportu. Porovnat skutečné hranice vykresleného znaku,
  ne jen nastavený font. Zvětšit i prostor, včetně hintů, mapy, zkoušky a co-op.
- [ ] **Přiměřený vložený znak:** původní základ je drobný znak ve hře, nikoli
  předchozí návrh. Čistý znak mezi čísly má přibližně jejich viditelnou výšku;
  nesmí být obří jen proto, že vyplnil celý host krokodýla. Toto je výslovná
  následná oprava autora. Prázdný host a vložený znak mají nezávislou velikost.
- [ ] **Bez prozrazení:** při samostatném rozhodování správný směr neprozrazuje
  pohled krokodýla, otevřená tlama, barva, zvýraznění ani ruka z ukázky.
- [ ] **Společný MathBoard:** porovnávání používá stejný pergamen a postup
  odpovědi jako ostatní příklady. Místo pro vztah je na začátku prázdné; bez
  neutrálního krokodýla, otazníku nebo předem vloženého znaménka. Tři větší
  volby mohou mít novou podobu; nesmějí založit oddělený výukový/bojový systém.
- [ ] **Všechny porovnávací úlohy:** přerušované prázdné políčko také v běžné
  smíšené sadě, obraně, pokročilých zkouškách, katakombách a mobilním ovladači.
  Žádné kolečko místo vztahu. Zachovat všechny členy a operátory na obou stranách;
  velké volby `<`, `=`, `>` se musejí vejít dovnitř skutečného rámu tlačítka.
- [ ] **Ovládání a vzhled:** desktop i tablet; normální, hover, stisk, pointer-out,
  disabled, správně, špatně a hotovo. Bez překryvů, čitelné počty a čísla,
  zachované proporce. Dotykový cíl nejméně 44 CSS px.
- [ ] **Společný pohyb tlačítka:** dřevěná plocha i tlama/znak jsou v jednom
  vizuálním kontejneru. Hover, stisk a návrat pohybují oběma zároveň; klikací
  plocha zůstává na místě. Zkontrolovat i přechod do disabled a nové zadání.
- [ ] **Stejný boj, jeden příklad:** postupné zobrazení nemění počet úloh,
  poškození, zdroj meče/mazlíčka, obranu ani postup kapitoly. První odpověď se
  zaznamená jednou; výuková oprava nevytváří další úspěch. Ukázka nepřidává
  sílu a netiká během ní čas řešení. Jeden tah končí jedním bojovým callbackem.
- [ ] **Výrobní integrace:** statické hosty a safe inset v `scenes.json`, pozice
  a hloubka přes SceneBuilder; žádné nahrazování layoutu zmenšováním textu.
  V Phaseru ověřit Canvas i WebGL a konstruktorové `resolution: 2`.
- [ ] **Doložený vizuální průchod:** zapsané cesty ke skutečně prohlédnutým
  obrázkům a zbývající omezení. Automatický bounds test není vizuální schválení.

## Zvláštní kontrola krokodýla

1. Jeden větší a jeden menší předmět **stejného druhu**, bez čísel a počítání.
   Nestejné velikosti musí být na první pohled odlišné: schválený kontrast
   je 2:1 v šířce i výšce. Rovnost má zcela stejné rozměry.
2. Více versus méně kusů, zpočátku **stejné velikosti** a se shodnými rozestupy.
3. Stejné skupiny a **číslo u každé skupiny**; číslo přesně souhlasí s počtem.
4. Jen dvě čísla. Známá tlama se postupně převádí na velký čistý znak.

- [ ] Tlama má rozpoznatelný tvar `<`/`>` a otevřenou stranou míří k většímu
  předmětu, větší skupině nebo většímu číslu. Není to malý ovál ani dekorace.
- [ ] Úvodní animace probíhá přímo na MathBoardu: prázdné místo → volba tlamy
  → přesun tlamy do místa → krmení větší nabídkou → pravdivý vztah. Ukázat
  oba směry i rovnost, potom nový samostatný příklad s prázdným místem.
- [ ] Ukázka skutečně krmí krokodýla větším předmětem / početnější skupinou.
  Animace nesmí zanechat nepravdivé porovnání po zmizení části předmětů.
- [ ] Rovnost předvede shodné velikosti nebo párování kusů 1:1 a velké `=`.
  Pouhá zavřená tlama není vysvětlení rovnosti; dítě má samostatnou volbu `=`.
- [ ] Ověřit oba směry a rovnost v každé fázi, prohodit strany. Až po názorném
  vysvětlení počtu ověřit i „3 malé a 3 velké = stejný počet“.
- [ ] Vynechání obrázků ve třetí fázi nebo přidání textového návodu je blokující
  regrese. Následná aritmetika nesmí přeskočit žádný ze čtyř kroků.
- [ ] **Přechodná podpora znaků:** případné krokodýlí připomínky nad volbami
  přijdou současně nad `<`, `=`, `>` a nevyznačují správnou odpověď. Místo
  pro vztah je dál prázdné; zobrazení podpory neposouvá tlačítka.
- [ ] **Aktuální čekání:** první pětice zodpovězených číselných příkladů má
  krokodýly hned; od šestého vždy po 10 sekundách. Počítat správné i chybné
  odpovědi napříč útokem, štítem a mazlíčkem, zvlášť pro každého hráče.
  U pozdějších výrazů je čekání vždy 10 sekund. Toto nahrazuje staré kroky
  4/8/16/24/vypnuto. Jediné nastavení je v `src/data/comparison-learning.json`.
- [ ] **Postup a bonus:** připomínky nad všemi třemi volbami neprozrazují
  odpověď, a proto neblokují postup ke zkoušce ani rychlostní energii.
  Skutečné dopočtení výsledku / nová ukázka jsou stále asistencí. Porovnávání
  musí fungovat i v obraně, útoku mazlíčka, cechovní zkoušce a katakombách.
- [ ] Timer počítá jen aktivní zadání. Po odpovědi nebo změně úlohy už nápověda
  nepřijde; pozastavení nevyčerpá čekání. Pomoc se zaznamená až po skutečném
  objevení. Podpora nepřidává body sama a ve zkoušce se automaticky nespouští.

## Rozsah aktuálního ověření

Schválený návrh je zapojený do hry. Skutečný rozsah kontroly a prohlédnuté
snímky popisuje [COMPARISON_RUNTIME_REVIEW.md](COMPARISON_RUNTIME_REVIEW.md).
Přijetí této kapitoly není tvrzením, že všechny starší obrazovky celé hry
už splňují tento checklist.

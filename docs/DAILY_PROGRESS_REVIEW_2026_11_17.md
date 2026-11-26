# Denní přehled a obnovená historie — 17. 11. 2026

## Zadání

- Zachovat skutečné lokální profily Eli a Kitten a jejich doložené odpovědi.
- Oddělit celkový počet příkladů od výsledků vybraného dne.
- Procházet historii za celé dostupné období, ne pouze posledních sedm dnů.
- Za každý den ukázat dobu hraní, počet zodpovězených příkladů, procentní
  úspěšnost a samostatně průměrný čas správné odpovědi.
- Ukázat aktuálně trénovanou matematickou úroveň; nezaměňovat ji s bojovou
  úrovní postavy ani ji vydávat za historickou úroveň vybraného dne.
- Zachovat osobní přepínač hráče v coopu. Změna prohlíženého profilu nesmí
  přepnout hráče na tahu ani přepsat jeho postup.
- Tato revize se soustředí na funkci a data. Rozsáhlé estetické ladění bylo
  autorem odloženo; bezpečné okraje, rozestupy a čitelnost stále platí.

## Zdroj a oprava dat

Podklad: [Číslokraj – hráči, sezení a vývoj učení](https://docs.google.com/spreadsheets/d/1tI12Wrm3zJsE4gKwn2yo-HytVplEr1u6HbGVuZBCYso/edit),
zejména listy Lili (Kitten), Laura (Eli) a Metodika. Zdroj byl přečten přímo
přes Google Sheets. Soukromý výpočet reportu zpracoval archiv lokálních savů,
vyřadil syntetické odpovědi, diagnostiku a opakované kopie.

| Profil | Doložené odpovědi v původním savu | Po doplnění archivu | Správně | Dny s odpověďmi |
|---|---:|---:|---:|---:|
| Kitten | 800 | 805 | 699 | 13 |
| Eli | 1 171 | 1 176 | 1 000 | 22 |

Staré globální čítače 895 / 1 240 zahrnují historické rozdíly a nejsou zdrojem
tohoto přehledu. Původní UI navíc zobrazovalo jen poslední týden. Nový souhrn
vychází ze skutečných prvních odpovědí a jasně odděluje CELKEM a DEN.

`scripts/recover-learning-history.mts` připravuje obnovu nejprve bez zápisu.
Kontroluje konkrétní identity a očekávané počty. Aplikační režim používá
existující lokální API s kontrolou revizí a archivací starého katalogu.
Mění pouze `masteryData.learningHistory`. Zachovává postavu, předměty,
měnu, úrovně, odemčený obsah, původní mastery záznamy i čas posledního hraní.
Rodinné záznamy zůstávají v ignorovaném soukromém úložišti, ne v assets.

## Význam metrik

- **Příklady:** počet zaznamenaných prvních odpovědí v daném dni. Opakované
  procvičení se počítá znovu; kopie stejné odpovědi ze savu a archivu jen jednou.
  Umělý startovní postup a diagnostické ukázky nejsou odpovědi dítěte.
- **Úspěšnost:** správné první odpovědi / všechny první odpovědi daného dne.
  Den bez odpovědí zobrazuje pomlčku, nikoli falešných 0 %.
- **Průměr správně:** aritmetický průměr kladných časů správných prvních
  odpovědí do 120 sekund, bez výslovně zaznamenané pomoci. Delší časy mohou
  obsahovat přestávku. U starší aritmetiky může být pomoc neznámá. Nejde
  o medián ze zdrojové tabulky ani o celkový čas hraní.
- **Čas hry:** nově místně měřený čas aktivní hry. Historická data nemají
  spolehlivě měřenou dobu hraní; ukazují **Neměřeno**. Rozpětí mezi první
  a poslední odpovědí ani součet časů řešení se za dobu hraní nevydává.
- **Trénuje teď:** současné matematické pásmo a dovednost ze skutečného
  plánu učení. Historické datum nemění význam této položky.

Historie se uchovává odděleně od pracovního okna porovnávací kapitoly, aby
rotace posledních 400 odpovědí nesmazala denní součty. Čtení přehledu nemění
postup a nová odpověď se připíše do historie správného osobního mastery tracku.

## Ověření

Úprava je lokální frontend a rozšíření savu. Nepotřebuje databázovou migraci;
produkční databáze ani její migrace se při této práci nemění.

### Data a výpočty

- Obnova byla aplikována přes lokální API: Kitten revize 981 → 982,
  Eli 784 → 785. Každému profilu přibylo pět doložených odpovědí.
  Porovnání celých savů po vynechání jediného pole `learningHistory` je shodné;
  zbývajících šest profilů je beze změny.
- Předchozí katalog je zachovaný v automatické gzip záloze
  `.local-saves/development/history/catalog-eca81798e101e32e8e6b20d4e3f1012453d11eb00c4fe26e5b64c74b9066b7f8.json.gz`.
  Výsledný SHA256 katalogu:
  `783aede5d28e26894279c417f8c9b9ad7d0935e7e7d2127fcdce3eb7444067e0`.
- Opakovaný preview obnovy hlásí `changed: false` pro oba profily.
- Nezávislé Astra review porovnalo všech 13 + 22 historických dní s podkladem:
  počty, správné odpovědi i průměrné časy souhlasí. Zachování známé pomoci při
  sloučení starší a nové kopie je pokryté regresním testem.
- **80/80 cílených testů v sedmi souborech prošlo**: historie, denní součty,
  osobní profily, co-op, lokální čas a přenos savů.
- Development i pilot build prošel. Celoprojektový TypeScript nadále hlásí
  existující chyby v jiných scénách/testech; nevykazuje diagnostiku v nových
  modulech historie, času ani upraveném denním přehledu. Log je uložený.

### Skutečný prohlížeč a vizuální kontrola

- Playwright: desktop WebGL a tablet Canvas, **2/2 scénáře prošly**. Ověřeno
  CELKEM versus vybraný DEN, starý a prázdný den, týdenní šipky, návrat DNES,
  zakázaná budoucnost, dlouhé jméno a přepnutí profilu při zachování aktivního B.
- Doplněný Canvas průchod bez slov a se ztlumeným zvukem prošel **1/1**.
  Číselné výsledky, časové/odpovědní ikony, výběr dne a směrové šipky zůstaly
  viditelné. Jde o prohlížení statistik, nikoli novou výukovou úlohu.
- Root přes Playwright MCP načetl skutečný katalog z `http://localhost:8001/`:
  10. listopadu Kitten 45 odpovědí / 40 správně / průměr 10,8 s,
  Eli 44 / 38 / 19,4 s. Oba souhrny mají správně 805 a 1 176 odpovědí.
- V izolované kopii ověřeno skutečné měření v TownScene: oba účastníci coopu
  dostávají stejný čas, pauza, blur a menu jej nezvyšují, reload ho zachová.
  Všechny zápisové HTTP požadavky byly zachycené v paměti. SHA256 skutečného
  katalogu zůstal během testů shodný.
- Skutečně prohlédnuté snímky root review:
  `artifacts/daily-progress-2026-11-17/kitten-real-history-desktop.png`,
  `artifacts/daily-progress-2026-11-17/eli-real-history-tablet.png`,
  `artifacts/daily-history-2026-11-17/today-no-prose-canvas.png`.
  Astra navíc prohlédla today, old-day, other-player, empty-day a hub ve WebGL
  i Canvas. Počty, průměr a datum se vejdou do bezpečného vnitřku rámu;
  žádný nalezený překryv. Estetické ladění celé hry nebylo cílem této revize.

Omezení měření: starší dny zůstávají neměřené. Čas zahrnuje přemýšlení v aktivní
hře bez časového limitu nečinnosti; neumí poznat, že dítě odešlo od stále aktivního
tabletu. Při tvrdém pádu bez lifecycle události může chybět posledních nejvýše
15 sekund. Podrobnosti v `docs/LOCAL_PLAY_TIME_REVIEW_2026_11_17.md`.

Logy, doklady obnovy a integrity jsou v
`artifacts/daily-progress-2026-11-17/validation/`. Lokální Vite na portu 8001
byl po kontrole znovu ověřen: HTTP 200, naslouchá na všech rozhraních.

## Následná oprava skutečné kopie v Chrome

Uživatel po předchozí kontrole správně upozornil na Eli s pouhými 30 příklady.
Předchozí průchod ověřil správný katalog v izolovaném prohlížeči, ale ne staré
kopie uložené v jeho otevřeném Chrome. Tuto mezeru v ověření opravuje tato část.

### Příčina a obnova

- Chrome na `http://localhost:8001/` měl sedm profilů. Eli v pozici 7 měla
  staré UUID, level 2 a 30 odpovědí; Kitten v pozici 2 jiné staré UUID,
  level 2 a 72 doložených odpovědí. Jména sama o sobě nejsou identita.
- Běžná obnova pokládala obě kanonické identity za nové hráče. Do jedné
  volné pozice se nevešly; nevyměnila tedy žádný profil.
- Před opravou byla přes místní archive-only API uložená přesná kopie všech
  sedmi savů do
  `.local-saves/development/history/browser-20e75c54f616e01c6cefc16270c9a497dc7e62b7daece1449fb83a080ecbb608.json.gz`.
- Párování bylo výslovné podle původního a kanonického UUID, pozice,
  jména/avataru a doložené historie. Všech 72 odpovědí Kitten a 29 z 30
  odpovědí Eli již bylo v obnovené historii.
- Zbývající odpověď Eli je platný historický záznam z 9. září:
  `A1:1+1vs1:compare_eq_num`, čas `1788977398598`, správně, `5248 ms`.
  Astra ověřila její původ ve staré posloupnosti i dalších místních zálohách;
  v podkladovém reportu chyběla. Zůstala zachovaná, takže nynější správný
  součet je **Eli 1 177 / 1 001 správně**, nikoli původních 1 176 / 1 000.
  **Kitten zůstává 805 / 699 správně**.
- Kanonický postup nebyl snížen. Eli má level 13, Kitten level 11. U Kitten
  byl zachován navíc již zhlédnutý průvodce `pythia.intro.v1`; staré zásoby
  a spotřebovatelné předměty se nesčítaly.
- Obnova skutečného Chrome proběhla přes dočasné rodičovské UI. Po reloadu
  hry i novém načtení kontrolní stránky se znovu zobrazilo Kitten 805 / 11
  a Eli 1 177 / 13. Zbývajících pět profilů zůstalo přesně shodných s původní
  zálohou; ověřeno porovnáním celých savů.

### Ochrana proti opakování a kontroly

- `restoreDevSaves` přijímá explicitní přiřazení staré identity. Ověřuje
  původní pozici, UUID, jméno/avatar, standardní ochranu proti ztrátě postupu,
  úplný multiset odpovědí a známý čas hraní. Kontroly proběhnou před zápisem;
  původní hry se archivují, chybný zápis se vrací a souběžná změna obnovu ruší.
  Samotná shoda jmen k automatickému nahrazení nikdy nestačí.
- Automatický sync nyní aktualizuje existující identity i v plném prohlížeči.
  Nedostatek pozic pro další profily aktualizaci neblokuje. Vlastní úspěšná
  obnova aktualizuje `restoreEpoch`, aby nezastavila následnou zálohu.
- Změna nevyžaduje databázovou migraci. Prošlo **29/29** testů synchronizace,
  historie a přenosu, **8/8** testů lokálního úložiště a development build.
  Celoprojektový TypeScript stále hlásí nesouvisející chyby; žádná diagnostika
  se netýká změněného `DevSaveSync` ani jeho testů. Závěrečné Astra review
  nenašlo konkrétní regresi nebo blokující riziko dat.
- Playwright MCP znovu proklikal herní hub, mapu, historický den a přepínání
  profilů se stejnými sedmi savy. Šlo o izolovanou kopii; všechny zápisové HTTP
  požadavky byly zablokované. Skutečné trvalé uložení v Chrome bylo ověřeno
  samostatně přes jeho živé rodičovské UI, nikoli vydáváno za tento playtest.
- Mapa Eli má počty 200, 199, 71, 45, 66; 80, 159, 64, 57; 120, 105, 11.
  Jejich součet je 1 177. Denní přehled pro 10. listopadu má u Eli 44 příkladů,
  38 správně a průměr 19,4 s; Kitten má 45, 40 a 10,8 s. Historický čas
  zůstává poctivě označený „Neměřeno“.
- Root skutečně prohlédl snímky `eli-restored-learning-map.png`,
  `eli-restored-daily-progress.png` (1440 × 900) a
  `kitten-restored-daily-tablet.png` (1024 × 768), všechny v
  `artifacts/daily-progress-2026-11-17/`. Čísla se zobrazují uvnitř rámů,
  celkový počet je oddělený od dne a zůstává průměr správných odpovědí.
  Pravidla `UI_PRE_READER_GATES.md` platí; tato oprava nemění ovládání,
  texty ani výukový tok. Estetická revize celé hry není součástí této opravy.
- Snímky herní UI jsou z izolované kopie. CUA ověřila skutečný Chrome přes
  přístupný obsah kontrolní stránky; přímý snímek jeho canvasu nebylo možné
  spolehlivě získat kvůli chybě připojení a náhledu neaktivního okna.

Po záloze ostatních pěti skutečných profilů má místní katalog 13 identit;
počet hráčů v tomto Chrome zůstává sedm. Závěrečný SHA256 katalogu je
`adf7e4d2eacb2ad3394a76114d9cb29c34d32db46b0973ee61578938f3a02680`.
Doklady: `validation/identity-restore-final-integrity.json`,
`validation/chrome-evidence-applied.json` a logy s prefixem `identity-restore-`.
Pomocná karta byla zavřená; původní karta hry zůstala otevřená.

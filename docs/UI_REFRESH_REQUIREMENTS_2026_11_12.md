# Přehled hráčů, učení a jednoznačné ovládání — zadání 12. 11. 2026

## Cíl a způsob přejímky

Implementovat požadavky autora v produkční hře, nejen v mockupu. Implementaci
provádí Astra (`gpt-6-astra`, reasoning `max`); koordinující agent kontroluje
výsledek proti tomuto dokumentu, skutečným screenshotům a
[UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md). Funkční test bez prohlédnutí
obrazovek nestačí. Výsledek musí působit jednotně, přehledně a výtvarně dokončeně.

## R1 — Hráči a statistiky přímo z menu

- Z hlavního menu je dostupný přehled existujících hráčů bez vstupu do rozehrané
  hry. Každý profil poznáme podle postavy a jména, nikoli čísla slotu.
- U vybraného hráče lze otevřít denní pokrok a mapu učení, pokračovat sólo a
  vybrat druhého existujícího hráče pro coop. Vytvoření nového hráče zůstane
  dostupné. Stejný profil nelze vybrat dvakrát.
- Prohlížení statistik nesmí přepsat, promíchat nebo resetovat uložený postup
  ani aktivní coop relaci. Návrat z přehledů zachová vybraného hráče.
- Delší jména, žádný/jeden/více profilů a zaplněné sloty mají srozumitelný stav.

## R2 — Vysvětlení mají jedno velké potvrzení

- Provést audit vysvětlujících panelů napříč produkčními scénami a zapsat jeho
  rozsah a nálezy. Návod v obchodě má jedinou velkou akci „OK“ s výraznou fajfkou;
  odstranit souběžné zavřít, znovu a potvrdit.
- Stejný vzor použít pro ostatní vysvětlující panely. Vícekroková ukázka může
  postupovat tímto jediným tlačítkem; musí zůstat dokončitelná bez zvuku.
- Vytvořit nový hezký sdílený potvrzovací ovladač v herním stylu. Stisk a hover
  pohybují plochou i symbolem společně, stabilní hit area se nemění. Pointer-out,
  disabled, opakované otevření a zánik scény zruší neplatné animace a časovače.
- Návody jsou obrázkové, ne textové. Potvrzení nesmí nakoupit, utratit měnu,
  přidat poškození, udělit mastery ani propadnout do scény pod dialogem.
- Jediné potvrzení platí pro vysvětlení; nesmí odstranit významové volby
  skutečných rozhodnutí, nákupů, zkoušek nebo potvrzení smazání profilu.

## R3 — Jedno středové tlačítko útoku

- V boji se útočí jediným výrazným tlačítkem ve středovém kruhu. Meč označuje
  útok hrdiny, obrázek právě útočícího mazlíčka jeho útok. Nad ovladačem je
  jméno vlastníka; portrét/barva/označení hráče pomáhá i bez čtení.
- V sólu i coopu je vždy zřetelné, kdo je na řadě a komu mazlíček patří. Při
  každém přechodu mezi hrdiny a mazlíčky se obsah stejného ovladače aktualizuje.
  Stávající coop pořadí obou hrdinů a poté obou mazlíčků zůstává zachované.
- Nevytvářet druhé soupeřící tlačítko pro mazlíčka. Zakázané/neaktivní tahy
  nereagují, dvojklik nespouští duplicitní útok.
- Zachovat pořadí tahů, počet úloh, první odpovědi, přípravu meče/štítu,
  damage/defense pravidla, cooldowny, vlastníka mastery a co-op ovladače.

## R4 — Přehledná mapa učení

- Nahradit dosavadní grafiku novým výtvarným řešením vytvořeným s imagegen.
  Přehled tvoří vodorovné pásy podle skutečných číselných rozsahů kurikula;
  nezměnit rozsahy ani výukovou logiku kvůli návrhu.
- Místo kódů A1/B3 zobrazovat konkrétní obsah: sčítání, odčítání, porovnávání,
  tři čísla a další existující formy pomocí velkých symbolů a krátkých názvů.
- Již v přehledu je u dovednosti počet příkladů a stupeň zvládnutí. Stupně mají
  jasný tvar/počet značek a krátkou společnou legendu; barva není jediný nositel
  významu. Detail může ukázat přesnější data, ale základ je zřejmý bez rozkliknutí.
- Pokud profil začínal pozdějším modulem, přeskočené dřívější moduly se vůbec
  nevykreslí. Rozlišit startovní volbu od aktuálně dosaženého postupu.
- V coopu je vidět konkrétní hráč a lze přímo přepínat oba profily. Mění se
  pouze prohlížená data, nikoli vlastník právě rozehrané hry.

## R5 — Denní pokrok

- Vizuálně sladit s mapou a přehledem hráčů, s velkými jasnými metrikami,
  srozumitelnými ikonami a jednoduchou historií bez dlouhých textů.
- Zřetelně ukazovat profil, jeho denní počty a úspěšnost. V coopu umožnit přímé
  přepnutí hráčů; součet obou hráčů nesmí předstírat osobní statistiky.
- Ověřit nulový pokrok, aktivní den, historii a odlišná data obou hráčů.

## Společné povinné požadavky

- Číst [ASSET_CREATION.md](ASSET_CREATION.md) před návrhem. Použít jednotné
  rámy, oddělenou grafiku a runtime text. Žádné generované popisky v bitmapách.
- Veškeré statické hosty v `scenes.json`, pozice a depth přes SceneBuilder,
  samostatné safe insets. Zachovat poměr stran kompletních dekorativních rámů.
- Žádné překryvy, ořezané názvy nebo deformace. Velké dotykové cíle (≥44 CSS px).
  Konstruktorové `resolution: 2`, ověřit WebGL i Canvas.
- Slova nanejvýš 1–3 na běžný popisek, 4 v nadpisu; žádné odstavce a návody
  závislé na čtení. Vizuální průchod také se skrytými slovy a vypnutým zvukem.
- Porovnávací znaky měřit podle kresby; dodržet zvětšení proti původním drobným
  znakům i přiměřenost k číslům. V tomto úkolu neměnit porovnávací kurikulum.
- Před testy zkontrolovat závislost na DB migracích. Frontendové testy s lokálními
  save fixtures nepotřebují DB; případné integrační testy API vyžadují samostatný
  preflight a výslovné upozornění, pokud migrace chybějí.

## Důkazy a review

Zapsat do doprovodného review dokumentu: implementované soubory, audit návodů,
výsledek migrace preflight, provedené testy, cesty k prohlédnutým screenshotům,
nalezené vady a jejich opravy, případná skutečná omezení. Pro každý R1–R5 uvést
konkrétní důkaz a výsledek přejímky.

Požadované průchody Playwrightem:

1. Menu → hráč → denní pokrok → mapa → zpět; vytvoření/volba profilu; sólo/coop.
2. Obchod a další auditované návody: jediná akce, normal/hover/pressed/out,
   disabled/ready, opakované otevření a dokončení bez vedlejšího herního účinku.
3. Boj sólo i coop: hrdina a mazlíček obou hráčů, neaktivní stavy a správná identita.
4. Mapa: rozdílný startovní modul, počty a stupně, legenda, rozkliknutí a přepnutí.
5. Denní pokrok: prázdný den, odlišné profily, přepínání a historie.
6. Desktop 1280×720 a tablet 1024×768; přiměřené pokrytí WebGL/Canvas a
   interakčních stavů. Screenshoty nejen pořídit, ale skutečně vizuálně posoudit.

## Oprava po autorském review — 13. 11. 2026

Autor zamítl vizuální přejímku první verze a doložil pět konkrétních vad.
Tato korekce zpřesňuje předchozí požadavky; samotné automatické bounds kontroly
neprokazují dostatečný odstup od skutečně nakreslených ozdob.

1. **Tlačítka a ozdobný rám:** spodní akce přehledu hráčů posunout dovnitř
   čisté plochy pergamenu. Zachovat viditelnou mezeru od zlatých listů i
   rohových kamenů v normálním, hover a stisknutém stavu. Zkontrolovat také
   obsah denního pokroku, mapovou legendu a související panely.
2. **Scrollbar mapy:** nahradit holou modrou čáru výtvarně sladěnou dráhou
   a zřetelným úchytem. Zachovat funkci kolečka a dotyku, správný poměr délky
   úchytu a krajní polohy, dostatečný odstup od rámu a klikatelného obsahu.
3. **Zyx:** opticky vystředit skutečnou kresbu postavy v medailonu, nikoli
   jen její průhledné plátno. Prověřit více fází animace a všechny panely,
   které stejný portrét používají. Zachovat poměr stran a společnou geometrii.
4. **Vlastník bojového útoku:** portrét a jméno stáhnout z bojiště do kompaktní
   dolní skupiny ovládání. Upřesnění autora nahrazuje doslovné umístění jména
   „nad ovladačem“ v R3; identita může být vedle kruhu. Zůstává jediný středový
   útok a jednoznačný vlastník hrdiny i mazlíčka v sólu a coopu.
5. **Spodní bojové UI:** kruh, lektvar, počty a síla nesmí křížit zdobené
   okraje ani hranu obrazovky. Vytvořit přehlednou vyhrazenou dolní plochu,
   aby ovládání nesplývalo s rytinami arény. Čísla nesmí sedět přes ozdoby
   vlastních kruhových rámů.

Nové důkazy uložit odděleně do `artifacts/ui-refresh-v2/`. Původní snímky
ponechat pro porovnání. Opakovat cílené interakce a skutečnou vizuální kontrolu
desktop/tablet, WebGL/Canvas, včetně detailních výřezů těchto pěti vad.

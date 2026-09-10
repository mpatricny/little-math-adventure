# Podvodní kořist a požehnání perly

8. září 2026, navazující ověření po playtestu.

## Truhly

Truhly měly neprázdnou kořist už před touto úpravou. `createChest()` přiděloval mince/manu a ukládal osobní claim, ale přehrál jen nenápadný kruh. U číselného/písmenového zámku se změna horního HUD odehrála za otevřenou hádankou. Žádné ceny ani ekonomika nebyly navýšeny a staré otevřené truhly se nevyplácejí znovu.

| Místnost | Hodnota mincí | Mana |
|---|---:|---:|
| Mělčina pod molem | 5 | 3 |
| Zatopený kanál | 8 | 4 |
| Vrak poštovní lodi | 8 | 4 |
| Podpalubí poštovní lodi | 18 | 10 |

Autoritou částek je `public/assets/data/underwater-rooms.json`. V co-opu každému nově oprávněnému účastníkovi náleží vlastní odměna. Jeho claim se ukládá současně s měnou; znovukliknutí ani reload nic nepřidává. Mince se normalizují na různé nominály, proto testy měří jejich celkovou hodnotu, nikoli pouze měděnou kolonku.

Nový `UnderwaterChestReward` ukáže po zavření vyřešeného zámku (nebo ihned u nezamčené truhly) nemodální oznámení POKLAD, skutečné ikony mince/many a připsané částky. V co-opu označí A + B. Jde pouze o potvrzení již uloženého přírůstku, nikoli nové udělení odměny. Po 4,8 s začne mizet; nevyžaduje další kliknutí. Recykluje modrý smaltový rám, zachovává jeho poměr stran a používá runtime text s constructorovým `resolution: 2`. Rám, bezpečná oblast, titul i jednotlivé ikony a čísla jsou v `scenes.json` pod `UnderwaterChestReward`.

Před testy ověřeno, že není potřeba databázová migrace; save schéma zůstává stejné. **38 cílených unit testů / 4 soubory, tři E2E scénáře a build prošly.** E2E skutečně odemyká všechny čtyři truhly v každém scénáři, kontroluje přesné změny mince/mana, kořist pro oba hráče, ochranu proti opakování a reload. Výřezy nebyly pouze pořízeny: vizuálně posouzeny `chest-loot-desktop-sp_post_wreck.png`, `chest-loot-desktop-sp_wreck_hold.png`, `chest-loot-desktop-sp_shallows.png`, `chest-loot-tablet-sp_wreck_hold.png` a `chest-loot-coop-tablet-sp_sunken_canal.png` v `artifacts/underwater/`. Desktop 1280×720, skutečný Canvas 1024×768 a co-op Canvas 1280×800; fyzický Samsung nebyl ovládán. Neinteraktivní oznámení nemá hover/pressed stav. Běžící server 8001 a hráčské savy nebyly resetovány.

## Požehnání versus mezifázové léčení

Požehnání získané řešením světelné hádanky (`grotto-light`) při každém vstupu do boss souboje nabije jednu osobní ochranu. Jen ve druhé fázi, s mechanikou `tidal_wave`, zesiluje každý druhý útok na daného obránce bonus +3. Jeho první silná vlna tento bonus díky požehnání nedostane; běžná síla útoku zůstává. Vyhodnocení je před obranou/blokováním. A/B mají samostatné počítadlo i ochranu. Účinek tedy není trvalé snížení všech útoků ani úplná nezranitelnost.

Automatických +20 % maximálního zdraví mezi první/druhou a druhou/třetí fází platí nezávisle na požehnání. Současný popisek „Síla perel“ může tuto jinou mechaniku zaměňovat s požehnáním; v této změně se její pravidla ani text neupravovaly.

Vyvážení strážce beze změny. Zkratka z menu jde přes `preview: true`: vytvoří dočasného Průzkumníka s útokem 8, 24 HP, železným mečem/štítem a třemi lektvary. Nejde o běžnou postupovou postavu a odměny tohoto náhledu se neukládají do skutečného slotu. To je třeba rozlišovat při dalším balančním playtestu.

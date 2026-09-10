# Audio ve hře

Stav 8. 9. 2026: uživatel schválil ElevenLabs nahrávky a dodal všech deset MP3 ze Suno. V produkci je **10 skladeb, 45 efektů, 5 ambientů a 37 českých replik**. Zyx používá hlas Will, Pythia hlas Lily. Jezerní víla zůstává beze slov; její hudební a efektová kulisa je zapojená.

## Hudba

| ID | Dodaný soubor ze složky Downloads | Použití | Délka |
|---|---|---|---|
| m01_starfall | Starlit Storybook.mp3 | Menu, výběr postavy, komiks | 3:18 |
| m02_mathoria | The Village Path.mp3 | Mathoria, obchod, cech, aréna před bojem | 1:48 |
| m03_crystal_workshop | Gathering Numbers.mp3 | Pythia, kovárna, krystalový stroj, mana a zkoušky | 0:49 |
| m04_forest | Dappled Discovery.mp3 | Lesní místnosti a puzzle, doupě před probuzením | 2:03 |
| m05_battle | Number Hero March.mp3 | Běžné souboje | 0:20 |
| m06_guardian | The Guardian's Watch.mp3 | Boss a probuzení strážce | 1:28 |
| m07_rest | Campfire Rest.mp3 | Odpočinek a hospoda | 2:00 |
| m08_silverpond | Pearlescent Lake.mp3 | Silverpond nad hladinou | 1:43 |
| m09_underwater | Calm Blue Depths.mp3 | Podvodní průzkum, puzzle a sestup | 2:12 |
| m10_zyx_hope | Little Repair.mp3 | Zyx u lodi, lesní krystal, příběhové odměny | 1:38 |

Originály z Downloads byly zkopírovány beze změny do `public/assets/audio/music`. SHA-256, délky, tiché okraje a vyrovnané hlasitosti jsou v `public/assets/data/audio.json` a `music-checks.json`. Neznámé údaje (Suno URL a zvolený tarif konkrétní generace) nejsou domyšlené.

Hudba se streamuje přes HTMLAudio a míchá přes Web Audio GainNode. Při změně tématu a na konci skladby se prolíná 2 sekundy. Stejné téma pokračuje při přechodu mezi místnostmi. Odstraňují se pouze tiché okraje pomocí metadat, soubory zůstávají původní. Toto je atmosférický přechod, nikoli střih přesně na hudební takt. Krátký 20sekundový bojový track se opakuje často; pro pozdější delší variantu stačí nahradit soubor a obnovit metadata.

## Řeč a efekty

- Zyx: dvě scény havárie, první instrukce boje/arény, příprava meče a štítu, vstup do lesa, most, váhy, cesta, obětování krystalů, zámky a odpočinek.
- Lesní krystal: replika až po vyzvednutí, při objevení cíle návratu k Zyxovi. Viditelný cíl je „Vrať Krystal lesa Zyxovi“; řeč je krátká Zyxova pobídka „To je Krystal lesa! Přines ho ke mně.“ Nejde o doslovné čtení titulku.
- Zyxova loď: každá ze tří stránek má vlastní repliku. Krystalový stroj komentuje postup kalibrace, výběr, vložení a aktivaci. Pokyn „zelené místo“ je sjednocený s textem scény.
- Pythia: uvítání, výběr dosud nezískaného mazlíčka, dokončené přivázání. Kovárna: instrukce spojování a dělení. Po přivázání hraje efekt a pochvala až v obnovené scéně.
- Silverpond: vstup, sestup, obrácené operace, směrování, pumpa, proudový plán a zvonové perly. Pumpa zobrazuje stejný pokyn jako řeč. Zvonová replika popisuje výběr dvou perel; kratší vizuální titulek připomíná dva kroky a spuštění zvonu.
- Krátká podpora při chybě a prvním vítězství. Obecné instrukce zazní jednou za otevření hry; stránky příběhu a výsledky akcí mohou zaznít znovu.
- Efekty: potvrzení a návrat, nedostupná akce, správná/chybná odpověď, meč/zásah/blok, kouzla, boss fáze, osvobození, příprava/spotřeba run, mince, krystaly, truhla, lektvar, vybavení, odpočinek, zámky, kameny, mazlíčci, stroj, voda/ventily/pumpa/zvon, kroky a komiksová havárie.
- Prostředí: les, dílna, oheň, jezero, podvodní prostředí. Ambient patří pod hlasitost efektů.

## Ovládání a životní cyklus

**ZVUK** je v hlavním menu a pod pauzovacím dialogem. Hudba, hlas a efekty mají vlastní hlasitost i vypnutí. Nastavení se ukládá pro prohlížeč do `littleMathAdventure_audio_v1`, odděleně od herních pozic. Výchozí hodnoty: hudba 65 %, řeč 100 %, efekty 80 %; jednotlivé soubory mají další mixážní gain v manifestu.

Zvuk začne až po skutečném kliknutí/dotyku/klávese. Na TV je potřeba první interakce na hostitelské obrazovce. Telefony ovladačů nevytvářejí další mixer.

Při řeči klesne hudba na 25 % nastavené úrovně a ambient na 40 %. Mluví jediná replika; další stránka, zavření dialogu nebo odchod zastaví i čekající nahrávku. Pauza a skrytá karta zastaví přehrávání a při návratu pokračují. V nastavení lze slyšet ukázku. Sestup začne až po instrukci; při vypnutém hlasu pokračuje hned. Načtení zvuku má limit 8 sekund a chyba souboru neblokuje hru.

Celkem může znít nejvýše 8 krátkých efektů současně; stejné efekty mají ochranu proti násobnému spuštění. Hlasy a soubory se načítají podle potřeby, hudba se nedekóduje celá do paměti.

## Soubory a údržba

- `src/audio/AudioDirector.ts`: jediný mixer, cache, řeč, pauza, hudební prolínání.
- `src/audio/SceneAudioPlugin.ts`: témata, ambienty a životní cyklus scén.
- `src/audio/AudioSettings.ts`, `src/scenes/AudioSettingsScene.ts`: uložené preference a ovládání; hosty jsou v `scenes.json`.
- `public/assets/data/audio.json`: produkční ID a soubory, gainy a metadata.
- `public/assets/audio/sfx`, `ambience`, `voice/cs`: schválené WAV kopie s rezervou proti špičkám. Žádná další ztrátová komprese.
- `public/assets/audio/incoming/elevenlabs`, `previews`: archiv generací a poslechu; Vite je vyloučí z výsledného `dist`.
- `scripts/audio/check_music.mjs`: znovu analyzuje hudbu a aktualizuje gainy a hranice, potřebuje Chromium z Playwright.
- `elevenlabs-generated.json`, `elevenlabs-batch.json`, `technical-checks.json`, `LISTEN.md`: původ, prompty, modely, kredity, poslechové zdroje.

Hra během přehrávání nepoužívá API ani tajný token. Přidáním audia nevznikla potřeba databázové migrace.

## Ověření

31 jednotkových testů nastavení, přípravy, výpočtu poškození, podvodních úloh a lesního krystalu prošlo. Produkční build prošel. Celorepozitářový `tsc --noEmit` má již existující chyby v jiných částech; nové audio moduly v kontrole chyby nemají.

Šest prohlížečových scénářů prošlo: nastavení/pauza na desktopu ve WebGL a tabletu v Canvas, mixer se smyčkou/chybovým souborem návaznost skutečných Zyxových dialogových stránek a celý hlasový postup krystalového stroje v obou vykreslovacích režimech. Dvě duplicitní kontroly mixeru/dialogu jsou na Canvas záměrně vynechané. Spuštění: `npm run test:e2e:audio`. Testují odemčení po interakci, skutečné přehrávání MP3/WAV, ztišení při řeči, výměnu dialogu, vypnutí a uložení hlasitosti, pauzu/návrat, mapování témat, konec smyčky, zrušení čekajícího hlasu a chybějící soubor. Vizuální snímky jsou v `artifacts/audio/`.

Při poslechovém doladění zbývá posoudit hudební návaznost v dlouhém hraní. Provedená automatická kontrola není poslechový mastering ani ověření na fyzickém iPadu/TV.

Vizuálně zkontrolováno: `artifacts/audio/desktop-webgl-{menu,normal,hover,pressed,pointer-out,muted,pause}.png` při 1280 × 720 a stejná sada `tablet-canvas-*` při 1024 × 768. Texty jsou uvnitř panelu, ovládací prvky se nepřekrývají, hover/pressed nemění geometrii. Tlačítko zvuku v pauze je pod dialogem a nezakrývá HUD. Stavy vypnuto/zapnuto mají odpovídající popisky. Podpora vypnutého ovladače se tu nepoužívá; hraniční hodnoty se omezují na 0–100 %.

Stroj: zkontrolovány snímky `desktop-webgl-machine-slot.png`, `desktop-webgl-machine-done.png` a odpovídající `tablet-canvas-*`. Dlouhý pokyn se vejde do autorské šířky 380 px v `machineTitleHost`; mění se skutečná velikost písma, nikoli poměr stran. Krystal, zelený cíl, aktivace a hotový stav odpovídají hlasovým krokům.

## Regrese obchodu po přidání řeči (8. 9. 2026)

Původní audio testy nepokryly vstup do obchodu. Podmínka uvítání četla neexistující `player.equipment.weapon`, a proto oba obchody při otevření padaly. `ShopScene.setupPreparationFlow()` nyní používá `PreparationSystem.hasRequiredEquipment()`, stejně jako tlačítka přípravy. Uložené pozice ani jejich formát se nemění; není potřeba migrace nebo reset.

Nová sada `npm run test:e2e:shop` pokrývá hlavní i silverpondský obchod bez vybavení, s mečem, se štítem a s obojím; podmínku řeči; skutečné klikání a přetahování mincí; chybnou platbu bez ztráty peněz; nákup, výměnu meče bez násobení bonusu, přesné odečtení ceny, opakované kliknutí, uložení a opětovné načtení; přepnutí aktivního hráče v kooperaci. Běží v Chromium při 1280 × 720 se softwarovým WebGL a 1024 × 768 s Canvas. Fixture zachytává neočekávané runtime chyby. Testy používají samostatné prohlížečové kontexty, nikoli uživatelovu pozici.

Výsledek: všech 8 nových scénářů prošlo. První WebGL běh matice vybavení překročil původní 120sekundový limit při závěrečném návratu z města; po zvýšení limitu na 180 sekund prošel celý za 2,4 minuty. Ostatních 7 scénářů prošlo v prvním běhu. Dále prošlo všech 5 scénářů `test:e2e:preparation` (včetně chybných odpovědí, ukládání a spotřeby run v boji a oddělení hráčů), 11 jednotkových testů `PreparationSystem`, `CombatDamageSystem` a `AudioSettings` a `npm run build`. Celkový `tsc --noEmit` stále hlásí existující chyby jinde v projektu a nepoužité členy/parametry v `ShopScene`; chyba vlastnosti `equipment` je odstraněná.

Vizuálně zkontrolovány snímky v `artifacts/shop/`: `desktop-webgl-ShopScene-{empty,equipped,purchased}.png`, `desktop-webgl-SilverpondShopMockScene-{empty,wrong-payment}.png`, `tablet-canvas-ShopScene-equipped.png` a `tablet-canvas-SilverpondShopMockScene-purchased.png`. Obchody se vykreslí, dostupnost přípravy odpovídá výbavě a platební ovládání je viditelné. Ve stávajícím Canvas vykreslení chybí tmavý podklad legendy mincí, takže má slabší kontrast; tato oprava pádu nemění vzhled. Tablet je emulovaný rozměr, nikoli ověření na fyzickém iPadu.

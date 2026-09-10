# Plán ozvučení Little Math Adventure

> Stav 8. 9. 2026: nahrávky schváleny a integrovány. Aktuální soubory, obsazení, spouštěče a ověření: [INTEGRATION.md](INTEGRATION.md). Níže zůstává původní plán a Suno prompty.


Datum: 8. září 2026. Stav: produkční plán a probíhající výroba nahrávek; runtime zatím beze změn.

Aktualizace výroby: efekty a ambienty jsou vygenerované, viz `LISTEN.md` a `ELEVENLABS_STATUS.md`. Uživatel schválil **Willa pro Zyxe a Lily pro Pythii**; pokračující dabing používá stejné `eleven_multilingual_v2`, stability 0,5 a similarity boost 0,75 jako pilot. Aktuální nahrávací texty jsou v `elevenlabs-batch.json`; tabulka níže zachycuje původní návrh. Jezerní víla zatím není obsazená. Hra dosud ozvučení nepoužívá.

Zadání: česká řeč a efekty přes ElevenLabs, hudba ze Suno vytvořená uživatelem. Hra je nyní nekomerční. Existující token RemoteExam je autorizovaný pro ElevenLabs; před generováním zjistit dostupné kredity a oprávnění k TTS a Sound Effects. Nic nepředplácet automaticky.

## 1. Zvukový směr a rozsah

Pohádková výprava pro děti, laskavá magie a objevování. Souboje mají energii, ale nevyvolávají stres. Krystalické zvuky propojují Zyxe, odměny a dílny. Les je teplý a přírodní; Silverpond vzdušný, vodní a perleťový.

- Řeč je nejčitelnější vrstva; hudba jí ustupuje. Efekt potvrzuje akci, ne každý pohyb kurzoru.
- Opakované počítání doprovází krátké zvukové potvrzení. Slovní pochvala jen po milníku, ne po každém příkladu.
- Chyba má jemné neutrální upozornění. Žádné výsměšné tóny, výkřiky bolesti, sirény ani hlasité odpočítávání.
- Vše generovat předem a uložit jako soubory. Ve hře nevolat ElevenLabs ani Suno. Klíče nikdy neposílat do klienta.
- Dabing doplňuje stávající obrázky a text. Úkol musí být srozumitelný i při vypnutém zvuku.
- Pokrýt současnou Mathorii, les a Silverpond včetně podvodních úkolů. Budoucí hory, trpasličí město a finále zatím nenahrávat.

Podklady: `src/main.ts`, současné scény, `src/data/underwater-descent.json`, `public/assets/data/{encounters,forest-puzzles,underwater-puzzles}.json`, `docs/GAME_DESIGN_DOCUMENT.md`. Design dokument obsahuje i budoucí a starší návrhy; konkrétní úkoly a děj ověřovat podle runtime. Například nynější mezihra uvádí tři lodní krystaly a komiks má šest panelů.

## 2. Hudební mapa

Deset témat stačí pro současnou hru. Nemusí se vygenerovat všechna hned. První čtyři k poslechu: M02, M04, M05, M08. Délky jsou cíle pro výsledný sestřih; Suno je nemusí přesně dodržet.

| ID / název souboru | Kam patří | Charakter | Cíl / priorita |
|---|---|---|---|
| M01 `m01_starfall` | MenuScene/MenuNewScene, výběr uložení, postavy, pásma, co-op a párování; tiše také ComicScene | Hlavní téma, laskavý úžas, celesta, harfa, flétna, měkké smyčce; 76 BPM | 90–150 s / druhá várka |
| M02 `m02_mathoria` | TownScene, ShopScene, GuildScene, vstupní tabulka ArenaScene | Bezpečné městečko, lehká loutna, pizzicato, dřevěná flétna; 84 BPM | 90–150 s / první várka |
| M03 `m03_crystal_workshop` | PythiaWorkshopScene, WitchHutScene, CrystalForgeScene, ZyxCrystalMachineScene; podbarvení ManaCollectionScene | Zvídavá magie, harfa, celesta, tlumená marimba; 72 BPM | 90–150 s / druhá várka |
| M04 `m04_forest` | ForestAdventureStartScene, ForestRoomScene, ForestRiddleScene, ForestPuzzleScene, LetterLockPuzzleScene, SpinLockPuzzleScene, případně ForestMapScene | Jemné lesní dobrodružství, flétna, harfa, dřevo; 78 BPM | 120–180 s / první várka |
| M05 `m05_battle` | BattleScene, běžné souboje všech regionů | Hravá odvaha, pizzicato, marimba, lehké bubínky; 104 BPM, bez naléhavosti | 90–150 s / první várka |
| M06 `m06_guardian` | GuardianLairScene při aktivaci střetu; BattleScene u skutečných boss encounterů včetně podvodního bosse | Vznešený přírodní strážce, hlubší dřevo, smyčce, měkké tympány; 96 BPM | 90–150 s / třetí várka |
| M07 `m07_rest` | ForestCampScene a TavernScene | Odpočinek, akustické drnkání a teplé dlouhé tóny, bez rytmického tlaku; 66 BPM | 90–150 s / třetí várka |
| M08 `m08_silverpond` | SilverpondTownMockScene, místní obchod, cech a vstupní aréna | Jezero, harfa, celesta, měkká flétna, lehké zvonky; 76 BPM | 120–180 s / první várka |
| M09 `m09_underwater` | UnderwaterDescentScene, UnderwaterRoomScene a jejich puzzle | Klidná hloubka, měkké skleněné tóny a pomalé plochy; 64 BPM; žádné hlasové sbory | 120–180 s / druhá várka |
| M10 `m10_zyx_hope` | CrashSiteScene, ForestCrystalRewardScene, ZyxRocketInterludeScene, SilverpondFairyRewardScene | Naděje a vděčnost, celesta s harfou a klidnými smyčci; 72 BPM | 90–150 s / třetí várka |

Doplňující pravidla:

- `SilverpondPythiaWorkshopMockScene` a `SilverpondCrystalForgeMockScene`: M03 s vodním ambientem. Ostatní Silverpond interiéry M08. Název Mock neznamená automaticky nepoužívanou scénu; město na tyto interiéry odkazuje.
- `CatacombTrialScene` a `GuildExamMockScene`: M03 velmi tiše, případně pouze ambient. Žádný hudební tlak podle zbývajícího času. Konkrétní zkouškové varianty ověřit při integraci.
- `ManaCollectionScene`: M03; při dvou hráčích stále jediný podkres.
- `GuardianLairScene`: při rituálním puzzle zůstává M04. M06 až pro střet. Boss hudbu určovat z encounter kontextu, nikoli podle vzhledu nepřítele.
- `VictoryScene` i výsledkové overlaye: krátký vítězný efekt, poté hudba návratového prostředí. Samostatná dlouhá vítězná skladba není potřeba.
- Během běžného podvodního boje M05 + velmi tichý vodní ambient. Vlastní vodní bojovou variantu zvážit až po poslechu.
- Technické testovací a asset debug scény bez automatické hudby. Boot/loading tichý do první uživatelské interakce.
- M01 přes menu a výběry nerestartovat. Stejně M04 přes sousední lesní místnosti a M09 přes podvodní místnosti. Při návratu z boje ideálně navázat na průzkumnou skladbu.
- Nejvýše jedna hudební skladba, krátce dvě při přechodu. Crossfade orientačně 1–2 s, u nástupu boje 0,4–0,8 s. Rozhodne poslech.

## 3. Suno: postup pro uživatele

1. Přihlas se na https://suno.com a otevři **Create**.
2. Pokud je dostupný **Custom**, zapni ho a zapni **Instrumental**. Text písně nech prázdný. Do **Styles / Style of Music** vlož jeden celý prompt níže, do **Title** jeho název. Rozložení polí se může lišit podle verze účtu.
3. Pokud máš jen jednoduchý režim, vlož stejný prompt do popisu skladby a zapni Instrumental, je-li dostupné. Prompt sám výslovně žádá instrumentální hudbu.
4. Použij model dostupný na tvém tarifu; plán nevyžaduje placený model, Studio, stems ani pokročilé přepínače.
5. Vytvoř první várku v pořadí M02 → M04 → M05 → M08. Z každého tématu nejprve jeden běh generování; porovnej nabídnuté varianty. Nepotřebujeme hned desítky skladeb.
6. Poslouchej i prostředek a závěr. Vyber přirozenou, nenápadnou variantu, kterou sneseš několik minut při počítání. Vrať se k ní při nízké hlasitosti a zkus nahlas přečíst větu.
7. V knihovně otevři nabídku skladby a zvol stažení audia (**Download**, případně audio/MP3). Free tarif dle nápovědy nabízí MP3; WAV pro tento postup nepotřebujeme.
8. Zachovej původní stažený soubor. Pojmenuj kopii například `m02_mathoria_take-a.mp3`; druhou `...take-b.mp3`. Přidej odkaz na skladbu a použitý prompt. Soubory předej jako přílohy nebo je ulož do `public/assets/audio/incoming/suno/` v projektu; adresář vznikne při importu.
9. Já potom připravím herní sestřih, hlasitost a přechod smyčky. Výraz „loop-friendly“ v promptu nezaručuje bezešvou smyčku. Výsledek nesmí při opakování cvakat, ztichnout ani rytmicky škobrtat.

Oficiální podklady: [Custom workflow](https://help.suno.com/en/articles/3726721), [Simple workflow](https://help.suno.com/en/articles/3726657), [formáty stažení](https://help.suno.com/en/articles/2479873). Návody pro mobil výslovně popisují obdobný webový Custom postup; konkrétní webový účet zde nebyl otevřen.

### Prompty k přímému vložení

Každý prompt je samostatný. Tempo a délka jsou instrukce pro model, nikoli záruka. Nepoužívat jména skladatelů, her nebo existujících melodií. Společné nástroje mají sjednotit styl; shodný motiv napříč nezávislými generacemi nelze slíbit.

**M01 — Starfall / Hlavní téma**
```text
Instrumental background music for a warm storybook fantasy adventure for children. Gentle wonder and a hopeful journey among the stars. Soft celesta, harp, wooden flute and warm chamber strings. 76 BPM, simple memorable motif with spacious quiet passages. Small acoustic ensemble with a subtle magical shimmer. Restrained dynamics, unobtrusive under spoken dialogue, loop-friendly repeating middle section. No vocals, choir, humming, speech, sound effects, dramatic drops or loud finale.
```

**M02 — Mathoria / Bezpečné městečko**
```text
Instrumental background music for a cozy storybook fantasy village in a children's adventure game. Warm, welcoming and quietly playful. Soft lute, pizzicato strings, wooden flute and a few delicate celesta notes. 84 BPM, gentle steady pulse, sparse arrangement, simple melody with room to think. Comfortable for repeated listening while solving puzzles. Restrained dynamics and loop-friendly repeating middle section. No vocals, choir, humming, speech, sound effects, big build-ups or loud ending.
```

**M03 — Crystal Workshop / Kouzelná dílna**
```text
Instrumental background music for a friendly crystal witch's workshop in a children's fantasy game. Curious, safe and gently magical. Harp, soft celesta, muted marimba and warm sustained strings. 72 BPM, delicate widely spaced notes, very light pulse, a calm repeating pattern suitable for concentrating on numbers. Intimate small ensemble, restrained dynamics, loop-friendly middle section. No vocals, choir, humming, speech, sound effects, busy solos, tension or dramatic finale.
```

**M04 — Verdant Forest / Lesní výprava**
```text
Instrumental exploration music for an enchanted green forest in a warm children's storybook adventure. Gentle curiosity, dappled sunlight and a sense of discovery. Wooden flute, harp, pizzicato strings, soft marimba and subtle warm pads. 78 BPM, sparse repeating phrases and long breathing spaces, calm enough for puzzle solving. Small ensemble, soft dynamics, loop-friendly steady middle section. No vocals, choir, humming, birds, water sounds, speech, horror, sudden percussion or loud ending.
```

**M05 — Little Heroes / Běžný souboj**
```text
Instrumental battle background for a friendly children's fantasy math game. Playful courage and teamwork, energetic but never urgent or frightening. Pizzicato strings, marimba, wooden flute, light hand drums and warm short string phrases. Steady 104 BPM, clear simple rhythm, sparse melody, moderate soft dynamics. Comfortable during thinking and repeated turns, loop-friendly stable middle section. No vocals, choir, humming, speech, sound effects, ticking clocks, aggressive brass, epic trailer drums, tempo acceleration or explosive ending.
```

**M06 — The Guardian / Strážce**
```text
Instrumental guardian battle music for a children's storybook fantasy adventure. A majestic ancient being, wonder and brave determination rather than fear. Warm low strings, wooden flute, resonant marimba, gentle rounded timpani and delicate celesta. Steady 96 BPM, simple repeating harmonic pattern, controlled intensity and generous space for thinking. Loop-friendly middle section without escalating tension. No vocals, choir, humming, speech, sound effects, horror drones, aggressive brass, alarm sounds or huge finale.
```

**M07 — Fireside / Odpočinek**
```text
Instrumental rest music for a safe campsite and cozy inn in a children's fantasy adventure. Warmth, relief and a quiet evening with friends. Soft plucked acoustic strings, harp and very gentle sustained strings. 66 BPM with a loose almost beatless feel, sparse notes and long rests. Intimate, peaceful and comforting, soft consistent dynamics, loop-friendly middle section. No vocals, choir, humming, speech, fire sounds, nature recordings, melancholy solo, strong drums or dramatic ending.
```

**M08 — Silverpond / Stříbrné jezero**
```text
Instrumental background music for a luminous lakeside fantasy town in a children's adventure. Pearlescent light, gentle water and joyful discovery. Harp, celesta, soft wooden flute, delicate rounded bells and airy warm strings. 76 BPM, graceful sparse melody, calm steady dynamics, spacious acoustic texture with a subtle magical shimmer. Loop-friendly repeating middle section, comfortable under dialogue. No vocals, choir, humming, speech, actual water sounds, sharp high notes, heavy drums or loud finale.
```

**M09 — Beneath Silverpond / Pod hladinou**
```text
Instrumental underwater exploration background for a friendly children's fantasy puzzle game. Calm blue depths, floating light and gentle curiosity, never ominous. Soft glass-like mallets, sparse harp, warm slow pads and rounded low strings. 64 BPM, almost beatless, slow repeating harmony and lots of silence between notes. Quiet even dynamics, clear space for puzzle sound cues, loop-friendly sustained middle section. No vocals, choir, humming, speech, bubbles, sonar, horror drones, strong bass, sudden changes or big ending.
```

**M10 — Zyx's Hope / Návrat naděje**
```text
Instrumental story background for a kind little alien thanking a child for helping repair his spaceship. Tender hope, gratitude and gentle magical wonder. Soft celesta, harp, wooden flute and warm chamber strings, 72 BPM. Short simple melodic phrases with long quiet spaces for spoken dialogue. Understated emotion, small ensemble, stable soft dynamics and a loop-friendly middle section. No vocals, choir, humming, speech, sound effects, sad piano solo, cinematic crescendo or grand finale.
```

Když výsledek nefunguje: příliš výrazná melodie → přidat `minimal melody, sparse accompaniment`; příliš epické → `intimate small ensemble, no crescendo`; zpěv → ověřit Instrumental a vybrat jinou variantu; neklidný souboj → snížit BPM přibližně na 92. Jednou upravit prompt, potom znovu porovnat. U nevhodného konce často stačí vystřihnout klidnou střední pasáž.

## 4. Efekty pro ElevenLabs

P0 = první hratelná sada; P1 = rozšíření do celého současného obsahu; P2 = jemné detaily. Jeden řádek je rodina zvuku, nikoli povinnost mnoha generací. Krátké kliky mají cílovou délku pod 0,5 s, ale API má minimální zadanou délku 0,5 s: generovat krátký impuls v 0,5–1 s a následně oříznout ticho.

Všechny následující anglické prompty použít samostatně. Požadují izolované efekty bez řeči a hudby. U ambientů záměrně ponechat prostředí; u ostatních čistý podklad. Délky jsou cíle, které se zkontrolují po generování.

| ID | Spouštěč / použití | Délka; varianty | Priorita | Prompt |
|---|---|---|---|---|
| ui.confirm | Potvrzený klik/tap, výběr odpovědi před výsledkem | 0,08–0,18 s; 2 | P0 | One soft tactile wooden button click with a tiny rounded glass tick. Dry isolated one-shot, immediate onset, no voice, music or ambience. |
| ui.back | Zavření panelu, návrat | 0,15–0,3 s; 1 | P1 | A short gentle downward airy swish for closing a storybook panel. Dry isolated one-shot, no voice, music or ambience. |
| ui.page | Stránka komiksu či dialogu | 0,2–0,4 s; 2 | P1 | One soft parchment page turn, intimate light paper texture, quick clean finish. Isolated, no voice, music or ambience. |
| ui.unavailable | Skutečný pokus o nedostupnou akci | 0,2–0,4 s; 1 | P1 | A soft rounded wooden double tap, neutral unavailable action cue, gentle not punitive. Isolated, no buzzer, voice, music or ambience. |
| math.correct | První správné vyhodnocení odpovědi | 0,3–0,6 s; 2 | P0 | A tiny warm upward two-note glass chime for a correct answer in a children's game. Soft rounded attack, short tail, isolated, no voice or background music. |
| math.retry | Chybná odpověď | 0,25–0,45 s; 1 | P0 | One soft muted wooden plop, a kind neutral try-again cue. No sad melody, harsh buzzer or ridicule. Dry isolated one-shot, no voice or music. |
| reward.coins | Připsání mincí jako jedné dávky | 0,4–0,8 s; 2 | P0 | A small handful of light fantasy coins gently clinking into a pouch. One short cluster, soft bright detail. Isolated, no voice, music or ambience. |
| reward.crystal | Převzetí běžného krystalu | 0,6–1 s; 2 | P0 | A small magical crystal acquired, delicate glass ping followed by a short sparkling shimmer. Warm rounded highs. Isolated, no voice or background music. |
| reward.victory | Dokončený boj nebo vlna | 1,5–2,5 s; 1 | P0 | A brief three-note fantasy victory chime, warm celesta and soft sparkling finish, modest friendly celebration. Isolated stinger, no voice, drums or background track. |
| reward.milestone | První významná odměna, nový region, lodní krystal | 2–3 s; 1 | P1 | A short luminous crystal achievement flourish, rising warm glass tones opening into a gentle shimmer. Wholesome and restrained. Isolated, no voice or background track. |
| reward.rest | Dokončený odpočinek/léčení | 0,8–1,5 s; 1 | P1 | A soft warm restorative magical sigh of air with tiny mellow sparkles. Comforting, not a human breath. Isolated, no voice or music. |
| combat.swing | Začátek skutečného výpadu | 0,2–0,4 s; 3 | P0 | One light cartoon sword swoosh through air, quick soft attack and clean finish. Friendly fantasy, no impact, voice, gore or background music. |
| combat.hit | Dopad útoku, který skutečně udělí damage | 0,2–0,5 s; 3 | P0 | One rounded padded fantasy impact with a little wooden thump. Non-graphic children's game contact. Isolated, no cries, metallic ringing or music. |
| combat.block | Zablokovaná část zásahu | 0,3–0,6 s; 2 | P0 | One small shield deflection, soft rounded metal clink and light magical glint. Not a loud clang. Isolated, no voice or music. |
| combat.spell | Vypuštění kouzla hráče/peta | 0,5–0,9 s; 2 | P0 | One compact friendly magic bolt launch, soft airy whoosh with a crystalline sparkle, quick clean finish. No impact, voice or background music. |
| combat.release | Osvobození poraženého tvora | 0,7–1,2 s; 2 | P0 | A small cloud of magical confusion dissolves into warm sparkling air, gentle release and relief. Isolated, no scream, voice or background music. |
| combat.phase | Přechod boss fáze | 0,8–1,5 s; 1 | P1 | A restrained ancient magical pulse, soft wooden resonance and low airy swell, majestic not frightening. One-shot, no alarm, voice or music. |
| combat.retreat | Prohra a návrat do bezpečí | 0,6–1 s; 1 | P1 | A gentle settling magical exhale, neutral soft ending with a small warm tone. No sad trombone, failure buzzer, human voice or background music. |
| prep.charge | Uložení přípravy meče/štítu | 0,5–1 s; 1 | P1 | A small rune charging with a warm glass pulse and soft shimmer. Isolated one-shot, no electricity crack, voice or music. |
| prep.consume | Skutečné využití runy | 0,2–0,4 s; 1 | P1 | One tiny rune sparkle popping softly, compact airy glass tick. Dry isolated one-shot, no voice or music. |
| item.equip | Skutečné vybavení předmětu | 0,2–0,5 s; 2 | P1 | One soft leather strap fastening with a small buckle click. Clean close-up fantasy equipment foley, no voice, music or ambience. |
| item.potion | Vypití lektvaru | 0,5–0,9 s; 1 | P1 | One small cork pop followed by a tiny liquid gulp from a potion bottle, no human vocalization. Isolated, no music or ambience. |
| chest.open | Otevření odemčené truhly | 0,7–1,2 s; 2 | P0 | One little wooden treasure chest lid opening, soft hinge creak and gentle latch click. No coins or magical chime, isolated, no voice or music. |
| lock.turn | Jedna změna písmena nebo kolečka | 0,1–0,25 s; 2 | P1 | One small antique combination lock wheel detent, delicate rounded mechanical click. Dry isolated, no voice, music or ambience. |
| lock.open | Správně otevřený zámek | 0,3–0,7 s; 1 | P1 | A small antique lock mechanism releasing with a satisfying gentle double click. Isolated, no magical flourish, voice or music. |
| puzzle.place | Položení kamene/krystalu do slotu | 0,15–0,35 s; 2 | P0 | One smooth little stone placed gently in a stone socket, soft tactile clack. Dry isolated, no voice, music or ambience. |
| puzzle.solved | Dokončené puzzle, jednou | 0,8–1,3 s; 1 | P0 | A compact friendly puzzle-complete sound, soft mechanical click opening into a warm glass shimmer. Isolated, no voice or background music. |
| puzzle.stone_move | Rozjezd kamenného mostu či brány | 0,8–1,5 s; 1 | P1 | A small ancient stone mechanism sliding into place, gentle low stone friction and soft final contact. No huge rumble, voice or music. |
| forge.merge | Úspěšné spojení krystalů | 0,8–1,5 s; 1 | P1 | Two delicate crystal resonances gently converge into one warm clear magical tone, short sparkling tail. Isolated, no voice or background music. |
| forge.split | Úspěšné rozdělení | 0,8–1,5 s; 1 | P1 | One warm crystal resonance separates into two delicate glass sparkles, magical and gentle, no shattering. Isolated, no voice or background music. |
| pet.bind | Dokončené ochočení | 1,5–2,5 s; 1 | P1 | A gentle magical bond forming, warm airy swirl and soft crystal pendant chime, affectionate and bright. Isolated, no animal cries, voice or background music. |
| mana.collect | Připsaná dávka many | 0,3–0,6 s; 2 | P1 | One soft blue energy droplet collected with a rounded liquid-glass plink. Compact isolated one-shot, no voice or music. |
| story.ship_fault | Porucha lodi v komiksu | 0,7–1,2 s; 1 | P1 | A tiny whimsical spaceship engine sputtering briefly, soft mechanical wobble and two little sparks. Child friendly, no alarms, explosion, voice or music. |
| story.ship_landing | Přistání/náraz v komiksu | 0,8–1,5 s; 1 | P1 | A small cartoon spaceship landing with a padded earth thump and a short dust whoosh. Soft, not explosive. Isolated, no screams, voice or music. |
| machine.activate | Aktivace Zyxova stroje | 1,5–2,5 s; 1 | P1 | A friendly crystal-powered machine starting, smooth rising mechanical hum ending in a warm soft energy pulse. Isolated, no alarm, voice or music. |
| water.splash | Vstup do vody | 0,5–1 s; 2 | P1 | One gentle small splash entering calm water with a few bubbles, close and soft. Isolated, no voice, music or other ambience. |
| water.bubbles | Krátká akce/pohyb pod vodou | 0,4–0,8 s; 2 | P1 | One small cluster of rounded underwater bubbles rising softly. Clean isolated one-shot, no voice, music or continuous ambience. |
| water.valve | Přepnutí ventilu v puzzle | 0,3–0,7 s; 2 | P1 | One little brass valve turning with a soft mechanical click and tiny water movement. Isolated, no voice, music or ambience. |
| water.pump | Potvrzený pohyb pumpy | 0,4–0,8 s; 2 | P1 | One short gentle hand pump stroke moving water, soft piston movement and rounded liquid glug. Isolated, no voice or music. |
| water.bell | Herní zvon/získaná nota | 1–2 s; 1 základ | P1 | One single mellow underwater bronze bell strike, rounded clear pitch and short soft resonance, no repeated ringing, no voice, music or ambience. |
| step.grass | Kroky při skutečné chůzi po trávě | 0,15–0,3 s; 3 | P2 | One light boot footstep on short grass and soft earth. Close dry foley, no walking sequence, voice, music or ambience. |
| step.stone | Kroky v městě/interiéru | 0,15–0,3 s; 3 | P2 | One light boot footstep on smooth stone, soft contact without echo. Close dry foley, no walking sequence, voice or music. |
| creature.slime | Slizový tvor, občasná akce | 0,3–0,6 s; 2 | P2 | One cute little slime wobble, soft rubbery squish and tiny bubble pop. No speech, gross wet detail or music. |
| creature.forest | Přírodní tvor, pohyb/akce | 0,3–0,7 s; 2 | P2 | One small magical forest creature rustling leaves with a soft woody creak. Friendly isolated sound, no growl, speech or music. |
| creature.fox | Runová liška, odměna/akce | 0,3–0,6 s; 2 | P2 | One tiny friendly fox-like chirrup, soft curious animal sound, not human. Isolated, no bark, scream, speech or music. |

Ambienty jsou oddělené od hudby: generovat 15–30 s s loopingem a potom poslechem zkontrolovat spoj. Přes sousední místnosti mohou zůstat běžet.

| ID | Kde | Priorita | Prompt |
|---|---|---|---|
| amb.forest | Les a místo havárie | P1 | Quiet gentle forest air, soft leaves and sparse distant small birds. Even unobtrusive texture for a children's game, seamless ambience loop, no close calls, voices or music. |
| amb.fire | Tábor a hostinec | P1 | Very soft small campfire crackle, warm even texture with no loud pops. Seamless quiet ambience loop, no voices, footsteps or music. |
| amb.workshop | Dílny | P2 | A quiet friendly magical workshop, soft airy hum with very sparse tiny glass resonances. Even seamless ambience loop, no melody, voices or mechanical alarms. |
| amb.lake | Silverpond na povrchu | P1 | Gentle lake water lapping softly against a wooden shore, distant light breeze. Even seamless quiet ambience loop, no voices, birds calling nearby or music. |
| amb.underwater | Podvodní místnosti | P1 | Calm soft underwater ambience with sparse delicate bubbles and a smooth filtered water texture. Even seamless loop, no breathing, sonar, heartbeat, voices, music or ominous bass. |

### Výroba a úspora kreditů

Nejprve pilot: `ui.confirm`, `math.correct`, `math.retry`, `combat.hit`, `reward.crystal`, `amb.forest`. U krátkých zvuků začít jednou variantou; další až po schválení zvukového směru. Potom dokončit P0, dále P1 po jednotlivých regionech. P2 až po ověření, že detaily hru nezahltí.

Použít `eleven_text_to_sound_v2`, izolované generace, `loop: false` pro efekty a `true` pro ambient. Výchozí prompt influence 0,3; měnit podle výsledku. Aktuální API přijímá délku 0,5–30 s. Dostupný výstupní formát závisí na tarifu. Náklady zaznamenávat z odpovědí a reálného kreditu účtu; bez ověření rozpočtu negenerovat celý seznam opakovaně.

U zvonu nejprve schválit jeden neutrální základ, případné požadované výšky odvodit z něj a ověřit sluchem. Hudební efekt nesmí napovídat správnou odpověď; pokud zvon nese herní informaci, zobrazit i jednoznačnou vizuální informaci. Nespoléhat na absolutní sluch dítěte.

Oficiální zdroje: [SFX API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [práce s efekty a variantami](https://elevenlabs.io/docs/eleven-creative/playground/sound-effects).

## 5. Dabing: hlasy, scény a texty

Tři role, žádný dabing každé postavy ani automatické čtení všech čísel:

- **Zyx:** laskavý, zvídavý, lehce komický dospělý hlas, přirozená čeština, bez robotického filtru. Vede příběh a úvodní instrukce.
- **Pythia:** klidný hřejivý hlas, jasná čeština, bez přehnaného šepotu. Dílny, krystaly, mazlíčci a odpočinek.
- **Jezerní víla:** lehký, jasný, klidný hlas; podobnost s Pythií je pro začátek přijatelná. Její identitu může odlišit přednes; silný reverb by zhoršil srozumitelnost.

Použít nejprve existující hlasy ElevenLabs, které jsou dostupné pro daný klíč. George z RemoteExam je kandidát, nikoli automaticky finální Zyx. Model porovnat na stejné české ukázce: Eleven v3 a dostupný multilingual model. Nekopírovat bez ověření conversational konfiguraci pro zkoušení; zde vyrábíme hotové soubory. Přesné voice ID, model a nastavení zafixovat po poslechu pilotu.

Pilotní text pro Zyxe: „Ahoj! Já jsem Zyx. Moje loď potřebuje pomoc. Vyřeš příklad a pomoz tvorovi najít klid.“ Pilot pro Pythii: „Vítej v mé dílně. Každý krystal má své číslo. Společně najdeme to správné.“ Kontrolovat výslovnost Zyx, Pythia, Mathoria a Silverpond; pracovně „Ziks“, „Pýtia“, „Matoria“, „Silvrpond“, definitivně rozhodnout podle poslechu. Zápis jmen v titulcích se nemění.

### Nahrávací seznam

„Návrh“ znamená nový doporučený text, nikoli citaci již zobrazovaného dialogu. „Existující“ zachovává současné znění s normalizací číslic a řádkových zlomů pro řeč. Instrukce mají odkazovat na to, co dítě právě vidí, ne na náhodně pevná čísla nebo odpovědi.

| ID | Scéna / spouštěč | Hlas | Text / obsah | Stav |
|---|---|---|---|---|
| vo.crash.hello | CrashSiteScene, první obrázkový dialog | Zyx | Ahoj! Já jsem Zyx. Moje loď se rozbila. Vyřeš příklad a pomoz tomu tvorovi najít klid. | Návrh |
| vo.crash.arena | CrashSiteScene, druhý dialog po výhře | Zyx | Už je mu lépe! Pojď za mnou do arény. | Návrh |
| vo.battle.intro | První souboj, před spuštěním časovaných akcí | Zyx | Podívej se na příklad a vyber správnou odpověď. | Návrh |
| vo.arena.intro | ArenaScene, první návštěva | Zyx | V aréně tě čeká pět vln. Začneme tou, kterou ještě nemáš hotovou. | Návrh |
| vo.shop.prep | ShopScene, první otevření přípravy | Zyx | Vyber meč nebo štít a připrav si ho pomocí příkladů. | Návrh; jen ve stavu s potřebným vybavením |
| vo.shop.sword | Dokončená příprava meče | Zyx | Meč je připravený. Runy ti pomohou při útoku. | Návrh |
| vo.shop.shield | Dokončená příprava štítu | Zyx | Štít je připravený. Runy ti pomohou zachytit zásah. | Návrh |
| vo.pythia.welcome | Dílna Pythie / WitchHut, první návštěva | Pythia | Vítej v mé dílně. Krystaly nám pomohou získat nové přátele. | Návrh |
| vo.pythia.bind | První otevření skutečného bind úkolu | Pythia | Najdi amulet s číslem, které potřebuje tvůj nový přítel. | Návrh; potvrdit podle současného úkolu |
| vo.pythia.friend | První úspěšné ochočení | Pythia | Teď už máš nového kamaráda na cestu. | Návrh |
| vo.forge.merge | První spuštění spojování | Pythia | Spoj krystaly. Jejich čísla sečti. | Návrh |
| vo.forge.split | První spuštění rozdělování | Pythia | Rozděl krystal a zjisti, kolik zbývá. | Návrh |
| vo.forest.enter | ForestAdventureStartScene, první úspěšný vstup | Zyx | Cesta vede do lesa. Podívej se, co cestou objevíš. | Návrh |
| vo.bridge.intro | ForestRiddleScene, poprvé nevyřešený most | Zyx | Doplň chybějící čísla v řadě. Přesuň kameny na správná místa. | Návrh; nečíst řešení |
| vo.forest.balance | ForestPuzzleScene, varianta vah | Zyx | Vyrovnej obě strany vah. | Návrh |
| vo.forest.path | ForestPuzzleScene, výběr cesty | Zyx | Vyber cestu, na které je příklad správně. | Návrh |
| vo.forest.offering | ForestPuzzleScene / rituál se součtem | Zyx | Vyber krystaly, jejichž součet odpovídá cíli. | Návrh |
| vo.lock.intro | LetterLockPuzzleScene / SpinLockPuzzleScene | Zyx | Použij nápovědu a nastav správná písmena. | Návrh; před nahráním porovnat oba režimy |
| vo.camp.rest | ForestCampScene, poprvé dokončený odpočinek | Pythia | Teď si chvilku odpočiň. Cesta na tebe počká. | Návrh |
| vo.forest.crystal | ForestCrystalRewardScene, zobrazený nový cíl | Zyx | Vrať Krystal lesa Zyxovi. | Existující text cíle; raději neutrální přednes než předstíraný dialog na dálku |
| vo.rocket.1 | ZyxRocketInterludeScene, strana 1 | Zyx | Můj krystal! Spadl z lodi. | Existující |
| vo.rocket.2 | Stejná scéna, strana 2 | Zyx | Loď potřebuje tři krystaly. Máme první! | Existující |
| vo.rocket.3 | Stejná scéna, strana 3 | Zyx | Pojď ke stroji. Vložíme krystal. | Existující |
| vo.machine.numbers | ZyxCrystalMachineScene, úloha | Zyx | Vyber tři čísla. Jejich součet musí odpovídat cíli. | Návrh rozšiřující současné zadání |
| vo.machine.crystal | Stav po správném součtu | Zyx | Klikni na krystal. | Existující |
| vo.machine.slot | Po výběru krystalu | Zyx | Klikni na zelený slot. | Existující; případnou úpravu slova slot sjednotit i v textu |
| vo.machine.activate | Krystal vložen | Zyx | Aktivuj stroj. | Existující |
| vo.machine.done | Úspěšná aktivace | Zyx | Jeden ze tří hotovo! | Existující |
| vo.silverpond.enter | První příchod do Silverpond | Zyx | Další dobrodružství čeká pod hladinou. | Návrh |
| vo.descent.intro | UnderwaterDescentScene, před spuštěním sestupu | Zyx | Vyhýbej se překážkám a doplav dolů. | Návrh; přizpůsobit skutečnému ovládání |
| vo.water.reverse | První otevření obráceného výpočtu | Zyx | Postupuj zpátky a zjisti, které číslo bylo na začátku. | Návrh |
| vo.water.routing | První otevření směrování | Zyx | Sleduj změny po cestě a vyber správný cíl. | Návrh |
| vo.water.pump | První otevření pumpy | Zyx | Podívej se na čísla u pumpy a splň její úkol. | Pracovní text; zpřesnit podle konkrétního panelu před generováním |
| vo.water.current | První otevření proudového plánu | Zyx | Projdi plán po jednotlivých krocích. | Návrh |
| vo.water.bell | První otevření zvonového úkolu | Zyx | Prohlédni si plán a doplň chybějící kroky. | Pracovní text; ověřit přesnou akci před generováním |
| vo.fairy.thanks | SilverpondFairyRewardScene, viditelný dialog | Víla | Děkuji. Jezero si znovu vzpomnělo na svůj hlas. Přijmi jednu šupinu z mé koruny. | Existující |
| vo.common.retry | Na vyžádanou pomoc / po sérii neúspěchů, mimo časování | Zyx | Zkus to ještě jednou. | Návrh |
| vo.common.complete | První dokončená aktivita | Zyx | Povedlo se! | Návrh |

U řádku s odměnou lesa je alternativa srozumitelnější nový dialog „To je Krystal lesa! Přines ho ke mně.“ Pokud jej zvolíme, označit jako nový text a sladit scénu; nemíchat jej potichu s existující citací cíle.

Další úkoly (`ManaCollectionScene`, cechovní zkoušky, `CatacombTrialScene`) mají dostat krátké jednorázové vysvětlení, ale text napsat po průchodu jejich konkrétním ovládáním. Zejména neříkat „klikej“ tam, kde hráč na TV používá ovladač. Tyto repliky nejsou v první nahrávací várce.

### Kde mluvení omezit

- **ComicScene:** první verze zůstane beze slov, s M01 a dvěma synchronizovanými efekty. Obrázkový příběh je záměrný; úvod potom vysvětlí Zyx. Pokud později přidáme vypravěče, nejprve projít skutečné obrázky: komentáře o obsahu panelů nejsou plně shodné. Nynější auto-advance je 3 s, delší řeč by se uřízla.
- **Menu, uložení, volba postavy/pásma, obchodní seznamy:** nečíst automaticky každou položku. Případné čtení ovládacích prvků je samostatná volitelná přístupnost.
- **BattleScene:** žádné náhodné hlášky během řešení nebo nepřátelského tahu; výsledek řeší SFX. Úvod přehrát před časovaným úsekem, nepřidat dítěti časový handicap.
- **Les/podvodní místnosti:** žádné opakované „vítej“ při každém vstupu. Úkol vysvětlit poprvé, další přehrání na vyžádání. Zvuk nesmí automaticky prozradit placenou nápovědu nebo správné řešení.
- **Čtení příkladů:** samostatná pozdější funkce. Musí rozlišovat chybějící operand, porovnání a pravda/nepravda; nesmí přečíst skrytou odpověď. Neslepovat jednotlivá slova bez kontroly přirozenosti. První verze vystačí s obecnými instrukcemi.
- **Co-op / TV:** mluví jediný hlas na herní obrazovce. Telefony nepřehrávají kopie. Instrukce musí odpovídat aktivnímu hráči.

## 6. Integrace a provozní pravidla

Návrh souborů, které vzniknou až při implementaci:

```text
docs/audio/AUDIO_PLAN_CS.md                 tento plán
public/assets/audio/incoming/suno/          uživatelské originály k importu
public/assets/audio/music/                  schválené herní smyčky
public/assets/audio/sfx/                    krátké schválené efekty
public/assets/audio/ambience/               prostředí
public/assets/audio/voice/cs/               české repliky
public/assets/data/audio.json               ID, soubory, kategorie, hlasitost, varianty, loop
src/systems/AudioDirector.ts                životní cyklus přehrávání v Phaseru
scripts/audio/                             generování a zpracování mimo prohlížeč
docs/audio/asset-register.json              původ, prompt, model, tarif, datum, stav poslechu
```

Velké pracovní WAV a zamítnuté take nebalit do buildu. Před registrací v repozitáři zkontrolovat jeho pravidla pro binární soubory. Formáty pro finální přehrávání zvolit po browser testu; MP3 originál nepřevádět opakovaně ztrátově. U smyček ověřit skutečné dekódování a encoder padding; případně jednou připravit další podporovaný formát.

Runtime požadavky:

1. Samostatná hlasitost a vypnutí hudby, řeči a efektů; ambient pod efekty. Zachovat kompatibilitu existujících `soundEnabled` a `musicEnabled`; přidání nastavení řeči musí mít bezpečný default pro starší save.
2. Hudba podle kontextu regionu/aktivity, ne podle jednotlivé místnosti. Manifest uchovává sdílené assety; scénové volby mohou být v datech. Pokud přibude viditelné nastavení nebo tlačítko opakování řeči, host a pozice/depth musí být v `scenes.json` přes SceneBuilder. Před jeho návrhem přečíst `docs/ASSET_CREATION.md`.
3. První přehrávání po skutečné uživatelské interakci kvůli prohlížečovému audio unlock. Na TV ověřit lokální odemčení na hostitelské obrazovce; samotná vzdálená zpráva telefonu nemusí stačit.
4. Při řeči stáhnout hudbu orientačně o 8–12 dB, ambient o 4–8 dB; návrat plynule přibližně 0,5–1 s po konci. Jsou to startovní hodnoty pro poslech, ne hotový mix.
5. Jeden aktivní voiceover. Změna stránky zastaví předchozí repliku; odchod ze scény zruší i naplánované hlášky. Nepouštět opožděnou řeč po načtení souboru do již jiné scény.
6. Krátké potvrzení/efekt spouštět jednou ze skutečného výsledku akce. Události myši, dotyku a gamepadu nesmí vytvářet duplicity. Žádný zvuk na každý animation update.
7. Nechat doznít důležitou odměnu; nekombinovat současně `puzzle.solved`, `reward.victory`, `reward.milestone` a hlasitou pochvalu. Na jednu událost jeden dominantní zvuk. Mince/padající částice agregovat.
8. Příprava meče a štítu zazní při skutečném užitečném spotřebování runy, ne při každém útoku. Blok a zásah mohou nastat částečně současně; vyvážit hlasitost a použít skutečný výsledek CombatDamageSystem.
9. Omezit souběh krátkých efektů, například začít limitem 6–8 hlasů; vysokou prioritu má instrukce a odezva na hráčovu akci. UI debounce orientačně 80–120 ms, opakované ambientní detaily výrazně řidčeji. Doladit podle ovládání.
10. Na skryté kartě nebo pauze zvuk pozastavit/ztišit a obnovit bez duplikovaných smyček. Chybějící soubor či nedostupný zvuk nesmí blokovat hru.
11. Načítat společné efekty a aktuální kapitolu, nikoli celý dabing všech regionů při startu. Uchovávat přehled, zda byla jednorázová instrukce přehrána, odděleně od postupu řešení puzzle.

## 7. Pořadí práce a hotovost

**Krok A — Poslechový pilot:** já připravím dva kandidáty Zyxe, jeden Pythie a šest pilotních rodin efektů; uživatel v Suno M02/M04/M05/M08. Ověřit nejdříve kredit a dostupnost služeb; generovat malou dávku. Vybrat jeden hlas Zyxe a jednotný charakter magie. Výsledkem je poslechový balíček, ne nasazení všech zvuků.

**Krok B — První hratelný úsek:** menu/město → CrashSite → první boj → aréna. Zapojit správně/chyba, útok/zásah/blok, osvobození, mince/krystal/vítězství, dvě repliky havárie a úvod souboje. M01/M10 lze dočasně pokrýt schváleným M02 na nižší hlasitosti. Nepotřebujeme čekat na všech deset témat.

**Krok C — Les a dílny:** puzzle, zámky, odpočinek, kouzla, příprava vybavení, pet; lesní krystal a všechny stránky Zyxovy mezihry/stroje. Uživatel doplní M03/M07/M10 a boss M06.

**Krok D — Silverpond:** podvodní ambient, ventily, pumpa, zvon, sestup, víla; doplnit M09, ověřit puzzle instrukce podle aktuálních panelů. M08 už máme z první várky.

**Krok E — Jemné detaily:** kroky, tvorové, lokální ambienty, případná regionální bojová varianta. Přidávat jen to, co zlepšuje čitelnost a atmosféru.

Kontrola dokončení každé dávky:

- Poslechnout jednotlivé nahrávky: česká výslovnost, čistý začátek/konec, žádná řeč v SFX, žádné vokály v hudbě, žádný clipping či nepříjemné výšky.
- Smyčku poslechnout alespoň přes tři spoje; přechod mezi scénami nesmí hudbu znovu spouštět ani vytvářet dvojité přehrávání.
- Zkusit hudbu, řeč a časté efekty současně na notebooku, sluchátkách a tablet/TV reproduktorech. Delší chvíli skutečně počítat.
- Ověřit správnou i chybnou odpověď, částečný/plný blok, prohru, odměnu, rychlé přeskakování dialogu, návrat z boje, opakovaný vstup, mute, skrytou kartu a chybějící asset.
- Ověřit solo, co-op a TV: žádné dvojité efekty ani časovač běžící pod povinnou instrukcí.
- Před testováním implementace zkontrolovat potřebu migrací. Tento dokument žádné migrace nezavádí; nastavení v uložených hrách bude vyžadovat kompatibilní doplnění hodnot, pokud je implementace rozšíří.
- Funkční testy nemohou schválit poslech. U každého assetu evidovat stav „vygenerováno / poslechnuto / schváleno / zapojeno“ a konkrétní zbývající nedostatky. Nové viditelné ovládání navíc projít vizuálně podle projektových pravidel.

Předání hudby od uživatele: pro každé téma MP3, název Mxx, odkaz Suno, použitý prompt a označení preferované varianty. Stříhání, loop a hlasitost jsou součást následné integrace, nemusí je řešit uživatel.

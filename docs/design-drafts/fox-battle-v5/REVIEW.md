# Kontrola návrhu V5

**Poslední upřesnění autora, 19. 11.: pohyby 01 a 04 jsou schválené;
02, 03 a 05 se přepracují.** `approvedMotionForms` proto povoluje jen 01 a 04.
Toto nahrazuje předchozí plošné odmítnutí. Starší testy přehrávače ani snímek
`second-form-cast.png` nejsou schválením pohybu druhé podoby. V ukázce je nyní
statická, stejně jako 03 a 05. Světlo a funkční UI efekty se zachovávají.

Datum: 19. 11. 2026. Kontrola přes Playwright MCP, potom skutečné prohlédnutí
snímků. Prototyp ani kontrola nezávisí na databázi nebo neprovedené migraci.
Výrobní hra a profily nebyly upraveny.

## Ověřené chování

- Běžný útok dokončí tři příklady a jednou přičte výsledné poškození.
- Skutečná deska přijímá první odpověď jednou i po použití liščích schopností.
- Hráč B se léčí během příkladu hráče A. Hráč A ani jeho příklad se nezmění.
- Trojice použití je vedena zvlášť pro oba hráče. Dvojí dotyk nespustí účinek dvakrát.
- Ukázka schopnosti nic nespotřebuje a nepřidá poškození.
- Hodnota aktivního času se při ukázce, cílení a efektu nemění.
- Zrušení cílení vrací totožný nenulový snapshot příkladu a zachová použití.
- Zásah trefí vybraného živého protivníka a vrátí totožný příklad.
- Zamčená schopnost, plné zdraví a mrtvý cíl použití nespotřebují.
- Obrana blokuje všechny schopnosti a přepínání jejich vlastníka po celou fázi.
- Chybná obrana proti 8 s aktivním štítem 5 ubere 3 HP, štít klesne na nulu.
- Poslední protivník ukončí boj jednou. Reset během efektu odstraní starý účinek.
- Útočný zásah mění zdraví při dopadu; léčení při aplikaci místního efektu.
- Hover/stisk nemění hranice ovládacího prvku. Uvolnění mimo něj neaktivuje schopnost.
- Reduced motion zachová účinek a zastaví pohyb těla.
- Canvas varianta skutečně používá renderer 1, zobrazuje desku a přijímá odpověď.
  Běžná varianta byla ověřena s WebGL rendererem 2.
- Na začátku se načtou jen atlasy první podoby. Po poslední autorově korekci
  se přehrávají pouze 01 a 04; 02, 03 a 05 používají nové neutrální statické
  předlohy. Přepnutí všech pěti podob bylo znovu ověřeno bez chyby.
- Poslední načtení používá hashové URL. Konzole bez chyb a varování.
- Kontrola síťových požadavků neukázala volání API, ukládání profilu ani telemetrie.
  `localStorage.constructor.name` v prototypu je `PreviewStorage`.

## Vizuální kontrola a čtenářské brány

Použit dokument `docs/UI_PRE_READER_GATES.md`. Ve scéně nejsou odstavce ani
dlouhé instrukce. Předvedení pracuje s ikonou, šipkou, portrétem/cílem a změnou
životů. Zvuk je vypnutý. `Bez popisků` skrývá slovní popisky, čísla zůstávají.
Příklady, oprava s jablky a symboly jsou součástí skutečného MathBoardu.

Kontrola proběhla na 1440 × 1100, 1280 × 1000, 1024 × 850 a 768 × 1024.
Na šířce 768 px je nejmenší hlavní ovládací prvek 45,3 × 45,3 CSS px.
Stránka v tomto rozměru nepřetéká. Kořen scény má minimum 736 px; na užších
telefonech se posouvá samostatná scéna, není to návrh telefonního rozložení.

Prohlédnuté snímky v `review/`:

| Oblast | Snímky | Zjištění |
|---|---|---|
| Výrobní základ | `production-battle.png`, `production-mathboard.png` | Podkladem je současná aréna, deska a postavy. |
| Boj a volba hráče | `battle-desktop.png`, `battle-tablet.png` | Lišta je čitelná, postavy ani zdraví nepřekrývají ovládání. Poslední desktop snímek obsahuje opravenou polohu první lišky. |
| Stavy tlačítka | `hover.png`, `pressed.png`, `pointer-out.png` | Rám a ikona se pohybují společně, po opuštění se vrátí. |
| První kontakt | `first-use.png` | Obrázkové předvedení má oddělený výsledek a akční šipku; společný kruhový rám. |
| Počítání | `math-coop-desktop.png`, `healing-math.png`, `no-words-portrait.png` | Lišta zůstává dostupná, samostatný vlastník schopností je viditelný. Poslední snímky skrývají vyčnívající postavy za pergamenem. |
| Cílení a zásah | `targeting.png`, `strike-effect.png` | Živé cíle mají kruhy a terče, zrušení je samostatné. Účinek je lokální. |
| Vyčerpané/zamčené | `used-math.png`, `locked.png` | Vyčerpaný kosočtverec je prázdný s čárou; zámek má vlastní tvar. Rozdíl nestojí jen na barvě. |
| Obrana a oprava | `defense.png`, `wrong-defense.png`, `correct-math.png` | Pozastavené schopnosti mají značku II; chybu ukazují křížky a správný počet jablek. |
| Konec a omezený pohyb | `victory.png`, `reduced-motion.png` | Konec je zřetelný, omezený pohyb zachovává stav štítu. |
| Canvas | `canvas-math-tablet.png` | Text, rámy a číslice mají správné proporce a nezvětšují se oproti hostům. |
| Další podoby | `second-form-cast.png`, `fourth-form-attack.png`, `fifth-form.png` | Správná podoba a klip bez deformace; pátá zůstává statická. |

Některé průběžné snímky zachycují starší polohu první lišky a starší odstín
disabled lektvaru. Finální normální stav, ovládací stavy, první kontakt a režim
bez popisků byly po úpravě pořízeny znovu.

## Doplnění: účinky na hráče a protivníka

Nová vrstva `BattleEffects.ts` prošla funkčním a vizuálním průchodem ve výchozím
rendereru a v Canvas. Jde pouze o klientské efekty této izolované stránky;
žádné databázové migrace ani výrobní změny nebyly potřeba.

- Léčení B při příkladu A zvýšilo pouze B z 10 na 16 HP; čas desky se během
  efektu nezměnil a vrátil se totožný nenulový snapshot příkladu.
- Štít B a částečný zásah do něj zachovaly příklad A. Síla B klesla 5 → 3,
  HP se nezměnily a schopnost byla spotřebována jen jednou.
- Další zásahy vedly 5 → 3 → 1 → 0. Pouze poslední neblokovaný bod ubral HP.
  Po dohasnutí je vyčerpaná klenba skrytá.
- Skutečný obranný MathBoard s chybnou první odpovědí zapsal jednu odpověď,
  pohltil 5 z příchozích 8 a ubral zbývající 3 HP právě jednou.
- Zásah vybrané pravé potvory změnil jen její HP z 10 na 6, při dopadu.
- Reset během letu odstranil čekající dopad a všechny efektové úlohy.
- Dvojklik a reduced motion zachovaly jeden účinek, správného vlastníka a sílu.
- Použití po správné odpovědi zachovalo čekající pokračování; další úloha se
  otevřela bez dalšího záznamu první odpovědi.
- 02, 03 a 05 zůstávají statické. Síťový seznam neobsahoval jejich animační
  atlasy; načítaly se pouze výslovně schválené 01 a 04.
- Konzole po posledním průchodu bez chyb a varování; úložiště zůstává paměťové.

Prohlédnuté snímky (vše v `review/`):

| Účinek | Snímek | Vizuální výsledek |
|---|---|---|
| Léčení na hráče | `effects-heal-player.png` | Tyrkysové a teplé světelné body obklopují správnou postavu, `+6` je nad jejím HP. |
| Léčení u desky | `effects-heal-portrait.png` | Efekt je na portrétu 2, příklad hráče 1 je celý vidět. |
| Dopad na potvoru | `effects-strike-enemy.png` | Lokální zásah a `−4` pouze u vybraného protivníka. |
| Aplikace klenby | `effects-shield-apply.png` | Klenba stojí před hráčem směrem doprava, neprotíná jeho obličej. |
| Částečný blok | `effects-shield-block.png` | Vlna, `−2` síly a zbývající body; HP zůstávají. |
| Skutečný blok po obraně | `effects-real-defense-block.png` | Oddělené `−5` u štítu a `−3` u zdraví. |
| Oba chránění hráči | `effects-two-shields.png` | Klenba A leží za bližším hráčem B, každá chrání vlastního hráče. |
| Oba portréty | `effects-shield-portraits.png` | Obličeje zůstávají viditelné, síla je na vnějším okraji klenby. |
| Aplikace a blok u portrétu | `effects-shield-portrait-apply.png`, `effects-shield-portrait-block.png` | Správný vlastník; žádný zásah do oblasti příkladu. |
| Tablet bez slov a s omezeným pohybem | `effects-tablet-reduced-no-words.png` | Čísla a obrázky stačí; hlavní dotykové cíle mají stále nejméně 44 CSS px. |

Po review byly klenby posunuty o 45 herních px před postavy a o 25 px před
portréty. Všechny výše uvedené hlavní snímky štítu byly po posunu znovu pořízeny
a prohlédnuty. Snímek `effects-tablet-reduced-no-words.png` zachycuje dřívější
polohu klenby a dokládá pouze režim omezeného pohybu a čitelnost desky.
Implementační chat následně pořídil a prohlédl skutečné záznamy vykreslené scény:
`effect-recordings/healing-preview.webp`, `instant-strike-preview.webp` a
`air-shield-block-preview.webp`. Snímky jsou v původním pořadí, délky pocházejí
z času zachycení; nejde o vytváření pohybu z deformovaných ilustrací. Záznamy
ukazují A 14 → 20 HP, vybraného pravého protivníka 10 → 6 HP a štít 5 → 3 při
nezměněných 14 HP. Překontrolovány kontakty jednotlivých fází, návrat ovládání
a nulové runtime chyby. Reprodukce: `scripts/record-fox-effects.cjs` přes MCP.

Nové statické 02, 03 a 05 byly zapojené až poté; prohlédnutý snímek je
`root-neutral-third.png`. Potvrzené zdroje animací 01/04 zůstaly stejné.
`gpu-accepted-forms.json` dokládá skutečný WebGL upload a barevné vykreslené pixely
u všech šesti potvrzených atlasů a tří nových statických předloh. Limit je
2048 px na stranu. Test proběhl v místním prohlížeči, nikoli na Samsung tabletu.

## Hranice kontroly

Jde o review návrhu. Nebyl proveden playtest s dítětem ani zátěžový test na
fyzickém Samsung tabletu. Není to schválení výrobní integrace, všech typů úloh
nebo celé hry. Nový postup používá sčítání; porovnávání se zde nepřepisovalo.
Měřítko těl různých podob je potřeba sladit s konečnými animačními atlasy;
čtvrtá podoba má nyní v hostu menší viditelné tělo. Stav animací 03 a 05 spravuje
implementační chat. Celá herní UI scéna je samostatný návrh bez změny uložených her.

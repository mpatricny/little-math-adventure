# Porovnávání: krokodýl ve společném MathBoardu

21. 9. 2026. **Schválený návrh; zapojení do hry popisuje [COMPARISON_IMPLEMENTATION.md](COMPARISON_IMPLEMENTATION.md).**
Zachovat schválený pergamen a krokodýla, zmenšit vložený čistý znak, spojit
hover rámu se symbolem a po ukázce řešit skutečnou sadu pro útok postupně.

**Děti skoro neumějí číst. Žádný dlouhý text nikde v UI. Vysvětlení názorně,
obrázky a pohybem.** Platí [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md).
Podrobné napojení, konkrétní místa v kódu, save kompatibilita a ověření jsou v
[COMPARISON_BATTLE_INTEGRATION.md](COMPARISON_BATTLE_INTEGRATION.md).

**Dodatek 4:** krokodýlí tlamy nad čistými znaménky na třech tlačítkách.
Autor potvrdil postupně prodlužovat **čekání před zobrazením**, až automatická
podpora skončí. Pro integraci autor schválil **4 / 8 / 16 / 24 s / vypnuto** a návrat o jeden
stupeň po každé chybě. Starší HTML prototyp zachycuje předchozí návrhové časy.
Nový [náhled podpory](design-drafts/comparison-crocodile/hint-crocodile.html)
a [jeho kontrola](design-drafts/comparison-crocodile/REVIEW_HINTS.md).

## Schválený směr a nové opravy

- Přesný pergamen `math-board-larger.webp` a tlačítko `small_board_button.webp`
  ze společného MathBoardu. Zadání vlevo, stejné tři odpovědi vpravo.
- Mezi operandy na začátku **prázdné ohraničené místo**: žádný neutrální
  krokodýl, otazník ani předvolený vztah. Ukázka vloží odpověď až při předvedení.
- Čisté `<`, `>` a `=` po vložení nemusí vyplnit celý host krokodýla. Mají
  přibližně výšku sousedních číslic. Aktuální návrh používá šířku SVG 52 px
  proti fontu číslic 64 px; krokodýl a velké volby v tlačítkách zůstávají.
- Původní požadavek 2× znamená srovnání s původním malým znakem ve hře,
  nikoli dvojnásobení při každé revizi návrhu. Kontrolovat viditelnou kresbu,
  ne pouze rozměr textury/fontu. Poslední výslovná připomínka autora odmítá
  znak, který dominuje sousedním číslům.
- Tlačítko má jeden vnitřní vizuální kontejner pro dřevo a symbol. Hover
  posune **obojí o 2 px nahoru**, stisk o 1 px dolů. Návrat a disabled stav
  obnoví společnou polohu. Klikací kořen zůstává stabilní.

## Čtyři kroky

| Krok | Zadání | Volby |
|---|---|---|
| 1. Větší předmět | Dva různě velké předměty stejného druhu, bez čísel | Krokodýlí `<`, `=`, `>` |
| 2. Více předmětů | Dvě skupiny stejně velkých kusů, bez čísel | Stejné tři tlamy |
| 3. Předměty s číslem | Skupiny a jejich skutečné počty na společné základní lince | Stejné tři tlamy |
| 4. Jen čísla | Dvě čísla, bez předmětů | Čisté znaky; zpočátku může nad všemi volbami přijít opožděná krokodýlí připomínka |

Pátá a šestá fáze s výrazy navazují podle dosavadního systému. Horní čtyři
přepínače patří jen do návrhu; hráči fázi vybírá výukový systém. Tři ukázkové
úlohy nejsou nová hranice zvládnutí ani automatický postup do další fáze.

## Ukázka a následný boj

Úvod předvede prázdné místo, větší nabídku, výběr tlamy, její vložení a krmení.
Obnoví celé pravdivé porovnání, prohodí strany a předvede rovnost párováním.
U samotných čísel tlama přejde na čistý znak. Otevření tlamy směřuje vždy
k větší nabídce; u rovnosti se nesní žádná strana.

V produkci se ukázka přehraje při prvním setkání s fází; lze ji zopakovat.
V návrhu ji spouští „Ukázka“, aby šel posoudit i prázdný stav. Ani při omezeném
pohybu se nesmí vynechat druhý směr nebo rovnost. Zvuk není potřebný.

Po ukázce se zobrazí nové zadání. Dítě řeší **jeden příklad ze stejné sady pro
jeden útok**. Dole přibývají značky správně/chyba a dosavadní síla. Správná
volba krátce potvrdí vztah a přejde na další zadání. Chyba zapíše nulu;
následující názorná oprava není další odměněný pokus. Po posledním příkladu
se celé skóre předá běžnému útoku. Hráč nemusí opakovaně mačkat „Dál“.

Návrh demonstruje tři úlohy se silou 1. Tři první volby správně/chyba/správně
dají jeden útok se silou 2. V produkci hodnoty a počet pocházejí ze současných
pravidel hráče a vybavení; obrázkový renderer je nepočítá samostatně.
Dokončení návrhu s ikonou mečů zastupuje existující animaci hrdinova útoku.

## Prostor a společná architektura

Návrh má rozměr **740 × 300** v logických herních souřadnicích. Umístění
nad bojištěm se navrhuje kolem `(640, 170)` v canvasu 1280 × 720. Jde o
výchozí rozpočet pro ověření ve skutečných scénách, nikoli hotové umístění.

Stejný pergamen je složený jako autorovaný 9-slice (90/170/90/170), se shodnou
škálou rohů. Celý obrázek se nenatahuje do jiného poměru. Nadpis, příklad,
tři volby a patička mají vlastní prostor. Pod 580 CSS px se pouze konverzační
náhled skládá pod sebe; tím se nezavádí podpora úzkého telefonu ve hře.

MathBoard zachová celé pole problémů, první výsledky, časy, pomoc a jeden
konečný callback. Stavovou posloupnost doplní o ukázku a zpětnou vazbu; do
BattleScene se nepřidá druhý účet poškození. Všechna statická místa budou
v `scenes.json` a jejich polohy/hloubky se budou číst přes SceneBuilder.

## Podklady a stav ověření

- [Aktuální návrh](design-drafts/comparison-crocodile/battle-crocodile.html)
- [Vizuální kontrola revize 3](design-drafts/comparison-crocodile/REVIEW.md)
- [Plán zapojení do hry](COMPARISON_BATTLE_INTEGRATION.md)
- [Návrh revize 2](design-drafts/comparison-crocodile/mathboard-crocodile.html)
  a [jeho kontrola](design-drafts/comparison-crocodile/REVIEW_V2.md)
- [První varianta](design-drafts/comparison-crocodile/crocodile-chapter.html)
  a [její kontrola](design-drafts/comparison-crocodile/REVIEW_V1.md)

**Nyní se mění návrh a dokumentace.** Produkční MathBoard, BattleScene,
ComparisonLearningSystem, scenes.json ani savy se touto revizí nepřestavují.
Náhled nevyužívá server ani databázi. Nenahrazuje ověření skutečného boje,
Canvas/WebGL, vzdáleného ovládání, mastery a migrace uloženého postupu.

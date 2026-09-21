# Vizuální kontrola: krokodýl v soubojové tabuli, revize 3

20. 9. 2026. **Interaktivní návrh, nikoli hotová Phaser integrace.**
Zdroj: [battle-crocodile.html](battle-crocodile.html).
Plán: [COMPARISON_BATTLE_INTEGRATION.md](../../COMPARISON_BATTLE_INTEGRATION.md).
Podmínky: [UI_PRE_READER_GATES.md](../../UI_PRE_READER_GATES.md).
Starší kontrola je v [REVIEW_V2.md](REVIEW_V2.md); ta neověřovala společný
pohyb symbolu a plochy, který nyní autor výslovně požaduje.

## Opravy a skutečně prohlédnuté snímky

| Podklad | Zkontrolováno |
|---|---|
| [Čtyři fáze](battle-four-steps.png) | Jeden příklad, tři volby, prázdný vztah; čtyři odlišné reprezentace v tabuli 740 × 300. |
| [Jeden útočný tah](battle-turn.png) | Menší vložené `<`; správně → chyba bez bodu → další prázdné zadání → jeden součet 2. |
| [Hover, stisk, návrat](battle-hover.png) | Rám a symbol mění polohu společně; kořen a klikací rozměr se nemění. |
| [Tablet a úzký náhled](battle-responsive.png) | Čitelné počty, společná základní linka číslic, bez překryvů. Úzký konverzační náhled skládá volby pod zadání. |
| [Úvod](battle-intro.png) | Prázdný vztah, oba směry, rovnost, správné proporce čistého znaménka po přechodu z krokodýla. |

Jednotlivé snímky a kontrolní skript: `artifacts/comparison-crocodile-v3/`.
Kontaktní list s různě vysokými náhledy obsahuje prázdné místo mezi řádky;
nejde o prázdný prostor uvnitř soubojové tabule.

## Měření a chování

- Zkontrolováno všech 16 kombinací: 4 fáze × desktop 1280 × 900, tablet
  1024 × 768, konverzace 736 × 800 a úzký náhled 352 × 800.
- Široká tabule maximálně 740 × 300. Samostatné oblasti zadání, voleb a
  patičky se nepřekrývají; nevzniká horizontální overflow. Rozměr odpovědí
  na desktopu přibližně 88,27 × 70,02; ve všech testovaných náhledech alespoň
  44 px v obou směrech.
- Vložený čistý `<` má v širokém náhledu viditelnou výšku přibližně **41,6 px**
  proti **46 px** číslice. Velikost se odvozuje z SVG včetně šířky tahu a
  skutečných fontových metrik, nikoli pouze velikosti slotu. V úzkém náhledu
  přibližně 36,5 proti 48,9 px. Volby na tlačítkách zůstávají výrazné.
- Hover: symbol i plocha mají společný posun −2 px. Stisk: +1 px. Pointer-out:
  0 px. Souřadnice a rozměr kořenového tlačítka jsou ve všech stavech stejné.
- U každé fáze ověřena celá sada s výsledkem `101`: tři první odpovědi,
  získaná síla 2, jedno dokončení. Pokus o druhý klik po chybě nepřidá bod.
  Názorná oprava ukáže pravdivý vztah a nové zadání opět začíná prázdné.
- Oba soubory ve fázích 2–3 mají shodnou velikost kusů; číslo odpovídá
  skutečnému počtu včetně skupiny pěti předmětů.
- Úvod čísel skutečně prošel oba směry a rovnost; počet pokusů a síla zůstaly
  nula. Po přepnutí fáze stará animace nevyplní nové zadání.
- JavaScript bez runtime chyb. Výsledky: [battle-checks.json](battle-checks.json).

Použit stejný bitmapový pergamen v autorovaném 9-slice; rohy mají jednotnou
škálu a sloupky si zachovávají šířku. Vzhled byl posouzen ze screenshotů,
samotné automatické rozměrové kontroly nepředstavují estetické schválení.

## Rozsah a zbývající ověření

Playwright MCP stále hlásil profil obsazený jiným prohlížečem. Kontrola
proběhla instalovaným Playwrightem v samostatném izolovaném Chromiu;
cizí prohlížeč ani savy nebyly dotčené. Statický návrh nemá závislost na
serveru nebo neaplikovaných databázových migracích. Produkční regresní testy
nebyly pro změnu dokumentace a návrhu spouštěny.

Návrh nepoužívá produkční účet poškození: tři úlohy mají demonstrativně sílu 1.
Závěrečné meče se součtem zastupují budoucí předání do existující animace útoku.
Skutečné hodnoty vybavení, obrana, rychlost, mastery, save migrace, co-op,
remote a Canvas/WebGL čekají na implementaci. Rozpočet 740 × 300 je ověřený
uvnitř návrhu; skutečné zasazení mezi HUD všech bojových scén je další krok.
Není to playtest s dítětem. V návrhu není nahraný hlas.

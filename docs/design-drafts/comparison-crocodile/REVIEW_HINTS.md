# Vizuální kontrola: krokodýlí nápověda, revize 4

20. 9. 2026. **Interaktivní návrh, nikoli produkční integrace.**
Zdroj: [hint-crocodile.html](hint-crocodile.html).
Navazuje na [kontrolu revize 3](REVIEW.md) a
[plán zapojení do souboje](../../COMPARISON_BATTLE_INTEGRATION.md).

Autor potvrdil tlamy nad čistými znaménky a prodlužování čekání před jejich
zobrazením. Řada 0 → 3 → 6 → 10 s → vypnuto a posun po dvou správných prvních
odpovědích jsou návrhové parametry, které ještě nebyly ověřené s dětmi.

## Prohlédnuté snímky

| Podklad | Vizuálně zkontrolováno |
|---|---|
| [Stavy nápovědy](hint-states.png) | Okamžité připomenutí, čekání, opožděné připomenutí a vypnutá pomoc. Všechny tři obrázky jsou nad odpovídajícími čistými znaménky; prázdný slot zůstává prázdný. |
| [Menší obrazovky](hint-responsive.png) | Tablet, konverzační a úzký náhled. Nápovědy nekolidují s nadpisem ani tlačítky, úzký náhled skládá volby pod příklad. |

Nápověda má vlastní rezervovaný řádek vysoký 36 px a odstup 5 px od tlačítek.
Její objevení neposouvá zadání ani volby. Zachovává se původní pergamen,
velké čisté znaky na tlačítkách a společný pohyb jejich plochy se symbolem.
Samostatné tlamy nad tlačítky se při hoveru nehýbou.

## Ověřené chování

- Čtyři rozměry prohlížeče: 1280 × 900, 1024 × 768, 736 × 800 a 352 × 800.
  Široká tabule zůstává 740 × 300; nikde nevznikl horizontální overflow.
  Všechny volby mají klikací rozměr alespoň 44 × 44 px.
- Všechny tři připomínky se zobrazí současně. Volba jejich podoby a viditelnosti
  nečte správnou odpověď; nepředvyplňují vztah.
- Ověřena celá řada 0 / 3 / 6 / 10 s / vypnuto. U opožděných stupňů zůstává
  pomoc po první sekundě skrytá; objeví se až po příslušném čekání.
- Při simulovaném skrytí karty se zbývající čekání pozastaví. Po návratu
  pokračuje zbývající aktivní čas, nikoli čas strávený mimo zadání.
- Úroveň podpory přetrvává mezi dokončenými útočnými sadami. Dvě chyby
  v kontrolním okně obnoví předchozí stupeň podpory. Rychlost odpovědi
  neovlivňuje ubírání pomoci.
- Odpověď a změna fáze zruší starý timer. V dalších obrázkových fázích se
  opožděná nápověda neobjeví. Režim vypnuto zůstal skrytý i po 10,5 s.
- `assisted` se zapíše teprve po skutečném zobrazení nápovědy. Odpověď před
  jejím objevením zůstane samostatná. Chyba nepřidá demonstrativní sílu útoku.
- Bez chyb JavaScriptu. Měření: [hint-checks.json](hint-checks.json).

Kontrolní skript a jednotlivé snímky jsou v
`artifacts/comparison-crocodile-v4/`. Automatické kontroly rozměrů doplnila
skutečná prohlídka obou výše uvedených kontaktních listů.

## Rozsah kontroly

Playwright MCP hlásil obsazený profil; ověření proběhlo instalovaným
Playwrightem v samostatném Chromiu. Existující prohlížeč, běžící hra ani
uživatelské savy se neměnily. Samostatný HTML návrh nemá závislost na
databázových migracích; produkční regresní testy nebyly potřeba.

Canvas/WebGL, co-op, ukládání podpory mezi spuštěními, zkouška a skutečná
hodnota poškození čekají na implementaci podle integračního plánu.
Nová kontrola se soustředila na nápovědu; ostatní vizuální stavy tlačítek
a úvodní animace jsou doložené samostatně v revizi 3.

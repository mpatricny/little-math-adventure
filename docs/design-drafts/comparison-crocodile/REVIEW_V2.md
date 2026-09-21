# Vizuální kontrola: krokodýl v MathBoardu, revize 2

20. 9. 2026. Návrh upravený podle připomínky autora. **Produkční kód hry se
v této revizi nepřestavuje.** Předchozí návrh a jeho přejímka jsou archivované
v [REVIEW_V1.md](REVIEW_V1.md); aktuální je tato revize.

Zdroj: [mathboard-crocodile.html](mathboard-crocodile.html).
Zadání: [COMPARISON_CROCODILE_REDESIGN.md](../../COMPARISON_CROCODILE_REDESIGN.md).
Podmínky: [UI_PRE_READER_GATES.md](../../UI_PRE_READER_GATES.md).

## Změna podle současné hry

Byl prohlédnutý skutečný MathBoard v lokálním vývojovém buildu v izolovaném
prohlížeči. Návrh používá jeho přesný pergamen a obrázek tlačítka, společný
směr zadání vlevo / odpovědi vpravo a tři odpovědi ve všech čtyřech fázích.
Před odpovědí je mezi nabídkami skutečně prázdné ohraničené místo.

## Prohlédnuté snímky a průběh

| Podklad | Vizuální kontrola |
|---|---|
| [Čtyři kroky](mathboard-four-steps.png) | Stejný pergamen, žádný samostatný zelený panel, prázdné místo ve všech fázích; bez odstavců. |
| [Tablet](mathboard-tablet.png) | Oddělené oblasti příkladu a voleb, počitatelné kusy, čísla skupin na stejné základní lince. |
| [Úvodní animace](mathboard-intro.png) | Prázdné místo → tlama k většímu číslu vlevo → obrácená orientace → rovnost. Snímky zachycují skutečné fáze běžící animace. |
| [Stavy ovládání](mathboard-states.png) | Hover, stisk, pointer-out, správně a rovnost; stabilní poloha tlačítek a prostor uvnitř dřevěné plochy. |
| [Úzký náhled a výsledky](mathboard-small.png) | Přeskupení voleb v úzkém náhledu, 9-slice původního pergamenu, chyba, dokončení. |

Při kontrole byly zmenšené samotné znaky uvnitř velkých tlačítek tak, aby
nezasahovaly do jejich hrany; proti původním drobným textovým odpovědím jsou
stále výrazně větší. Obrázkové skupiny dostaly shodnou výšku, takže jejich
čísla neskáčou podle počtu řad. Konečné obrázky neukazují překryv příkladu,
voleb, nadpisu nebo patičky. Přesun odpovědi do políčka a krmení jsou záměrné
krátké pohyby přes pracovní oblast.

## Ověřené chování

- Desktop 1280 × 900, tablet 1024 × 768, náhled 768 × 800 a úzký 352 × 800.
- Ve všech čtyřech fázích je zpočátku políčko bez obsahu: žádný krokodýl,
  otazník ani znaménko. Chybná volba nevyzradí správný vztah v políčku.
- Všechny tři vztahy fungují ve všech velikostech; po krmení se obnoví celá
  nabídka. Počty ve třetím kroku odpovídají obrázkům.
- Úvod počtu i samotných čísel skutečně přehrál oba směry a rovnost.
  Po ukázce začne nový samostatný příklad s prázdným políčkem.
- Přepnutí fáze uprostřed animace ruší starý průběh; pozdější čekání do nové
  úlohy nevloží starou odpověď.
- Bez chyb JavaScriptu a vodorovného přetečení. Zadání a volby se nepřekrývají,
  ovládací cíle nejméně 44 px. Původní celý pergamen na desktopu/tabletu má
  správný poměr stran. V úzkém náhledu je výslovná 9-slice varianta.
- Po poslední úpravě navíc změřené shodné základní linky obou počtů na všech
  čtyřech šířkách.

Výsledky: [mathboard-checks.json](mathboard-checks.json),
[mathboard-final-layout.json](mathboard-final-layout.json).
Kontrolní skripty a jednotlivé snímky: `artifacts/comparison-crocodile-v2/`.
Playwright MCP byl opět obsazený jiným prohlížečem; použit izolovaný Chromium
přes instalovaný Playwright, bez zavírání cizího profilu a bez dotčení savů.

## Co tím není schválené

Jde o prohlédnutý a funkční návrh, nikoli playtest s dítětem nebo hotovou
Phaser integraci. Budoucí implementace musí zachovat sdílený MathBoard,
callbacky a zápis prvního pokusu, přiřazení v co-op a vzdálené ovládání.
Samostatně ověřit Canvas/WebGL, editorové hosty, font resolution a dvojnásobek
znamének ve všech dalších částech hry. V náhledu není nahraný hlas.

Statický návrh a prohlídka místního klienta nepotřebují databázové migrace;
nevznikly změny schématu, serveru ani uložených her. Herní regresní sady
se kvůli revizi návrhu a dokumentace nespouštěly.

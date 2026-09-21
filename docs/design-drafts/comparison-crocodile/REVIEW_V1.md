# Vizuální kontrola návrhu krokodýla

20. 9. 2026. **Návrh k připomínkám; není to schválení produkční kapitoly.**

Zdroj: [crocodile-chapter.html](crocodile-chapter.html).
Zadání: [COMPARISON_CROCODILE_REDESIGN.md](../../COMPARISON_CROCODILE_REDESIGN.md).
Povinné podmínky: [UI_PRE_READER_GATES.md](../../UI_PRE_READER_GATES.md).

## Prohlédnuté návrhy

| Obrázky | Co bylo vizuálně zkontrolováno |
|---|---|
| [Čtyři kroky na desktopu](review-desktop-steps.png) | Větší předmět, více předmětů, zachované skupiny s číslem, samotná čísla. Obě orientace tlamy a stejné poměry obrázků. |
| [Čtyři kroky na tabletu](review-tablet-steps.png) | Neutrální zadání bez nápovědy směru, počitatelné oddělené kusy, velké znaky, samostatné oblasti pro obrázky a čísla. |
| [Hover, stisk, pointer-out a chyba](review-desktop-states.png) | Stabilní geometrie ovládání, zřetelné zvýraznění, krátká reakce na chybu, žádný odstavec. |
| [Rovnost ve čtyřech krocích](review-equality.png) | Stejná velikost / počet, párové obrysy bez křížení předmětů, viditelné `=`, čísla odpovídají počtu. |
| [Výsledek a dokončení na tabletu](review-tablet-results.png) | Chyba, správná odpověď, disabled, rovnost a velká hvězda po dokončení. |
| [Úzký náhled](review-small.png) | Rozložení při šířce obsahu 320 px, rozdíl velikostí zachovaný, čísla a všechny volby bez vodorovného přetečení. |

Při vizuální kontrole byly odstraněny původní spojnice rovnosti vedené přes
jablka. Nahrazuje je postupné rozsvícení odpovídajících dvojic. Drobná ikona
v dokončení byla nahrazena velkou hvězdou. V konečných návrzích se rámy,
ovládací prvky, čísla a textové popisky nepřekrývají. Při krmení záměrně cestuje
předmět do středu tlamy; po animaci se obnoví celé pravdivé porovnání.

## Kontrola v prohlížeči

- Izolovaný Chromium přes instalovaný Playwright. Pokus o Playwright MCP
  narazil na obsazený sdílený profil; cizí prohlížeč nebyl zavírán.
- Viewporty 1280 × 1000, tablet 1024 × 768, náhled 768 × 900, úzký 352 × 900.
  Skutečné šířky fragmentu 1248, 992, 736 a 320 px.
- V každé velikosti všechny čtyři kroky: ukázka, nový samostatný příklad,
  chybná volba, správná volba, obnovení předmětů po krmení a rovnost.
- Před samostatnou volbou žádná pomocná ruka ani správná zvýrazněná strana.
  Ve třetím kroku automaticky ověřen soulad počtu jablek a čísla.
- Dokončení dostupné. Žádná chyba JavaScriptu, žádné vodorovné přetečení;
  nejmenší ovládací cíl 44 px, na desktopu/tabletu 48 px.
- Dlouhé instrukce nejsou součástí návrhu. Viditelné popisky jsou krátké;
  obrázky a krmení nesou význam. Návrh nevyžaduje zvuk.

Reprodukovatelný lokální kontrolní skript a jednotlivé plné screenshoty jsou
v `artifacts/comparison-crocodile-design/`; souhrn kontrol je uložený jako
[checks.json](checks.json). Snímky byly skutečně prohlédnuté, nikoli jen uložené.

## Co zatím není ověřeno

- Skutečné porozumění malým dítětem: následuje playtest, dospělá vizuální
  kontrola ho nemůže zastoupit.
- Integrace do Phaseru, Canvas/WebGL, scene-editor hosty, skutečná velikost
  znamének ve všech původních herních kontextech, dlouhé lokalizace a ukládání.
  Tato revize obsahuje návrh, ne jejich implementaci.
- Výrobní nahrávka hlasu, postupné počítání třetího kroku a přechod tlamy na
  čistý znak: zamýšlené chování je popsané v návrhu; zde nejsou finální assety.
- Podmínky průchodu kapitolou a mastery: ukázkový sled v prototypu jen předvádí
  obrazovky, nenahrazuje produkční výukový model.

Statický návrh nepoužívá databázi, API ani savy; migrace nejsou předpokladem
tohoto ověření. Herní regresní sady se kvůli změně návrhu a dokumentace
nespouštěly. Stávající herní kód a data nebyly tímto návrhem upravené.

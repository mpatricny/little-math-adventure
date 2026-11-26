# Osobní bonusy a návrh celé arény

## Změna

Rychlá první samostatná odpověď přidává přímo +1 k útoku. Vlastní průměr
posledních deseti správných samostatných odpovědí (alespoň pěti) se zmrazí
před soubojem a odděluje modul/formu i oba hráče. Reference přijímá i pomalé
aktivní odpovědi do dvou minut: například zrychlení z 30 na 27 sekund získá
bonus, aniž by se měnily přísnější podmínky mistrovství. Staré čtyři dílky se v boji
nepoužívají. Obrana si ponechává dosavadní rychlý blok. Mince se nemění.

Trénování při vítězství přidá jednou +1 many za alespoň 10% zlepšení proti
vlastním referencím, po pěti měřených odpovědích a při 90% samostatné přesnosti.
Chyba, pomoc, dlouhé odpovědi, neplatné hodiny a chybějící reference mají
samostatné regresní případy. První odpověď ani vítězství se nezapočítají dvakrát.

Před ověřením byl zkontrolován save kontrakt: payload je volný JSON;
nová volitelná metadata nevyžadují SQL migraci. Browser testy používají vlastní
profily a zachytávají save/API požadavky přes `isolateDevProfile`.

## Ověření

- 21 testů osobních bonusů a 123 souvisejících testů v 11 souborech. Poslední
  doplněné případy ověřují uchování známé nejistoty hodin v obnovené historii
  a motivaci dítěte s obvyklým třicetisekundovým časem; po úpravě znovu prošly
  testy bonusů, historie a nezměněných hranic mistrovství.
- Skutečný MathBoard: dvě dávky odpovědí, duplicita kliknutí, součet síly,
  odlišná osobní reference hráče B a jeho mazlíček, skryté staré čtyři dílky.
- Skutečné co-op vítězství: dvojí callback přidá manu jen A, rozdíl zůstatků
  A/B je přesně jedna mana, receipt je uložen jen A.
- Canvas i skutečný WebGL; test explicitně kontroluje `renderer.type` 1/2,
  takže neprojde při tichém přechodu na Canvas. Pro headless WebGL používá
  ANGLE/SwiftShader. Varianty odměny pro A, B a sólo jsou bez chyb běhu a bez
  porušení auditovaných textových insetů či poměrů bitmap. Aktualizované
  WebGL snímky byly znovu prohlédnuté.
- Původní browser test volby omezeného modulu pro hlavní útok, meč,
  štít, mazlíčka, bossy a výukovou kapitolu dál prochází.
- Celoprojektový TypeScript check má 134 známých diagnostik; oproti předchozímu
  ověření nepřibylo žádné nové hlášení (při srovnání bez čísel řádků).
  Nové moduly bonusů a změněné rozhraní MathBoardu nepřidávají diagnostiku.
  Nejde o čistý build.

Příkazy:

```sh
npx vitest run --exclude 'artifacts/**' src/systems/__tests__/PersonalBattleBonuses.test.ts
npx playwright test --config e2e/practice/bonus-ui.playwright.config.ts
npx playwright test --config e2e/practice/playwright.config.ts
```

## Prohlédnuté obrázky

V `docs/design-drafts/arena-reference-v3/review/`:

- `bonus-webgl.png`, `bonus-canvas.png`: dosavadní MathBoard s přímým +1.
- `victory-webgl.png`, `victory-canvas.png`: osobní mana a portrét vlastníka.
- `victory-b-only-webgl.png`, `victory-solo-canvas.png`: druhý hráč a sólo.
- `arena-proposed-1280.png`, `arena-proposed-768.png`: celý návrh s runtime
  popisky, pěti vlnami, životy, výbavou, lektvary, měnami a volbou obou hráčů.
- `arena-no-words-1280.png`, `arena-no-words-768.png`: stejné funkce obrázky;
  opakování a liška oproti cestě vzhůru, meči a srdci, vybraná volba se září
  a fajfkou, společný vstup do boje meči, návrat šipkou.

Nové mana prvky nepřekrývají odměny, mají vlastní hosty v scenes.json,
portréty pro majitele, zachované proporce a konstruktorové `resolution: 2`.
Nevkládají prose do hráčského UI. Starší popisy krystalových odměn a starší
deska čekají na širší UI změny; tento průchod neschvaluje veškeré staré UI.

## Generovaný návrh arény

Použit built-in imagegen. Podkladem je skutečný `ArenaScene` v izolovaném
co-op profilu (`practice-choice-v2/review/arena-current-coop.png`), doplněný
schváleným stylem `training-modes-v1/02-coop-choice-art.png`.
Prompt: `docs/design-drafts/arena-reference-v3/prompt.txt`.
Výsledek: `docs/design-drafts/arena-reference-v3/arena-coop-concept.png`.

Čísla a krátké popisky jsou vykreslené zvlášť v HTML/SVG. Nové přepínače
na obrázku jsou návrh; produkční výběr u Zyxe a před soubojem ještě není
napojen. Samotné bonusy jsou zapojené. Výtvarný návrh není sada produkčních
assetů a nelze ho použít jako jednu velkou interaktivní bitmapu. Při převodu
je nutné zachovat samostatné vrstvy, statické hosty a stabilní klikací plochy.

UI chat dokončil `docs/design-drafts/mathboard-variants-v4/` jako samostatný
funkční návrh. Počkali jsme na dokončení jeho kontroly. V4 používá skutečný
`PersonalBattleBonuses` přes `setPersonalBonusCallback`; animace přebírá
hotový součet z MathBoardu a následný zásah ze `resolveDamageAfterDefense`.
Nepočítá si vlastní rychlostní pravidlo a neuděluje manu.

Nezávisle byly prohlédnuté konečné v4 snímky `07-correct-total.png`,
`impact-normal-block.png`, `mode-defense-correct.png`, `tablet-768-missing.png`
a `tablet-768-comparison.png`. Připomínka k malému `=` ve výpočtu dopadu
byla opravena; pokračování po obraně má štít. Rozložení se nepřekrývá,
vztah před odpovědí zůstává prázdný a obrázková třetí fáze ponechává počty.

Vstupní volba u Zyxe/před bojem, nová obrazovka rychlosti a produkční nasazení
v4 jsou další práce. Dokončený samostatný návrh není hotová integrace těchto
obrazovek do hry. Podrobné výsledky a omezení v4 jsou v jeho `REVIEW.md`
a `review/final-smoke.json` (včetně vysvětlení timeoutu druhého mobilního
kontextu při dlouhém kombinovaném testu).

# UI refresh — nezávislé review 12. 11. 2026

**Vizuální schválení verze z 12. 11. bylo autorem 13. 11. zamítnuto.**
Pět doložených vad (odstup od rámů, scrollbar, centrování Zyxe a dvě oblasti
bojového ovládání) vyvrací původní estetickou přejímku. Níže je historický
záznam první verze; jeho výroky o přijaté estetice nejsou platným schválením.
Nové požadavky jsou v závěru [zadání](UI_REFRESH_REQUIREMENTS_2026_11_12.md).
Oprava i nová kontrola jsou dokončené v
[review z 13. 11.](UI_REFRESH_REVIEW_2026_11_13.md); důkazy jsou v
`artifacts/ui-refresh-v2/`. Následující historické výsledky nejsou výsledky
nového testovacího běhu.

Implementaci první verze provedli tři agenti
gpt-6-astra s reasoning max. Koordinátor kontroloval kód, vracel konkrétní vady
k opravě, procházel produkční scénáře přes Playwright MCP a prohlédl skutečné
screenshoty. Zelený test s chybějícími texturami nebyl přijat jako hotové UI.

[Zadání](UI_REFRESH_REQUIREMENTS_2026_11_12.md) ·
[Galerie screenshotů](../artifacts/ui-refresh/gallery.html) ·
[Imagegen prompty a původ bitmap](ui-refresh-2026-11-12/IMAGEGEN_PROMPTS.md)

## Přejímka požadavků

| Požadavek | Výsledek a důkaz |
|---|---|
| R1 — hráči a statistiky z menu | Menu → HRÁČI → DEN/MAPA, sólo nebo výběr dvojice. Skutečný klik na start coopu vytvořil relaci slotů 0/1. Ověřeny stavy 0/1/8 profilů, vytvoření, dlouhé jméno a zrušení smazání. |
| R2 — jedno potvrzení vysvětlení | Nové velké OK s fajfkou a společným pohybem rámu i obsahu. Audit zahrnuje obchod, kovárnu, arénu, Pythii, PictureDialog, komiks, cechovní opravu a příběhové panely Silverpond/rakety/podvodní části. Skutečné rozhodovací volby zachované. |
| R3 — jeden středový útok | Stejný kořen střídá meč a skutečného mazlíčka. Portrét, jméno a značky určují vlastníka. Koordinátor klikl oba hrdinské i oba pet útoky a všechny odpovědi na MathBoardu. Pořadí obou hrdinů a poté obou mazlíčků se nemění. |
| R4 — mapa konkrétních dovedností | Nový imagegen rám, vodorovné rozsahy kurikula, operace místo A1/B3, počty, zámek a 1–4 značky s legendou. Profil se startem E ukazuje jen E. Detail odčítání obsahuje skutečné odčítací formy. |
| R5 — osobní denní pokrok | Stejný výtvarný systém, výsledky/čas, skutečné ikony odměn a sedm dní historie. Přímé přepnutí profilu mění osobní údaje. Vlastník rozehrané hry se nepřepíná. |

Podrobné inventáře, soubory a reprodukce:
[hráči a učení](UI_REFRESH_PROFILES_REVIEW_2026_11_12.md),
[audit návodů](UI_REFRESH_GUIDES_REVIEW_2026_11_12.md),
[bojové ovládání](UI_REFRESH_BATTLE_REVIEW_2026_11_12.md).

## Nezávislé průchody a ochrana dat

Před testy ověřena závislost na migracích: jde o lokální save data, bez změny
DB schématu. Frontendové testy nepotřebují DB migrace; žádná nebyla aplikována.
API/DB integrační testy nejsou součástí přejímky.

Playwright MCP běžel v odděleném kontextu ui-refresh-review s fiktivními hráči
Anežka a Matěj. API /v1/, vývojové zálohy i diagnostika byly zachyceny lokálními
fixtures. Nebyly čteny ani přepsány skutečné serverové profily.

- Menu a přehled: pointer průchod menu → hráči → den → mapa → zpět.
  Volba druhé postavy a HRÁT spustila coop v TownScene. Prohlížení s aktivním B
  ponechalo slot 1 a tah B i při otevření mapy hráče A.
- Osobní data před bojovým testem: Anežka 12 pokusů / 9 správně, Matěj
  4 pokusy / 3 správně. Nulový historický den neukazuje falešnou úspěšnost.
  Po skutečně řešeném boji přibyly správné osobní pokusy.
- Obchod: intro → meč → štít, zvuk vypnutý, jediná akce. Zapsány tři seenGuides;
  matematické pokusy stále 0, hodnota peněženky 201. Hover/stisk/out zachovává
  root (640, 625), scale (1, 1), hit area 260 × 104. Stisk pohne společnou
  plochou o 2 px; pointer-out nepokročí.
- Boj: pointer kliknutí na stejný útok a odpovědi v každé sadě. A používala
  sliz, B démona; pet B zobrazil Matěje a purple-attack-sheet-portrait.
  Během matematiky byl útok deaktivovaný.
- Mapa: rozkliknutí odčítání, zavření z detailu, pozdější start, návrat a
  opakování. Maskovaný obsah po opravě nebere kliknutí do záhlaví.
  Agentův skutečný dotykový posuv nezpůsobil náhodný výběr.

## Vizuální review

Použity [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md) a
[ASSET_CREATION.md](ASSET_CREATION.md). Popisky jsou krátké, návody obrázkové.
S vypnutým zvukem a skrytými slovy zůstávají portréty, šipky, operace, počty,
značky zvládnutí a hlavní akce rozpoznatelné. Při závěrečné kontrole slov
zůstaly číslice a matematické symboly viditelné.

Rámy i portréty mají jednotné měřítko. Nadpisy, zavření, obsah, legenda a
patková tlačítka mají oddělená místa uvnitř rámu. Kořeny ovladačů se při stisku
neposouvají. Canvas i WebGL byly skutečně vykresleny; constructor resolution 2
se kontroluje také proti zdroji textury. Přehled má velké porovnávací znaky,
vložené vztahy zůstávají přiměřené číslicím. MathBoard ani kurikulum se nemění.

Koordinátorem skutečně prohlédnuté snímky (cesty vůči artifacts/):

| Oblast | Prohlédnuté soubory |
|---|---|
| Profily | ui-refresh/players-hub.png, players-hub-tablet-canvas.png, coop-selection.png; ui-refresh-profiles/hub-eight.png, hub-empty.png, coop-one-disabled.png, hub-canvas.png |
| Mapa | ui-refresh/learning-map.png, map-start-e.png, learning-map-detail.png, learning-map-tablet-canvas.png, map-no-words-tablet-canvas.png |
| Den | ui-refresh/daily-progress.png, daily-player-two.png, daily-tablet-canvas.png, daily-empty-tablet-canvas.png, daily-no-words-tablet-canvas.png |
| Obchod | ui-refresh/shop-guide-normal.png, shop-guide-pressed.png, shop-guide-disabled.png, shop-guide-without-words.png, shop-guide-tablet.png |
| Další návody | ui-refresh/guides/tablet-canvas-guild-correction.png, tablet-canvas-underwater-intro.png, desktop-webgl-silverpond-quest-2.png, desktop-webgl-rocket-1.png, desktop-webgl-comic.png |
| Boj | ui-refresh/battle/webgl-solo-hero-A-normal.png, webgl-solo-pet-A.png, webgl-coop-pet-B.png, canvas-coop-pet-B.png, webgl-solo-states-contact.png; vlastní proklik uložen jako ui-refresh/battle-coop-parent-*.png |

Další stavy disabled/stisk/out, skryté jméno a opakování scény jsou v dílčích
review. Desktop 1280 × 720 a tablet 1024 × 768 byly zkontrolovány v plné
velikosti. Technická přejímka nenahrazuje pozorovaný playtest s dětmi ani novou
kontrolu všech ostatních obrazovek celé hry.

## Vady nalezené review a jejich opravy

1. Nadpis, zavření, patička a legenda zasahovaly do ozdobného lemu; upraveny
   editorové hosty a zvětšeny mapové počty/značky.
2. Široký štítek nad útokem zakrýval nepřítele; nahrazen kompaktním portrétem
   a jménem, odděleny jejich bezpečné oblasti.
3. Potvrzení u questu a rakety zasahovalo do spodního rámu; přesunuto dovnitř
   a odděleno od obrázků. Přidány kontroly celého hit boxu.
4. Čtení savů doplňovalo identitu; oddělená čtecí cesta používá izolované kopie
   včetně živých mastery dat obou coop partnerů.
5. Denní přehled vynechával samostatnou kapitolu porovnávání; doplněny její
   pokusy. Syntetická historie a diagnostika nezvyšují běžný den.
6. Detail používal obecné příklady; nyní čte příslušný katalog. Stupeň
   porovnávání respektuje také rychlostní a mistrovskou výzvu.
7. Odrolované karty zachytávaly kliknutí do záhlaví; původní stabilní Phaser
   hit test se nově omezuje i na skutečný viewport.
8. Starý virtuální manifest ve znovupoužitém Vite procesu způsobil chybějící
   obrázky. Takové snímky odmítnuty; finální testy spouštějí čerstvý server
   a kontrolují viditelné __MISSING textury. Canvas fixture zachovává identity
   při reloadu, aby nevznikaly duplicitní testovací profily.

## Testy a zbývající omezení

- Finální build:pilot i build:dev: **prošlo**. Zůstávají upozornění bundleru
  na velikost chunků a anotace závislosti Zod.
- Node pilot-content a scene-assets: **19/19 prošlo**.
- Cílené frontendové sady: **45/45 boj, 26/26 návody, 20/20 profily a učení**.
- Browser: **7/7 bojových scénářů**, **5 návodových scénářů v obou rendererech**
  a **4 profilové scénáře** prošly v dokumentovaných bězích. Navíc nezávislé
  MCP proklikání, muted Canvas coop a finální opakování dotyku/Comic lifecycle.
- Širší frontendová sada: **494 testů, 491 prošlo, 3 selhaly**. Dva testy
  EnemyPresentationSystem.test.ts očekávají jiné uložené offsety houby/stromu;
  GuildExamMockScene.test.ts očekává starý statický import v main.ts, který
  už používá dynamickou registraci. Tyto testy a jejich relevantní zdroje
  enemies.json, EnemyPresentationSystem.ts a main.ts jsou oproti HEAD nezměněné.
  Stejná tři selhání byla i v prvním širším běhu. Produkční nepřátelé nebyli
  měněni kvůli starým očekáváním.
- Celkové tsc --noEmit není zelené kvůli existujícím chybám repozitáře; nové
  komponenty úpravy chyby nehlásí. Samostatná striktní kontrola bojových
  komponent prošla. git diff --check prošlo.
- Starší celé e2e sady learning/coop/Silverpond nebyly všechny opakovány;
  upravené části pokrývají nové cílené průchody. Remote ověřen na hranici
  doručeného příkazu, nikoli fyzickým telefonem přes relay.

Logy širšího frontendového běhu, buildů a asset kontrol jsou v
artifacts/ui-refresh/validation/. Změny nejsou commitnuté ani nasazené.
